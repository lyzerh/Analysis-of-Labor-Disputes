import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Beaker, ChevronDown, ChevronUp, Database, ExternalLink, FlaskConical, Plus, RefreshCw, ShieldAlert } from 'lucide-react';
import type { AllocationStrategy, AnalysisMode, AnalysisRun, CandidatePoolSnapshot, SamplingRun, StratificationDimension } from '../types';
import { ResearchWorkspaceService, type WorkspaceSnapshot } from '../services/analysis/ResearchWorkspaceService';
import { CURRENT_ANALYSIS_ENGINE_VERSIONS } from '../services/analysis/AnalysisEngineVersions';
import type { CandidatePoolProgress } from '../services/dataset/CandidatePoolSnapshotService';
import type { ResearchCasePreparationSummary } from '../services/analysis/ResearchCasePreparationService';
import { REGION_OPTIONS, regionLabel } from '../services/research/RegionSelection';
import { AnalysisContextBar } from './AnalysisContextBar';

interface ResearchWorkspaceProps {
  initialSnapshotId?: string;
  selectedAnalysisRunId?: string;
  onSnapshotSelect: (snapshotId: string) => void;
  onOpenLaborAnalytics: (analysisRunId: string) => void;
  onOpenDefenseAnalysis: (analysisRunId: string) => void;
  onOpenDataManagement: () => void;
}

const workspaceService = new ResearchWorkspaceService();
const shortHash = (value?: string): string => value ? `${value.slice(0, 10)}…` : '—';
const formatDate = (value: string): string => new Date(value).toLocaleString('zh-CN', { hour12: false });
const statusLabel: Record<AnalysisRun['status'], string> = { pending: '待运行', running: '运行中', completed: '已完成', failed: '失败' };

function snapshotLabel(snapshot: WorkspaceSnapshot): string {
  const cities = Object.keys(snapshot.distribution.byCity).join('、') || '未标注城市';
  const years = Object.keys(snapshot.distribution.byYear).sort();
  const yearLabel = years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : (years[0] ?? '年份未知');
  return `${cities} · ${yearLabel} · N=${snapshot.candidateCount}`;
}

