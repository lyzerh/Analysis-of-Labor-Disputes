import React from 'react';
import { useTranslation } from 'react-i18next';
import type { AnalysisRun } from '../types';
import type {
  ResearchAnalysisContext,
  ResearchAnalyticsMetadata,
} from '../services/analysis/ResearchAnalysisService';
import { buildOutcomeReviewQueue } from '../services/outcome/OutcomeReviewQueue';
import { AnalysisContextBar } from './AnalysisContextBar';
import { shortResearchId } from '../services/research/AnalysisContextPresentation';

interface ResearchAnalysisHeaderProps {
  runs: AnalysisRun[];
  selectedAnalysisRunId: string;
  onSelect: (id: string) => void;
  onExecute: () => void;
  isLoading: boolean;
  context: ResearchAnalysisContext | null;
  metadata: ResearchAnalyticsMetadata | null;
  error: string | null;
}

export const ResearchAnalysisHeader: React.FC<ResearchAnalysisHeaderProps> = ({
  runs,
  selectedAnalysisRunId,
  onSelect,
  onExecute,
  isLoading,
  context,
  metadata,
  error,
}) => {
  const { t } = useTranslation();
  const quality = context?.quality;
  const modeLabel = (mode: AnalysisRun['mode']) => mode === 'exhaustive' ? t('research.ui.full') : mode === 'sampled' ? t('research.ui.sampled') : t('research.ui.notSelected');
  const statusLabel = (status: AnalysisRun['status']) => ({ pending: t('research.ui.statusPending'), running: t('research.ui.statusRunning'), completed: t('research.ui.statusCompleted'), failed: t('research.ui.statusFailed') }[status] || t('research.ui.statusNotLoaded'));
  const qualityLabel = quality?.status === 'blocked' ? t('research.ui.blocked') : quality?.status === 'warning' ? t('research.ui.warning') : t('research.ui.passed');
  const selectedRun = runs.find((run) => run.id === selectedAnalysisRunId) || null;
  const currentRun = context?.analysisRun || selectedRun;
  const reviewQueueCount = context ? buildOutcomeReviewQueue(context.records).length : undefined;
  const qualityClass = quality?.status === 'blocked'
    ? 'border-rose-200 bg-rose-50 text-rose-900'
    : quality?.status === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-950'
      : 'border-emerald-200 bg-emerald-50 text-emerald-950';

  return (
    <div className="space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-center gap-2">
        <select
          value={selectedAnalysisRunId}
          onChange={(event) => onSelect(event.target.value)}
          className="min-w-0 flex-1 text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-700"
        >
          <option value="">{t('research.ui.selectRun')}</option>
          {runs.map((run) => (
            <option key={run.id} value={run.id} disabled={run.status === 'failed'}>
              {t('research.ui.runOption', { id: shortResearchId(run.id), mode: modeLabel(run.mode), count: run.inputCaseCount, status: statusLabel(run.status) })}
            </option>
          ))}
        </select>
        <button
          onClick={onExecute}
          disabled={isLoading || !selectedAnalysisRunId}
          className="lawlens-primary-button px-4 py-2 text-xs font-semibold rounded-lg disabled:bg-slate-200"
        >
          {isLoading ? t('research.ui.executingRun') : t('research.ui.executeRun')}
        </button>
      </div>

      {runs.length === 0 && (
        <div className="text-xs rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
          {t('research.ui.noRuns')}
        </div>
      )}
      {error && <div className="text-xs rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-800">{error}</div>}

      <AnalysisContextBar
        run={currentRun}
        snapshotId={context?.snapshot.id || currentRun?.snapshotId}
        scopeLabel={context ? (context.statisticalScope === 'corpus' ? t('research.ui.corpus') : t('research.ui.sample')) : undefined}
        reviewQueueCount={reviewQueueCount}
        qualityStatus={quality?.status}
        emptyLabel={t('research.ui.noSelectedRunContext')}
        labels={{
          current: t('research.ui.currentAnalysis'),
          details: t('research.ui.technicalDetails'),
          contextLabel: t('research.ui.currentContextLabel'),
          mode: t('research.ui.analysisMode', { mode: '' }).replace(/:\s*$/, ''),
          scope: t('research.ui.statisticsScope', { scope: '' }).replace(/:\s*$/, ''),
          bindingCurrent: t('research.ui.bindingCurrent'),
          bindingNone: t('research.ui.bindingNone'),
          run: t('research.ui.runLabel'),
          snapshot: t('research.ui.snapshot', { id: '' }).replace(/:\s*$/, ''),
          caseCount: t('research.ui.cases', { count: currentRun?.inputCaseCount ?? 0 }),
          runStatus: currentRun ? t('research.ui.runStatus', { status: statusLabel(currentRun.status) }) : '',
          pendingReviewCount: t('review.ui.pendingReviewCount', { count: reviewQueueCount ?? 0 }),
          qualityStatus: quality ? t('research.ui.qualityStatus', { value: qualityLabel }) : '',
          caseScope: t('research.ui.caseScope', { scope: '' }).replace(/:\s*$/, ''),
        }}
      />

      {context && (
        <div className={`rounded-xl border p-3 text-xs ${qualityClass}`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>{t('research.ui.currentAnalysis')}：{t('research.ui.cases', { count: context.analysisRun.inputCaseCount })}</div>
            <div>{t('research.ui.runStatus', { status: statusLabel(context.analysisRun.status) })}</div>
            <div>{t('research.ui.resultAvailable', { value: metadata ? t('research.ui.cases', { count: metadata.usableCaseCount }) : t('research.ui.pendingValue') })}</div>
            <div>{t('research.ui.qualityStatus', { value: qualityLabel })}</div>
          </div>
          <details className="mt-2 border-t border-current/20 pt-2">
            <summary className="cursor-pointer font-medium">{t('research.ui.technicalDetails')}</summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>{t('research.ui.analysisMode', { mode: modeLabel(context.analysisRun.mode) })}</div>
              <div>{t('research.ui.analysisRun', { id: shortResearchId(context.analysisRun.id) })}</div>
              <div>{t('research.ui.snapshot', { id: shortResearchId(context.snapshot.id) })}</div>
              <div>{t('research.ui.availableRecords', { count: quality?.metrics.availableRecordCount ?? 0 })}</div>
              <div>{t('research.ui.missingRecords', { count: quality?.metrics.missingRecordCount ?? 0 })}</div>
              <div className="col-span-2 truncate" title={context.analysisRun.provenanceHash}>{t('research.ui.provenance', { id: shortResearchId(context.analysisRun.provenanceHash) })}</div>
            </div>
            {metadata && (
              <div className="mt-2 space-y-1">
                <div>{t('research.ui.scopeStatement', { statement: metadata.scopeStatement, scope: metadata.statisticalScope === 'corpus' ? t('research.ui.corpus') : t('research.ui.sample') })}</div>
                <div>{t('research.ui.knownOutcomeDenominator', { known: metadata.denominatorContract.knownOutcomeCount, excluded: metadata.denominatorContract.unknownOutcomeExcludedCount })}</div>
                {metadata.sampling && <div>{t('research.ui.sampling', { method: metadata.sampling.method, seed: metadata.sampling.seed, count: metadata.sampling.actualSampleSize })}{metadata.sampling.allocationStrategy ? ` · ${metadata.sampling.allocationStrategy}` : ''}{metadata.sampling.dimensions ? ` · dimensions=${metadata.sampling.dimensions.join(',')}` : ''} · hash={metadata.sampling.sampleHash}</div>}
              </div>
            )}
            {quality && quality.issues.length > 0 && <ul className="mt-2 list-disc pl-4 space-y-1">{quality.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.code}: {issue.message}</li>)}</ul>}
          </details>
        </div>
      )}
    </div>
  );
};
