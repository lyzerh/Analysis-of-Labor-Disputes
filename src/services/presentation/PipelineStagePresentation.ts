import type { AnalysisCaseRecord } from '../../types';
import { evaluateAnalyticsAdmission } from '../analytics/AnalyticsAdmission';
import type { SemanticReviewItem } from '../semantic/SemanticReviewQueue';
import { executableUnresolvedReferences, hasExecutableSemanticTask } from '../semantic/SemanticTaskEligibility';
import { isTechnicalResolverError, isTechnicalSemanticStatus } from '../semantic/SemanticWorkflowState';
import { getWorkflowDisplayPresentation } from './WorkflowPresentation';

/** User-facing processing stages for the deterministic → semantic → human pipeline. */
export type ProcessingStage = 'safe' | 'awaiting_llm' | 'llm_processing' | 'review_pending' | 'technical_failure' | 'blocked';

export interface PipelineOverview {
  total: number;
  safe: number;
  awaitingAi: number;
  llmProcessing: number;
  reviewPending: number;
  technicalFailure: number;
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

const isTechnicalSemanticFailure = (record: PipelineRecord): boolean => (
  isTechnicalSemanticStatus(record.semanticResolutionStatus)
  || isTechnicalResolverError(record.semanticResolutionErrorCode)
);

const hasCompletedHumanReview = (
  record: PipelineRecord,
  reviewItems?: readonly SemanticReviewItem[],
): boolean => reviewItems?.some((item) => (
  item.caseId === record.caseId
  && item.status === 'reviewed'
  && item.reviewedResult?.source === 'human_review'
  && item.reviewedResult.reviewStatus === 'approved'
)) ?? false;

/**
 * Map persisted record metadata to a presentation stage. This is intentionally
 * read-only: it does not infer or rewrite parser/outcome fields.
 */
export function mapAnalysisRecordToProcessingStage(
  record: PipelineRecord,
  reviewItems?: readonly SemanticReviewItem[],
): ProcessingStage {
  const status = record.semanticResolutionStatus as string | undefined;
  if (status === 'processing' || status === 'running') return 'llm_processing';
  const admission = evaluateAnalyticsAdmission({ record, ...(reviewItems ? { reviewItems } : {}) });
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

  // A completed human result is now the current semantic authority. The
  // technical failure remains provenance/history, but must not keep the case
  // in the retryable technical stage after review (even when the human result
  // remains Gate-blocked as unclear or incomplete).
  if (hasCompletedHumanReview(record, reviewItems)
    && (isTechnicalSemanticFailure(record) || reasons.has('technical_failure'))) {
    return 'review_pending';
  }

  // A pending human review takes priority above so an existing review item
  // cannot be hidden behind a technical retry state.
  // A provider/JSON/schema/contract failure has no semantic candidate for a
  // reviewer to judge. Keep it separate from needs-review and from the LLM
  // work queue, regardless of whether an old unresolved reference remains.
  if (isTechnicalSemanticFailure(record) || reasons.has('technical_failure')) return 'technical_failure';

  // Only records with an executable unresolved task may enter the LLM queue.
  // A Gate-blocked record without one is a non-LLM/data blockage.
  return executableTask ? 'awaiting_llm' : 'blocked';
}

export function processingStageLabel(stage: ProcessingStage): string {
  if (stage === 'safe') return '可安全入库';
  if (stage === 'review_pending') return getWorkflowDisplayPresentation('needs_review').label;
  if (stage === 'awaiting_llm') return '待 AI 语义分析';
  if (stage === 'technical_failure') return getWorkflowDisplayPresentation('technical_failure').label;
  if (stage === 'blocked') return getWorkflowDisplayPresentation('blocked').label;
  if (stage === 'llm_processing') return 'AI 语义分析中';
  switch (stage) {
    default: return '待处理';
  }
}

export function processingStageDescription(stage: ProcessingStage): string {
  if (stage === 'safe') return '规则解析或已完成语义核验，当前结果可用于分析。';
  if (stage === 'review_pending') return getWorkflowDisplayPresentation('needs_review').description;
  if (stage === 'awaiting_llm') return getWorkflowDisplayPresentation('awaiting_llm').description;
  if (stage === 'technical_failure') return getWorkflowDisplayPresentation('technical_failure').description;
  if (stage === 'blocked') return getWorkflowDisplayPresentation('blocked').description;
  if (stage === 'llm_processing') return '正在按当前分析集逐案处理，结果尚未进入统计。';
  switch (stage) {
    default: return '等待流水线继续处理。';
  }
}

export function processingProvenanceLabel(record: PipelineRecord): string {
  if (record.reviewStatus === 'approved' || record.reviewStatus === 'modified') return '人工确认';
  if (record.semanticResolutionStatus === 'resolved') return 'AI解析';
  return '规则解析';
}

export function processingStageReason(record: PipelineRecord, reviewItems?: readonly SemanticReviewItem[]): string {
  const stage = mapAnalysisRecordToProcessingStage(record, reviewItems);
  if (stage === 'review_pending') {
    return getWorkflowDisplayPresentation('needs_review').description;
  }
  if (stage === 'technical_failure') {
    return '语义处理未完成（技术失败），可重新尝试 AI 或直接进入人工复核。';
  }
  if (stage === 'awaiting_llm') {
    const count = executableUnresolvedReferences(record).length;
    return count > 0 ? `待处理语义关联 ${count} 项。` : '等待语义分析。';
  }
  if (stage === 'blocked') return '缺少可执行语义输入。';
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

export function getPipelineOverview(
  records: readonly PipelineRecord[],
  reviewItems?: readonly SemanticReviewItem[],
): PipelineOverview {
  const counts = records.reduce((summary, record) => {
    const stage = mapAnalysisRecordToProcessingStage(record, reviewItems);
    summary[stage] += 1;
    return summary;
  }, {
    safe: 0,
    awaiting_llm: 0,
    llm_processing: 0,
    review_pending: 0,
    technical_failure: 0,
    blocked: 0,
  } as Record<ProcessingStage, number>);

  const total = records.length;
  return {
    total,
    safe: counts.safe,
    awaitingAi: counts.awaiting_llm,
    llmProcessing: counts.llm_processing,
    reviewPending: counts.review_pending,
    technicalFailure: counts.technical_failure,
    blocked: counts.blocked,
    safeRate: total === 0 ? 0 : Math.round((counts.safe / total) * 100),
  };
}

export function getPipelineProcessingStats(
  records: readonly PipelineRecord[],
  reviewItems?: readonly SemanticReviewItem[],
): PipelineProcessingStats {
  const overview = getPipelineOverview(records, reviewItems);
  return {
    pending: overview.awaitingAi,
    processing: overview.llmProcessing,
    completed: overview.safe,
    // Keep technical job failures distinct from valid semantic candidates
    // waiting for human review. The workbench's technical-failure count must
    // match the formal workflow card instead of treating review as a failed AI
    // job.
    failed: overview.technicalFailure,
  };
}
