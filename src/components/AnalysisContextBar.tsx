import React from 'react';
import type { AnalysisRun } from '../types';
import { researchModeLabel, researchStatusLabel, shortResearchId } from '../services/research/AnalysisContextPresentation';

interface AnalysisContextBarProps {
  run?: AnalysisRun | null;
  snapshotId?: string;
  scopeLabel?: string;
  reviewQueueCount?: number;
  qualityStatus?: string;
  emptyLabel?: string;
}

export const AnalysisContextBar: React.FC<AnalysisContextBarProps> = ({
  run,
  snapshotId,
  scopeLabel,
  reviewQueueCount,
  qualityStatus,
  emptyLabel = '未选择分析运行',
}) => (
  <div role="status" aria-label="当前分析上下文" className="rounded-xl border border-indigo-200 bg-indigo-50/70 px-3 py-2 text-xs text-indigo-950">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {run ? (
        <>
          <span className="font-bold text-indigo-900">当前分析集</span>
          <span>{run.inputCaseCount} 个案例</span>
          <span>状态：{researchStatusLabel(run.status)}</span>
          <span>待复核 {reviewQueueCount === undefined ? '—' : `${reviewQueueCount} 项`}</span>
          {qualityStatus && <span>质量状态：{qualityStatus === 'blocked' ? '阻断' : qualityStatus === 'warning' ? '警告' : '通过'}</span>}
        </>
      ) : (
        <>
          <span className="font-bold text-indigo-900">当前分析集</span>
          <span>{emptyLabel}</span>
          {(scopeLabel || snapshotId) && <span title={snapshotId}>案例范围：{scopeLabel || shortResearchId(snapshotId)}</span>}
        </>
      )}
    </div>
    {run && (
      <details className="mt-1 text-indigo-800/80">
        <summary className="cursor-pointer">分析详情</summary>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>分析模式：{researchModeLabel(run.mode)}</span>
          {scopeLabel && <span>统计口径：{scopeLabel}</span>}
          {qualityStatus && <span>{qualityStatus ? '结果绑定：当前所选' : '已选择，尚未加载结果'}</span>}
          <span title={run.id}>AnalysisRun：{shortResearchId(run.id)}</span>
          {snapshotId && <span title={snapshotId}>Snapshot：{shortResearchId(snapshotId)}</span>}
        </div>
      </details>
    )}
  </div>
);
