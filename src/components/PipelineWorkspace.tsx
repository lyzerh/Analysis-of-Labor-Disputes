import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, ShieldAlert, Sparkles, UserRoundCheck } from 'lucide-react';
import type { AnalysisCaseRecord, OutcomeReviewItem } from '../types';
import {
  getPipelineOverview,
  getPipelineProcessingStats,
  mapAnalysisRecordToProcessingStage,
  processingProvenanceKey,
  processingStageDescriptionKey,
  processingStageReason,
} from '../services/presentation/PipelineStagePresentation';
import { CollapsibleText } from './CollapsibleText';
import { SemanticReviewWorkspace } from './SemanticReviewWorkspace';
import { DiagnosticClueWorkspace } from './DiagnosticClueWorkspace';
import { isLlmAvailable, useLlmRuntimeSettings } from '../services/semantic/LlmRuntimeSettings';
import type { SingleCaseSemanticRunResult } from '../services/semantic/LlmRuntimeService';
import { latestSemanticTechnicalFailure, readSemanticTechnicalFailures } from '../services/semantic/SemanticTechnicalFailureStorage';
import type { SemanticReviewItem } from '../services/semantic/SemanticReviewQueue';
import type { CompetitionValidationSnapshot } from '../services/validation/CompetitionValidationSnapshot';

interface PipelineWorkspaceProps {
  records: AnalysisCaseRecord[];
  reviewItems: OutcomeReviewItem[];
  onSelectCase: (item: OutcomeReviewItem) => void;
  hasAnalysisRun: boolean;
  onRunSingleCase?: (record: AnalysisCaseRecord) => Promise<SingleCaseSemanticRunResult>;
  onOpenManualReview?: (record: AnalysisCaseRecord) => Promise<void>;
  onSelectRecord?: (record: AnalysisCaseRecord) => void;
  semanticReviewItems?: SemanticReviewItem[];
  onSemanticReviewItemsChange?: (items: SemanticReviewItem[]) => void;
  onExportValidationSnapshot?: () => Promise<CompetitionValidationSnapshot>;
}

const stageCardStyles = {
  safe: 'border-emerald-200 bg-emerald-50/70 text-emerald-950',
  awaiting_llm: 'border-indigo-200 bg-indigo-50/70 text-indigo-950',
  review_pending: 'border-amber-200 bg-amber-50/70 text-amber-950',
  technical_failure: 'border-orange-200 bg-orange-50/70 text-orange-950',
  blocked: 'border-slate-200 bg-slate-50/80 text-slate-800',
} as const;

const technicalFailureLabel = (code: string, t: (key: string) => string): string => {
  if (code === 'timeout') return t('pipeline.timeout');
  if (code === 'network_error') return t('pipeline.networkError');
  if (code === 'invalid_json') return t('pipeline.invalidJson');
  if (code === 'schema_invalid' || code === 'schema_validation_failed') return t('pipeline.schemaInvalid');
  if (code === 'contract_validation_failed' || code === 'contract_mismatch') return t('pipeline.contractInvalid');
  if (/^http_/.test(code) || code === 'provider_http_failure') return t('pipeline.providerError');
  return t('pipeline.processingError');
};

const StageIcon: React.FC<{ stage: 'safe' | 'awaiting_llm' | 'review_pending' | 'technical_failure' | 'blocked' }> = ({ stage }) => {
  if (stage === 'safe') return <CheckCircle2 className="h-4 w-4" />;
  if (stage === 'awaiting_llm') return <Sparkles className="h-4 w-4" />;
  if (stage === 'technical_failure') return <AlertTriangle className="h-4 w-4" />;
  if (stage === 'blocked') return <ShieldAlert className="h-4 w-4" />;
  return <UserRoundCheck className="h-4 w-4" />;
};

const PipelineStat: React.FC<{ label: string; value: number; tone: string; detail?: string }> = ({ label, value, tone, detail }) => (
  <div className={`rounded-2xl border px-4 py-4 ${tone}`}>
    <div className="text-[11px] font-medium opacity-80">{label}</div>
    <div className="mt-1 text-2xl font-bold tracking-tight">{value}</div>
    {detail && <div className="mt-1 text-[10px] opacity-75">{detail}</div>}
  </div>
);

