import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
function snapshotLabel(snapshot: WorkspaceSnapshot, t: (key: string, options?: Record<string, unknown>) => string): string {
  const cities = Object.keys(snapshot.distribution.byCity).join('、') || t('finalUi.researchExtras.unlabeledCity');
  const years = Object.keys(snapshot.distribution.byYear).sort();
  const yearLabel = years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : (years[0] ?? t('finalUi.researchExtras.unknownYear'));
  return t('finalUi.researchExtras.snapshotLabel', { scope: geographicScopeLabel(snapshot.geographicScope), cities, year: yearLabel, count: snapshot.candidateCount });
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
  const { t } = useTranslation();
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
        <button type="button" role="menuitem" onClick={() => { setOpen(false); void onRestore?.(); }} disabled={isUpdating} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><RotateCcw className="w-3.5 h-3.5" />{' '}{t('finalUi.researchWorkspace.copy001')}{' '}</button>
        <div className="px-2 py-1.5 text-slate-400">{' '}{t('finalUi.researchWorkspace.copy002')}{' '}</div>
      </> : <>
        <button type="button" role="menuitem" onClick={() => { setOpen(false); void onArchive?.(); }} disabled={isUpdating} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><Archive className="w-3.5 h-3.5" />{' '}{t('finalUi.researchWorkspace.copy003')}{' '}</button>
        <button type="button" role="menuitem" onClick={() => { setOpen(false); void onDelete?.(); }} disabled={isUpdating || !canDelete} title={deleteTitle} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="w-3.5 h-3.5" />{' '}{t('finalUi.researchWorkspace.copy004')}{' '}</button>
      </>}
    </div>,
    document.body,
  ) : null;

  return <>
    <button ref={triggerRef} type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => { if (current) return false; setPosition(null); return true; })} className="shrink-0 cursor-pointer rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600">{' '}{t('finalUi.researchWorkspace.copy005')}{' '}</button>
    {menu}
  </>;
};

