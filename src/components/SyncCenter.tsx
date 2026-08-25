import React, { useState, useEffect, useRef } from 'react';
import {
  RefreshCw,
  Search,
  Copy,
  ExternalLink,
  Download,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Globe,
  FileCode2,
  Trash2,
  Filter,
  Check,
  Eye,
  FileSpreadsheet,
  Layers,
  ChevronRight,
  ShieldCheck,
  Plus,
  AlertCircle,
} from 'lucide-react';
import { db } from '../db';
import { DocumentTask, TaskStatus, HTMLInspectionReport, ArbitrationCase } from '../types';
import { ShenzhenDiscoveryAdapter } from '../services/dataSource/ShenzhenDiscoveryAdapter';
import { HTMLImportAdapter } from '../services/dataSource/HTMLImportAdapter';
import { DataService } from '../services/data/dataService';
import { CaseDetailModal } from './CaseDetailModal';

interface SyncCenterProps {
  onSyncComplete?: () => void;
  onNavigateToDatabase?: () => void;
}

export const SyncCenter: React.FC<SyncCenterProps> = ({
  onSyncComplete,
  onNavigateToDatabase,
}) => {
  // Phase 1 Discovery State
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scanStats, setScanStats] = useState<{ discovered: number; added: number; existing: number } | null>(null);

  // Phase 2 Task Queue State
  const [tasks, setTasks] = useState<DocumentTask[]>([]);
  const [taskFilter, setTaskFilter] = useState<TaskStatus | 'all'>('all');
  const [taskSearch, setTaskSearch] = useState('');
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Manual URL task input
  const [showAddModal, setShowAddModal] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [manualDate, setManualDate] = useState('');

  // Phase 3 Batch HTML Import State
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, percent: 0 });
  const [importStats, setImportStats] = useState<{ success: number; duplicate: number; failed: number } | null>(null);
  const [inspectionReports, setInspectionReports] = useState<HTMLInspectionReport[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal inspection of parsed case
  const [inspectedCase, setInspectedCase] = useState<ArbitrationCase | null>(null);

  // Load tasks on mount
  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      const list = await db.documentTasks.orderBy('createdAt').reverse().toArray();
      setTasks(list);
    } catch (err) {
      console.error('Failed to load document tasks:', err);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3000);
  };

  // ----------------------------------------------------
  // Phase 1: 扫描文书目录
  // ----------------------------------------------------
  const handleScanDirectory = async () => {
    setIsScanning(true);
    setScanMessage('正在连接深圳市人力资源和社会保障局公开文书目录...');
    setScanStats(null);

    try {
      const adapter = new ShenzhenDiscoveryAdapter();
      const links = await adapter.discoverDocuments();

      setScanMessage(`扫描完成，共发现 ${links.length} 篇公开裁决文书，正在保存采集清单...`);

      const result = await DataService.addDiscoveredTasks(links);
      setScanStats({
        discovered: links.length,
        added: result.addedCount,
        existing: result.existingCount,
      });

      await loadTasks();
      setScanMessage(null);
      showToast(`成功同步 ${links.length} 篇公开文书，新增 ${result.addedCount} 项待采集任务`);
    } catch (err: any) {
      setScanMessage(`扫描异常: ${err?.message || '网络连接失败'}`);
    } finally {
      setIsScanning(false);
    }
  };

  // 添加自定义文书任务
  const handleAddManualTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim() || !manualUrl.trim()) return;

    try {
      const existing = await db.documentTasks.where('url').equals(manualUrl.trim()).first();
      if (existing) {
        showToast('该文书 URL 任务已存在');
        return;
      }

      const now = new Date().toISOString();
      const newTask: DocumentTask = {
        id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title: manualTitle.trim(),
        url: manualUrl.trim(),
        publishedAt: manualDate.trim() || undefined,
        status: 'pending',
        rawDocumentId: null,
        createdAt: now,
        updatedAt: now,
      };

      await db.documentTasks.put(newTask);
      await loadTasks();
      setManualTitle('');
      setManualUrl('');
      setManualDate('');
      setShowAddModal(false);
      showToast('已添加新文书采集任务');
    } catch (err: any) {
      showToast(`添加失败: ${err?.message}`);
    }
  };

  // ----------------------------------------------------
  // Phase 2: 任务管理与清单导出
  // ----------------------------------------------------
  const handleCopyUrl = async (url: string, taskId: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedTaskId(taskId);
      showToast('已复制文书详情页 URL 到剪贴板');
      setTimeout(() => setCopiedTaskId((prev) => (prev === taskId ? null : prev)), 2000);
    } catch {
      showToast('复制失败，请手动选择复制');
    }
  };

  const handleBatchCopyUrls = async () => {
    const targetTasks = selectedTaskIds.size > 0
      ? filteredTasks.filter((t) => selectedTaskIds.has(t.id))
      : filteredTasks;

    if (targetTasks.length === 0) {
      showToast('当前无可用文书任务');
      return;
    }

    const urls = targetTasks.map((t) => t.url).join('\n');
    try {
      await navigator.clipboard.writeText(urls);
      showToast(`已批量复制 ${targetTasks.length} 个详情页链接到剪贴板`);
    } catch {
      showToast('复制失败');
    }
  };

  const handleExportCsv = () => {
    const targetTasks = selectedTaskIds.size > 0
      ? filteredTasks.filter((t) => selectedTaskIds.has(t.id))
      : tasks;

    if (targetTasks.length === 0) {
      showToast('当前任务列表为空，无法导出');
      return;
    }

    const csvContent = DataService.exportTasksToCsv(targetTasks);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `深圳人社局文书待采集清单_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`已导出 ${targetTasks.length} 条文书采集清单 (CSV)`);
  };

  const handleDeleteTask = async (id: string) => {
    await db.documentTasks.delete(id);
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    await loadTasks();
    showToast('已删除该任务');
  };

  const handleClearCompletedTasks = async () => {
    const completed = await db.documentTasks
      .where('status')
      .anyOf(['imported', 'parsed'])
      .primaryKeys();
    if (completed.length === 0) {
      showToast('没有已完成的任务需要清理');
      return;
    }
    await db.documentTasks.bulkDelete(completed);
    await loadTasks();
    showToast(`已清理 ${completed.length} 项已完成采集的任务`);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedTaskIds(new Set(filteredTasks.map((t) => t.id)));
    } else {
      setSelectedTaskIds(new Set());
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ----------------------------------------------------
  // Phase 3: 批量 HTML 导入与质量检查
  // ----------------------------------------------------
  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files).filter((f) =>
      /\.(html?|mht|mhtml|txt)$/i.test(f.name)
    );

    if (fileArray.length === 0) {
      showToast('请选择有效的 .html / .htm / .mht 网页文书文件');
      return;
    }

    setIsImporting(true);
    setImportProgress({ current: 0, total: fileArray.length, percent: 0 });
    setImportStats(null);
    const newReports: HTMLInspectionReport[] = [];

    const result = await HTMLImportAdapter.importBatch(fileArray, (current, total, report) => {
      newReports.unshift(report);
      setInspectionReports([...newReports]);
      setImportProgress({
        current,
        total,
        percent: Math.round((current / total) * 100),
      });
    });

    setImportStats({
      success: result.successCount,
      duplicate: result.duplicateCount,
      failed: result.failedCount,
    });
    setIsImporting(false);

    // 重新加载任务状态与数据统计
    await loadTasks();
    onSyncComplete?.();
    showToast(
      `批量导入完成：成功解析 ${result.successCount} 篇 (重复 ${result.duplicateCount} 篇, 失败 ${result.failedCount} 篇)`
    );

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleViewCaseDetail = async (caseId?: string) => {
    if (!caseId) return;
    try {
      const c = await db.arbitrationCases.get(caseId);
      if (c) {
        setInspectedCase(c);
      } else {
        showToast('未找到该案例明细');
      }
    } catch {
      showToast('读取案例失败');
    }
  };

  // Filter tasks
  const filteredTasks = tasks.filter((t) => {
    if (taskFilter !== 'all' && t.status !== taskFilter) return false;
    if (taskSearch.trim()) {
      const kw = taskSearch.trim().toLowerCase();
      const matchTitle = t.title.toLowerCase().includes(kw);
      const matchUrl = t.url.toLowerCase().includes(kw);
      const matchCase = t.caseNumber?.toLowerCase().includes(kw);
      if (!matchTitle && !matchUrl && !matchCase) return false;
    }
    return true;
  });

  const pendingCount = tasks.filter((t) => t.status === 'pending').length;
  const importedCount = tasks.filter((t) => t.status === 'imported').length;
  const parsedCount = tasks.filter((t) => t.status === 'parsed').length;
  const failedCount = tasks.filter((t) => t.status === 'failed').length;

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-8 select-text">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-lg shadow-xl border border-slate-700 flex items-center gap-2 text-xs animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
              <RefreshCw className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">同步中心</h1>
            <span className="px-2.5 py-0.5 rounded-full text-2xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              文书发现 + 人工采集 + HTML导入解析
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1.5 max-w-3xl">
            专为 PC Chrome 打造的深圳劳动人事仲裁公开文书本地研究库采集工作台。通过目录自动发现生成待采清单、配合浏览器离线保存与多文件批量解析，稳定构建高质量本地案例库。
          </p>
        </div>

        {/* Action Summary Pill */}
        <div className="flex items-center gap-2">
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 flex items-center gap-3 text-xs">
            <div className="text-slate-500">
              待采集: <span className="font-bold text-amber-600">{pendingCount}</span>
            </div>
            <div className="w-px h-3 bg-slate-200" />
            <div className="text-slate-500">
              已入库: <span className="font-bold text-emerald-600">{parsedCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 阶段 1：发现公开文书 */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 bg-slate-50/70 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
              1
            </div>
            <div>
              <h2 className="text-xs font-bold text-slate-900">阶段一 · 发现公开文书</h2>
              <div className="text-3xs text-slate-500">
                扫描深圳市人力资源和社会保障局公开文书目录页，快速提取文书标题、发布时间与详情页地址
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-scan-directory"
              onClick={handleScanDirectory}
              disabled={isScanning}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-xs flex items-center gap-2 transition-colors disabled:opacity-50 shadow-xs cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
              <span>{isScanning ? '正在扫描目录...' : '扫描文书目录'}</span>
            </button>
            <button
              id="btn-add-manual-task"
              onClick={() => setShowAddModal(true)}
              className="px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>添加URL任务</span>
            </button>
          </div>
        </div>

        <div className="p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs bg-slate-50 p-3 rounded-lg border border-slate-100 gap-2">
            <div className="flex items-center gap-2 text-slate-600">
              <Globe className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="font-medium text-slate-700">公开文书目录源：</span>
              <code className="text-2xs font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                https://hrss.sz.gov.cn/ztfw/cjjy/wsgk/index.html
              </code>
            </div>
            <div className="text-2xs text-slate-400">
              采用目录层元数据发现机制，避免盲目爬取与封禁
            </div>
          </div>

          {/* Scanning Progress Feedback */}
          {scanMessage && (
            <div className="p-3 bg-blue-50/80 rounded-lg border border-blue-200 text-xs text-blue-800 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
              <span>{scanMessage}</span>
            </div>
          )}

          {scanStats && (
            <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  扫描完成！发现公开文书 <strong>{scanStats.discovered}</strong> 篇，新增待采集任务{' '}
                  <strong>{scanStats.added}</strong> 项 (已存在 {scanStats.existing} 项)。
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 阶段 2：人工采集与待采集任务管理 */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 bg-slate-50/70 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">
              2
            </div>
            <div>
              <h2 className="text-xs font-bold text-slate-900">阶段二 · 人工采集与任务清单</h2>
              <div className="text-3xs text-slate-500">
                支持批量复制文书地址或导出 CSV 清单，在浏览器中打开并保存网页 HTML
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              id="btn-export-csv"
              onClick={handleExportCsv}
              disabled={tasks.length === 0}
              className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              title="导出包含标题、URL、发布日期、状态的 CSV 格式清单"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>导出采集清单 (CSV)</span>
            </button>
            <button
              id="btn-batch-copy-urls"
              onClick={handleBatchCopyUrls}
              disabled={filteredTasks.length === 0}
              className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5 text-blue-600" />
              <span>
                {selectedTaskIds.size > 0
                  ? `批量复制选中 (${selectedTaskIds.size})`
                  : '复制当前列表全部 URL'}
              </span>
            </button>
            {parsedCount > 0 && (
              <button
                id="btn-clear-completed-tasks"
                onClick={handleClearCompletedTasks}
                className="px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 text-2xs transition-colors cursor-pointer"
                title="清除已解析完成的任务"
              >
                <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                清理已完成
              </button>
            )}
          </div>
        </div>

        {/* Operating Guide Callout */}
        <div className="p-5 border-b border-slate-100 bg-amber-50/50">
          <div className="flex items-start gap-2.5 text-2xs text-amber-900 leading-relaxed">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">浏览器人工采集操作说明：</span>
              1. 点击右侧 <span className="font-semibold underline">「复制URL」</span> 或直接点击链接在新标签页打开政务文书详情页；
              2. 在 Chrome 浏览器页面按下 <kbd className="px-1.5 py-0.5 bg-white border border-amber-300 rounded font-mono text-3xs shadow-2xs">Ctrl + S</kbd>（或菜单 → 更多工具 → 网页另存为），保存类型选择 <strong>「网页，仅 HTML」</strong> 或 <strong>「网页，完整」</strong>；
              3. 在下方 <strong>「阶段三」</strong> 将保存好的 HTML 文件批量拖拽上传，系统将全自动解析并关联更新任务状态。
            </div>
          </div>
        </div>

        {/* Task List Controls */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setTaskFilter('all')}
              className={`px-2.5 py-1 rounded-md text-2xs font-medium transition-colors ${
                taskFilter === 'all'
                  ? 'bg-slate-900 text-white font-bold'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              全部 ({tasks.length})
            </button>
            <button
              onClick={() => setTaskFilter('pending')}
              className={`px-2.5 py-1 rounded-md text-2xs font-medium transition-colors ${
                taskFilter === 'pending'
                  ? 'bg-amber-600 text-white font-bold'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              待采集 ({pendingCount})
            </button>
            <button
              onClick={() => setTaskFilter('parsed')}
              className={`px-2.5 py-1 rounded-md text-2xs font-medium transition-colors ${
                taskFilter === 'parsed'
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              已解析 ({parsedCount})
            </button>
            {failedCount > 0 && (
              <button
                onClick={() => setTaskFilter('failed')}
                className={`px-2.5 py-1 rounded-md text-2xs font-medium transition-colors ${
                  taskFilter === 'failed'
                    ? 'bg-rose-600 text-white font-bold'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                失败 ({failedCount})
              </button>
            )}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜索任务标题 / 案号 / URL..."
              value={taskSearch}
              onChange={(e) => setTaskSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* Task Table */}
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          {filteredTasks.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-400">
              {tasks.length === 0
                ? '暂无待采集任务，请点击上方「扫描文书目录」开始'
                : '没有符合筛选条件的任务'}
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50/80 text-slate-500 text-3xs font-bold uppercase tracking-wider sticky top-0 border-b border-slate-200 z-10">
                <tr>
                  <th className="py-2.5 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={
                        filteredTasks.length > 0 &&
                        filteredTasks.every((t) => selectedTaskIds.has(t.id))
                      }
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="py-2.5 px-3">文书标题 / 案号</th>
                  <th className="py-2.5 px-3 w-32">发布时间</th>
                  <th className="py-2.5 px-3 w-28">状态</th>
                  <th className="py-2.5 px-4 w-44 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTasks.map((task) => {
                  const isSelected = selectedTaskIds.has(task.id);
                  const isCopied = copiedTaskId === task.id;

                  return (
                    <tr
                      key={task.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSelected ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      <td className="py-2.5 px-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(task.id)}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-900 line-clamp-1" title={task.title}>
                          {task.title}
                        </div>
                        <div className="text-3xs text-slate-400 font-mono flex items-center gap-1.5 mt-0.5 truncate max-w-md">
                          {task.caseNumber && (
                            <span className="text-blue-600 font-semibold">{task.caseNumber}</span>
                          )}
                          <span className="truncate">{task.url}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-2xs text-slate-500">
                        {task.publishedAt || '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        {task.status === 'pending' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="w-3 h-3" /> 待采集
                          </span>
                        )}
                        {task.status === 'imported' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            <FileCode2 className="w-3 h-3" /> HTML已导入
                          </span>
                        )}
                        {task.status === 'parsed' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" /> 解析完成
                          </span>
                        )}
                        {task.status === 'failed' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                            <XCircle className="w-3 h-3" /> 失败
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => handleCopyUrl(task.url, task.id)}
                            className={`p-1.5 rounded-md text-2xs font-medium transition-colors flex items-center gap-1 ${
                              isCopied
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            }`}
                            title="复制详情页 URL"
                          >
                            {isCopied ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span>已复制</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3 text-slate-600" />
                                <span>复制URL</span>
                              </>
                            )}
                          </button>
                          <a
                            href={task.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                            title="在浏览器新窗口打开"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <button
                            onClick={() => handleDeleteTask(task.id)}
                            className="p-1.5 rounded-md hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors"
                            title="删除任务"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 阶段 3：批量导入与解析 HTML */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 bg-slate-50/70 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
              3
            </div>
            <div>
              <h2 className="text-xs font-bold text-slate-900">阶段三 · 批量导入详情页 HTML</h2>
              <div className="text-3xs text-slate-500">
                支持拖入单份或 10/50/100+ 份保存的 HTML/MHT 网页文件，执行全文字段提取、SHA-256 去重与质量检查
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Upload Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              handleFilesSelected(e.dataTransfer.files);
            }}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
              isDragOver
                ? 'border-blue-500 bg-blue-50/50 scale-[0.99]'
                : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              multiple
              accept=".html,.htm,.mht,.mhtml,.txt"
              className="hidden"
              onChange={(e) => handleFilesSelected(e.target.files)}
            />
            <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 mx-auto flex items-center justify-center mb-3">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div className="text-sm font-bold text-slate-800">
              点击选择或将 HTML 网页文件拖拽至此处
            </div>
            <p className="text-xs text-slate-500 mt-1">
              支持批量上传 10 ~ 100+ 份 <code className="bg-slate-200/70 px-1 rounded">.html</code>,{' '}
              <code className="bg-slate-200/70 px-1 rounded">.htm</code>,{' '}
              <code className="bg-slate-200/70 px-1 rounded">.mht</code> 文件
            </p>
          </div>

          {/* Import Progress Bar */}
          {isImporting && (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-700">
                <span className="font-bold flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                  正在批量解析文书：{importProgress.current} / {importProgress.total}
                </span>
                <span className="font-mono font-bold text-blue-600">{importProgress.percent}%</span>
              </div>
              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-150"
                  style={{ width: `${importProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* Import Result Summary */}
          {importStats && !isImporting && (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-4">
                <span className="font-bold text-slate-800">导入结果统计：</span>
                <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 font-medium">
                  成功入库: <strong>{importStats.success}</strong>
                </span>
                <span className="text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 font-medium">
                  内容重复: <strong>{importStats.duplicate}</strong>
                </span>
                <span className="text-rose-700 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200 font-medium">
                  解析失败: <strong>{importStats.failed}</strong>
                </span>
              </div>

              {onNavigateToDatabase && (
                <button
                  onClick={onNavigateToDatabase}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-medium text-xs hover:bg-blue-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>前往案例数据库查看</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* 导入质量检查报告 (Inspection Report Table) */}
          {/* ========================================================================= */}
          {inspectionReports.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  本次导入质量检查报告 ({inspectionReports.length} 份)
                </h3>
                <span className="text-3xs text-slate-400">
                  真实结构化提取：案号、当事人、请求、查明事实、裁决结果、法律依据
                </span>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-80 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-500 text-3xs font-bold uppercase sticky top-0 border-b border-slate-200 z-10">
                    <tr>
                      <th className="py-2.5 px-3">文件名 / 识别案号</th>
                      <th className="py-2.5 px-3 w-24">质量评分</th>
                      <th className="py-2.5 px-3">关键要素识别情况 (√ / ×)</th>
                      <th className="py-2.5 px-3 w-28">状态</th>
                      <th className="py-2.5 px-3 w-24 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {inspectionReports.map((r, idx) => {
                      const scoreColor =
                        r.qualityScore >= 80
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : r.qualityScore >= 50
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200';

                      return (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-slate-800 line-clamp-1" title={r.fileName}>
                              {r.fileName}
                            </div>
                            <div className="text-3xs text-slate-400 font-mono">
                              {r.extractedCaseNumber || r.extractedTitle || '未能识别标题案号'}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-2xs font-bold border ${scoreColor}`}
                            >
                              {r.qualityScore}/100
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex flex-wrap items-center gap-1.5 text-3xs">
                              <span
                                className={`px-1.5 py-0.5 rounded ${
                                  r.hasCaseNumber ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'
                                }`}
                              >
                                案号:{r.hasCaseNumber ? '✓' : '×'}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded ${
                                  r.hasParties ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'
                                }`}
                              >
                                当事人:{r.hasParties ? '✓' : '×'}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded ${
                                  r.hasClaims ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'
                                }`}
                              >
                                请求:{r.hasClaims ? '✓' : '×'}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded ${
                                  r.hasFacts ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'
                                }`}
                              >
                                事实:{r.hasFacts ? '✓' : '×'}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded ${
                                  r.hasReasoning ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'
                                }`}
                              >
                                说理:{r.hasReasoning ? '✓' : '×'}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded ${
                                  r.hasDecision ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'
                                }`}
                              >
                                裁决:{r.hasDecision ? '✓' : '×'}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded ${
                                  r.hasLegalBasis ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'
                                }`}
                              >
                                法条:{r.hasLegalBasis ? '✓' : '×'}
                              </span>
                            </div>
                            {r.unrecognizedFields.length > 0 && r.parseStatus !== 'failed' && (
                              <div className="text-3xs text-amber-700 mt-1">
                                缺失: {r.unrecognizedFields.join('、')}
                              </div>
                            )}
                            {r.error && (
                              <div className="text-3xs text-rose-600 mt-1">{r.error}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            {r.isDuplicate && (
                              <span className="px-2 py-0.5 rounded-full text-3xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                重复更新
                              </span>
                            )}
                            {!r.isDuplicate && r.parseStatus === 'success' && (
                              <span className="px-2 py-0.5 rounded-full text-3xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                解析成功
                              </span>
                            )}
                            {!r.isDuplicate && r.parseStatus === 'partial' && (
                              <span className="px-2 py-0.5 rounded-full text-3xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                部分提取
                              </span>
                            )}
                            {r.parseStatus === 'failed' && (
                              <span className="px-2 py-0.5 rounded-full text-3xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                                解析失败
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {r.caseId && (
                              <button
                                onClick={() => handleViewCaseDetail(r.caseId)}
                                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-2xs font-medium transition-colors inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Eye className="w-3 h-3" />
                                <span>查看</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Manual Task Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-slate-900">添加自定义文书采集任务</h3>
            <form onSubmit={handleAddManualTask} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  文书标题 / 争议案由 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="如：张某与深圳某科技有限公司劳动争议仲裁裁决书"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  详情页 URL <span className="text-rose-500">*</span>
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://hrss.sz.gov.cn/ztfw/cjjy/wsgk/..."
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  发布时间（选填）
                </label>
                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
                >
                  保存任务
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Case Detail Modal */}
      {inspectedCase && (
        <CaseDetailModal
          arbitrationCase={inspectedCase}
          onClose={() => setInspectedCase(null)}
        />
      )}
    </div>
  );
};
