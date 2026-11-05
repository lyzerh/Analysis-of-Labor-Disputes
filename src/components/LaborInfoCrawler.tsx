import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Play,
  Pause,
  Square,
  RefreshCw,
  Layers,
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
import { createPipelineHealthPresentation } from '../services/data/PipelineHealthPresentation';
import { LaborInfoImportHistory } from './LaborInfoImportHistory';

export const LaborInfoCrawlerComponent: React.FC = () => {
  const { t } = useTranslation();
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
  const pipelineHealthView = pipelineHealth ? createPipelineHealthPresentation(pipelineHealth) : null;

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
      alert(t('dataManagement.crawlerUi.startFailed', { message: err.message }));
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
      alert(t('dataManagement.crawlerUi.resumeFailed', { message: err.message }));
    }
  };

  // 停止采集
  const handleStopCrawl = async () => {
    if (!crawlerRef.current) return;
    await crawlerRef.current.stopCrawl();
  };

  // 删除历史任务记录
  const handleDeleteTask = async (taskId: string) => {
    if (confirm(t('dataManagement.crawlerUi.deleteConfirm'))) {
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
    <div className="space-y-8">
      {/* 顶部标题与说明卡片 */}
      <div className="bg-white/80 backdrop-blur-xl border border-white/80 rounded-[28px] p-7 shadow-[0_12px_40px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">{t('dataManagement.crawlerUi.copy001')}{' '}</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">{t('dataManagement.crawlerUi.copy002')}{' '}</span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-3xl leading-relaxed">{t('dataManagement.crawlerUi.copy003')}{' '}</p>
              <details className="mt-2 text-2xs text-slate-400">
                <summary className="cursor-pointer select-none">{t('dataManagement.crawlerUi.copy004')}</summary>
                <p className="mt-1 font-mono">{t('dataManagement.crawlerUi.copy005')}</p>
              </details>
            </div>
          </div>

          {/* 状态徽标 */}
          <div className="flex items-center gap-3 self-start lg:self-center">
            {currentTask && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-slate-50 border-slate-200 text-xs">
                <span className="text-slate-500 font-medium">{t('dataManagement.crawlerUi.copy006')}</span>
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
                  {currentTask.status === 'running' && t('dataManagement.crawlerUi.running')}
                  {currentTask.status === 'paused' && (currentTask.rateLimited ? t('dataManagement.crawlerUi.rateLimited') : t('dataManagement.crawlerUi.paused'))}
                  {currentTask.status === 'completed' && t('dataManagement.crawlerUi.completed')}
                  {currentTask.status === 'stopped' && t('dataManagement.crawlerUi.stopped')}
                  {currentTask.status === 'failed' && t('dataManagement.crawlerUi.failed')}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 数据链路全景概览 (Data Pipeline Health Status) */}
      {pipelineHealthView && (
        <div className="bg-white/80 backdrop-blur-xl border border-white/80 rounded-[24px] p-6 text-slate-900 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-600" />
              <h2 className="text-sm font-bold text-slate-900 tracking-wide">{t('dataManagement.crawlerUi.copy007')}{' '}</h2>
            </div>
            <details className="text-2xs text-slate-500">
              <summary className="cursor-pointer select-none">{t('dataManagement.crawlerUi.copy008')}</summary>
              <span className="mt-1 block font-mono text-slate-400">RawDocument → Parser → Evaluator → AnalysisCaseRecord</span>
            </details>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-100">
              <div className="text-2xs text-slate-500 font-semibold uppercase">{t('dataManagement.crawlerUi.copy009')}</div>
              <div className="text-xl font-bold font-mono text-slate-900 mt-1">
                {pipelineHealthView.rawCount} <span className="text-xs font-normal text-slate-500">{t('dataManagement.crawlerUi.copy010')}</span>
              </div>
              <div className="text-2xs text-emerald-700 mt-1 flex items-center gap-1">
                <Check className="w-3 h-3" />{t('dataManagement.crawlerUi.copy011')}{' '}{pipelineHealthView.rawCompletenessRate}%
              </div>
            </div>

            <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-100">
              <div className="text-2xs text-slate-500 font-semibold uppercase">{t('dataManagement.crawlerUi.copy012')}</div>
              <div className="text-xl font-bold font-mono text-slate-900 mt-1">
                {pipelineHealthView.parsedCount} <span className="text-xs font-normal text-slate-500">{t('dataManagement.crawlerUi.copy013')}</span>
              </div>
              <div className="text-2xs text-cyan-700 mt-1">{t('dataManagement.crawlerUi.copy014')}{' '}{pipelineHealthView.parseSuccessRate}%
              </div>
            </div>

            <div className="p-4 bg-emerald-50/80 rounded-2xl border border-emerald-100">
              <div className="text-2xs text-emerald-700 font-semibold uppercase">{t('dataManagement.crawlerUi.copy015')}</div>
              <div className="text-xl font-bold font-mono text-emerald-800 mt-1 flex items-center gap-1.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                {pipelineHealthView.availableCount} <span className="text-xs font-normal text-emerald-700/70">{t('dataManagement.crawlerUi.copy013')}</span>
              </div>
              <div className="text-2xs text-emerald-700/80 mt-1">{t('dataManagement.crawlerUi.copy016')}{' '}{pipelineHealthView.analysisAvailabilityRate}{t('dataManagement.crawlerUi.copy017')}{' '}</div>
            </div>

            <div className="p-4 bg-amber-50/80 rounded-2xl border border-amber-100">
              <div className="text-2xs text-amber-700 font-semibold uppercase">{t('dataManagement.crawlerUi.copy018')}</div>
              <div className="text-xl font-bold font-mono text-amber-800 mt-1">
                {pipelineHealthView.pendingCount} <span className="text-xs font-normal text-amber-700/70">{t('dataManagement.crawlerUi.copy013')}</span>
              </div>
              <div className="text-2xs text-amber-700/80 mt-1">{t('dataManagement.crawlerUi.copy019')}{' '}</div>
            </div>
          </div>
        </div>
      )}

      {/* 第一部分：采集配置表单 */}
      <div className="bg-white/80 border border-white/80 rounded-[24px] p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Filter className="w-4 h-4 text-indigo-600" />{t('dataManagement.crawlerUi.copy020')}{' '}</h2>
          <span className="text-2xs text-slate-400">{t('dataManagement.crawlerUi.copy021')}{' '}</span>
        </div>

        {/* 流水线模式选择 (Pipeline Mode) */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <label className="block text-2xs font-bold text-slate-700 uppercase tracking-wider">{t('dataManagement.crawlerUi.copy022')}{' '}</label>
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
                <span>{t('dataManagement.crawlerUi.copy023')}</span>
                {params.pipelineMode === 'raw_only' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
              </div>
              <p className="text-2xs text-slate-500 mt-1 leading-normal">{t('dataManagement.crawlerUi.copy024')}{' '}</p>
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
                <span>{t('dataManagement.crawlerUi.copy025')}</span>
                {params.pipelineMode === 'crawl_and_parse' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
              </div>
              <p className="text-2xs text-slate-500 mt-1 leading-normal">{t('dataManagement.crawlerUi.copy026')}{' '}</p>
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
                <span>{t('dataManagement.crawlerUi.copy027')}</span>
                {params.pipelineMode === 'crawl_parse_build' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
              </div>
              <p className="text-2xs text-indigo-700/80 mt-1 leading-normal">{t('dataManagement.crawlerUi.copy028')}{' '}</p>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 省份 */}
          <div>
            <label className="block text-2xs font-semibold text-slate-600 uppercase mb-1.5">{t('dataManagement.crawlerUi.copy029')}{' '}</label>
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
            <p className="text-2xs text-slate-500 mt-1.5">{t('dataManagement.crawlerUi.copy030')}</p>
          </div>

          {/* 审级 */}
          <div>
            <label className="block text-2xs font-semibold text-slate-600 uppercase mb-1.5">{t('dataManagement.crawlerUi.copy031')}{' '}</label>
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
              <label className="block text-2xs font-semibold text-slate-600 uppercase mb-1.5">{t('dataManagement.crawlerUi.copy032')}{' '}</label>
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
              <label className="block text-2xs font-semibold text-slate-600 uppercase mb-1.5">{t('dataManagement.crawlerUi.copy033')}{' '}</label>
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
            <label className="block text-2xs font-semibold text-slate-600 uppercase mb-1.5">{t('dataManagement.crawlerUi.copy034')}{' '}</label>
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
                  {count === 10 ? t('dataManagement.crawlerUi.testCount') : count}
                </button>
              ))}
            </div>
          </div>

          {/* 每页条数 */}
          <div>
            <label className="block text-2xs font-semibold text-slate-600 uppercase mb-1.5">{t('dataManagement.crawlerUi.copy035')}{' '}</label>
            <select
              disabled={isRunning}
              value={params.per_page}
              onChange={(e) => setParams({ ...params, per_page: Number(e.target.value) })}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value={10}>{t('dataManagement.crawlerUi.copy036')}</option>
              <option value={20}>{t('dataManagement.crawlerUi.copy037')}</option>
              <option value={50}>{t('dataManagement.crawlerUi.copy038')}</option>
            </select>
          </div>

          {/* 起始页码 */}
          <div>
            <label className="block text-2xs font-semibold text-slate-600 uppercase mb-1.5">{t('dataManagement.crawlerUi.copy039')}{' '}</label>
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
            <label className="block text-2xs font-semibold text-slate-600 uppercase mb-1.5">{t('dataManagement.crawlerUi.copy040')}{' '}</label>
            <input
              type="text"
              placeholder={t('dataManagement.crawlerUi.copy041')}
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
            <span>{t('dataManagement.crawlerUi.copy042')}{' '}</span>
          </div>

          <div className="flex items-center gap-2">
            {!isRunning ? (
              <button
                type="button"
                onClick={handleStartCrawl}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
              >
                <Play className="w-4 h-4 fill-white" />{t('dataManagement.crawlerUi.copy043')}{' '}</button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handlePauseCrawl}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Pause className="w-4 h-4" />{t('dataManagement.crawlerUi.copy044')}{' '}</button>
                <button
                  type="button"
                  onClick={handleStopCrawl}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Square className="w-4 h-4" />{t('dataManagement.crawlerUi.copy045')}{' '}</button>
              </>
            )}

            {isPaused && (
              <button
                type="button"
                onClick={() => handleResumeCrawl()}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
              >
                <Play className="w-4 h-4 fill-white" />{t('dataManagement.crawlerUi.copy046')}{' '}</button>
            )}
          </div>
        </div>
      </div>

      {/* 第二部分：实时状态监控看板 */}
      {currentTask && (
        <div className="bg-white/80 border border-white/80 rounded-[24px] p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <RefreshCw className={`w-4 h-4 text-indigo-600 ${isRunning ? 'animate-spin' : ''}`} />{t('dataManagement.crawlerUi.copy047')}{' '}<details className="text-2xs font-normal text-slate-400">
                <summary className="cursor-pointer select-none">{t('dataManagement.crawlerUi.copy048')}</summary>
                <span className="mt-1 block font-mono">Task ID: {currentTask.id}</span>
              </details>
            </h2>
            <div className="text-xs font-mono text-slate-600 font-semibold">{t('dataManagement.crawlerUi.copy049')}{' '}{currentTask.params.maxCases}{t('dataManagement.crawlerUi.copy050')}{' '}</div>
          </div>

          {/* 进度条 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 flex items-center gap-1">{t('dataManagement.crawlerUi.copy051')}{' '}<span className="text-indigo-600 font-mono font-bold">
                  {currentTask.saved + currentTask.duplicates} / {currentTask.params.maxCases}
                </span>
                <span className="text-slate-400 text-2xs">{t('dataManagement.crawlerUi.copy052')}{' '}{currentTask.saved}{t('dataManagement.crawlerUi.copy053')}{' '}{currentTask.duplicates})
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
              <div className="text-2xs font-semibold text-slate-500 uppercase">{t('dataManagement.crawlerUi.copy054')}</div>
              <div className="text-base font-bold font-mono text-slate-800 mt-1">
                {currentTask.currentPage} <span className="text-2xs text-slate-400 font-normal">/ {currentTask.totalPages}</span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-2xs font-semibold text-slate-500 uppercase">{t('dataManagement.crawlerUi.copy055')}</div>
              <div className="text-base font-bold font-mono text-slate-800 mt-1">
                {currentTask.found}
              </div>
            </div>

            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl">
              <div className="text-2xs font-semibold text-emerald-700 uppercase">{t('dataManagement.crawlerUi.copy056')}</div>
              <div className="text-base font-bold font-mono text-emerald-700 mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                {currentTask.saved}
              </div>
            </div>

            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl">
              <div className="text-2xs font-semibold text-amber-700 uppercase">{t('dataManagement.crawlerUi.copy057')}</div>
              <div className="text-base font-bold font-mono text-amber-700 mt-1">
                {currentTask.duplicates}
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-2xs font-semibold text-slate-500 uppercase">{t('dataManagement.crawlerUi.copy058')}</div>
              <div className="text-base font-bold font-mono text-slate-700 mt-1">
                {currentTask.filteredSamples}
              </div>
            </div>

            <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl">
              <div className="text-2xs font-semibold text-indigo-700 uppercase">{t('dataManagement.crawlerUi.copy059')}</div>
              <div className="text-base font-bold font-mono text-indigo-700 mt-1">
                {currentTask.parsedSuccess || 0}
              </div>
            </div>

            <div className="p-3 bg-emerald-50/70 border border-emerald-300 rounded-xl">
              <div className="text-2xs font-semibold text-emerald-800 uppercase">{t('dataManagement.crawlerUi.copy060')}</div>
              <div className="text-base font-bold font-mono text-emerald-800 mt-1 flex items-center gap-1">
                <Check className="w-4 h-4" />
                {currentTask.includedInAnalysisSet || 0}
              </div>
            </div>

            <div className="p-3 bg-amber-50/70 border border-amber-300 rounded-xl">
              <div className="text-2xs font-semibold text-amber-800 uppercase">{t('dataManagement.crawlerUi.copy061')}</div>
              <div className="text-base font-bold font-mono text-amber-800 mt-1">
                {currentTask.pendingOptimization || 0}
              </div>
            </div>

            <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-xl">
              <div className="text-2xs font-semibold text-rose-700 uppercase">{t('dataManagement.crawlerUi.copy062')}</div>
              <div className="text-base font-bold font-mono text-rose-700 mt-1">
                {(currentTask.failed || 0) + (currentTask.emptyText || 0) + (currentTask.parsedFailed || 0)}
              </div>
            </div>

            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl">
              <div className="text-2xs font-semibold text-blue-700 uppercase">{t('dataManagement.crawlerUi.copy063')}</div>
              <div className="text-base font-bold font-mono text-blue-700 mt-1">
                {currentTask.totalCountInApi.toLocaleString()}
              </div>
            </div>
          </div>

          {/* 实时终端日志 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <div className="flex items-center gap-1.5 font-bold">
                <Terminal className="w-4 h-4 text-slate-700" />{t('dataManagement.crawlerUi.copy064')}{' '}</div>
              <span className="text-2xs font-mono text-slate-400">{t('dataManagement.crawlerUi.copy065')}{' '}{currentTask.logs.length}{t('dataManagement.crawlerUi.copy066')}{' '}</span>
            </div>

            <div
              ref={logTerminalRef}
              className="p-4 bg-slate-950 text-slate-300 font-mono text-xs rounded-xl h-56 overflow-y-auto space-y-1.5 border border-slate-800 shadow-inner select-text"
            >
              {currentTask.logs.length === 0 ? (
                <div className="text-slate-600 italic">{t('dataManagement.crawlerUi.copy067')}</div>
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
      <div className="bg-white/80 border border-white/80 rounded-[24px] p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-800">{t('dataManagement.crawlerUi.copy068')}{' '}</h2>
            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-2xs rounded-full font-mono font-semibold">
              {historyTasks.length}{t('dataManagement.crawlerUi.copy069')}{' '}</span>
          </div>
          <button
            onClick={loadHistoryTasks}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />{t('dataManagement.crawlerUi.copy070')}{' '}</button>
        </div>

        {historyTasks.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50">{t('dataManagement.crawlerUi.copy071')}{' '}</div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-3.5 py-2.5">{t('dataManagement.crawlerUi.copy072')}</th>
                  <th className="px-3.5 py-2.5">{t('dataManagement.crawlerUi.copy073')}</th>
                  <th className="px-3.5 py-2.5">{t('dataManagement.crawlerUi.copy074')}</th>
                  <th className="px-3.5 py-2.5">{t('dataManagement.crawlerUi.copy075')}</th>
                  <th className="px-3.5 py-2.5">{t('dataManagement.crawlerUi.copy054')}</th>
                  <th className="px-3.5 py-2.5">{t('dataManagement.crawlerUi.copy076')}</th>
                  <th className="px-3.5 py-2.5">{t('dataManagement.crawlerUi.copy077')}</th>
                  <th className="px-3.5 py-2.5 text-right">{t('dataManagement.crawlerUi.copy078')}</th>
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
                      <td className="px-3.5 py-2.5 text-slate-600 font-semibold">
                        <div>{t('dataManagement.crawlerUi.copy079')}</div>
                        <details className="text-2xs text-slate-400 font-normal">
                          <summary className="cursor-pointer select-none">{t('dataManagement.crawlerUi.copy004')}</summary>
                          <span className="mt-1 block font-mono">Task ID: {task.id}</span>
                        </details>
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
                      <td className="px-3.5 py-2.5 font-mono text-2xs text-slate-500">{t('dataManagement.crawlerUi.copy080')}{' '}{task.duplicates}{t('dataManagement.crawlerUi.copy081')}{' '}{task.filteredSamples}
                      </td>
                      <td className="px-3.5 py-2.5 font-mono text-slate-600">{t('dataManagement.crawlerUi.copy082')}{' '}{task.currentPage} / {task.totalPages}{t('dataManagement.crawlerUi.copy083')}{' '}</td>
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
                              title={t('dataManagement.crawlerUi.copy084')}
                            >
                              <Play className="w-3 h-3 fill-emerald-700" />{t('dataManagement.crawlerUi.copy085')}{' '}</button>
                          )}
                          <button
                            onClick={() => handleDeleteTask(task.id)}
                            className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                            title={t('dataManagement.crawlerUi.copy086')}
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
      <div className="bg-white/80 border border-white/80 rounded-[24px] p-6 shadow-sm">
        <LaborInfoImportHistory onRefreshTrigger={refreshTrigger} />
      </div>
    </div>
  );
};