const RecordStageList: React.FC<{
  records: AnalysisCaseRecord[];
  stage: 'safe' | 'awaiting_llm' | 'technical_failure' | 'blocked';
  llmAvailable: boolean;
  runningCaseId: string | null;
  semanticReviewItems?: readonly SemanticReviewItem[];
  onRunSingleCase?: (record: AnalysisCaseRecord) => void;
  onOpenManualReview?: (record: AnalysisCaseRecord) => void;
  onSelectRecord?: (record: AnalysisCaseRecord) => void;
}> = ({ records, stage, llmAvailable, runningCaseId, semanticReviewItems, onRunSingleCase, onOpenManualReview, onSelectRecord }) => {
  const { t } = useTranslation();
  const visible = records.filter((record) => mapAnalysisRecordToProcessingStage(record, semanticReviewItems) === stage);
  return (
    <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1" aria-label={`${t(`pipeline.${stage === 'safe' ? 'safeToStore' : stage === 'awaiting_llm' ? 'pendingSemantic' : stage === 'technical_failure' ? 'technicalFailure' : 'notEligible'}`)} ${t('pipeline.caseList')}`}>
      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white/70 px-3 py-4 text-center text-xs text-slate-500">{t('pipeline.noCases')}</div>
      ) : visible.map((record) => (
        <div key={record.caseId} className="rounded-lg border border-white/80 bg-white/80 px-3 py-2 text-xs shadow-sm">
          <div className="line-clamp-2 font-semibold text-slate-900">{record.title || record.caseNumber || record.caseId}</div>
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-slate-600">
            <span>{record.caseNumber || record.caseId}</span>
            <span>｜{t(processingProvenanceKey(record))}</span>
            {stage === 'blocked' && onSelectRecord && (
              <button
                type="button"
                onClick={() => onSelectRecord(record)}
                className="rounded border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-700 hover:bg-slate-50"
              >
                {t('pipeline.viewCase')}
              </button>
            )}
            {(stage === 'awaiting_llm' || stage === 'technical_failure') && onRunSingleCase && (
              <button
                type="button"
                disabled={!llmAvailable || runningCaseId === record.caseId}
                onClick={() => onRunSingleCase(record)}
                className="rounded border border-indigo-300 bg-white px-2 py-0.5 font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                title={llmAvailable ? t('pipeline.stageOnly') : t('pipeline.enableAiKey')}
              >
                {runningCaseId === record.caseId ? t('pipeline.analyzing') : stage === 'technical_failure' ? t('pipeline.retryAi') : t('pipeline.analyzeCase')}
              </button>
            )}
            {stage === 'technical_failure' && onOpenManualReview && (
              <button
                type="button"
                onClick={() => onOpenManualReview(record)}
                className="rounded border border-amber-300 bg-white px-2 py-0.5 font-semibold text-amber-800 hover:bg-amber-50"
              >
                {t('pipeline.directReview')}
              </button>
            )}
          </div>
          <div className="mt-1 text-[11px] text-slate-700">{(() => { const reason = processingStageReason(record, semanticReviewItems); return t(reason.key, reason.count === undefined ? undefined : { count: reason.count }); })()}</div>
          {stage === 'technical_failure' && (() => {
            const failure = latestSemanticTechnicalFailure(record.caseId);
            return failure ? (
              <details className="mt-2 rounded border border-orange-200 bg-orange-50/70 px-2 py-1 text-[10px] text-orange-950">
                <summary className="cursor-pointer font-semibold">{t('pipeline.technicalDetails')}</summary>
                <div className="mt-1 space-y-0.5">
                  <div>{t('pipeline.stage')}：{failure.failureStage}</div>
                  <div>{t('pipeline.failureCode')}：{failure.failureCode}{failure.httpStatus ? `｜HTTP ${failure.httpStatus}` : ''}</div>
                  <div>{t('pipeline.summary')}：{failure.errorSummary}</div>
                  <div>{t('pipeline.timestamp')}：{failure.timestamp}｜{t('pipeline.attempt')} {failure.attempt}</div>
                </div>
              </details>
            ) : null;
          })()}
          {stage === 'awaiting_llm' && record.unresolvedReferences?.[0]?.sourceText && (
            <div className="mt-1 rounded border border-indigo-100 bg-indigo-50/60 px-2 py-1 text-[10px] text-indigo-900"><span className="font-medium">{t('pipeline.closure.pendingText')}</span><CollapsibleText text={record.unresolvedReferences[0].sourceText} collapsedLines={4} /></div>
          )}
        </div>
      ))}
    </div>
  );
};

