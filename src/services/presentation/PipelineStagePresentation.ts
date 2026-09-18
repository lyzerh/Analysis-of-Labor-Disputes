import type { AnalysisCaseRecord } from '../../types';
import { evaluateAnalyticsAdmission } from '../analytics/AnalyticsAdmission';
import { executableUnresolvedReferences, hasExecutableSemanticTask } from '../semantic/SemanticTaskEligibility';

/** User-facing processing stages for the deterministic → semantic → human pipeline. */
export type ProcessingStage = 'safe' | 'awaiting_llm' | 'llm_processing' | 'review_pending' | 'blocked';

export interface PipelineOverview {
  total: number;
  safe: number;
  awaitingAi: number;
  llmProcessing: number;
  reviewPending: number;
  blocked: number;
  safeRate: number;
}

export interface PipelineProcessingStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

type PipelineRecord = AnalysisCaseRecord;

const TRANSIENT_SEMANTIC_ERROR_CODES = new Set([
  'timeout',
  'network_error',
  'rate_limited',
  'provider_error',
  'output_truncated',
]);

const isTransientSemanticFailure = (record: PipelineRecord): boolean => (
  record.semanticResolutionStatus === 'provider_unavailable'
  || TRANSIENT_SEMANTIC_ERROR_CODES.has(record.semanticResolutionErrorCode || '')
);

/**
 * Map persisted record metadata to a presentation stage. This is intentionally
 * read-only: it does not infer or rewrite parser/outcome fields.
 */
export function mapAnalysisRecordToProcessingStage(record: PipelineRecord): ProcessingStage {
  const status = record.semanticResolutionStatus as string | undefined;
  if (status === 'processing' || status === 'running') return 'llm_processing';
  const admission = evaluateAnalyticsAdmission({ record });
  if (admission.status === 'eligible') return 'safe';
  const executableTask = hasExecutableSemanticTask(record);
  const reasons = new Set(admission.reasonCodes);
  if (reasons.has('review_pending')
    || reasons.has('audit_failed')
    || reasons.has('missing_accepted_semantic_result')
    || status === 'needs_review'
    || (record.humanReviewCandidates?.length ?? 0) > 0) {
    return 'review_pending';
  }

  // Provider/runtime failures are retryable semantic work, not an accepted
  // result and not a human conclusion. A pending human review takes priority
  // above so a review item cannot be hidden in the retry queue.
  if (isTransientSemanticFailure(record) && executableTask) return 'awaiting_llm';

  // A non-transient technical failure is reviewable, but a transient failure
  // without an executable task remains an explicit non-LLM blockage below.
  if (reasons.has('technical_failure') && !isTransientSemanticFailure(record)) return 'review_pending';

  // Only records with an executable unresolved task may enter the LLM queue.
  // A Gate-blocked record without one is a non-LLM/data blockage.
  return executableTask ? 'awaiting_llm' : 'blocked';
}

export function processingStageLabel(stage: ProcessingStage): string {
  switch (stage) {
    case 'safe': return '可安全入库';
    case 'awaiting_llm': return '待 AI 语义分析';
    case 'llm_processing': return 'AI 语义分析中';
    case 'review_pending': return '人工复核';
    case 'blocked': return '无法生成语义任务';
    default: return '待处理';
  }
}

export function processingStageDescription(stage: ProcessingStage): string {
  switch (stage) {
    case 'safe': return '规则解析或已完成语义核验，当前结果可用于分析。';
    case 'awaiting_llm': return '规则解析留下了需要语义对应的事实、诉求或裁判项。';
    case 'llm_processing': return '正在按当前分析集逐案处理，结果尚未进入统计。';
    case 'review_pending': return '自动核验未通过，需要人工确认后再进入安全结果。';
    case 'blocked': return '当前结果未满足准入条件，且没有可执行的 LLM 语义任务。';
    default: return '等待流水线继续处理。';
  }
}

export function processingProvenanceLabel(record: PipelineRecord): string {
  if (record.reviewStatus === 'approved' || record.reviewStatus === 'modified') return '人工确认';
  if (record.semanticResolutionStatus === 'resolved') return 'AI解析';
  return '规则解析';
}

export function processingStageReason(record: PipelineRecord): string {
  const stage = mapAnalysisRecordToProcessingStage(record);
  if (stage === 'review_pending') {
    return record.semanticResolutionErrorCode
      ? '语义处理未能可靠完成，结果已转入人工复核。'
      : '自动核验未通过，结果已转入人工复核。';
  }
  if (stage === 'awaiting_llm') {
    const count = executableUnresolvedReferences(record).length;
    return count > 0 ? `待处理语义关联 ${count} 项。` : '等待语义分析。';
  }
  if (stage === 'blocked') return '当前没有可执行的待分析语义任务，请检查原始文书或解析状态。';
  return processingStageDescription(stage);
}

/** Keep persisted diagnostic explanations useful without resurfacing retired routing instructions. */
export function cleanPipelineDiagnosticMessage(message: string | undefined, fallback: string): string {
  const cleaned = message
    ?.replace(/(?:建议人工复核|建议人工判断|建议完善规则库|建议规则库改进|可加入\s*LLM\s*复核候选)/g, '')
    .replace(/[，、]\s*[。]?/g, '。')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || fallback;
}

export function getPipelineOverview(records: readonly PipelineRecord[]): PipelineOverview {
  const counts = records.reduce((summary, record) => {
    const stage = mapAnalysisRecordToProcessingStage(record);
    summary[stage] += 1;
    return summary;
  }, {
    safe: 0,
    awaiting_llm: 0,
    llm_processing: 0,
    review_pending: 0,
    blocked: 0,
  } as Record<ProcessingStage, number>);

  const total = records.length;
  return {
    total,
    safe: counts.safe,
    awaitingAi: counts.awaiting_llm,
    llmProcessing: counts.llm_processing,
    reviewPending: counts.review_pending,
    blocked: counts.blocked,
    safeRate: total === 0 ? 0 : Math.round((counts.safe / total) * 100),
  };
}

export function getPipelineProcessingStats(records: readonly PipelineRecord[]): PipelineProcessingStats {
  const overview = getPipelineOverview(records);
  return {
    pending: overview.awaitingAi,
    processing: overview.llmProcessing,
    completed: overview.safe,
    failed: overview.reviewPending,
  };
}
