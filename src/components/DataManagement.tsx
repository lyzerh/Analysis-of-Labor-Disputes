import React, { useState } from 'react';
import {
  HardDrive,
  Download,
  Upload,
  Trash2,
  FileSpreadsheet,
  FileCode,
  ShieldAlert,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
  Layers,
  Database,
  CloudDownload,
  UploadCloud,
  ShieldCheck,
  BarChart3
} from 'lucide-react';
import { DataService } from '../services/data/dataService';
import { db } from '../db';
import { LaborInfoCrawlerComponent } from './LaborInfoCrawler';
import { ImportCases } from './ImportCases';
import { LaborInfoReview } from './LaborInfoReview';
import { LaborInfoApiTest } from './LaborInfoApiTest';
import { LaborInfoParserTest } from './LaborInfoParserTest';
import { DatasetBuilderTest } from './DatasetBuilderTest';

interface DataManagementProps {
  onDataChanged?: () => void;
}

export const DataManagement: React.FC<DataManagementProps> = ({ onDataChanged }) => {
  const [activeTab, setActiveTab] = useState<'backup' | 'crawler' | 'import' | 'quality' | 'advanced'>('crawler');

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Management Top Nav */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4 shrink-0 overflow-x-auto">
        <h2 className="text-lg font-bold text-slate-900 mr-4 flex items-center gap-2">
          <Database className="w-5 h-5 text-blue-600" />
          数据管理
        </h2>
        
        <button
          onClick={() => setActiveTab('crawler')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'crawler'
              ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 border border-transparent'
          }`}
        >
          <CloudDownload className="w-4 h-4" />
          工劳网采集
        </button>
        
        <button
          onClick={() => setActiveTab('import')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'import'
              ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 border border-transparent'
          }`}
        >
          <UploadCloud className="w-4 h-4" />
          本地文件导入
        </button>

        <button
          onClick={() => setActiveTab('backup')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'backup'
              ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 border border-transparent'
          }`}
        >
          <HardDrive className="w-4 h-4" />
          备份与恢复
        </button>
        
        <button
          onClick={() => setActiveTab('quality')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'quality'
              ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 border border-transparent'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          数据质量监控
        </button>

        <button
          onClick={() => setActiveTab('advanced')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'advanced'
              ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 border border-transparent'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          高级测试工具
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'crawler' && <LaborInfoCrawlerComponent />}
        {activeTab === 'import' && <ImportCases onImportComplete={() => onDataChanged?.()} onNavigateToDatabase={() => {}} />}
        {activeTab === 'quality' && <LaborInfoReview />}
        {activeTab === 'backup' && <BackupRestorePanel onDataChanged={onDataChanged} />}
        {activeTab === 'advanced' && <AdvancedToolsPanel />}
      </div>
    </div>
  );
};

const BackupRestorePanel: React.FC<{ onDataChanged?: () => void }> = ({ onDataChanged }) => {
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const allCases = await db.arbitrationCases.toArray();
      const csv = DataService.exportToCsv(allCases);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `劳动争议案例库_全量案例_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: `成功导出 ${allCases.length} 篇案例为 CSV 文件！` });
    } catch (err: any) {
      setMessage({ type: 'error', text: `导出 CSV 失败: ${err.message}` });
    } finally {
      setExporting(false);
    }
  };

  const handleExportJson = async () => {
    setExporting(true);
    try {
      const allCases = await db.arbitrationCases.toArray();
      const blob = new Blob([JSON.stringify(allCases, null, 2)], {
        type: 'application/json;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `劳动争议案例库_结构化数据_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: `成功导出 ${allCases.length} 篇结构化案例为 JSON 文件！` });
    } catch (err: any) {
      setMessage({ type: 'error', text: `导出 JSON 失败: ${err.message}` });
    } finally {
      setExporting(false);
    }
  };

  const handleExportFullBackup = async () => {
    setExporting(true);
    try {
      const backupJson = await DataService.exportFullDatabaseBackup();
      const blob = new Blob([backupJson], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `劳动争议案例库_完整备份_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: '已成功生成全库完整备份文件！' });
    } catch (err: any) {
      setMessage({ type: 'error', text: `导出备份失败: ${err.message}` });
    } finally {
      setExporting(false);
    }
  };

  const handleRestoreBackup = async (file: File | null) => {
    if (!file) return;
    setRestoring(true);
    setMessage(null);
    try {
      const content = await file.text();
      const result = await DataService.restoreDatabaseBackup(content);
      setMessage({
        type: 'success',
        text: `🎉 成功从备份文件恢复 ${result.importedCount} 篇裁决案例及原始文书！`,
      });
      onDataChanged?.();
    } catch (err: any) {
      setMessage({ type: 'error', text: `恢复失败: ${err.message}` });
    } finally {
      setRestoring(false);
    }
  };

  const handleClearAll = async () => {
    try {
      await DataService.clearAllDatabase();
      setShowClearConfirm(false);
      setMessage({ type: 'success', text: '本地 IndexedDB 数据库已全部清空。' });
      onDataChanged?.();
    } catch (err: any) {
      setMessage({ type: 'error', text: `清空失败: ${err.message}` });
    }
  };

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-blue-600" />
          备份与恢复
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          管理本地案例库的数据备份，支持全量导出和恢复。
        </p>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center gap-2 border ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Export Section */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
            <Download className="w-4 h-4 text-blue-600" />
            导出案例库
          </h3>
          <span className="text-2xs text-slate-400">支持 Excel 兼容格式</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            disabled={exporting}
            onClick={handleExportCsv}
            className="p-4 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 text-left transition-all group"
          >
            <FileSpreadsheet className="w-5 h-5 text-emerald-600 mb-2" />
            <div className="text-xs font-bold text-slate-900 group-hover:text-emerald-700">导出全量案例 (CSV)</div>
          </button>

          <button
            disabled={exporting}
            onClick={handleExportJson}
            className="p-4 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50 text-left transition-all group"
          >
            <FileCode className="w-5 h-5 text-blue-600 mb-2" />
            <div className="text-xs font-bold text-slate-900 group-hover:text-blue-700">导出结构化数据 (JSON)</div>
          </button>

          <button
            disabled={exporting}
            onClick={handleExportFullBackup}
            className="p-4 rounded-xl border border-slate-200 hover:border-purple-500 hover:bg-purple-50 text-left transition-all group"
          >
            <Layers className="w-5 h-5 text-purple-600 mb-2" />
            <div className="text-xs font-bold text-slate-900 group-hover:text-purple-700">完整案例库备份 (JSON)</div>
          </button>
        </div>
      </div>

      {/* Restore Section */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
            <Upload className="w-4 h-4 text-blue-600" />
            恢复案例库
          </h3>
        </div>

        <div className="p-6 border-2 border-dashed border-slate-200 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/50 rounded-xl transition-colors relative cursor-pointer text-center">
          <input
            type="file"
            accept=".json"
            disabled={restoring}
            onChange={(e) => handleRestoreBackup(e.target.files?.[0] || null)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          />
          {restoring ? (
            <div className="flex flex-col items-center gap-2">
              <RotateCcw className="w-6 h-6 text-blue-600 animate-spin" />
              <span className="text-xs text-blue-700 font-bold">正在恢复数据库...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-xs text-blue-600 border border-slate-200">
                <UploadCloud className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-slate-700 mt-2">点击或拖拽备份文件 (.json) 恢复数据</span>
              <span className="text-2xs text-slate-500">此操作将覆盖已有同ID数据</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const AdvancedToolsPanel: React.FC = () => {
  const [tool, setTool] = useState<'api' | 'parser' | 'dataset'>('api');

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-rose-600" />
          高级测试与开发工具
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          本页面仅限开发、测试及维护人员使用。请谨慎操作，部分功能可能产生高额API请求开销。
        </p>
      </div>

      <div className="flex items-center gap-3 border-b border-slate-200 pb-2">
        <button
          onClick={() => setTool('api')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
            tool === 'api' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          API通道测试 (工劳网)
        </button>
        <button
          onClick={() => setTool('parser')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
            tool === 'parser' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Parser 正则解析测试
        </button>
        <button
          onClick={() => setTool('dataset')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
            tool === 'dataset' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          数据集重建
        </button>
      </div>

      <div>
        {tool === 'api' && <LaborInfoApiTest />}
        {tool === 'parser' && <LaborInfoParserTest />}
        {tool === 'dataset' && <DatasetBuilderTest />}
      </div>
    </div>
  );
};