export const PipelineWorkspace: React.FC<PipelineWorkspaceProps> = ({ records, reviewItems, onSelectCase, hasAnalysisRun, onRunSingleCase, onOpenManualReview, onSelectRecord, semanticReviewItems, onSemanticReviewItemsChange, onExportValidationSnapshot }) => {
  const { t } = useTranslation();
  const overview = useMemo(() => getPipelineOverview(records, semanticReviewItems), [records, semanticReviewItems]);
  const processing = useMemo(() => getPipelineProcessingStats(records, semanticReviewItems), [records, semanticReviewItems]);
  const technicalFailureSummary = useMemo(() => {
    const counts = new Map<string, number>();
    const currentCaseIds = new Set(records.map((record) => record.caseId));
    readSemanticTechnicalFailures()
      .filter((failure) => currentCaseIds.has(failure.caseId))
      .forEach((failure) => counts.set(failure.failureCode, (counts.get(failure.failureCode) || 0) + 1));
    return [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 4);
  }, [records, overview.technicalFailure]);
  const { settings } = useLlmRuntimeSettings();
  const llmAvailable = isLlmAvailable(settings);
  const [runningCaseId, setRunningCaseId] = useState<string | null>(null);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [runMessage, setRunMessage] = useState<string>('');
  const [exportingSnapshot, setExportingSnapshot] = useState(false);
  const [exportMessage, setExportMessage] = useState<string>('');

  const handleRunSingleCase = async (record: AnalysisCaseRecord): Promise<void> => {
    if (!onRunSingleCase || !llmAvailable) return;
    setRunningCaseId(record.caseId);
    setRunMessage('');
    try {
      const result = await onRunSingleCase(record);
      setRunMessage(result.message);
    } catch {
      setRunMessage(t('pipeline.closure.singleRunFailed'));
    } finally {
      setRunningCaseId(null);
    }
  };

  const handleExportValidationSnapshot = async (): Promise<void> => {
    if (!onExportValidationSnapshot) return;
    setExportingSnapshot(true);
    setExportMessage('');
    try {
      const snapshot = await onExportValidationSnapshot();
      setExportMessage(t('pipeline.closure.snapshotExported', { count: snapshot.cases.length }));
    } catch (error) {
      setExportMessage(error instanceof Error ? t('pipeline.closure.exportFailed', { message: error.message }) : t('pipeline.closure.snapshotExportFailed'));
    } finally {
      setExportingSnapshot(false);
    }
  };

  const runtimeMessage = !settings.enabled
    ? t('pipeline.aiDisabled')
    : !settings.apiKey?.trim()
      ? t('pipeline.keyMissing')
      : t('pipeline.aiEnabled');
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/80 px-6 pb-8 pt-5 lg:px-8" data-testid="pipeline-workspace" aria-label={t('pipeline.title')}>
      <section aria-label={t('pipeline.overview')} className="mx-auto max-w-7xl rounded-[28px] border border-white/80 bg-white/80 p-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">{t('page.pipeline')}</h2>
            <p className="mt-1 text-xs text-slate-500">{hasAnalysisRun ? t('pipeline.analysisSetNote') : t('pipeline.localBrowseNote')}{t('pipeline.stageChangeNote')}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {onExportValidationSnapshot && (
              <button
                type="button"
                onClick={handleExportValidationSnapshot}
                disabled={exportingSnapshot}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                title={t('pipeline.snapshotTitle')}
              >
                {exportingSnapshot ? t('pipeline.exporting') : t('pipeline.exportSnapshot')}
              </button>
            )}
          </div>
        </div>
        {exportMessage && <div role="status" className="mt-2 text-[11px] text-slate-600">{exportMessage}</div>}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('pipeline.currentSet')}>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4"><div className="text-xs text-slate-500">{t('pipeline.currentSet')}</div><div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{overview.total}</div><div className="mt-1 text-xs text-slate-500">{t('pipeline.caseCount')}</div></div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4"><div className="text-xs text-slate-500">{t('pipeline.status')}</div><div className="mt-2 text-lg font-semibold text-slate-900">{hasAnalysisRun ? t('pipeline.completed') : t('pipeline.localBrowse')}</div><div className="mt-1 text-xs text-slate-500">{t('pipeline.currentScope')}</div></div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4"><div className="text-xs text-amber-800">{t('pipeline.pendingReview')}</div><div className="mt-2 text-2xl font-semibold tracking-tight text-amber-950">{overview.reviewPending}</div><div className="mt-1 text-xs text-amber-800">{t('pipeline.items')}</div></div>
          <div className={`rounded-2xl border p-4 ${overview.blocked > 0 ? 'border-amber-100 bg-amber-50/70' : 'border-emerald-100 bg-emerald-50/70'}`}><div className={`text-xs ${overview.blocked > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>{t('pipeline.quality')}</div><div className={`mt-2 text-lg font-semibold ${overview.blocked > 0 ? 'text-amber-950' : 'text-emerald-950'}`}>{overview.blocked > 0 ? t('pipeline.warning') : t('pipeline.normal')}</div><div className={`mt-1 text-xs ${overview.blocked > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>{t('pipeline.blockedCount', { count: overview.blocked })}</div></div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <PipelineStat label={t('pipeline.allCases')} value={overview.total} tone="border-slate-200 bg-slate-50 text-slate-900" />
          <PipelineStat label={t('pipeline.safeToStore')} value={overview.safe} tone={stageCardStyles.safe} detail={t('pipeline.safeRate', { rate: overview.safeRate })} />
          <PipelineStat label={t('pipeline.pendingSemantic')} value={overview.awaitingAi} tone={stageCardStyles.awaiting_llm} />
          <PipelineStat label={t('pipeline.humanReview')} value={overview.reviewPending} tone={stageCardStyles.review_pending} />
          <PipelineStat label={t('pipeline.technicalFailure')} value={overview.technicalFailure} tone={stageCardStyles.technical_failure} />
          <PipelineStat label={t('pipeline.notEligible')} value={overview.blocked} tone={stageCardStyles.blocked} />
        </div>
      </section>

      <section aria-label={t('pipeline.closure.processingStages')} className="mx-auto mt-5 grid max-w-7xl gap-4 xl:grid-cols-2">
        <div className={`rounded-[24px] border p-5 shadow-sm ${stageCardStyles.safe}`}>
          <div className="flex items-center gap-2 text-sm font-bold"><StageIcon stage="safe" />{t('pipeline.safeToStore')} <span className="text-xs font-normal opacity-75">{overview.safe} {t('pipeline.caseCount')}</span></div>
          <p className="mt-1 text-[11px] opacity-80">{t(processingStageDescriptionKey('safe'))}</p>
          <RecordStageList records={records} stage="safe" llmAvailable={llmAvailable} runningCaseId={runningCaseId} semanticReviewItems={semanticReviewItems} />
        </div>
        <div className={`rounded-[24px] border p-5 shadow-sm ${stageCardStyles.awaiting_llm}`}>
          <div className="flex items-center gap-2 text-sm font-bold"><StageIcon stage="awaiting_llm" />{t('pipeline.pendingSemantic')} <span className="text-xs font-normal opacity-75">{overview.awaitingAi} {t('pipeline.caseCount')}</span></div>
          <p className="mt-1 text-[11px] opacity-80">{t(processingStageDescriptionKey('awaiting_llm'))}</p>
          <RecordStageList records={records} stage="awaiting_llm" llmAvailable={llmAvailable} runningCaseId={runningCaseId} semanticReviewItems={semanticReviewItems} onRunSingleCase={handleRunSingleCase} />
        </div>
        <div className={`rounded-[24px] border p-5 shadow-sm ${stageCardStyles.blocked}`} data-testid="blocked-stage-panel">
          <button type="button" className="flex w-full items-center gap-2 text-left text-sm font-bold" aria-expanded={blockedOpen} onClick={() => setBlockedOpen((current) => !current)}>
            <StageIcon stage="blocked" />{t('pipeline.notEligible')} <span className="text-xs font-normal opacity-75">（{overview.blocked}）</span><span className="ml-auto text-xs font-medium text-slate-600">{blockedOpen ? t('common.collapse') : t('common.expand')}</span>
          </button>
          <p className="mt-1 text-[11px] opacity-80">{t(processingStageDescriptionKey('blocked'))}</p>
          {blockedOpen && <RecordStageList records={records} stage="blocked" llmAvailable={llmAvailable} runningCaseId={runningCaseId} semanticReviewItems={semanticReviewItems} onSelectRecord={onSelectRecord} />}
        </div>
        <div className={`rounded-[24px] border p-5 shadow-sm ${stageCardStyles.technical_failure}`}>
          <div className="flex items-center gap-2 text-sm font-bold"><StageIcon stage="technical_failure" />{t('pipeline.technicalFailure')} <span className="text-xs font-normal opacity-75">{overview.technicalFailure} {t('pipeline.caseCount')}</span></div>
          <p className="mt-1 text-[11px] opacity-80">{t(processingStageDescriptionKey('technical_failure'))}</p>
          {technicalFailureSummary.length > 0 && <div className="mt-2 rounded border border-orange-200 bg-white/60 px-2 py-1 text-[10px] text-orange-900" data-testid="technical-failure-summary">{t('pipeline.recentTechnicalFailures')}：{technicalFailureSummary.map(([code, count]) => `${technicalFailureLabel(code, t)} × ${count}`).join('、')}</div>}
          <RecordStageList records={records} stage="technical_failure" llmAvailable={llmAvailable} runningCaseId={runningCaseId} semanticReviewItems={semanticReviewItems} onRunSingleCase={handleRunSingleCase} onOpenManualReview={onOpenManualReview ? async (record) => onOpenManualReview(record) : undefined} />
        </div>
      </section>

      <section aria-label={t('pipeline.semanticWorkbench')} className="mx-auto mt-5 max-w-7xl rounded-[24px] border border-indigo-100 bg-indigo-50/60 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-indigo-950">{t('pipeline.semanticWorkbench')}</h3>
            <p className="mt-1 text-[11px] text-indigo-900/75">{runtimeMessage}</p>
          </div>
          <div className="flex gap-1.5 text-[10px] text-indigo-900">
            <span className="rounded bg-white/80 px-2 py-1">{t('pipeline.pending')} {processing.pending}</span>
            <span className="rounded bg-white/80 px-2 py-1">{t('pipeline.processing')} {processing.processing}</span>
            <span className="rounded bg-white/80 px-2 py-1">{t('pipeline.completed')} {processing.completed}</span>
            <span className="rounded bg-white/80 px-2 py-1">{t('pipeline.technicalFailure')} {processing.failed}</span>
            <span className="rounded bg-white/80 px-2 py-1">{t('pipeline.pendingHumanReview')} {overview.reviewPending}</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" disabled className="cursor-not-allowed rounded-lg bg-indigo-300 px-3 py-1.5 text-xs font-semibold text-white" title={t('pipeline.autoScheduled')}>{t('pipeline.processAll')}</button>
          <span className="text-[10px] text-indigo-900/70">{t('pipeline.singleCaseOnly')}</span>
          {runMessage && <span role="status" className="basis-full text-[10px] text-indigo-900">{runMessage}</span>}
        </div>
      </section>

      <section aria-label={t('pipeline.humanReviewWorkbench')} className="mx-auto mt-5 max-w-7xl rounded-[24px] border border-amber-100 bg-amber-50/60 p-5 shadow-sm">
        <div className="flex items-start gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 text-amber-700" /><div><h3 className="text-sm font-bold text-amber-950">{t('pipeline.humanReviewWorkbench')}</h3><p className="mt-1 text-[11px] text-amber-900/75">{t('pipeline.reviewDescription')}</p></div></div>
        <div className="mt-3 h-[min(75vh,720px)] min-h-[520px] overflow-hidden rounded-lg border border-amber-200/80 bg-white/60"><SemanticReviewWorkspace items={semanticReviewItems} onItemsChange={onSemanticReviewItemsChange} /></div>
        <DiagnosticClueWorkspace items={reviewItems} onSelectCase={onSelectCase} />
      </section>
    </div>
  );
};
