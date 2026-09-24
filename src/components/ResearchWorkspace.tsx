import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, Beaker, ChevronDown, ChevronUp, Database, ExternalLink, Plus, RefreshCw, ShieldAlert, Trash2, RotateCcw } from 'lucide-react';
import type { AllocationStrategy, AnalysisMode, AnalysisRun, AnalysisCaseRecord, CandidatePoolSnapshot, SamplingRun, StratificationDimension } from '../types';
import { ResearchWorkspaceService, type WorkspaceSnapshot } from '../services/analysis/ResearchWorkspaceService';
import { CURRENT_ANALYSIS_ENGINE_VERSIONS } from '../services/analysis/AnalysisEngineVersions';
import type { CandidatePoolProgress } from '../services/dataset/CandidatePoolSnapshotService';
import type { ResearchCasePreparationSummary } from '../services/analysis/ResearchCasePreparationService';
import {
  geographicScopeLabel,
  getResearchGeographicOptions,
  filterRecordsByResearchGeographicScope,
  type ResearchGeographicScope,
  type ResearchGeographicScopeMode,
} from '../services/research/ResearchGeographicScope';
import { AnalysisContextBar } from './AnalysisContextBar';

// REGION_OPTIONS remains a legacy snapshot vocabulary; new 地区范围 uses real local records.

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
  return `${geographicScopeLabel(snapshot.geographicScope)} · ${cities} · ${yearLabel} · 候选案例 ${snapshot.candidateCount} 个`;
}

interface ResearchPopulationActionMenuProps {
  archived?: boolean;
  isUpdating: boolean;
  canDelete?: boolean;
  deleteTitle?: string;
  onArchive?: () => void | Promise<void>;
  onRestore?: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}

/**
 * Render the lifecycle menu in the document overlay layer so population cards
 * and the scrollable workspace surface cannot clip it. Its position is
 * recalculated against the viewport and flips above the trigger when needed.
 */