export const ResearchWorkspace: React.FC<ResearchWorkspaceProps> = ({ initialSnapshotId = '', selectedAnalysisRunId = '', onSnapshotSelect, onOpenLaborAnalytics, onOpenDefenseAnalysis, onOpenDataManagement }) => {
  const { t } = useTranslation();
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
      setError(loadError instanceof Error ? loadError.message : t('finalUi.researchExtras.loadFailed'));
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
      setError(t('finalUi.researchExtras.populationMissing'));
      return;
    }
    const selected = snapshots.find((snapshot) => snapshot.id === selectedSnapshotId);
    if (!selected?.isSelectable) {
      setSamplingRuns([]);
      return;
    }
    workspaceService.listSamplingRuns(selectedSnapshotId)
      .then(setSamplingRuns)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : t('finalUi.researchExtras.samplingLoadFailed')));
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
    if (snapshotCaseLevels.length === 0) { setError(t('finalUi.researchExtras.selectLevel')); return; }
    if (snapshotSourceMode === 'local' && localRecordCount === 0) { setError(t('finalUi.researchExtras.localEmpty')); return; }
    if (snapshotSourceMode === 'remote' && snapshotStartDate && snapshotEndDate && snapshotStartDate > snapshotEndDate) { setError(t('finalUi.researchExtras.invalidDates')); return; }
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
      setNotice(t('finalUi.researchExtras.scopeCreated', { status: created.status, count: created.candidateCount }));
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t('finalUi.researchExtras.createPopulationFailed'));
    } finally { snapshotAbortController.current = null; setIsCreatingSnapshot(false); }
  };

  const handlePrepareRecords = async (snapshotId: string) => {
    setIsPreparing(true); setError(''); setPreparationSummary(null);
    try {
      const summary = await workspaceService.prepareSnapshotRecords(snapshotId);
      setPreparationSummary(summary);
      setNotice(t('finalUi.researchExtras.preparationDone', { fetched: summary.fetchedCount, failed: summary.failedCaseIds.length }));
      window.dispatchEvent(new CustomEvent('labor-data-updated'));
    } catch (prepareError) {
      setError(prepareError instanceof Error ? prepareError.message : t('finalUi.researchExtras.preparationFailed'));
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
      setError(loadError instanceof Error ? loadError.message : t('finalUi.researchExtras.samplingLoadFailed'));
    }
  };

  const refreshPopulationState = async () => {
    const state = await workspaceService.loadWorkspace();
    setSnapshots(state.snapshots);
    setAllSamplingRuns(state.samplingRuns);
    setAnalysisRuns(state.analysisRuns);
  };

  const handleArchivePopulation = async (snapshot: WorkspaceSnapshot) => {
    if (!window.confirm(t('finalUi.researchExtras.archiveConfirm'))) return;
    setIsUpdatingPopulation(true); setError(''); setNotice('');
    try {
      await workspaceService.archiveResearchPopulation(snapshot.id);
      await refreshPopulationState();
      if (selectedSnapshotId === snapshot.id) {
        setSelectedSnapshotId(''); setSamplingRuns([]); onSnapshotSelect('');
      }
      setNotice(t('finalUi.researchExtras.archived'));
    } catch (lifecycleError) {
      setError(lifecycleError instanceof Error ? lifecycleError.message : t('finalUi.researchExtras.archiveFailed'));
    } finally { setIsUpdatingPopulation(false); }
  };

  const handleRestorePopulation = async (snapshot: WorkspaceSnapshot) => {
    setIsUpdatingPopulation(true); setError(''); setNotice('');
    try {
      await workspaceService.restoreResearchPopulation(snapshot.id);
      await refreshPopulationState();
      setNotice(t('finalUi.researchExtras.restored'));
    } catch (lifecycleError) {
      setError(lifecycleError instanceof Error ? lifecycleError.message : t('finalUi.researchExtras.restoreFailed'));
    } finally { setIsUpdatingPopulation(false); }
  };

  const handleDeletePopulation = async (snapshot: WorkspaceSnapshot) => {
    const referencedRunCount = analysisRuns.filter((run) => run.snapshotId === snapshot.id).length;
    const samplingRunCount = allSamplingRuns.filter((run) => run.snapshotId === snapshot.id).length;
    if (referencedRunCount > 0 || samplingRunCount > 0) {
      setError(referencedRunCount > 0
        ? t('finalUi.researchExtras.runReferenced', { count: referencedRunCount })
        : t('finalUi.researchExtras.sampleReferenced', { count: samplingRunCount }));
      return;
    }
    if (!window.confirm(t('finalUi.researchExtras.deleteConfirm'))) return;
    setIsUpdatingPopulation(true); setError(''); setNotice('');
    try {
      await workspaceService.deleteResearchPopulation(snapshot.id);
      await refreshPopulationState();
      if (selectedSnapshotId === snapshot.id) {
        setSelectedSnapshotId(''); setSamplingRuns([]); onSnapshotSelect('');
      }
      setNotice(t('finalUi.researchExtras.deleted'));
    } catch (lifecycleError) {
      setError(lifecycleError instanceof Error ? lifecycleError.message : t('finalUi.researchExtras.deleteFailed'));
    } finally { setIsUpdatingPopulation(false); }
  };

  const toggleDimension = (dimension: StratificationDimension) => {
    setDimensions((current) => current.includes(dimension) ? current.filter((item) => item !== dimension) : [...current, dimension]);
  };

  const createSamplingRun = async (): Promise<string> => {
    if (!selectedSnapshotId) throw new Error(t('finalUi.researchExtras.selectPopulation'));
    if (!seed.trim()) throw new Error(t('finalUi.researchExtras.seedRequired'));
    const requestedSize = Number(sampleSize);
    if (!Number.isInteger(requestedSize) || requestedSize <= 0) throw new Error(t('finalUi.researchExtras.invalidSampleSize'));
    if (samplingMethod === 'stratified_seeded_random' && dimensions.length === 0) throw new Error(t('finalUi.researchExtras.selectDimension'));
    const created = samplingMethod === 'seeded_random'
      ? await workspaceService.createSamplingRun({ method: 'seeded_random', snapshotId: selectedSnapshotId, sampleSize: requestedSize, seed: seed.trim() })
      : await workspaceService.createSamplingRun({ method: 'stratified_seeded_random', snapshotId: selectedSnapshotId, sampleSize: requestedSize, seed: seed.trim(), dimensions, allocationStrategy });
    setSamplingRuns(await workspaceService.listSamplingRuns(selectedSnapshotId));
    setSelectedSamplingRunId(created.id);
    return created.id;
  };

  const handleCreateAnalysisRun = async () => {
    setError(''); setNotice('');
    if (!selectedSnapshot?.isSelectable || !mode) { setError(t('finalUi.researchExtras.selectScopeAndMode')); return; }
    if (mode === 'sampled' && samplingChoice === 'existing' && !selectedSamplingRunId) { setError(t('finalUi.researchExtras.selectSamplingPlan')); return; }
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
      setNotice(t('finalUi.researchExtras.runCreated'));
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t('finalUi.researchExtras.runCreateFailed'));
    } finally { setIsCreating(false); }
  };

  const selectedRun = samplingRuns.find((run) => run.id === selectedSamplingRunId);
  const selectedAnalysisRun = analysisRuns.find((run) => run.id === selectedAnalysisRunId) || null;
  const createDisabled = isCreating || !selectedSnapshot?.isSelectable || !mode || (mode === 'sampled' && samplingChoice === 'existing' && !selectedSamplingRunId);

  return <div className="min-h-full bg-slate-50 p-4 md:p-6 lg:p-8"><div className="max-w-7xl mx-auto space-y-6">
    <header className="flex flex-col md:flex-row md:items-center justify-between gap-4"><div><h1 className="text-2xl font-bold text-slate-900">{' '}{t('finalUi.researchWorkspace.copy006')}{' '}</h1><p className="text-sm text-slate-500 mt-1">{' '}{t('finalUi.researchWorkspace.copy007')}{' '}</p></div><button onClick={() => void loadWorkspace()} disabled={isLoading} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> {' '}{t('finalUi.researchWorkspace.copy008')}{' '}</button></header>
    <AnalysisContextBar
      run={selectedAnalysisRun}
      snapshotId={selectedSnapshot?.id}
      scopeLabel={selectedSnapshot ? snapshotLabel(selectedSnapshot, t) : undefined}
      emptyLabel={selectedSnapshot ? t('finalUi.researchExpression.label001') : t('finalUi.researchExpression.label002')}
    />
    {selectedSnapshot && <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 px-1 text-sm text-slate-600"><span><span className="text-xs text-slate-400">{' '}{t('finalUi.researchWorkspace.copy009')}{' '}</span> {geographicScopeLabel(selectedSnapshot.geographicScope)}</span><span><span className="text-xs text-slate-400">{' '}{t('finalUi.researchWorkspace.copy010')}{' '}</span> {Object.keys(selectedSnapshot.distribution.byCity).join('、') || t('finalUi.researchExpression.label003')}</span><span><span className="text-xs text-slate-400">{' '}{t('finalUi.researchWorkspace.copy011')}{' '}</span> {Object.keys(selectedSnapshot.distribution.byYear).sort().join('、') || t('finalUi.researchExpression.label003')}</span><span><span className="text-xs text-slate-400">{' '}{t('finalUi.researchWorkspace.copy012')}{' '}</span> {selectedSnapshot.candidateCount} {' '}{t('finalUi.researchWorkspace.copy013')}{' '}</span></div>}
    {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}{notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"><div className="px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-900">{' '}{t('finalUi.researchWorkspace.copy014')}{' '}</h2><p className="text-xs text-slate-500 mt-1">{' '}{t('finalUi.researchWorkspace.copy015')}{' '}</p><p className="text-xs text-slate-500 mt-1">{' '}{t('finalUi.researchWorkspace.copy016')}{' '}{localRecordCount} {' '}{t('finalUi.researchWorkspace.copy013')}{' '}</p></div><div className="flex flex-wrap gap-2"><button onClick={() => { setSnapshotSourceMode('local'); setShowSnapshotForm(true); }} disabled={localRecordCount === 0} className="lawlens-primary-button px-3 py-2 rounded-lg text-sm font-medium">{' '}{t('finalUi.researchWorkspace.copy017')}{' '}</button><button onClick={() => { setSnapshotSourceMode('remote'); setShowSnapshotForm(true); }} className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium">{' '}{t('finalUi.researchWorkspace.copy018')}{' '}</button></div></div>{localRecordCount === 0 && <div className="mx-5 mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{' '}{t('finalUi.researchWorkspace.copy019')}{' '}</div>}<div className="border-t border-slate-100 px-5 py-4 space-y-3"><div className="flex items-center justify-between"><div className="text-sm font-medium text-slate-700">{' '}{t('finalUi.researchWorkspace.copy020')}{' '}<span className="text-xs text-slate-400">{snapshots.filter((snapshot) => snapshot.lifecycleStatus !== 'archived').length}</span></div>{snapshots.some((snapshot) => snapshot.lifecycleStatus === 'archived') && <button type="button" onClick={() => setShowArchivedPopulations((current) => !current)} className="text-xs text-slate-500 underline">{showArchivedPopulations ? t('finalUi.researchExpression.label004') : t('finalUi.researchRemaining.archivedCount', { count: snapshots.filter((snapshot) => snapshot.lifecycleStatus === 'archived').length })}</button>}</div>{snapshots.filter((snapshot) => snapshot.lifecycleStatus !== 'archived').map((snapshot) => { const referencedRunCount = analysisRuns.filter((run) => run.snapshotId === snapshot.id).length; const samplingRunCount = allSamplingRuns.filter((run) => run.snapshotId === snapshot.id).length; return <div key={snapshot.id} className={`flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-lg border px-3 py-3 ${selectedSnapshotId === snapshot.id ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200 bg-white'}`}><button type="button" onClick={() => void handleSnapshotChange(snapshot.id)} className="min-w-0 text-left"><div className="text-sm font-medium text-slate-800 truncate">{snapshotLabel(snapshot, t)}</div><div className="text-xs text-slate-500 mt-1">{referencedRunCount > 0 ? t('finalUi.researchRemaining.referencedRuns', { count: referencedRunCount }) : t('finalUi.researchRemaining.notReferenced')}</div></button><ResearchPopulationActionMenu isUpdating={isUpdatingPopulation} canDelete={referencedRunCount === 0 && samplingRunCount === 0} deleteTitle={referencedRunCount > 0 ? t('finalUi.researchRemaining.referencedRuns', { count: referencedRunCount }) : samplingRunCount > 0 ? t('finalUi.researchRemaining.referencedPlans', { count: samplingRunCount }) : undefined} onArchive={() => handleArchivePopulation(snapshot)} onDelete={() => handleDeletePopulation(snapshot)} /></div>; })}{showArchivedPopulations && snapshots.filter((snapshot) => snapshot.lifecycleStatus === 'archived').map((snapshot) => { const referencedRunCount = analysisRuns.filter((run) => run.snapshotId === snapshot.id).length; return <div key={snapshot.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3"><button type="button" onClick={() => void handleSnapshotChange(snapshot.id)} className="min-w-0 text-left"><div className="text-sm font-medium text-slate-700 truncate">{snapshotLabel(snapshot, t)} {' '}{t('finalUi.researchWorkspace.copy021')}{' '}</div><div className="text-xs text-slate-500 mt-1">{' '}{t('finalUi.researchWorkspace.copy022')}{' '}{referencedRunCount}</div></button><ResearchPopulationActionMenu archived isUpdating={isUpdatingPopulation} onRestore={() => handleRestorePopulation(snapshot)} /></div>; })}</div>{showSnapshotForm && <div className="border-t border-slate-200 p-5 space-y-4">
      <div className={`rounded-lg border p-3 text-sm ${snapshotSourceMode === 'local' ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{snapshotSourceMode === 'local' ? t('finalUi.researchRemaining.localMode', { count: localRecordCount }) : t('finalUi.researchRemaining.remoteMode')}</div>
      <fieldset><legend className="text-sm font-medium">{' '}{t('finalUi.researchWorkspace.copy023')}{' '}</legend><p className="text-xs text-slate-500 mt-1">{' '}{t('finalUi.researchWorkspace.copy024')}{' '}</p><div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">{([['all', t('finalUi.researchExpression.label005')], ['province', t('finalUi.researchExpression.label006')], ['pearl_river_delta', t('finalUi.researchExpression.label007')], ['custom_cities', t('finalUi.researchExpression.label008')]] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setGeographicScopeMode(value)} className={`rounded-lg border px-3 py-2 text-sm text-left ${geographicScopeMode === value ? 'border-blue-400 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-700'}`}>{label}</button>)}</div>
        {geographicScopeMode === 'province' && <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-xs text-slate-500 mb-2">{' '}{t('finalUi.researchWorkspace.copy025')}{' '}</div><div className="flex flex-wrap gap-2">{geographicOptions.provinces.length === 0 ? <span className="text-xs text-slate-500">{' '}{t('finalUi.researchWorkspace.copy026')}{' '}</span> : geographicOptions.provinces.map((province) => <label key={province} className="text-sm rounded-md bg-white border border-slate-200 px-2 py-1.5"><input type="checkbox" checked={selectedProvinces.includes(province)} onChange={() => toggleListValue(province, selectedProvinces, setSelectedProvinces)} className="mr-1.5" />{province} <span className="text-xs text-slate-400">{geographicOptions.provinceCounts[province] ?? 0}</span></label>)}</div></div>}
        {geographicScopeMode === 'pearl_river_delta' && <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"><div>{' '}{t('finalUi.researchWorkspace.copy027')}{' '}</div><div className="text-xs text-slate-500 mt-1">{' '}{t('finalUi.researchWorkspace.copy028')}{' '}</div></div>}
        {geographicScopeMode === 'custom_cities' && <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-xs text-slate-500 mb-2">{' '}{t('finalUi.researchWorkspace.copy029')}{' '}</div><div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{geographicOptions.cities.length === 0 ? <span className="text-xs text-slate-500">{' '}{t('finalUi.researchWorkspace.copy030')}{' '}</span> : geographicOptions.cities.map((city) => <label key={city} className="text-sm rounded-md bg-white border border-slate-200 px-2 py-1.5"><input type="checkbox" checked={selectedCities.includes(city)} onChange={() => toggleListValue(city, selectedCities, setSelectedCities)} className="mr-1.5" />{city} <span className="text-xs text-slate-400">{geographicOptions.cityCounts[city] ?? 0}</span></label>)}</div></div>}
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600"><div className="font-medium text-slate-700">{' '}{t('finalUi.researchWorkspace.copy031')}{' '}{geographicScopeLabel(geographicScope)}</div><div className="mt-1">{' '}{t('finalUi.researchWorkspace.copy032')}{' '}{localRecords.length} {' '}{t('finalUi.researchWorkspace.copy033')}{' '}{geographicRecords.length} {' '}{t('finalUi.researchWorkspace.copy013')}{' '}</div>{Object.keys(geographicSummary.cityCounts).length > 0 && <div className="mt-1">{' '}{t('finalUi.researchWorkspace.copy034')}{' '}{Object.entries(geographicSummary.cityCounts).map(([city, count]) => `${city} ${count}`).join(' · ')}</div>}{geographicRecords.length === 0 && <div className="mt-2 text-amber-700">{' '}{t('finalUi.researchWorkspace.copy035')}{' '}<button type="button" onClick={() => setGeographicScopeMode('all')} className="font-medium underline">{' '}{t('finalUi.researchWorkspace.copy036')}{' '}</button></div>}</div>
      </fieldset>
      <fieldset><legend className="text-sm font-medium">{' '}{t('finalUi.researchWorkspace.copy037')}{' '}</legend><div className="flex gap-3 mt-2">{['一审', '二审'].map((value) => <label key={value} className="text-sm"><input type="checkbox" checked={snapshotCaseLevels.includes(value)} onChange={() => toggleListValue(value, snapshotCaseLevels, setSnapshotCaseLevels)} className="mr-1" />{value}</label>)}</div></fieldset>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{snapshotSourceMode === 'remote' && <><label className="text-sm">{' '}{t('finalUi.researchWorkspace.copy038')}{' '}<input type="date" value={snapshotStartDate} onChange={(event) => setSnapshotStartDate(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-2" /></label><label className="text-sm">{' '}{t('finalUi.researchWorkspace.copy039')}{' '}<input type="date" value={snapshotEndDate} onChange={(event) => setSnapshotEndDate(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-2" /></label></>}<label className="text-sm">{' '}{t('finalUi.researchWorkspace.copy040')}{' '}<input value={snapshotKeyword} onChange={(event) => setSnapshotKeyword(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-2" /></label></div>
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">{' '}{t('finalUi.researchWorkspace.copy041')}{' '}{snapshotSourceMode === 'local' ? t('finalUi.researchExpression.label009') : t('finalUi.researchExpression.label010')} {' '}{t('finalUi.researchWorkspace.copy042')}{' '}{geographicScopeLabel(geographicScope)} {' '}{t('finalUi.researchWorkspace.copy043')}{' '}{snapshotCaseLevels.join('、') || t('finalUi.researchExpression.label011')}{snapshotSourceMode === 'remote' ? t('finalUi.researchRemaining.dateRange', { start: snapshotStartDate || t('finalUi.researchExpression.label012'), end: snapshotEndDate || t('finalUi.researchExpression.label012') }) : ''}</div>
      {snapshotSourceMode === 'remote' && snapshotProgress && <div className="text-xs text-blue-700">{' '}{t('finalUi.researchWorkspace.copy044')}{' '}{snapshotProgress.fetchedPages}/{snapshotProgress.totalPages} {' '}{t('finalUi.researchWorkspace.copy045')}{' '}{snapshotProgress.candidateCount}</div>}
      <div className="flex gap-2"><button onClick={() => void handleCreateSnapshot()} disabled={isCreatingSnapshot || (snapshotSourceMode === 'local' && localRecordCount === 0)} className="lawlens-primary-button px-4 py-2 rounded-lg text-sm font-semibold">{isCreatingSnapshot ? t('finalUi.researchExpression.label013') : t('finalUi.researchExpression.label014')}</button>{snapshotSourceMode === 'remote' && isCreatingSnapshot && <button onClick={() => snapshotAbortController.current?.abort()} className="px-4 py-2 rounded-lg border border-slate-300 text-sm">{' '}{t('finalUi.researchWorkspace.copy046')}{' '}</button>}</div>
      {lastSnapshot && <details className="text-xs text-slate-600"><summary className="cursor-pointer font-medium">{' '}{t('finalUi.researchWorkspace.copy047')}{' '}</summary><div className="mt-3 space-y-1 border-l border-slate-200 pl-3"><div>{' '}{t('finalUi.researchWorkspace.copy048')}{' '}{geographicScopeLabel(lastSnapshot.geographicScope)} {' '}{t('finalUi.researchWorkspace.copy049')}{' '}{lastSnapshot.sourceMode === 'local' ? t('finalUi.researchExpression.label009') : t('finalUi.researchExpression.label015')} {' '}{t('finalUi.researchWorkspace.copy050')}{' '}{lastSnapshot.status} {' '}{t('finalUi.researchWorkspace.copy051')}{' '}{lastSnapshot.candidateCount} {' '}{t('finalUi.researchWorkspace.copy052')}{' '}{lastSnapshot.duplicateCount} {' '}{t('finalUi.researchWorkspace.copy013')}{' '}</div><div>{' '}{t('finalUi.researchWorkspace.copy053')}{' '}{JSON.stringify(lastSnapshot.distribution.byCity)} {' '}{t('finalUi.researchWorkspace.copy054')}{' '}{JSON.stringify(lastSnapshot.distribution.byYear)} {' '}{t('finalUi.researchWorkspace.copy043')}{' '}{JSON.stringify(lastSnapshot.distribution.byCaseLevel)}</div><div>{' '}{t('finalUi.researchWorkspace.copy055')}{' '}{lastSnapshot.exclusions.excludedKnownTestCases} / other {lastSnapshot.exclusions.excludedOther} / unknown {lastSnapshot.exclusions.excludedUnknown}</div><div>Candidate hash：{shortHash(lastSnapshot.candidateHash)} · Fingerprint：{shortHash(lastSnapshot.snapshotFingerprint)}</div>{lastSnapshot.sourceMode !== 'local' && lastSnapshot.status === 'complete' && lastSnapshot.candidateCount > 0 && <button onClick={() => void handlePrepareRecords(lastSnapshot.id)} disabled={isPreparing} className="mt-3 px-3 py-2 rounded-md bg-slate-800 text-white text-xs">{isPreparing ? t('finalUi.researchExpression.label016') : t('finalUi.researchExpression.label017')}</button>}</div></details>}
      {preparationSummary && <div className="text-xs text-slate-600">Exact IDs {preparationSummary.requestedCount} {' '}{t('finalUi.researchWorkspace.copy056')}{' '}{preparationSummary.alreadyAvailableCount} · fetched {preparationSummary.fetchedCount} · saved {preparationSummary.savedCount} · failed {preparationSummary.failedCaseIds.length}</div>}
    </div>}</section>
    {snapshots.length === 0 && !isLoading ? <section className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center"><Database className="w-9 h-9 text-slate-400 mx-auto" /><h2 className="font-semibold text-slate-800 mt-3">{' '}{t('finalUi.researchWorkspace.copy057')}{' '}</h2><p className="text-sm text-slate-500 mt-1">{' '}{t('finalUi.researchWorkspace.copy058')}{' '}</p><button onClick={onOpenDataManagement} className="mt-4 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium">{' '}{t('finalUi.researchWorkspace.copy059')}{' '}</button></section> :
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"><div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2"><Plus className="w-4 h-4 text-blue-600" /><h2 className="font-semibold text-slate-900">{' '}{t('finalUi.researchWorkspace.copy060')}{' '}</h2></div><div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4"><label className="block text-sm font-medium text-slate-700">{' '}{t('finalUi.researchWorkspace.copy061')}{' '}<select value={selectedSnapshotId} onChange={(event) => void handleSnapshotChange(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">{' '}{t('finalUi.researchWorkspace.copy062')}{' '}</option>{snapshots.filter((snapshot) => snapshot.lifecycleStatus !== 'archived').map((snapshot) => <option key={snapshot.id} value={snapshot.id} disabled={!snapshot.isSelectable}>{snapshotLabel(snapshot, t)}{snapshot.isSelectable ? '' : ` · ${snapshot.status}`}</option>)}{selectedSnapshot?.lifecycleStatus === 'archived' && <option value={selectedSnapshot.id} disabled>{snapshotLabel(selectedSnapshot, t)} {' '}{t('finalUi.researchWorkspace.copy063')}{' '}</option>}</select></label>
          {selectedSnapshot && <div className={`rounded-lg border p-3 text-xs ${selectedSnapshot.isSelectable ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-amber-200 bg-amber-50 text-amber-800'}`}><div className="font-medium">{' '}{t('finalUi.researchWorkspace.copy064')}{' '}{selectedSnapshot.candidateCount} {' '}{t('finalUi.researchWorkspace.copy065')}{' '}</div><div className="mt-1">{' '}{t('finalUi.researchWorkspace.copy048')}{' '}{geographicScopeLabel(selectedSnapshot.geographicScope)} {' '}{t('finalUi.researchWorkspace.copy066')}{' '}{Object.keys(selectedSnapshot.distribution.byCity).join('、') || t('finalUi.researchExpression.label003')} {' '}{t('finalUi.researchWorkspace.copy043')}{' '}{Object.keys(selectedSnapshot.distribution.byCaseLevel).join('、') || t('finalUi.researchExpression.label003')}</div>{!selectedSnapshot.isSelectable && <div className="mt-2 font-medium">{selectedSnapshot.unavailableReason}</div>}{selectedSnapshot.sourceMode !== 'local' && selectedSnapshot.isSelectable && <button onClick={() => void handlePrepareRecords(selectedSnapshot.id)} disabled={isPreparing} className="mt-3 px-3 py-2 rounded-md bg-slate-800 text-white text-xs">{isPreparing ? t('finalUi.researchExpression.label016') : t('finalUi.researchExpression.label017')}</button>}<details className="mt-2"><summary className="cursor-pointer text-slate-500">{' '}{t('finalUi.researchWorkspace.copy067')}{' '}</summary><div className="mt-2 space-y-1 border-l border-slate-200 pl-3"><div>Snapshot ID：<span className="font-mono break-all">{selectedSnapshot.id}</span></div><div>{' '}{t('finalUi.researchWorkspace.copy041')}{' '}{selectedSnapshot.sourceMode === 'local' ? t('finalUi.researchExpression.label009') : t('finalUi.researchExpression.label018')}</div><div>{' '}{t('finalUi.researchWorkspace.copy068')}{' '}{selectedSnapshot.filters.remoteFilters.startDate ?? t('finalUi.researchExpression.label003')} {' '}{t('finalUi.researchWorkspace.copy069')}{' '}{selectedSnapshot.filters.remoteFilters.endDate ?? t('finalUi.researchExpression.label003')} {' '}{t('finalUi.researchWorkspace.copy070')}{' '}{formatDate(selectedSnapshot.createdAt)}</div><div>Candidate hash：{shortHash(selectedSnapshot.candidateHash)}</div></div></details></div>}
          <fieldset><legend className="text-sm font-medium text-slate-700">{' '}{t('finalUi.researchWorkspace.copy071')}{' '}</legend><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2"><label className={`rounded-lg border p-3 cursor-pointer ${mode === 'exhaustive' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}><input type="radio" name="research-mode" checked={mode === 'exhaustive'} onChange={() => setMode('exhaustive')} className="mr-2" /><span className="text-sm font-semibold">{' '}{t('finalUi.researchWorkspace.copy072')}{' '}</span><div className="text-xs text-slate-500 mt-1">{' '}{t('finalUi.researchWorkspace.copy073')}{' '}</div></label><label className={`rounded-lg border p-3 cursor-pointer ${mode === 'sampled' ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}><input type="radio" name="research-mode" checked={mode === 'sampled'} onChange={() => setMode('sampled')} className="mr-2" /><span className="text-sm font-semibold">{' '}{t('finalUi.researchWorkspace.copy074')}{' '}</span><div className="text-xs text-slate-500 mt-1">{' '}{t('finalUi.researchWorkspace.copy075')}{' '}</div></label></div></fieldset>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={semanticEnabled} onChange={(event) => setSemanticEnabled(event.target.checked)} /><span><span className="font-medium">{' '}{t('finalUi.researchWorkspace.copy076')}{' '}</span><span className="block text-xs text-slate-500 mt-0.5">{' '}{t('finalUi.researchWorkspace.copy077')}{' '}</span></span></label></div>
        <div className="space-y-4">{mode === 'sampled' ? <><div className="flex gap-4 text-sm"><label><input type="radio" checked={samplingChoice === 'existing'} onChange={() => setSamplingChoice('existing')} className="mr-1.5" />{' '}{t('finalUi.researchWorkspace.copy078')}{' '}</label><label><input type="radio" checked={samplingChoice === 'new'} onChange={() => setSamplingChoice('new')} className="mr-1.5" />{' '}{t('finalUi.researchWorkspace.copy079')}{' '}</label></div>
          {samplingChoice === 'existing' ? <label className="block text-sm font-medium text-slate-700">{' '}{t('finalUi.researchWorkspace.copy080')}{' '}<select value={selectedSamplingRunId} onChange={(event) => setSelectedSamplingRunId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">{' '}{t('finalUi.researchWorkspace.copy081')}{' '}</option>{samplingRuns.map((run) => <option key={run.id} value={run.id}>{run.method === 'seeded_random' ? t('finalUi.researchExpression.label019') : t('finalUi.researchExpression.label020')} · {run.actualSampleSize} {' '}{t('finalUi.researchWorkspace.copy082')}{' '}{run.seed}</option>)}</select></label> :
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4"><label className="block text-sm">{' '}{t('finalUi.researchWorkspace.copy083')}{' '}<select value={samplingMethod} onChange={(event) => setSamplingMethod(event.target.value as SamplingRun['method'])} className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-2 bg-white"><option value="seeded_random">{' '}{t('finalUi.researchWorkspace.copy084')}{' '}</option><option value="stratified_seeded_random">{' '}{t('finalUi.researchWorkspace.copy085')}{' '}</option></select></label><div className="grid grid-cols-2 gap-3"><label className="text-sm">{' '}{t('finalUi.researchWorkspace.copy086')}{' '}<input value={sampleSize} onChange={(event) => setSampleSize(event.target.value)} inputMode="numeric" className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-2" placeholder={t('finalUi.researchWorkspace.copy087')} /></label><label className="text-sm">{' '}{t('finalUi.researchWorkspace.copy088')}{' '}<input value={seed} onChange={(event) => setSeed(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-2" placeholder={t('finalUi.researchWorkspace.copy089')} /></label></div>
              {samplingMethod === 'stratified_seeded_random' && <><fieldset><legend className="text-sm">{' '}{t('finalUi.researchWorkspace.copy090')}{' '}</legend><div className="flex flex-wrap gap-3 mt-1.5">{(['city', 'year', 'caseLevel'] as const).map((dimension) => <label key={dimension} className="text-sm"><input type="checkbox" checked={dimensions.includes(dimension)} onChange={() => toggleDimension(dimension)} className="mr-1" />{dimension}</label>)}</div></fieldset><label className="block text-sm">{' '}{t('finalUi.researchWorkspace.copy091')}{' '}<select value={allocationStrategy} onChange={(event) => setAllocationStrategy(event.target.value as AllocationStrategy)} className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-2 bg-white"><option value="proportional">{' '}{t('finalUi.researchWorkspace.copy092')}{' '}</option><option value="balanced">{' '}{t('finalUi.researchWorkspace.copy093')}{' '}</option></select></label>{allocationStrategy === 'balanced' && <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800"><ShieldAlert className="inline w-4 h-4 mr-1" />{' '}{t('finalUi.researchWorkspace.copy094')}{' '}</div>}</>}
            </div>}{selectedRun && <div className="text-xs text-slate-500">{' '}{t('finalUi.researchWorkspace.copy095')}{' '}{selectedRun.method === 'seeded_random' ? t('finalUi.researchExpression.label019') : t('finalUi.researchExpression.label020')} · {selectedRun.actualSampleSize} {' '}{t('finalUi.researchWorkspace.copy096')}{' '}</div>}</> : <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">{' '}{t('finalUi.researchWorkspace.copy097')}{' '}{mode === 'exhaustive' ? t('finalUi.researchExpression.label021') : t('finalUi.researchExpression.label022')}</div>}
          <details className="text-xs text-slate-600"><summary className="cursor-pointer font-medium">{' '}{t('finalUi.researchWorkspace.copy067')}{' '}</summary><div className="mt-3 space-y-1 border-l border-slate-200 pl-3"><div>{' '}{t('finalUi.researchWorkspace.copy098')}{' '}</div><div>Parser：{CURRENT_ANALYSIS_ENGINE_VERSIONS.parserVersion}</div><div>Ruleset：{CURRENT_ANALYSIS_ENGINE_VERSIONS.rulesetVersion}</div><div>Semantic Resolver：{semanticEnabled ? t('finalUi.researchExpression.label023') : 'Disabled'}</div>{selectedRun && <div>{' '}{t('finalUi.researchWorkspace.copy099')}{' '}{shortHash(selectedRun.sampleHash)}</div>}</div></details>
          <button onClick={() => void handleCreateAnalysisRun()} disabled={createDisabled} className="lawlens-primary-button w-full rounded-lg px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed">{isCreating ? t('finalUi.researchExpression.label024') : t('finalUi.researchExpression.label025')}</button></div>
      </div></section>}
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"><div className="px-5 py-4 border-b border-slate-200"><h2 className="font-semibold text-slate-900">{' '}{t('finalUi.researchWorkspace.copy100')}{' '}</h2><p className="text-xs text-slate-500 mt-1">{' '}{t('finalUi.researchWorkspace.copy101')}{' '}</p></div>{analysisRuns.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">{' '}{t('finalUi.researchWorkspace.copy102')}{' '}</div> : <div className="divide-y divide-slate-100">{analysisRuns.map((run) => { const sampling = allSamplingRuns.find((item) => item.id === run.samplingRunId); const expanded = expandedRunId === run.id; return <article key={run.id} className="p-5"><div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-900">{run.mode === 'exhaustive' ? t('finalUi.researchExpression.label021') : t('finalUi.researchExpression.label026')} · {formatDate(run.createdAt)}</span><span className={`text-xs px-2 py-0.5 rounded-full ${run.status === 'failed' ? 'bg-red-100 text-red-700' : run.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{t(`finalUi.researchExtras.status.${run.status}`)}</span></div><div className="text-xs text-slate-500 mt-1 truncate">{run.inputCaseCount} {' '}{t('finalUi.researchWorkspace.copy103')}{' '}{geographicScopeLabel(run.geographicScope)} {' '}{t('finalUi.researchWorkspace.copy104')}{' '}{run.mode === 'exhaustive' ? t('finalUi.researchExpression.label021') : (sampling ? t('finalUi.researchExpression.label027') : t('finalUi.researchExpression.label028'))}</div>{run.status === 'completed' && run.resultSummary && <div className="text-xs text-emerald-700 mt-1">{' '}{t('finalUi.researchWorkspace.copy105')}{' '}{run.resultSummary.includedCaseCount} {' '}{t('finalUi.researchWorkspace.copy106')}{' '}{run.resultSummary.excludedCaseCount} {' '}{t('finalUi.researchWorkspace.copy107')}{' '}{run.resultSummary.failedCaseCount} {' '}{t('finalUi.researchWorkspace.copy096')}{' '}</div>}{run.status === 'failed' && <div className="text-xs text-red-700 mt-1">{run.errorCode ?? 'ANALYSIS_FAILED'}：{run.errorMessage ?? t('finalUi.researchExpression.label029')}</div>}</div><div className="flex flex-wrap gap-2"><button onClick={() => onOpenLaborAnalytics(run.id)} className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-blue-200 text-blue-700 text-xs font-medium"><ExternalLink className="w-3.5 h-3.5" />{' '}{t('finalUi.researchWorkspace.copy108')}{' '}</button><button onClick={() => onOpenDefenseAnalysis(run.id)} className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-slate-300 text-slate-700 text-xs"><Beaker className="w-3.5 h-3.5" />{' '}{t('finalUi.researchWorkspace.copy109')}{' '}</button><button onClick={() => setExpandedRunId(expanded ? '' : run.id)} className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-slate-300 text-slate-600 text-xs">{' '}{t('finalUi.researchWorkspace.copy110')}{' '}{expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</button></div></div>{expanded && <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 p-4 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-600 break-all"><div>AnalysisRun ID：{run.id}</div><div>Snapshot ID：{run.snapshotId}</div><div>SamplingRun ID：{run.samplingRunId ?? t('finalUi.researchExpression.label030')}</div><div>{' '}{t('finalUi.researchWorkspace.copy111')}{' '}{run.inputCaseCount}</div><div>Parser：{run.engineVersions.parserVersion}</div><div>Ruleset：{run.engineVersions.rulesetVersion}</div><div>Semantic：{run.semantic.enabled ? `${run.semantic.provider} / ${run.semantic.model} / ${run.semantic.promptVersion}` : 'Disabled'}</div><div>{' '}{t('finalUi.researchWorkspace.copy048')}{' '}{geographicScopeLabel(run.geographicScope)}</div><div>Provenance：{run.provenanceHash}</div></div>}</article>; })}</div>}</section>
    <p className="text-xs text-slate-400">{' '}{t('finalUi.researchWorkspace.copy112')}{' '}</p>
  </div></div>;
};
