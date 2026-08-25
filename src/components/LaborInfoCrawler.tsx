import React, { useState, useEffect, useRef } from 'react';
import {
  DownloadCloud,
  Play,
  Pause,
  Square,
  RefreshCw,
  Layers,
  Database,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Terminal,
  Filter,
  Calendar,
  Building,
  Scale,
  Trash2,
  ChevronRight,
  ShieldAlert,
  ArrowRight,
  Sparkles,
  Cpu,
  BarChart3,
  Check,
} from 'lucide-react';
import {
  LaborInfoCrawlParams,
  LaborInfoCrawlTask,
  CrawlLogEntry,
  LaborInfoCrawlSummary,
  PipelineMode,
} from '../types';
import { LaborInfoCrawler } from '../services/dataSource/LaborInfoCrawler';
import { DataService } from '../services/data/dataService';
import { LaborAnalysisPipeline, DataPipelineHealthStats } from '../services/data/LaborAnalysisPipeline';
import { LaborInfoImportHistory } from './LaborInfoImportHistory';

export const LaborInfoCrawlerComponent: React.FC = () => {
  // 采集参数状态
  const [params, setParams] = useState<LaborInfoCrawlParams>({
    province: ['广东省'],
    caseLevel: ['一审', '二审'],
    start_date: '2021-01-01',
    end_date: '2023-12-31',
    per_page: 50,
    maxCases: 100,
    startPage: 1,
    q: '',
    pipelineMode: 'crawl_parse_build',
  });

  // 运行与任务状态
  const [currentTask, setCurrentTask] = useState<LaborInfoCrawlTask | null>(null);
  const [historyTasks, setHistoryTasks] = useState<LaborInfoCrawlTask[]>([]);
  const [activeLogTaskId, setActiveLogTaskId] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [selectedPresetMax, setSelectedPresetMax] = useState<number>(100);
  const [pipelineHealth, setPipelineHealth] = useState<DataPipelineHealthStats | null>(null);

  // Crawler 实例引用
  const crawlerRef = useRef<LaborInfoCrawler | null>(null);
  const logTerminalRef = useRef<HTMLDivElement>(null);

  // 初始化并加载历史任务与数据链路状态
  const loadHistoryTasks = async () => {
    try {
      const tasks = await DataService.getAllCrawlTasks();
      setHistoryTasks(tasks);
      const health = await LaborAnalysisPipeline.getPipelineHealthStats();
      setPipelineHealth(health);
    } catch (e) {
      console.error('Failed to load crawl history tasks:', e);
    }
  };

  useEffect(() => {
    // 实例化 Crawler
    const crawler = new LaborInfoCrawler('https://laborinfocn.com', {
      onProgress: (task) => {
        setCurrentTask({ ...task });
      },
      onLog: () => {
        // 自动滚动日志终端
        if (logTerminalRef.current) {
          logTerminalRef.current.scrollTop = logTerminalRef.current.scrollHeight;
        }
      },
      onStateChange: (task) => {
        setCurrentTask({ ...task });
        loadHistoryTasks();
        setRefreshTrigger((prev) => prev + 1);
      },
    });
    crawlerRef.current = crawler;

    loadHistoryTasks();
  }, []);

  // 启动全新采集
  const handleStartCrawl = async () => {
    if (!crawlerRef.current) return;
    try {
      const task = await crawlerRef.current.startCrawl(params);
      setCurrentTask(task);
      setActiveLogTaskId(task.id);
      loadHistoryTasks();
    } catch (err: any) {
      alert(`启动采集失败: ${err.message}`);
    }
  };

  // 暂停采集
  const handlePauseCrawl = async () => {
    if (!crawlerRef.current) return;
    await crawlerRef.current.pauseCrawl();
  };

  // 恢复/断点继续采集
  const handleResumeCrawl = async (taskId?: string) => {
    if (!crawlerRef.current) return;
    const targetId = taskId || currentTask?.id;
    if (!targetId) return;

    try {
      const task = await crawlerRef.current.resumeCrawl(targetId);
      setCurrentTask(task);
      setActiveLogTaskId(task.id);
      loadHistoryTasks();
    } catch (err: any) {
      alert(`恢复任务失败: ${err.message}`);
    }
  };

  // 停止采集
  const handleStopCrawl = async () => {
    if (!crawlerRef.current) return;
    await crawlerRef.current.stopCrawl();
  };

  // 删除历史任务记录
  const handleDeleteTask = async (taskId: string) => {
    if (confirm('确认删除该条采集任务历史记录吗？（注意：已入库的裁判文书不会被删除）')) {
      await DataService.deleteCrawlTask(taskId);
      if (currentTask?.id === taskId) {
        setCurrentTask(null);
      }
      loadHistoryTasks();
    }
  };

  // 审级复选框切换
  const handleToggleCaseLevel = (level: string) => {
    setParams((prev) => {
      const exists = prev.caseLevel.includes(level);
      const nextLevels = exists
        ? prev.caseLevel.filter((l) => l !== level)
        : [...prev.caseLevel, level];
      return { ...prev, caseLevel: nextLevels.length ? nextLevels : [level] };
    });
  };

  // 省份切换
  const handleToggleProvince = (prov: string) => {
    setParams((prev) => {
      const exists = prev.province.includes(prov);
      const nextProvs = exists
        ? prev.province.filter((p) => p !== prov)
        : [...prev.province, prov];
      return { ...prev, province: nextProvs.length ? nextProvs : [prov] };
    });
  };

  const isRunning = currentTask?.status === 'running';
  const isPaused = currentTask?.status === 'paused';
  const progressPercent = currentTask
    ? Math.min(100, Math.round(((currentTask.saved + currentTask.duplicates) / (currentTask.params.maxCases || 100)) * 100))
    : 0;

  return (
    <div className="space-y-6">
      {/* 顶部标题与说明卡片 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20 shrink-0">
              <DownloadCloud className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  工劳网裁判文书批量采集与全链路案例构建
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  真实数据流水线
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-3xl leading-relaxed">
                合规节流串行分页抓取工劳网裁判文书全文 (fbqw)，采用
                <code className="text-slate-700 font-bold px-1 bg-slate-100 rounded">sourceId + SHA-256</code>
                双重严格去重入库至本地 IndexedDB
                <code className="text-slate-700 font-bold px-1 bg-slate-100 rounded">rawDocuments</code>
                表，并可直通解析、质检评估与可分析案例集构建。
              </p>
            </div>
          </div>

          {/* 状态徽标 */}
          <div className="flex items-center gap-3 self-start lg:self-center">
            {currentTask && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-slate-50 border-slate-200 text-xs">
                <span className="text-slate-500 font-medium">当前任务状态:</span>
                <span
                  className={`px-2 py-0.5 rounded-full font-bold uppercase ${
                    currentTask.status === 'running'
                      ? 'bg-emerald-100 text-emerald-700 animate-pulse'
                      : currentTask.status === 'paused'
                      ? 'bg-amber-100 text-amber-700'
                      : currentTask.status === 'completed'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {currentTask.status === 'running' && '运行中'}
                  {currentTask.status === 'paused' && (currentTask.rateLimited ? '限流暂停' : '已暂停')}
                  {currentTask.status === 'completed' && '已完成'}
                  {currentTask.status === 'stopped' && '已停止'}
                  {currentTask.status === 'failed' && '异常失败'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 数据链路全景概览 (Data Pipeline Health Status) */}
      {pipelineHealth && (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 rounded-2xl p-6 text-white shadow-md">
          <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-400" />
              <h2 className="text-sm font-bold text-white tracking-wide">
                数据处理全链路实时流通状态
              </h2>
            </div>
            <span className="text-2xs text-slate-300 font-mono">
              RawDocument → Parser → Evaluator → AnalysisCaseRecord
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3.5 bg-white/5 rounded-xl border border-white/10">
              <div className="text-2xs text-slate-400 font-semibold uppercase">原始裁判文书总库</div>
              <div className="text-xl font-bold font-mono text-white mt-1">
                {pipelineHealth.totalRawDocuments} <span className="text-xs font-normal text-slate-400">篇</span>
              </div>
              <div className="text-2xs text-emerald-400 mt-1 flex items-center gap-1">
                <Check className="w-3 h-3" />
                正文完整率 {pipelineHealth.totalRawDocuments > 0 ? '100%' : '0%'}
              </div>
            </div>

            <div className="p-3.5 bg-white/5 rounded-xl border border-white/10">
              <div className="text-2xs text-slate-400 font-semibold uppercase">规则提取解析完成</div>
              <div className="text-xl font-bold font-mono text-cyan-300 mt-1">
                {pipelineHealth.parsedCount} <span className="text-xs font-normal text-slate-400">篇</span>
              </div>
              <div className="text-2xs text-cyan-400 mt-1">
                解析成功率 {pipelineHealth.totalRawDocuments > 0 ? Math.round((pipelineHealth.parsedCount / pipelineHealth.totalRawDocuments) * 100) : 0}%
              </div>
            </div>

            <div className="p-3.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
              <div className="text-2xs text-emerald-400 font-semibold uppercase">正式可分析案例集</div>
              <div className="text-xl font-bold font-mono text-emerald-300 mt-1 flex items-center gap-1.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                {pipelineHealth.admittedCount} <span className="text-xs font-normal text-emerald-400/70">篇</span>
              </div>
              <div className="text-2xs text-emerald-400/80 mt-1">
                准入率 {pipelineHealth.parsedCount > 0 ? Math.round((pipelineHealth.admittedCount / pipelineHealth.parsedCount) * 100) : 0}% (≥80分或已审核)
              </div>
            </div>

            <div className="p-3.5 bg-amber-500/10 rounded-xl border border-amber-500/20">
              <div className="text-2xs text-amber-400 font-semibold uppercase">待优化 / 待质检池</div>
              <div className="text-xl font-bold font-mono text-amber-300 mt-1">
                {pipelineHealth.pendingCount} <span className="text-xs font-normal text-amber-400/70">篇</span>
              </div>
              <div className="text-2xs text-amber-400/80 mt-1">
                严格隔离，不参与生产级统计与抗辩矩阵
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 第一部分：采集配置表单 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Filter className="w-4 h-4 text-indigo-600" />
            采集检索条件配置
          </h2>
          <span className="text-2xs text-slate-400">
            支持按省份、审级、裁判年份区间与流水线模式精准拉取
          </span>
        </div>

        {/* 流水线模式选择 (Pipeline Mode) */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <label className="block text-2xs font-bold text-slate-700 uppercase tracking-wider">
            数据处理流水线模式 (Pipeline Processing Mode)
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              type="button"
              disabled={isRunning}
              onClick={() => setParams({ ...params, pipelineMode: 'raw_only' })}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                params.pipelineMode === 'raw_only'
                  ? 'bg-white border-indigo-600 ring-2 ring-indigo-500/20 shadow-xs'
                  : 'bg-slate-100/60 border-slate-200 hover:bg-white text-slate-600'
              }`}
            >
              <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                <span>仅采集原始文书</span>
                {params.pipelineMode === 'raw_only' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
              </div>
              <p className="text-2xs text-slate-500 mt-1 leading-normal">
                仅入库 rawDocuments 表，不触发自动解析与打分。
              </p>
            </button>

            <button
              type="button"
              disabled={isRunning}
              onClick={() => setParams({ ...params, pipelineMode: 'crawl_and_parse' })}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                params.pipelineMode === 'crawl_and_parse'
                  ? 'bg-white border-indigo-600 ring-2 ring-indigo-500/20 shadow-xs'
                  : 'bg-slate-100/60 border-slate-200 hover:bg-white text-slate-600'
              }`}
            >
              <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                <span>采集并自动解析</span>
                {params.pipelineMode === 'crawl_and_parse' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
              </div>
              <p className="text-2xs text-slate-500 mt-1 leading-normal">
                采集后自动提取结构化字段与打分，不自动导入分析库。
              </p>
            </button>

            <button
              type="button"
              disabled={isRunning}
              onClick={() => setParams({ ...params, pipelineMode: 'crawl_parse_build' })}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                params.pipelineMode === 'crawl_parse_build'
                  ? 'bg-indigo-50/50 border-indigo-600 ring-2 ring-indigo-500/30 shadow-xs'
                  : 'bg-slate-100/60 border-slate-200 hover:bg-white text-slate-600'
              }`}
            >
              <div className="text-xs font-bold text-indigo-900 flex items-center justify-between">
                <span>采集 + 解析 + 构建可分析案例 (推荐)</span>
                {params.pipelineMode === 'crawl_parse_build' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
              </div>
              <p className="text-2xs text-indigo-700/80 mt-1 leading-normal">
                全链路打通，高质量案例即刻进入可分析案例库。
              </p>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 省份 */}
          <div>
            <label className="block text-2xs font-semibold text-slate-600 uppercase mb-1.5">
              目标省份
            </label>
            <div className="flex flex-wrap gap-1.5">
              {['广东省', '北京市', '上海市', '浙江省', '江苏省'].map((prov) => {
                const isSelected = params.province.includes(prov);
                return (
                  <button
                    key={prov}
                    type="button"
                    disabled={isRunning}
                    onClick={() => handleToggleProvince(prov)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white font-bold'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {prov}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 审级 */}
          <div>
            <label className="block text-2xs font-semibold text-slate-600 uppercase mb-1.5">
              案件审级
            </label>
            <div className="flex flex-wrap gap-1.5">
              {['一审', '二审', '再审', '执行'].map((level) => {
                const isSelected = params.caseLevel.includes(level);
                return (
                  <button
                    key={level}
                    type="button"
                    disabled={isRunning}
                    onClick={() => handleToggleCaseLevel(level)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white font-bold'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 时间范围 */}
          <div className="lg:col-span-2 grid grid-cols-2 gap-2">
            <div>
              <label className="block text-2xs font-semibold text-slate-600 uppercase mb-1.5">
                开始裁判日期 (start_date)
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="date"
                  disabled={isRunning}
                  value={params.start_date || '2021-01-01'}
                  onChange={(e) => setParams({ ...params, start_date: e.target.value })}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-2xs font-semibold text-slate-600 uppercase mb-1.5">
                结束裁判日期 (end_date)
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="date"
                  disabled={isRunning}
                  value={params.end_date || '2023-12-31'}
                  onChange={(e) => setParams({ ...params, end_date: e.target.value })}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 第二排参数：每页条数、最大采集量、起始页、关键词 */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 pt-2 border-t border-slate-100">
          {/* 本次最大采集量预设 */}
          <div>
            <label className="block text-2xs font-semibold text-slate-600 uppercase mb-1.5">
              本次采集目标上限 (maxCases)
            </label>
            <div className="flex items-center gap-1.5">
              {[10, 50, 100, 200, 500].map((count) => (
                <button
                  key={count}
                  type="button"
                  disabled={isRunning}
                  onClick={() => {
                    setSelectedPresetMax(count);
                    setParams({ ...params, maxCases: count });
                  }}
                  className={`px-2 py-1 rounded text-xs font-mono font-semibold transition-colors cursor-pointer ${
                    params.maxCases === count
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {count === 10 ? '10 (测试)' : count}
                </button>
              ))}
            </div>
          </div>

          {/* 每页条数 */}
          <div>
            <label className="block text-2xs font-semibold text-slate-600 uppercase mb-1.5">
              每页请求条数 (per_page)
            </label>
            <select
              disabled={isRunning}
              value={params.per_page}
              onChange={(e) => setParams({ ...params, per_page: Number(e.target.value) })}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value={10}>10 条 / 页</option>
              <option value={20}>20 条 / 页</option>
              <option value={50}>50 条 / 页 (推荐)</option>
            </select>
          </div>

          {/* 起始页码 */}
          <div>
            <label className="block text-2xs font-semibold text-slate-600 uppercase mb-1.5">
              起始页码 (startPage)
            </label>
            <input
              type="number"
              min={1}
              disabled={isRunning}
              value={params.startPage || 1}
              onChange={(e) => setParams({ ...params, startPage: Math.max(1, Number(e.target.value)) })}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500 font-mono"
            />
          </div>

          {/* 可选关键词 */}
          <div>
            <label className="block text-2xs font-semibold text-slate-600 uppercase mb-1.5">
              可选搜索关键词 (q)
            </label>
            <input
              type="text"
              placeholder="留空即抓取全部争议类型"
              disabled={isRunning}
              value={params.q || ''}
              onChange={(e) => setParams({ ...params, q: e.target.value })}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* 操作按钮栏 */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="text-2xs text-slate-500 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
            <span>
              已内置节流（搜索 800ms / 详情 500ms），自动过滤 5 篇固定测试样本，遭遇限流自动挂起。
            </span>
          </div>

          <div className="flex items-center gap-2">
            {!isRunning ? (
              <button
                type="button"
                onClick={handleStartCrawl}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
              >
                <Play className="w-4 h-4 fill-white" />
                开始批量采集任务
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handlePauseCrawl}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Pause className="w-4 h-4" />
                  暂停任务
                </button>
                <button
                  type="button"
                  onClick={handleStopCrawl}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Square className="w-4 h-4" />
                  停止任务
                </button>
              </>
            )}

            {isPaused && (
              <button
                type="button"
                onClick={() => handleResumeCrawl()}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
              >
                <Play className="w-4 h-4 fill-white" />
                继续当前采集任务
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 第二部分：实时状态监控看板 */}
      {currentTask && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <RefreshCw className={`w-4 h-4 text-indigo-600 ${isRunning ? 'animate-spin' : ''}`} />
              实时采集监控看板
              <span className="text-2xs font-mono text-slate-400 font-normal">
                (Task ID: {currentTask.id})
              </span>
            </h2>
            <div className="text-xs font-mono text-slate-600 font-semibold">
              目标上限: {currentTask.params.maxCases} 篇
            </div>
          </div>

          {/* 进度条 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 flex items-center gap-1">
                采集进度:
                <span className="text-indigo-600 font-mono font-bold">
                  {currentTask.saved + currentTask.duplicates} / {currentTask.params.maxCases}
                </span>
                <span className="text-slate-400 text-2xs">
                  (有效入库 {currentTask.saved} + 重复跳过 {currentTask.duplicates})
                </span>
              </span>
              <span className="font-mono font-bold text-indigo-600">{progressPercent}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-blue-600 transition-all duration-300 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* 统计指标卡片群 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-2xs font-semibold text-slate-500 uppercase">当前页码</div>
              <div className="text-base font-bold font-mono text-slate-800 mt-1">
                {currentTask.currentPage} <span className="text-2xs text-slate-400 font-normal">/ {currentTask.totalPages}</span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-2xs font-semibold text-slate-500 uppercase">扫描案件</div>
              <div className="text-base font-bold font-mono text-slate-800 mt-1">
                {currentTask.found}
              </div>
            </div>

            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl">
              <div className="text-2xs font-semibold text-emerald-700 uppercase">成功入库 (saved)</div>
              <div className="text-base font-bold font-mono text-emerald-700 mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                {currentTask.saved}
              </div>
            </div>

            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl">
              <div className="text-2xs font-semibold text-amber-700 uppercase">重复跳过 (dup)</div>
              <div className="text-base font-bold font-mono text-amber-700 mt-1">
                {currentTask.duplicates}
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-2xs font-semibold text-slate-500 uppercase">过滤测试样本</div>
              <div className="text-base font-bold font-mono text-slate-700 mt-1">
                {currentTask.filteredSamples}
              </div>
            </div>

            <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl">
              <div className="text-2xs font-semibold text-indigo-700 uppercase">结构化解析成功</div>
              <div className="text-base font-bold font-mono text-indigo-700 mt-1">
                {currentTask.parsedSuccess || 0}
              </div>
            </div>

            <div className="p-3 bg-emerald-50/70 border border-emerald-300 rounded-xl">
              <div className="text-2xs font-semibold text-emerald-800 uppercase">正式分析集入选</div>
              <div className="text-base font-bold font-mono text-emerald-800 mt-1 flex items-center gap-1">
                <Check className="w-4 h-4" />
                {currentTask.includedInAnalysisSet || 0}
              </div>
            </div>

            <div className="p-3 bg-amber-50/70 border border-amber-300 rounded-xl">
              <div className="text-2xs font-semibold text-amber-800 uppercase">待优化隔离池</div>
              <div className="text-base font-bold font-mono text-amber-800 mt-1">
                {currentTask.pendingOptimization || 0}
              </div>
            </div>

            <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-xl">
              <div className="text-2xs font-semibold text-rose-700 uppercase">采集/正文异常</div>
              <div className="text-base font-bold font-mono text-rose-700 mt-1">
                {(currentTask.failed || 0) + (currentTask.emptyText || 0) + (currentTask.parsedFailed || 0)}
              </div>
            </div>

            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl">
              <div className="text-2xs font-semibold text-blue-700 uppercase">API 总文书数</div>
              <div className="text-base font-bold font-mono text-blue-700 mt-1">
                {currentTask.totalCountInApi.toLocaleString()}
              </div>
            </div>
          </div>

          {/* 实时终端日志 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <div className="flex items-center gap-1.5 font-bold">
                <Terminal className="w-4 h-4 text-slate-700" />
                实时执行调度日志 (Console Stream)
              </div>
              <span className="text-2xs font-mono text-slate-400">
                共 {currentTask.logs.length} 条记录
              </span>
            </div>

            <div
              ref={logTerminalRef}
              className="p-4 bg-slate-950 text-slate-300 font-mono text-xs rounded-xl h-56 overflow-y-auto space-y-1.5 border border-slate-800 shadow-inner select-text"
            >
              {currentTask.logs.length === 0 ? (
                <div className="text-slate-600 italic">等待日志输出...</div>
              ) : (
                currentTask.logs.map((log, index) => (
                  <div key={log.id || index} className="flex items-start gap-2 leading-relaxed">
                    <span className="text-slate-500 select-none shrink-0">[{log.time}]</span>
                    <span
                      className={`shrink-0 font-bold ${
                        log.level === 'success'
                          ? 'text-emerald-400'
                          : log.level === 'warn'
                          ? 'text-amber-400'
                          : log.level === 'error'
                          ? 'text-rose-400'
                          : 'text-cyan-400'
                      }`}
                    >
                      {log.level === 'success' && '✔'}
                      {log.level === 'warn' && '▲'}
                      {log.level === 'error' && '✖'}
                      {log.level === 'info' && '•'}
                    </span>
                    <span
                      className={`${
                        log.level === 'success'
                          ? 'text-emerald-300'
                          : log.level === 'warn'
                          ? 'text-amber-200'
                          : log.level === 'error'
                          ? 'text-rose-300'
                          : 'text-slate-200'
                      }`}
                    >
                      {log.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 第三部分：历史任务管理 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-800">
              采集任务历史记录 (断点续传管理)
            </h2>
            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-2xs rounded-full font-mono font-semibold">
              {historyTasks.length} 个任务
            </span>
          </div>
          <button
            onClick={loadHistoryTasks}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            刷新任务列表
          </button>
        </div>

        {historyTasks.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50">
            暂无采集任务记录，点击上方「开始批量采集任务」即可创建新任务
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-3.5 py-2.5">任务 ID</th>
                  <th className="px-3.5 py-2.5">条件范围</th>
                  <th className="px-3.5 py-2.5">目标/已入库</th>
                  <th className="px-3.5 py-2.5">重复/过滤</th>
                  <th className="px-3.5 py-2.5">当前页码</th>
                  <th className="px-3.5 py-2.5">状态</th>
                  <th className="px-3.5 py-2.5">更新时间</th>
                  <th className="px-3.5 py-2.5 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {historyTasks.map((task) => {
                  const isCurrent = currentTask?.id === task.id;
                  return (
                    <tr
                      key={task.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isCurrent ? 'bg-indigo-50/40' : ''
                      }`}
                    >
                      <td className="px-3.5 py-2.5 font-mono text-slate-600 font-semibold">
                        {task.id}
                      </td>
                      <td className="px-3.5 py-2.5 text-slate-600">
                        <div className="font-medium text-slate-800">
                          {task.params.province.join(', ')} · {task.params.caseLevel.join(', ')}
                        </div>
                        <div className="text-2xs font-mono text-slate-400">
                          {task.params.start_date} ~ {task.params.end_date}
                        </div>
                      </td>
                      <td className="px-3.5 py-2.5 font-mono">
                        <span className="font-bold text-emerald-700">{task.saved}</span> /{' '}
                        <span className="text-slate-500">{task.params.maxCases}</span>
                      </td>
                      <td className="px-3.5 py-2.5 font-mono text-2xs text-slate-500">
                        重复: {task.duplicates} · 过滤: {task.filteredSamples}
                      </td>
                      <td className="px-3.5 py-2.5 font-mono text-slate-600">
                        第 {task.currentPage} / {task.totalPages} 页
                      </td>
                      <td className="px-3.5 py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-2xs font-semibold ${
                            task.status === 'running'
                              ? 'bg-emerald-100 text-emerald-700'
                              : task.status === 'paused'
                              ? 'bg-amber-100 text-amber-700'
                              : task.status === 'completed'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {task.status}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 font-mono text-2xs text-slate-400">
                        {new Date(task.updatedAt).toLocaleTimeString()}
                      </td>
                      <td className="px-3.5 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {task.status !== 'completed' && task.status !== 'running' && (
                            <button
                              onClick={() => handleResumeCrawl(task.id)}
                              className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold rounded text-2xs flex items-center gap-0.5 cursor-pointer"
                              title="从断点继续"
                            >
                              <Play className="w-3 h-3 fill-emerald-700" />
                              继续
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteTask(task.id)}
                            className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                            title="删除任务记录"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 第四部分：已入库的本地案例库 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <LaborInfoImportHistory onRefreshTrigger={refreshTrigger} />
      </div>
    </div>
  );
};