const ResearchPopulationActionMenu: React.FC<ResearchPopulationActionMenuProps> = ({
  archived = false,
  isUpdating,
  canDelete = true,
  deleteTitle,
  onArchive,
  onRestore,
  onDelete,
}) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const updatePosition = () => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const margin = 8;
    const openAbove = window.innerHeight - triggerRect.bottom < menuRect.height + margin && triggerRect.top > menuRect.height + margin;
    const preferredTop = openAbove ? triggerRect.top - menuRect.height - 4 : triggerRect.bottom + 4;
    const maxTop = Math.max(margin, window.innerHeight - menuRect.height - margin);
    const top = Math.min(maxTop, Math.max(margin, preferredTop));
    const left = Math.min(Math.max(margin, triggerRect.right - menuRect.width), window.innerWidth - menuRect.width - margin);
    setPosition({ top: Math.max(margin, top), left: Math.max(margin, left) });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const handleViewportChange = () => updatePosition();
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', handleOutsidePointer);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const menu = open && typeof document !== 'undefined' ? createPortal(
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-40 min-w-44 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-lg"
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        maxHeight: 'calc(100vh - 1rem)',
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {archived ? <>
        <button type="button" role="menuitem" onClick={() => { setOpen(false); void onRestore?.(); }} disabled={isUpdating} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><RotateCcw className="w-3.5 h-3.5" />恢复研究总体</button>
        <div className="px-2 py-1.5 text-slate-400">已归档总体默认保留，不能直接删除历史定义。</div>
      </> : <>
        <button type="button" role="menuitem" onClick={() => { setOpen(false); void onArchive?.(); }} disabled={isUpdating} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><Archive className="w-3.5 h-3.5" />归档研究总体</button>
        <button type="button" role="menuitem" onClick={() => { setOpen(false); void onDelete?.(); }} disabled={isUpdating || !canDelete} title={deleteTitle} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="w-3.5 h-3.5" />删除研究总体</button>
      </>}
    </div>,
    document.body,
  ) : null;

  return <>
    <button ref={triggerRef} type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => { if (current) return false; setPosition(null); return true; })} className="shrink-0 cursor-pointer rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600">更多操作</button>
    {menu}
  </>;
};

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
  const [localRecords, setLocalRecords] = useState<AnalysisCaseRecord[]>([]);
  const [snapshotCaseLevels, setSnapshotCaseLevels] = useState<string[]>(['一审', '二审']);
  const [geographicScopeMode, setGeographicScopeMode] = useState<ResearchGeographicScopeMode>('all');
  const [selectedProvinces, setSelectedProvinces] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [snapshotStartDate, setSnapshotStartDate] = useState('2023-11-28');
  const [snapshotEndDate, setSnapshotEndDate] = useState('2023-11-30');
  const [snapshotKeyword, setSnapshotKeyword] = useState('');
  const [snapshotProgress, setSnapshotProgress] = useState<CandidatePoolProgress | null>(null);
  const [lastSnapshot, setLastSnapshot] = useState<CandidatePoolSnapshot | null>(null);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [preparationSummary, setPreparationSummary] = useState<ResearchCasePreparationSummary | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isUpdatingPopulation, setIsUpdatingPopulation] = useState(false);
  const [showArchivedPopulations, setShowArchivedPopulations] = useState(false);
  const snapshotAbortController = useRef<AbortController | null>(null);

  const selectedSnapshot = useMemo(() => snapshots.find((snapshot) => snapshot.id === selectedSnapshotId), [snapshots, selectedSnapshotId]);

  const loadWorkspace = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [state, records] = await Promise.all([
        workspaceService.loadWorkspace(),
        workspaceService.listLocalAnalysisRecords(),
      ]);
      setSnapshots(state.snapshots);
      setAllSamplingRuns(state.samplingRuns);
      setAnalysisRuns(state.analysisRuns);
      setLocalRecords(records);
      setLocalRecordCount(records.length);
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
    const selected = snapshots.find((snapshot) => snapshot.id === selectedSnapshotId);
    if (!selected?.isSelectable) {
      setSamplingRuns([]);
      return;
    }
    workspaceService.listSamplingRuns(selectedSnapshotId)
      .then(setSamplingRuns)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : '无法加载抽样方案'));
  }, [isLoading, onSnapshotSelect, selectedSnapshotId, snapshots]);

  const toggleListValue = (value: string, values: string[], update: (next: string[]) => void) => {
    update(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  };

  const geographicOptions = useMemo(() => getResearchGeographicOptions(localRecords), [localRecords]);
  const geographicScope = useMemo<ResearchGeographicScope>(() => {
    if (geographicScopeMode === 'province') return { mode: 'province', provinces: selectedProvinces };
    if (geographicScopeMode === 'pearl_river_delta') return { mode: 'pearl_river_delta' };
    if (geographicScopeMode === 'custom_cities') return { mode: 'custom_cities', cities: selectedCities };
    return { mode: 'all' };
  }, [geographicScopeMode, selectedCities, selectedProvinces]);
  const geographicRecords = useMemo(
    () => filterRecordsByResearchGeographicScope(localRecords, geographicScope),
    [geographicScope, localRecords],
  );
  const geographicSummary = useMemo(() => getResearchGeographicOptions(geographicRecords), [geographicRecords]);

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
        ? await workspaceService.createSnapshot({ caseLevels: snapshotCaseLevels, geographicScope, q: snapshotKeyword })
        : await workspaceService.createRemoteSnapshot(
            { caseLevels: snapshotCaseLevels, geographicScope, startDate: snapshotStartDate, endDate: snapshotEndDate, q: snapshotKeyword },
            { signal: controller?.signal, onProgress: setSnapshotProgress },
          );
      setLastSnapshot(created);
      const [state, records] = await Promise.all([workspaceService.loadWorkspace(), workspaceService.listLocalAnalysisRecords()]);
      setSnapshots(state.snapshots); setAllSamplingRuns(state.samplingRuns); setAnalysisRuns(state.analysisRuns); setLocalRecords(records); setLocalRecordCount(records.length);
      setNotice(`研究范围已创建：${created.status}，候选案例 ${created.candidateCount} 个`);
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

  const refreshPopulationState = async () => {
    const state = await workspaceService.loadWorkspace();
    setSnapshots(state.snapshots);
    setAllSamplingRuns(state.samplingRuns);
    setAnalysisRuns(state.analysisRuns);
  };

  const handleArchivePopulation = async (snapshot: WorkspaceSnapshot) => {
    if (!window.confirm('归档研究总体？\n\n归档后，该研究总体将从活跃列表隐藏，历史研究运行仍可查看。之后可以恢复。')) return;
    setIsUpdatingPopulation(true); setError(''); setNotice('');
    try {
      await workspaceService.archiveResearchPopulation(snapshot.id);
      await refreshPopulationState();
      if (selectedSnapshotId === snapshot.id) {
        setSelectedSnapshotId(''); setSamplingRuns([]); onSnapshotSelect('');
      }
      setNotice('研究总体已归档');
    } catch (lifecycleError) {
      setError(lifecycleError instanceof Error ? lifecycleError.message : '归档研究总体失败');
    } finally { setIsUpdatingPopulation(false); }
  };

  const handleRestorePopulation = async (snapshot: WorkspaceSnapshot) => {
    setIsUpdatingPopulation(true); setError(''); setNotice('');
    try {
      await workspaceService.restoreResearchPopulation(snapshot.id);
      await refreshPopulationState();
      setNotice('研究总体已恢复');
    } catch (lifecycleError) {
      setError(lifecycleError instanceof Error ? lifecycleError.message : '恢复研究总体失败');
    } finally { setIsUpdatingPopulation(false); }
  };

  const handleDeletePopulation = async (snapshot: WorkspaceSnapshot) => {
    const referencedRunCount = analysisRuns.filter((run) => run.snapshotId === snapshot.id).length;
    const samplingRunCount = allSamplingRuns.filter((run) => run.snapshotId === snapshot.id).length;
    if (referencedRunCount > 0 || samplingRunCount > 0) {
      setError(referencedRunCount > 0
        ? `该研究总体已被 ${referencedRunCount} 个研究运行引用，为保留历史研究的可复现性，不能直接删除。`
        : `该研究总体已有 ${samplingRunCount} 个抽样方案引用，不能直接删除。`);
      return;
    }
    if (!window.confirm('删除研究总体？\n\n该研究总体尚未被任何研究运行引用。删除后将移除该研究总体定义，但不会删除本地案例或原始文书。历史研究运行也不会被删除。')) return;
    setIsUpdatingPopulation(true); setError(''); setNotice('');
    try {
      await workspaceService.deleteResearchPopulation(snapshot.id);
      await refreshPopulationState();
      if (selectedSnapshotId === snapshot.id) {
        setSelectedSnapshotId(''); setSamplingRuns([]); onSnapshotSelect('');
      }
      setNotice('研究总体已删除');
    } catch (lifecycleError) {
      setError(lifecycleError instanceof Error ? lifecycleError.message : '删除研究总体失败');
    } finally { setIsUpdatingPopulation(false); }
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
    if (mode === 'sampled' && samplingChoice === 'existing' && !selectedSamplingRunId) { setError('抽样研究必须选择或创建抽样方案'); return; }
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
      setNotice('分析记录已创建');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '创建研究运行失败');
    } finally { setIsCreating(false); }
  };

  const selectedRun = samplingRuns.find((run) => run.id === selectedSamplingRunId);
  const selectedAnalysisRun = analysisRuns.find((run) => run.id === selectedAnalysisRunId) || null;
  const createDisabled = isCreating || !selectedSnapshot?.isSelectable || !mode || (mode === 'sampled' && samplingChoice === 'existing' && !selectedSamplingRunId);

  return <div className="min-h-full bg-slate-50 p-4 md:p-6 lg:p-8"><div className="max-w-7xl mx-auto space-y-6">
    <header className="flex flex-col md:flex-row md:items-center justify-between gap-4"><div><h1 className="text-2xl font-bold text-slate-900">研究工作区</h1><p className="text-sm text-slate-500 mt-1">管理研究范围、抽样方案与分析结果。</p></div><button onClick={() => void loadWorkspace()} disabled={isLoading} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> 刷新</button></header>
    <AnalysisContextBar
      run={selectedAnalysisRun}
      snapshotId={selectedSnapshot?.id}
      scopeLabel={selectedSnapshot ? snapshotLabel(selectedSnapshot) : undefined}
      emptyLabel={selectedSnapshot ? '已选择研究范围，尚未选择分析运行' : '未选择研究范围或分析运行'}
    />
    {selectedSnapshot && <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 px-1 text-sm text-slate-600"><span><span className="text-xs text-slate-400">研究地域</span> {geographicScopeLabel(selectedSnapshot.geographicScope)}</span><span><span className="text-xs text-slate-400">城市</span> {Object.keys(selectedSnapshot.distribution.byCity).join('、') || '未限定'}</span><span><span className="text-xs text-slate-400">年份</span> {Object.keys(selectedSnapshot.distribution.byYear).sort().join('、') || '未限定'}</span><span><span className="text-xs text-slate-400">候选案例</span> {selectedSnapshot.candidateCount} 个</span></div>}
    {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}{notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"><div className="px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-900">研究总体</h2><p className="text-xs text-slate-500 mt-1">基于本地已入库案例创建固定研究范围，不会重新请求远程数据。</p><p className="text-xs text-slate-500 mt-1">当前本地案例：{localRecordCount} 个</p></div><div className="flex flex-wrap gap-2"><button onClick={() => { setSnapshotSourceMode('local'); setShowSnapshotForm(true); }} disabled={localRecordCount === 0} className="lawlens-primary-button px-3 py-2 rounded-lg text-sm font-medium">创建研究总体</button><button onClick={() => { setSnapshotSourceMode('remote'); setShowSnapshotForm(true); }} className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium">从远程数据源构建总体（高级）</button></div></div>{localRecordCount === 0 && <div className="mx-5 mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">当前本地案例库为空，请先导入或准备案例。</div>}<div className="border-t border-slate-100 px-5 py-4 space-y-3"><div className="flex items-center justify-between"><div className="text-sm font-medium text-slate-700">活跃研究总体 <span className="text-xs text-slate-400">{snapshots.filter((snapshot) => snapshot.lifecycleStatus !== 'archived').length}</span></div>{snapshots.some((snapshot) => snapshot.lifecycleStatus === 'archived') && <button type="button" onClick={() => setShowArchivedPopulations((current) => !current)} className="text-xs text-slate-500 underline">{showArchivedPopulations ? '隐藏已归档' : `已归档（${snapshots.filter((snapshot) => snapshot.lifecycleStatus === 'archived').length}）`}</button>}</div>{snapshots.filter((snapshot) => snapshot.lifecycleStatus !== 'archived').map((snapshot) => { const referencedRunCount = analysisRuns.filter((run) => run.snapshotId === snapshot.id).length; const samplingRunCount = allSamplingRuns.filter((run) => run.snapshotId === snapshot.id).length; return <div key={snapshot.id} className={`flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-lg border px-3 py-3 ${selectedSnapshotId === snapshot.id ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200 bg-white'}`}><button type="button" onClick={() => void handleSnapshotChange(snapshot.id)} className="min-w-0 text-left"><div className="text-sm font-medium text-slate-800 truncate">{snapshotLabel(snapshot)}</div><div className="text-xs text-slate-500 mt-1">{referencedRunCount > 0 ? `已被 ${referencedRunCount} 个研究运行引用` : '尚未被研究运行引用'}</div></button><ResearchPopulationActionMenu isUpdating={isUpdatingPopulation} canDelete={referencedRunCount === 0 && samplingRunCount === 0} deleteTitle={referencedRunCount > 0 ? `已被 ${referencedRunCount} 个研究运行引用` : samplingRunCount > 0 ? `已有 ${samplingRunCount} 个抽样方案引用` : undefined} onArchive={() => handleArchivePopulation(snapshot)} onDelete={() => handleDeletePopulation(snapshot)} /></div>; })}{showArchivedPopulations && snapshots.filter((snapshot) => snapshot.lifecycleStatus === 'archived').map((snapshot) => { const referencedRunCount = analysisRuns.filter((run) => run.snapshotId === snapshot.id).length; return <div key={snapshot.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3"><button type="button" onClick={() => void handleSnapshotChange(snapshot.id)} className="min-w-0 text-left"><div className="text-sm font-medium text-slate-700 truncate">{snapshotLabel(snapshot)} · 已归档</div><div className="text-xs text-slate-500 mt-1">历史运行引用：{referencedRunCount}</div></button><ResearchPopulationActionMenu archived isUpdating={isUpdatingPopulation} onRestore={() => handleRestorePopulation(snapshot)} /></div>; })}</div>{showSnapshotForm && <div className="border-t border-slate-200 p-5 space-y-4">
      <div className={`rounded-lg border p-3 text-sm ${snapshotSourceMode === 'local' ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{snapshotSourceMode === 'local' ? `本地模式：从当前已入库的 ${localRecordCount} 个分析案例筛选并持久化研究范围，不会访问网络。` : '高级远程模式：将重新查询 LaborInfo 并枚举所有符合条件的候选案件，可能耗时较长。'}</div>
      <fieldset><legend className="text-sm font-medium">研究地域范围</legend><p className="text-xs text-slate-500 mt-1">研究地域与数据采集范围分开设置；以下选项来自当前本地案例数据。</p><div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">{([['all', '全部已采集地区'], ['province', '按省份'], ['pearl_river_delta', '珠三角（9市）'], ['custom_cities', '自定义城市']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setGeographicScopeMode(value)} className={`rounded-lg border px-3 py-2 text-sm text-left ${geographicScopeMode === value ? 'border-blue-400 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-700'}`}>{label}</button>)}</div>
        {geographicScopeMode === 'province' && <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-xs text-slate-500 mb-2">选择当前案例中实际存在的省份</div><div className="flex flex-wrap gap-2">{geographicOptions.provinces.length === 0 ? <span className="text-xs text-slate-500">当前没有可用省份信息</span> : geographicOptions.provinces.map((province) => <label key={province} className="text-sm rounded-md bg-white border border-slate-200 px-2 py-1.5"><input type="checkbox" checked={selectedProvinces.includes(province)} onChange={() => toggleListValue(province, selectedProvinces, setSelectedProvinces)} className="mr-1.5" />{province} <span className="text-xs text-slate-400">{geographicOptions.provinceCounts[province] ?? 0}</span></label>)}</div></div>}
        {geographicScopeMode === 'pearl_river_delta' && <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"><div>广州 · 深圳 · 珠海 · 佛山 · 惠州 · 东莞 · 中山 · 江门 · 肇庆</div><div className="text-xs text-slate-500 mt-1">仅纳入当前数据中能确定属于珠三角九市的案例。</div></div>}
        {geographicScopeMode === 'custom_cities' && <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-xs text-slate-500 mb-2">选择当前案例中实际存在的城市</div><div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{geographicOptions.cities.length === 0 ? <span className="text-xs text-slate-500">当前没有可用城市信息</span> : geographicOptions.cities.map((city) => <label key={city} className="text-sm rounded-md bg-white border border-slate-200 px-2 py-1.5"><input type="checkbox" checked={selectedCities.includes(city)} onChange={() => toggleListValue(city, selectedCities, setSelectedCities)} className="mr-1.5" />{city} <span className="text-xs text-slate-400">{geographicOptions.cityCounts[city] ?? 0}</span></label>)}</div></div>}
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600"><div className="font-medium text-slate-700">研究地域摘要：{geographicScopeLabel(geographicScope)}</div><div className="mt-1">当前数据库：{localRecords.length} 个案例 · 符合地域条件：{geographicRecords.length} 个</div>{Object.keys(geographicSummary.cityCounts).length > 0 && <div className="mt-1">城市分布：{Object.entries(geographicSummary.cityCounts).map(([city, count]) => `${city} ${count}`).join(' · ')}</div>}{geographicRecords.length === 0 && <div className="mt-2 text-amber-700">当前数据中暂无符合该地域范围的案例。 <button type="button" onClick={() => setGeographicScopeMode('all')} className="font-medium underline">调整研究范围</button></div>}</div>
      </fieldset>
      <fieldset><legend className="text-sm font-medium">审级</legend><div className="flex gap-3 mt-2">{['一审', '二审'].map((value) => <label key={value} className="text-sm"><input type="checkbox" checked={snapshotCaseLevels.includes(value)} onChange={() => toggleListValue(value, snapshotCaseLevels, setSnapshotCaseLevels)} className="mr-1" />{value}</label>)}</div></fieldset>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{snapshotSourceMode === 'remote' && <><label className="text-sm">开始日期<input type="date" value={snapshotStartDate} onChange={(event) => setSnapshotStartDate(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-2" /></label><label className="text-sm">结束日期<input type="date" value={snapshotEndDate} onChange={(event) => setSnapshotEndDate(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-2" /></label></>}<label className="text-sm">关键词（可选）<input value={snapshotKeyword} onChange={(event) => setSnapshotKeyword(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-2" /></label></div>
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">来源：{snapshotSourceMode === 'local' ? '本地案例库' : 'LaborInfo 远程候选元数据'} · 研究地域：{geographicScopeLabel(geographicScope)} · 审级：{snapshotCaseLevels.join('、') || '未选'}{snapshotSourceMode === 'remote' ? ` · 日期：${snapshotStartDate || '不限'} ~ ${snapshotEndDate || '不限'}` : ''}</div>
      {snapshotSourceMode === 'remote' && snapshotProgress && <div className="text-xs text-blue-700">已获取 {snapshotProgress.fetchedPages}/{snapshotProgress.totalPages} 页，当前候选 {snapshotProgress.candidateCount}</div>}
      <div className="flex gap-2"><button onClick={() => void handleCreateSnapshot()} disabled={isCreatingSnapshot || (snapshotSourceMode === 'local' && localRecordCount === 0)} className="lawlens-primary-button px-4 py-2 rounded-lg text-sm font-semibold">{isCreatingSnapshot ? '正在创建研究总体…' : '确认创建研究总体'}</button>{snapshotSourceMode === 'remote' && isCreatingSnapshot && <button onClick={() => snapshotAbortController.current?.abort()} className="px-4 py-2 rounded-lg border border-slate-300 text-sm">取消</button>}</div>
      {lastSnapshot && <details className="text-xs text-slate-600"><summary className="cursor-pointer font-medium">查看刚创建的研究范围详情</summary><div className="mt-3 space-y-1 border-l border-slate-200 pl-3"><div>研究地域：{geographicScopeLabel(lastSnapshot.geographicScope)} · 来源：{lastSnapshot.sourceMode === 'local' ? '本地案例库' : 'LaborInfo 远程'} · 状态：{lastSnapshot.status} · 候选案例 {lastSnapshot.candidateCount} 个 · 重复候选 {lastSnapshot.duplicateCount} 个</div><div>城市：{JSON.stringify(lastSnapshot.distribution.byCity)} · 年份：{JSON.stringify(lastSnapshot.distribution.byYear)} · 审级：{JSON.stringify(lastSnapshot.distribution.byCaseLevel)}</div><div>排除：test {lastSnapshot.exclusions.excludedKnownTestCases} / other {lastSnapshot.exclusions.excludedOther} / unknown {lastSnapshot.exclusions.excludedUnknown}</div><div>Candidate hash：{shortHash(lastSnapshot.candidateHash)} · Fingerprint：{shortHash(lastSnapshot.snapshotFingerprint)}</div>{lastSnapshot.sourceMode !== 'local' && lastSnapshot.status === 'complete' && lastSnapshot.candidateCount > 0 && <button onClick={() => void handlePrepareRecords(lastSnapshot.id)} disabled={isPreparing} className="mt-3 px-3 py-2 rounded-md bg-slate-800 text-white text-xs">{isPreparing ? '正在准备…' : '准备研究案例'}</button>}</div></details>}
      {preparationSummary && <div className="text-xs text-slate-600">Exact IDs {preparationSummary.requestedCount} · 已存在 {preparationSummary.alreadyAvailableCount} · fetched {preparationSummary.fetchedCount} · saved {preparationSummary.savedCount} · failed {preparationSummary.failedCaseIds.length}</div>}
    </div>}</section>
    {snapshots.length === 0 && !isLoading ? <section className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center"><Database className="w-9 h-9 text-slate-400 mx-auto" /><h2 className="font-semibold text-slate-800 mt-3">尚无研究总体。</h2><p className="text-sm text-slate-500 mt-1">请使用上方“创建研究总体”从本地已入库案例开始。</p><button onClick={onOpenDataManagement} className="mt-4 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium">查看数据管理</button></section> :
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"><div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2"><Plus className="w-4 h-4 text-blue-600" /><h2 className="font-semibold text-slate-900">创建研究运行</h2></div><div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4"><label className="block text-sm font-medium text-slate-700">1. 选择研究总体<select value={selectedSnapshotId} onChange={(event) => void handleSnapshotChange(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">请选择研究总体（不会自动选择最新记录）</option>{snapshots.filter((snapshot) => snapshot.lifecycleStatus !== 'archived').map((snapshot) => <option key={snapshot.id} value={snapshot.id} disabled={!snapshot.isSelectable}>{snapshotLabel(snapshot)}{snapshot.isSelectable ? '' : ` · ${snapshot.status}`}</option>)}{selectedSnapshot?.lifecycleStatus === 'archived' && <option value={selectedSnapshot.id} disabled>{snapshotLabel(selectedSnapshot)} · 已归档（仅查看）</option>}</select></label>
          {selectedSnapshot && <div className={`rounded-lg border p-3 text-xs ${selectedSnapshot.isSelectable ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-amber-200 bg-amber-50 text-amber-800'}`}><div className="font-medium">当前研究范围：{selectedSnapshot.candidateCount} 个候选案例</div><div className="mt-1">研究地域：{geographicScopeLabel(selectedSnapshot.geographicScope)} · 城市：{Object.keys(selectedSnapshot.distribution.byCity).join('、') || '未限定'} · 审级：{Object.keys(selectedSnapshot.distribution.byCaseLevel).join('、') || '未限定'}</div>{!selectedSnapshot.isSelectable && <div className="mt-2 font-medium">{selectedSnapshot.unavailableReason}</div>}{selectedSnapshot.sourceMode !== 'local' && selectedSnapshot.isSelectable && <button onClick={() => void handlePrepareRecords(selectedSnapshot.id)} disabled={isPreparing} className="mt-3 px-3 py-2 rounded-md bg-slate-800 text-white text-xs">{isPreparing ? '正在准备…' : '准备研究案例'}</button>}<details className="mt-2"><summary className="cursor-pointer text-slate-500">高级设置 / 技术详情</summary><div className="mt-2 space-y-1 border-l border-slate-200 pl-3"><div>Snapshot ID：<span className="font-mono break-all">{selectedSnapshot.id}</span></div><div>来源：{selectedSnapshot.sourceMode === 'local' ? '本地案例库' : 'LaborInfo 远程（含旧版 Snapshot）'}</div><div>日期范围：{selectedSnapshot.filters.remoteFilters.startDate ?? '未限定'} 至 {selectedSnapshot.filters.remoteFilters.endDate ?? '未限定'} · 创建于 {formatDate(selectedSnapshot.createdAt)}</div><div>Candidate hash：{shortHash(selectedSnapshot.candidateHash)}</div></div></details></div>}
          <fieldset><legend className="text-sm font-medium text-slate-700">2. 选择研究模式</legend><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2"><label className={`rounded-lg border p-3 cursor-pointer ${mode === 'exhaustive' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}><input type="radio" name="research-mode" checked={mode === 'exhaustive'} onChange={() => setMode('exhaustive')} className="mr-2" /><span className="text-sm font-semibold">全量分析</span><div className="text-xs text-slate-500 mt-1">分析当前研究范围内的全部候选案例。</div></label><label className={`rounded-lg border p-3 cursor-pointer ${mode === 'sampled' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}><input type="radio" name="research-mode" checked={mode === 'sampled'} onChange={() => setMode('sampled')} className="mr-2" /><span className="text-sm font-semibold">抽样比较</span><div className="text-xs text-slate-500 mt-1">从当前研究范围中创建可复现的抽样分析。</div></label></div></fieldset>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={semanticEnabled} onChange={(event) => setSemanticEnabled(event.target.checked)} /><span><span className="font-medium">启用 AI 语义分析</span><span className="block text-xs text-slate-500 mt-0.5">可在研究运行中补充语义层面的结果判断。</span></span></label></div>
        <div className="space-y-4">{mode === 'sampled' ? <><div className="flex gap-4 text-sm"><label><input type="radio" checked={samplingChoice === 'existing'} onChange={() => setSamplingChoice('existing')} className="mr-1.5" />使用已有抽样方案</label><label><input type="radio" checked={samplingChoice === 'new'} onChange={() => setSamplingChoice('new')} className="mr-1.5" />创建新的抽样方案</label></div>
          {samplingChoice === 'existing' ? <label className="block text-sm font-medium text-slate-700">当前研究范围的抽样方案<select value={selectedSamplingRunId} onChange={(event) => setSelectedSamplingRunId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">请选择抽样方案</option>{samplingRuns.map((run) => <option key={run.id} value={run.id}>{run.method === 'seeded_random' ? '随机抽样' : '分层随机抽样'} · {run.actualSampleSize} 个案例 · 复现编号 {run.seed}</option>)}</select></label> :
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4"><label className="block text-sm">抽样方式<select value={samplingMethod} onChange={(event) => setSamplingMethod(event.target.value as SamplingRun['method'])} className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-2 bg-white"><option value="seeded_random">随机抽样</option><option value="stratified_seeded_random">分层随机抽样</option></select></label><div className="grid grid-cols-2 gap-3"><label className="text-sm">案例样本量<input value={sampleSize} onChange={(event) => setSampleSize(event.target.value)} inputMode="numeric" className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-2" placeholder="例如 30" /></label><label className="text-sm">复现编号<input value={seed} onChange={(event) => setSeed(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-2" placeholder="例如 42" /></label></div>
              {samplingMethod === 'stratified_seeded_random' && <><fieldset><legend className="text-sm">分层维度</legend><div className="flex flex-wrap gap-3 mt-1.5">{(['city', 'year', 'caseLevel'] as const).map((dimension) => <label key={dimension} className="text-sm"><input type="checkbox" checked={dimensions.includes(dimension)} onChange={() => toggleDimension(dimension)} className="mr-1" />{dimension}</label>)}</div></fieldset><label className="block text-sm">样本分配<select value={allocationStrategy} onChange={(event) => setAllocationStrategy(event.target.value as AllocationStrategy)} className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-2 bg-white"><option value="proportional">Proportional · 按 Snapshot 分层比例分配</option><option value="balanced">Balanced · 各分层尽量接近</option></select></label>{allocationStrategy === 'balanced' && <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800"><ShieldAlert className="inline w-4 h-4 mr-1" />平衡抽样适合组间比较，但样本构成不代表总体分布，不应直接解释为总体比例。</div>}</>}
            </div>}{selectedRun && <div className="text-xs text-slate-500">已选抽样方案：{selectedRun.method === 'seeded_random' ? '随机抽样' : '分层随机抽样'} · {selectedRun.actualSampleSize} 个案例</div>}</> : <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">抽样方案：{mode === 'exhaustive' ? '全量分析' : '选择抽样模式后配置。'}</div>}
          <details className="text-xs text-slate-600"><summary className="cursor-pointer font-medium">高级设置 / 技术详情</summary><div className="mt-3 space-y-1 border-l border-slate-200 pl-3"><div>冻结引擎版本</div><div>Parser：{CURRENT_ANALYSIS_ENGINE_VERSIONS.parserVersion}</div><div>Ruleset：{CURRENT_ANALYSIS_ENGINE_VERSIONS.rulesetVersion}</div><div>Semantic Resolver：{semanticEnabled ? 'Enabled（当前配置）' : 'Disabled'}</div>{selectedRun && <div>抽样方案标识：{shortHash(selectedRun.sampleHash)}</div>}</div></details>
          <button onClick={() => void handleCreateAnalysisRun()} disabled={createDisabled} className="lawlens-primary-button w-full rounded-lg px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed">{isCreating ? '创建中…' : '创建研究运行'}</button></div>
      </div></section>}
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"><div className="px-5 py-4 border-b border-slate-200"><h2 className="font-semibold text-slate-900">研究运行</h2><p className="text-xs text-slate-500 mt-1">历史对象只读；如需变更研究设计，请创建新运行。</p></div>{analysisRuns.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">已有研究总体，但尚未创建研究运行。</div> : <div className="divide-y divide-slate-100">{analysisRuns.map((run) => { const sampling = allSamplingRuns.find((item) => item.id === run.samplingRunId); const expanded = expandedRunId === run.id; return <article key={run.id} className="p-5"><div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-900">{run.mode === 'exhaustive' ? '全量分析' : '抽样比较'} · {formatDate(run.createdAt)}</span><span className={`text-xs px-2 py-0.5 rounded-full ${run.status === 'failed' ? 'bg-red-100 text-red-700' : run.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{statusLabel[run.status]}</span></div><div className="text-xs text-slate-500 mt-1 truncate">{run.inputCaseCount} 个案例 · 研究地域：{geographicScopeLabel(run.geographicScope)} · 研究范围已冻结 · 抽样方案 {run.mode === 'exhaustive' ? '全量分析' : (sampling ? '已保存' : '待配置')}</div>{run.status === 'completed' && run.resultSummary && <div className="text-xs text-emerald-700 mt-1">纳入分析 {run.resultSummary.includedCaseCount} 个案例 · 排除 {run.resultSummary.excludedCaseCount} 个案例 · 处理失败 {run.resultSummary.failedCaseCount} 个案例</div>}{run.status === 'failed' && <div className="text-xs text-red-700 mt-1">{run.errorCode ?? 'ANALYSIS_FAILED'}：{run.errorMessage ?? '分析失败'}</div>}</div><div className="flex flex-wrap gap-2"><button onClick={() => onOpenLaborAnalytics(run.id)} className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-blue-200 text-blue-700 text-xs font-medium"><ExternalLink className="w-3.5 h-3.5" />查看 Labor Analytics</button><button onClick={() => onOpenDefenseAnalysis(run.id)} className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-slate-300 text-slate-700 text-xs"><Beaker className="w-3.5 h-3.5" />查看 Defense Analysis</button><button onClick={() => setExpandedRunId(expanded ? '' : run.id)} className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-slate-300 text-slate-600 text-xs">详情 {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</button></div></div>{expanded && <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 p-4 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-600 break-all"><div>AnalysisRun ID：{run.id}</div><div>Snapshot ID：{run.snapshotId}</div><div>SamplingRun ID：{run.samplingRunId ?? '不适用'}</div><div>输入案例：{run.inputCaseCount}</div><div>Parser：{run.engineVersions.parserVersion}</div><div>Ruleset：{run.engineVersions.rulesetVersion}</div><div>Semantic：{run.semantic.enabled ? `${run.semantic.provider} / ${run.semantic.model} / ${run.semantic.promptVersion}` : 'Disabled'}</div><div>研究地域：{geographicScopeLabel(run.geographicScope)}</div><div>Provenance：{run.provenanceHash}</div></div>}</article>; })}</div>}</section>
    <p className="text-xs text-slate-400">当前研究运行数据尚未纳入完整备份恢复流程；Workspace 只引用统一案例仓库，不复制 AnalysisCaseRecord。</p>
  </div></div>;
};
