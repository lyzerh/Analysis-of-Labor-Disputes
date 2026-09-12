import React from 'react';
import type { AnalysisRun } from '../types';
import type {
  ResearchAnalysisContext,
  ResearchAnalyticsMetadata,
} from '../services/analysis/ResearchAnalysisService';

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
          <option value="">请选择 AnalysisRun（不会自动选择最新记录）</option>
          {runs.map((run) => (
            <option key={run.id} value={run.id} disabled={run.status === 'failed'}>
              {run.id} · {run.mode === 'exhaustive' ? '语料总体' : '样本'} · N={run.inputCaseCount} · {run.status}
            </option>
          ))}
        </select>
        <button
          onClick={onExecute}
          disabled={isLoading || !selectedAnalysisRunId}
          className="px-4 py-2 bg-indigo-600 disabled:bg-slate-300 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          {isLoading ? '正在执行…' : '加载并执行正式分析'}
        </button>
      </div>

      {runs.length === 0 && (
        <div className="text-xs rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
          当前没有 AnalysisRun。请先创建 exhaustive 或 sampled AnalysisRun；本页不会回退到本地全库。
        </div>
      )}
      {error && <div className="text-xs rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-800">{error}</div>}

      {context && (
        <div className={`rounded-xl border p-3 text-xs ${qualityClass}`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 font-mono">
            <div>Mode: {context.analysisRun.mode}</div>
            <div>Input N: {context.analysisRun.inputCaseCount}</div>
            <div>Usable N: {quality?.metrics.includedCaseCount ?? 0}</div>
            <div>Quality: {quality?.status.toUpperCase()}</div>
            <div className="col-span-2 truncate" title={context.analysisRun.id}>AnalysisRun: {context.analysisRun.id}</div>
            <div className="col-span-2 truncate" title={context.snapshot.id}>Snapshot: {context.snapshot.id}</div>
            <div>Available: {quality?.metrics.availableRecordCount ?? 0}</div>
            <div>Missing: {quality?.metrics.missingRecordCount ?? 0}</div>
            <div className="col-span-2 truncate" title={context.analysisRun.provenanceHash}>Provenance: {context.analysisRun.provenanceHash}</div>
          </div>
          {metadata && (
            <div className="mt-2 pt-2 border-t border-current/20 space-y-1">
              <div>{metadata.scopeStatement}；结果范围为 {metadata.statisticalScope}。</div>
              <div>
                Outcome 比例分母：known N={metadata.denominatorContract.knownOutcomeCount}；
                排除 unclear N={metadata.denominatorContract.unknownOutcomeExcludedCount}。
              </div>
              {metadata.sampling && (
                <div>
                  Sampling: {metadata.sampling.method} · seed={metadata.sampling.seed} · sample N={metadata.sampling.actualSampleSize}
                  {metadata.sampling.allocationStrategy ? ` · ${metadata.sampling.allocationStrategy}` : ''}
                  {metadata.sampling.dimensions ? ` · dimensions=${metadata.sampling.dimensions.join(',')}` : ''}
                  {` · hash=${metadata.sampling.sampleHash}`}
                </div>
              )}
            </div>
          )}
          {quality && quality.issues.length > 0 && (
            <ul className="mt-2 pt-2 border-t border-current/20 list-disc pl-4 space-y-1">
              {quality.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.code}: {issue.message}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
