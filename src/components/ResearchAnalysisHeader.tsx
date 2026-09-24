import React from 'react';
import type { AnalysisRun } from '../types';
import type {
  ResearchAnalysisContext,
  ResearchAnalyticsMetadata,
} from '../services/analysis/ResearchAnalysisService';
import { buildOutcomeReviewQueue } from '../services/outcome/OutcomeReviewQueue';
import { AnalysisContextBar } from './AnalysisContextBar';
import { researchModeLabel, researchStatusLabel, shortResearchId } from '../services/research/AnalysisContextPresentation';

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
  const quality = context?.quality;
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
          <option value="">请选择分析记录（不会自动选择最新记录）</option>
          {runs.map((run) => (
            <option key={run.id} value={run.id} disabled={run.status === 'failed'}>
              {shortResearchId(run.id)} · {researchModeLabel(run.mode)} · {run.inputCaseCount} 个案例 · {researchStatusLabel(run.status)}
            </option>
          ))}
        </select>
        <button
          onClick={onExecute}
          disabled={isLoading || !selectedAnalysisRunId}
          className="lawlens-primary-button px-4 py-2 text-xs font-semibold rounded-lg disabled:bg-slate-200"
        >
          {isLoading ? '正在执行…' : '加载并执行正式分析'}
        </button>
      </div>

      {runs.length === 0 && (
        <div className="text-xs rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
          当前没有可用的分析记录。请先创建全量分析或抽样分析；本页不会回退到本地全库。
        </div>
      )}
      {error && <div className="text-xs rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-800">{error}</div>}

      <AnalysisContextBar
        run={currentRun}
        snapshotId={context?.snapshot.id || currentRun?.snapshotId}
        scopeLabel={context ? (context.statisticalScope === 'corpus' ? '语料总体' : '本次样本') : undefined}
        reviewQueueCount={reviewQueueCount}
        qualityStatus={quality?.status}
        emptyLabel="未选择分析运行；不会自动选择最新记录"
      />

      {context && (
        <div className={`rounded-xl border p-3 text-xs ${qualityClass}`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>当前分析集：{context.analysisRun.inputCaseCount} 个案例</div>
            <div>状态：{researchStatusLabel(context.analysisRun.status)}</div>
            <div>结果可用：{metadata ? `${metadata.usableCaseCount} 个案例` : '待执行'}</div>
            <div>质量状态：{quality?.status === 'blocked' ? '阻断' : quality?.status === 'warning' ? '警告' : '通过'}</div>
          </div>
          <details className="mt-2 border-t border-current/20 pt-2">
            <summary className="cursor-pointer font-medium">技术详情</summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>分析模式：{researchModeLabel(context.analysisRun.mode)}</div>
              <div>AnalysisRun：<span className="truncate" title={context.analysisRun.id}>{shortResearchId(context.analysisRun.id)}</span></div>
              <div>研究范围：<span className="truncate" title={context.snapshot.id}>{shortResearchId(context.snapshot.id)}</span></div>
              <div>已有记录：{quality?.metrics.availableRecordCount ?? 0}</div>
              <div>缺失记录：{quality?.metrics.missingRecordCount ?? 0}</div>
              <div className="col-span-2 truncate" title={context.analysisRun.provenanceHash}>Provenance：{shortResearchId(context.analysisRun.provenanceHash)}</div>
            </div>
            {metadata && (
              <div className="mt-2 space-y-1">
                <div>{metadata.scopeStatement}；结果范围为 {metadata.statisticalScope === 'corpus' ? '语料总体' : '本次样本'}。</div>
                <div>结果比例分母：已知结果 {metadata.denominatorContract.knownOutcomeCount} 个案例；排除未确定 {metadata.denominatorContract.unknownOutcomeExcludedCount} 个案例。</div>
                {metadata.sampling && <div>抽样：{metadata.sampling.method} · seed={metadata.sampling.seed} · 样本 {metadata.sampling.actualSampleSize} 个案例{metadata.sampling.allocationStrategy ? ` · ${metadata.sampling.allocationStrategy}` : ''}{metadata.sampling.dimensions ? ` · dimensions=${metadata.sampling.dimensions.join(',')}` : ''} · hash={metadata.sampling.sampleHash}</div>}
              </div>
            )}
            {quality && quality.issues.length > 0 && <ul className="mt-2 list-disc pl-4 space-y-1">{quality.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.code}: {issue.message}</li>)}</ul>}
          </details>
        </div>
      )}
    </div>
  );
};