export const ResearchWorkspace: React.FC<ResearchWorkspaceProps> = ({ initialSnapshotId = '', selectedAnalysisRunId = '', onSnapshotSelect, onOpenLaborAnalytics, onOpenDefenseAnalysis, onOpenDataManagement }) => {
  const [snapshots, setSnapshots] = useState<WorkspaceSnapshot[]>([]);
  const [analysisRuns, setAnalysisRuns] = useState<AnalysisRun[]>([]);
  const [samplingRuns, setSamplingRuns] = useState<SamplingRun[]>([]);
  const [allSamplingRuns, setAllSamplingRuns] = useState<SamplingRun[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState(initialSnapshotId);
  const [mode, setMode] = useState<AnalysisMode | ''>('');
  const [samplingChoice, setSamplingChoice] = useState<'existing' | 'new'>('existing');
  const [selectedSamplingRunId, setSelectedSamplingRunId] = useState('');
  const [samplingMethod, setSamplingMethod] = useState<SamplingRun['method']>('seeded_random');
  const [sampleSize, setSampleSize] = useState('');
  const [seed, setSeed] = useState('');
  const [dimensions, setDimensions] = useState<StratificationDimension[]>(['city']);
  const [allocationStrategy, setAllocationStrategy] = useState<AllocationStrategy>('proportional');
  const [semanticEnabled, setSemanticEnabled] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showSnapshotForm, setShowSnapshotForm] = useState(false);
  const [snapshotSourceMode, setSnapshotSourceMode] = useState<'local' | 'remote'>('local');
  const [localRecordCount, setLocalRecordCount] = useState(0);
  const [snapshotCaseLevels, setSnapshotCaseLevels] = useState<string[]>(['一审', '二审']);
  const [snapshotRegionIds, setSnapshotRegionIds] = useState<string[]>([
    'guangdong-guangzhou', 'guangdong-shenzhen', 'guangdong-dongguan',
  ]);
  const [snapshotStartDate, setSnapshotStartDate] = useState('2023-11-28');
  const [snapshotEndDate, setSnapshotEndDate] = useState('2023-11-30');
  const [snapshotKeyword, setSnapshotKeyword] = useState('');
  const [snapshotProgress, setSnapshotProgress] = useState<CandidatePoolProgress | null>(null);
  const [lastSnapshot, setLastSnapshot] = useState<CandidatePoolSnapshot | null>(null);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [preparationSummary, setPreparationSummary] = useState<ResearchCasePreparationSummary | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const snapshotAbortController = useRef<AbortController | null>(null);

  const selectedSnapshot = useMemo(() => snapshots.find((snapshot) => snapshot.id === selectedSnapshotId), [snapshots, selectedSnapshotId]);

  const loadWorkspace = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [state, recordCount] = await Promise.all([
        workspaceService.loadWorkspace(),
        workspaceService.getLocalRecordCount(),
      ]);
      setSnapshots(state.snapshots);
      setAllSamplingRuns(state.samplingRuns);
      setAnalysisRuns(state.analysisRuns);
      setLocalRecordCount(recordCount);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '无法加载研究工作区');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void loadWorkspace(); }, []);

  useEffect(() => {
    if (isLoading || !selectedSnapshotId) return;
    if (!snapshots.some((snapshot) => snapshot.id === selectedSnapshotId)) {
      setSelectedSnapshotId('');
      onSnapshotSelect('');
      setSamplingRuns([]);
      setError('先前选择的研究总体已不存在，请重新选择。');
      return;
    }
    workspaceService.listSamplingRuns(selectedSnapshotId)
      .then(setSamplingRuns)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : '无法加载抽样方案'));
  }, [isLoading, onSnapshotSelect, selectedSnapshotId, snapshots]);

  const toggleListValue = (value: string, values: string[], update: (next: string[]) => void) => {
    update(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  };

  const handleCreateSnapshot = async () => {
    setError(''); setNotice(''); setSnapshotProgress(null); setLastSnapshot(null);
    if (snapshotCaseLevels.length === 0) { setError('请至少选择一个审级'); return; }
    if (snapshotSourceMode === 'local' && localRecordCount === 0) { setError('当前本地案例库为空，请先导入或准备案例'); return; }
    if (snapshotSourceMode === 'remote' && snapshotStartDate && snapshotEndDate && snapshotStartDate > snapshotEndDate) { setError('开始日期不能晚于结束日期'); return; }
    const controller = snapshotSourceMode === 'remote' ? new AbortController() : null;
    snapshotAbortController.current = controller;
    setIsCreatingSnapshot(true);
    try {
      const created = snapshotSourceMode === 'local'
        ? await workspaceService.createSnapshot({ caseLevels: snapshotCaseLevels, regionIds: snapshotRegionIds, q: snapshotKeyword })
        : await workspaceService.createRemoteSnapshot(
            { regionIds: snapshotRegionIds, caseLevels: snapshotCaseLevels, startDate: snapshotStartDate, endDate: snapshotEndDate, q: snapshotKeyword },
            { signal: controller?.signal, onProgress: setSnapshotProgress },
          );
      setLastSnapshot(created);
      const state = await workspaceService.loadWorkspace();
      setSnapshots(state.snapshots); setAllSamplingRuns(state.samplingRuns); setAnalysisRuns(state.analysisRuns);
      setNotice(`研究范围已创建：${created.status}，候选 N=${created.candidateCount}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '创建研究总体失败');
    } finally { snapshotAbortController.current = null; setIsCreatingSnapshot(false); }
  };

  const handlePrepareRecords = async (snapshotId: string) => {
    setIsPreparing(true); setError(''); setPreparationSummary(null);
    try {
      const summary = await workspaceService.prepareSnapshotRecords(snapshotId);
      setPreparationSummary(summary);
      setNotice(`研究案例准备完成：已获取 ${summary.fetchedCount}，失败 ${summary.failedCaseIds.length}`);
      window.dispatchEvent(new CustomEvent('labor-data-updated'));
    } catch (prepareError) {
      setError(prepareError instanceof Error ? prepareError.message : '准备研究案例失败');
    } finally { setIsPreparing(false); }
  };

  const handleSnapshotChange = async (snapshotId: string) => {
    setSelectedSnapshotId(snapshotId);
    onSnapshotSelect(snapshotId);
    setSelectedSamplingRunId('');
    setSamplingRuns([]);
    setNotice('');
    setError('');
    const snapshot = snapshots.find((item) => item.id === snapshotId);
    if (!snapshot?.isSelectable) return;
    try {
      setSamplingRuns(await workspaceService.listSamplingRuns(snapshotId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '无法加载抽样方案');
    }
  };

  const toggleDimension = (dimension: StratificationDimension) => {
    setDimensions((current) => current.includes(dimension) ? current.filter((item) => item !== dimension) : [...current, dimension]);
  };

  const createSamplingRun = async (): Promise<string> => {
    if (!selectedSnapshotId) throw new Error('请先选择研究总体');
    if (!seed.trim()) throw new Error('Seed 必须显式填写');
    const requestedSize = Number(sampleSize);
    if (!Number.isInteger(requestedSize) || requestedSize <= 0) throw new Error('样本量必须是正整数');
    if (samplingMethod === 'stratified_seeded_random' && dimensions.length === 0) throw new Error('分层抽样至少需要一个维度');
    const created = samplingMethod === 'seeded_random'
      ? await workspaceService.createSamplingRun({ method: 'seeded_random', snapshotId: selectedSnapshotId, sampleSize: requestedSize, seed: seed.trim() })
      : await workspaceService.createSamplingRun({ method: 'stratified_seeded_random', snapshotId: selectedSnapshotId, sampleSize: requestedSize, seed: seed.trim(), dimensions, allocationStrategy });
    setSamplingRuns(await workspaceService.listSamplingRuns(selectedSnapshotId));
    setSelectedSamplingRunId(created.id);
    return created.id;
  };

  const handleCreateAnalysisRun = async () => {
    setError(''); setNotice('');
    if (!selectedSnapshot?.isSelectable || !mode) { setError('请明确选择可用研究总体和研究模式'); return; }
    if (mode === 'sampled' && samplingChoice === 'existing' && !selectedSamplingRunId) { setError('抽样研究必须选择或创建 SamplingRun'); return; }
    setIsCreating(true);
    try {
      const samplingRunId = mode === 'sampled' ? (samplingChoice === 'new' ? await createSamplingRun() : selectedSamplingRunId) : undefined;
      const run = mode === 'exhaustive'
        ? await workspaceService.createAnalysisRun({ mode: 'exhaustive', snapshotId: selectedSnapshot.id, semanticEnabled })
        : await workspaceService.createAnalysisRun({ mode: 'sampled', snapshotId: selectedSnapshot.id, samplingRunId: samplingRunId!, semanticEnabled });
      const state = await workspaceService.loadWorkspace();
      setAnalysisRuns(state.analysisRuns);
      setAllSamplingRuns(state.samplingRuns);
      setExpandedRunId(run.id);
      setNotice(`AnalysisRun created：${run.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '创建研究运行失败');
    } finally { setIsCreating(false); }
  };

  const selectedRun = samplingRuns.find((run) => run.id === selectedSamplingRunId);
  const selectedAnalysisRun = analysisRuns.find((run) => run.id === selectedAnalysisRunId) || null;
  const createDisabled = isCreating || !selectedSnapshot?.isSelectable || !mode || (mode === 'sampled' && samplingChoice === 'existing' && !selectedSamplingRunId);

  return <div className="min-h-full bg-slate-50 p-4 md:p-6 lg:p-8"><div className="max-w-7xl mx-auto space-y-6">
    <header className="flex flex-col md:flex-row md:items-center justify-between gap-4"><div><div className="flex items-center gap-2 text-blue-600 text-xs font-bold uppercase tracking-wider"><FlaskConical className="w-4 h-4" /> Research Workspace</div><h1 className="text-2xl font-bold text-slate-900 mt-1">研究工作区</h1><p className="text-sm text-slate-500 mt-1">管理可复现的研究总体、抽样方案与分析运行。</p></div><button onClick={() => void loadWorkspace()} disabled={isLoading} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> 刷新</button></header>
    <AnalysisContextBar
      run={selectedAnalysisRun}
      snapshotId={selectedSnapshot?.id}
      scopeLabel={selectedSnapshot ? snapshotLabel(selectedSnapshot) : undefined}
      emptyLabel={selectedSnapshot ? '已选择研究范围，尚未选择分析运行' : '未选择研究范围或分析运行'}
    />
    {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}{notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"><div className="px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-900">研究总体</h2><p className="text-xs text-slate-500 mt-1">基于本地已入库案例创建固定研究范围，不会重新请求远程数据。</p><p className="text-xs text-slate-500 mt-1">当前本地案例：N={localRecordCount}</p></div><div className="flex flex-wrap gap-2"><button onClick={() => { setSnapshotSourceMode('local'); setShowSnapshotForm(true); }} disabled={localRecordCount === 0} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-40">创建研究总体</button><button onClick={() => { setSnapshotSourceMode('remote'); setShowSnapshotForm(true); }} className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium">从远程数据源构建总体（高级）</button></div></div>{localRecordCount === 0 && <div className="mx-5 mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">当前本地案例库为空，请先导入或准备案例。</div>}{showSnapshotForm && <div className="border-t border-slate-200 p-5 space-y-4">
      <div className={`rounded-lg border p-3 text-sm ${snapshotSourceMode === 'local' ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{snapshotSourceMode === 'local' ? `本地模式：从当前已入库的 ${localRecordCount} 个分析案例筛选并持久化研究范围，不会访问网络。` : '高级远程模式：将重新查询 LaborInfo 并枚举所有符合条件的候选案件，可能耗时较长。'}</div>
      <fieldset><div className="flex items-center justify-between gap-3"><legend className="text-sm font-medium">地区范围</legend><div className="flex items-center gap-3 text-xs"><span className="text-slate-500">已选择 {snapshotRegionIds.length} 个地区</span><button type="button" onClick={() => setSnapshotRegionIds([])} className="text-blue-600 hover:text-blue-800">清空</button></div></div><div className="mt-2 h-64 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-xs font-bold text-slate-500 mb-2">广东省</div><div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{REGION_OPTIONS.filter((option) => option.province === '广东省').map((option) => <label key={option.id} className="text-sm rounded-md bg-white border border-slate-200 px-2 py-1.5"><input type="checkbox" checked={snapshotRegionIds.includes(option.id)} onChange={() => toggleListValue(option.id, snapshotRegionIds, setSnapshotRegionIds)} className="mr-1.5" />{option.label}</label>)}</div><div className="text-xs font-bold text-slate-500 mt-4 mb-2">其他地区</div><div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{REGION_OPTIONS.filter((option) => option.province !== '广东省').map((option) => <label key={option.id} className="text-sm rounded-md bg-white border border-slate-200 px-2 py-1.5"><input type="checkbox" checked={snapshotRegionIds.includes(option.id)} onChange={() => toggleListValue(option.id, snapshotRegionIds, setSnapshotRegionIds)} className="mr-1.5" />{option.label}</label>)}</div></div><p className="text-xs text-slate-500 mt-2">未选择地区表示不限制地区；江苏省（全省）不会被当作城市条件。</p></fieldset>
      <fieldset><legend className="text-sm font-medium">审级</legend><div className="flex gap-3 mt-2">{['一审', '二审'].map((value) => <label key={value} className="text-sm"><input type="checkbox" checked={snapshotCaseLevels.includes(value)} onChange={() => toggleListValue(value, snapshotCaseLevels, setSnapshotCaseLevels)} className="mr-1" />{value}</label>)}</div></fieldset>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{snapshotSourceMode === 'remote' && <><label className="text-sm">开始日期<input type="date" value={snapshotStartDate} onChange={(event) => setSnapshotStartDate(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-2" /></label><label className="text-sm">结束日期<input type="date" value={snapshotEndDate} onChange={(event) => setSnapshotEndDate(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-2" /></label></>}<label className="text-sm">关键词（可选）<input value={snapshotKeyword} onChange={(event) => setSnapshotKeyword(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-2" /></label></div>
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">来源：{snapshotSourceMode === 'local' ? '本地案例库' : 'LaborInfo 远程候选元数据'} · 地区：{snapshotRegionIds.map(regionLabel).join('、') || '不限'} · 审级：{snapshotCaseLevels.join('、') || '未选'}{snapshotSourceMode === 'remote' ? ` · 日期：${snapshotStartDate || '不限'} ~ ${snapshotEndDate || '不限'}` : ''}</div>
      {snapshotSourceMode === 'remote' && snapshotProgress && <div className="text-xs text-blue-700">已获取 {snapshotProgress.fetchedPages}/{snapshotProgress.totalPages} 页，当前候选 {snapshotProgress.candidateCount}</div>}
      <div className="flex gap-2"><button onClick={() => void handleCreateSnapshot()} disabled={isCreatingSnapshot || (snapshotSourceMode === 'local' && localRecordCount === 0)} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-40">{isCreatingSnapshot ? '正在创建研究总体…' : '确认创建研究总体'}</button>{snapshotSourceMode === 'remote' && isCreatingSnapshot && <button onClick={() => snapshotAbortController.current?.abort()} className="px-4 py-2 rounded-lg border border-slate-300 text-sm">取消</button>}</div>
      {lastSnapshot && <div className="rounded-lg border border-slate-200 p-3 text-xs text-slate-600"><div>来源：{lastSnapshot.sourceMode === 'local' ? '本地案例库' : 'LaborInfo 远程'} · 状态：{lastSnapshot.status} · 候选 N={lastSnapshot.candidateCount} · duplicate={lastSnapshot.duplicateCount}</div><div className="mt-1">城市：{JSON.stringify(lastSnapshot.distribution.byCity)} · 年份：{JSON.stringify(lastSnapshot.distribution.byYear)} · 审级：{JSON.stringify(lastSnapshot.distribution.byCaseLevel)}</div><div className="mt-1">排除：test {lastSnapshot.exclusions.excludedKnownTestCases} / other {lastSnapshot.exclusions.excludedOther} / unknown {lastSnapshot.exclusions.excludedUnknown}</div><div className="mt-1">Candidate hash：{shortHash(lastSnapshot.candidateHash)} · Fingerprint：{shortHash(lastSnapshot.snapshotFingerprint)}</div>{lastSnapshot.sourceMode !== 'local' && lastSnapshot.status === 'complete' && lastSnapshot.candidateCount > 0 && <button onClick={() => void handlePrepareRecords(lastSnapshot.id)} disabled={isPreparing} className="mt-3 px-3 py-2 rounded-md bg-slate-800 text-white text-xs">{isPreparing ? '正在准备…' : '准备研究案例'}</button>}</div>}
      {preparationSummary && <div className="text-xs text-slate-600">Exact IDs {preparationSummary.requestedCount} · 已存在 {preparationSummary.alreadyAvailableCount} · fetched {preparationSummary.fetchedCount} · saved {preparationSummary.savedCount} · failed {preparationSummary.failedCaseIds.length}</div>}
    </div>}</section>
    {snapshots.length === 0 && !isLoading ? <section className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center"><Database className="w-9 h-9 text-slate-400 mx-auto" /><h2 className="font-semibold text-slate-800 mt-3">尚无研究总体。</h2><p className="text-sm text-slate-500 mt-1">请使用上方“创建研究总体”从本地已入库案例开始。</p><button onClick={onOpenDataManagement} className="mt-4 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium">查看数据管理</button></section> :
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"><div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2"><Plus className="w-4 h-4 text-blue-600" /><h2 className="font-semibold text-slate-900">创建研究运行</h2></div><div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4"><label className="block text-sm font-medium text-slate-700">1. 选择研究总体<select value={selectedSnapshotId} onChange={(event) => void handleSnapshotChange(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">请选择研究总体（不会自动选择最新记录）</option>{snapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id} disabled={!snapshot.isSelectable}>{snapshotLabel(snapshot)}{snapshot.isSelectable ? '' : ` · ${snapshot.status}`}</option>)}</select></label>
          {selectedSnapshot && <div className={`rounded-lg border p-3 text-xs ${selectedSnapshot.isSelectable ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-amber-200 bg-amber-50 text-amber-800'}`}><div className="font-mono break-all">当前 Snapshot：{selectedSnapshot.id}</div><div className="mt-1">来源：{selectedSnapshot.sourceMode === 'local' ? '本地案例库' : 'LaborInfo 远程（含旧版 Snapshot）'} · N={selectedSnapshot.candidateCount} · 城市 {Object.keys(selectedSnapshot.distribution.byCity).join('、') || '未知'} · 审级 {Object.keys(selectedSnapshot.distribution.byCaseLevel).join('、') || '未知'}</div><div className="mt-1">日期范围：{selectedSnapshot.filters.remoteFilters.startDate ?? '未限定'} 至 {selectedSnapshot.filters.remoteFilters.endDate ?? '未限定'} · 创建于 {formatDate(selectedSnapshot.createdAt)}</div><div className="mt-1">Candidate hash：{shortHash(selectedSnapshot.candidateHash)}</div>{!selectedSnapshot.isSelectable && <div className="mt-2 font-medium">{selectedSnapshot.unavailableReason}</div>}{selectedSnapshot.sourceMode !== 'local' && selectedSnapshot.isSelectable && <button onClick={() => void handlePrepareRecords(selectedSnapshot.id)} disabled={isPreparing} className="mt-3 px-3 py-2 rounded-md bg-slate-800 text-white text-xs">{isPreparing ? '正在准备…' : '准备研究案例'}</button>}</div>}
          <fieldset><legend className="text-sm font-medium text-slate-700">2. 选择研究模式</legend><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2"><label className={`rounded-lg border p-3 cursor-pointer ${mode === 'exhaustive' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}><input type="radio" name="research-mode" checked={mode === 'exhaustive'} onChange={() => setMode('exhaustive')} className="mr-2" /><span className="text-sm font-semibold">全量语料分析</span><div className="text-xs text-slate-500 mt-1">使用 Snapshot 全部候选，不创建 SamplingRun。</div></label><label className={`rounded-lg border p-3 cursor-pointer ${mode === 'sampled' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}><input type="radio" name="research-mode" checked={mode === 'sampled'} onChange={() => setMode('sampled')} className="mr-2" /><span className="text-sm font-semibold">抽样比较研究</span><div className="text-xs text-slate-500 mt-1">使用已有或新建的可复现 SamplingRun。</div></label></div></fieldset>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={semanticEnabled} onChange={(event) => setSemanticEnabled(event.target.checked)} />Semantic Resolver（默认关闭；开启时冻结当前 prompt/provider/model）</label></div>
        <div className="space-y-4">{mode === 'sampled' ? <><div className="flex gap-4 text-sm"><label><input type="radio" checked={samplingChoice === 'existing'} onChange={() => setSamplingChoice('existing')} className="mr-1.5" />使用已有 SamplingRun</label><label><input type="radio" checked={samplingChoice === 'new'} onChange={() => setSamplingChoice('new')} className="mr-1.5" />创建新的 SamplingRun</label></div>
          {samplingChoice === 'existing' ? <label className="block text-sm font-medium text-slate-700">当前 Snapshot 的抽样方案<select value={selectedSamplingRunId} onChange={(event) => setSelectedSamplingRunId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">请选择 SamplingRun</option>{samplingRuns.map((run) => <option key={run.id} value={run.id}>{run.method} · N={run.actualSampleSize} · seed={run.seed}</option>)}</select></label> :
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4"><label className="block text-sm">抽样方法<select value={samplingMethod} onChange={(event) => setSamplingMethod(event.target.value as SamplingRun['method'])} className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-2 bg-white"><option value="seeded_random">Seeded Random</option><option value="stratified_seeded_random">Stratified Seeded Random</option></select></label><div className="grid grid-cols-2 gap-3"><label className="text-sm">Sample N<input value={sampleSize} onChange={(event) => setSampleSize(event.target.value)} inputMode="numeric" className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-2" placeholder="例如 30" /></label><label className="text-sm">Seed<input value={seed} onChange={(event) => setSeed(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-2" placeholder="例如 42" /></label></div>
              {samplingMethod === 'stratified_seeded_random' && <><fieldset><legend className="text-sm">分层维度</legend><div className="flex flex-wrap gap-3 mt-1.5">{(['city', 'year', 'caseLevel'] as const).map((dimension) => <label key={dimension} className="text-sm"><input type="checkbox" checked={dimensions.includes(dimension)} onChange={() => toggleDimension(dimension)} className="mr-1" />{dimension}</label>)}</div></fieldset><label className="block text-sm">样本分配<select value={allocationStrategy} onChange={(event) => setAllocationStrategy(event.target.value as AllocationStrategy)} className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-2 bg-white"><option value="proportional">Proportional · 按 Snapshot 分层比例分配</option><option value="balanced">Balanced · 各分层尽量接近</option></select></label>{allocationStrategy === 'balanced' && <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800"><ShieldAlert className="inline w-4 h-4 mr-1" />平衡抽样适合组间比较，但样本构成不代表总体分布，不应直接解释为总体比例。</div>}</>}
            </div>}{selectedRun && <div className="text-xs text-slate-500">已选：{selectedRun.method} · N={selectedRun.actualSampleSize} · hash {shortHash(selectedRun.sampleHash)}</div>}</> : <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Sampling：{mode === 'exhaustive' ? '不适用 / 全量' : '选择抽样模式后配置。'}</div>}
          <div className="rounded-lg border border-slate-200 p-3 text-xs text-slate-600 space-y-1"><div className="font-semibold text-slate-800">冻结引擎版本</div><div>Parser：{CURRENT_ANALYSIS_ENGINE_VERSIONS.parserVersion}</div><div>Ruleset：{CURRENT_ANALYSIS_ENGINE_VERSIONS.rulesetVersion}</div><div>Semantic：{semanticEnabled ? 'Enabled（当前配置）' : 'Disabled'}</div></div>
          <button onClick={() => void handleCreateAnalysisRun()} disabled={createDisabled} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{isCreating ? '创建中…' : '创建研究运行'}</button></div>
      </div></section>}
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"><div className="px-5 py-4 border-b border-slate-200"><h2 className="font-semibold text-slate-900">研究运行</h2><p className="text-xs text-slate-500 mt-1">历史对象只读；如需变更研究设计，请创建新运行。</p></div>{analysisRuns.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">已有研究总体，但尚未创建研究运行。</div> : <div className="divide-y divide-slate-100">{analysisRuns.map((run) => { const sampling = allSamplingRuns.find((item) => item.id === run.samplingRunId); const expanded = expandedRunId === run.id; return <article key={run.id} className="p-5"><div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-900">{run.mode === 'exhaustive' ? '全量语料' : '抽样研究'} · {formatDate(run.createdAt)}</span><span className={`text-xs px-2 py-0.5 rounded-full ${run.status === 'failed' ? 'bg-red-100 text-red-700' : run.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{statusLabel[run.status]}</span></div><div className="text-xs text-slate-500 mt-1 truncate">N={run.inputCaseCount} · Snapshot {run.snapshotId} · Sampling {run.mode === 'exhaustive' ? '全量' : (sampling?.method ?? run.samplingRunId)}</div>{run.status === 'completed' && run.resultSummary && <div className="text-xs text-emerald-700 mt-1">Usable N={run.resultSummary.includedCaseCount} · excluded {run.resultSummary.excludedCaseCount} · failed {run.resultSummary.failedCaseCount}</div>}{run.status === 'failed' && <div className="text-xs text-red-700 mt-1">{run.errorCode ?? 'ANALYSIS_FAILED'}：{run.errorMessage ?? '分析失败'}</div>}</div><div className="flex flex-wrap gap-2"><button onClick={() => onOpenLaborAnalytics(run.id)} className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-blue-200 text-blue-700 text-xs font-medium"><ExternalLink className="w-3.5 h-3.5" />查看 Labor Analytics</button><button onClick={() => onOpenDefenseAnalysis(run.id)} className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-slate-300 text-slate-700 text-xs font-medium"><Beaker className="w-3.5 h-3.5" />查看 Defense Analysis</button><button onClick={() => setExpandedRunId(expanded ? '' : run.id)} className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-slate-300 text-slate-600 text-xs">详情 {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</button></div></div>{expanded && <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 p-4 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-600 break-all"><div>AnalysisRun ID：{run.id}</div><div>Snapshot ID：{run.snapshotId}</div><div>SamplingRun ID：{run.samplingRunId ?? '不适用'}</div><div>Input N：{run.inputCaseCount}</div><div>Parser：{run.engineVersions.parserVersion}</div><div>Ruleset：{run.engineVersions.rulesetVersion}</div><div>Semantic：{run.semantic.enabled ? `${run.semantic.provider} / ${run.semantic.model} / ${run.semantic.promptVersion}` : 'Disabled'}</div><div>Provenance：{run.provenanceHash}</div></div>}</article>; })}</div>}</section>
    <p className="text-xs text-slate-400">当前研究运行数据尚未纳入完整备份恢复流程；Workspace 只引用统一案例仓库，不复制 AnalysisCaseRecord。</p>
  </div></div>;
};
