import React from 'react';
import { useTranslation } from 'react-i18next';
import type { AnalysisRun } from '../types';
import { shortResearchId } from '../services/research/AnalysisContextPresentation';

interface AnalysisContextBarProps {
  run?: AnalysisRun | null;
  snapshotId?: string;
  scopeLabel?: string;
  reviewQueueCount?: number;
  qualityStatus?: string;
  emptyLabel?: string;
  labels?: Partial<Record<'current' | 'details' | 'contextLabel' | 'mode' | 'scope' | 'bindingCurrent' | 'bindingNone' | 'run' | 'snapshot' | 'pendingReview' | 'quality' | 'availableRecords' | 'missingRecords' | 'provenance' | 'caseCount' | 'runStatus' | 'pendingReviewCount' | 'qualityStatus' | 'caseScope', string>>;
}

export const AnalysisContextBar: React.FC<AnalysisContextBarProps> = ({
  run,
  snapshotId,
  scopeLabel,
  reviewQueueCount,
  qualityStatus,
  emptyLabel,
  labels,
}) => {
  const { t } = useTranslation();
  const modeKey = run?.mode === 'exhaustive' ? 'exhaustive' : run?.mode === 'sampled' ? 'sampled' : 'unknown';
  const statusKey = run?.status || 'unknown';
  return (
  <div role="status" aria-label={labels?.contextLabel || t('research.context.ariaLabel')} className="rounded-xl border border-indigo-200 bg-indigo-50/70 px-3 py-2 text-xs text-indigo-950">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {run ? (
        <>
          <span className="font-bold text-indigo-900">{labels?.current || t('research.context.current')}</span>
          <span>{labels?.caseCount || t('research.context.caseCount', { count: run.inputCaseCount })}</span>
          <span>{labels?.runStatus || t('research.context.runStatus', { status: t(`research.context.statusValue.${statusKey}`, { defaultValue: t('research.context.statusValue.unknown') }) })}</span>
          <span>{labels?.pendingReviewCount || (reviewQueueCount === undefined ? t('research.context.pendingReviewMissing') : t('research.context.pendingReviewCount', { count: reviewQueueCount }))}</span>
          {qualityStatus && <span>{labels?.qualityStatus || t('research.context.qualityStatus', { status: t(`research.context.quality.${qualityStatus}`, { defaultValue: qualityStatus }) })}</span>}
        </>
      ) : (
        <>
          <span className="font-bold text-indigo-900">{labels?.current || t('research.context.current')}</span>
          <span>{emptyLabel || t('research.context.noRun')}</span>
          {(scopeLabel || snapshotId) && <span title={snapshotId}>{labels?.caseScope || t('research.context.caseScope')}：{scopeLabel || shortResearchId(snapshotId)}</span>}
        </>
      )}
    </div>
    {run && (
      <details className="mt-1 text-indigo-800/80">
        <summary className="cursor-pointer">{labels?.details || t('research.context.details')}</summary>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{labels?.mode || t('research.context.mode')}：{t(`research.context.modeValue.${modeKey}`)}</span>
          {scopeLabel && <span>{labels?.scope || t('research.context.scope')}：{scopeLabel}</span>}
          {qualityStatus && <span>{qualityStatus ? labels?.bindingCurrent || t('research.context.bindingCurrent') : labels?.bindingNone || t('research.context.bindingNone')}</span>}
          <span title={run.id}>{labels?.run || t('research.context.run')}：{shortResearchId(run.id)}</span>
          {snapshotId && <span title={snapshotId}>{labels?.snapshot || t('research.context.snapshot')}：{shortResearchId(snapshotId)}</span>}
        </div>
      </details>
    )}
  </div>
  );
};
