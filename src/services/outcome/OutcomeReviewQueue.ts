import type {
  AnalysisCaseRecord,
  OutcomeReviewItem,
  OutcomeReviewSuggestion,
  OutcomeUnclearReasonCode,
} from '../../types';

export type OutcomeReviewStatusFilter = 'all' | 'needs_review';

export const outcomeReviewReasonLabels: Record<OutcomeUnclearReasonCode, string> = {
  missing_party_roles: '缺少程序身份',
  missing_labor_role: '缺少劳动者/用人单位身份',
  missing_claim_owner: '缺少诉求主体',
  missing_disposition_text: '缺少裁判主文',
  disposition_not_matched: '裁判动作未匹配诉求',
  payment_beneficiary_unclear: '支付对象不明确',
  rejection_owner_unclear: '驳回对象不明确',
  appeal_inheritance_unclear: '上诉结果承接不明确',
  amount_conflict: '请求金额与判付金额冲突',
  unsupported_claim_type: '诉求类型暂不支持',
  ambiguous_multiple_claims: '多项诉求无法拆分',
  source_text_missing: '缺少原文片段',
  low_confidence: '解析置信度较低',
  unknown: '其他原因',
};

export const outcomeReviewSuggestionLabels: Record<OutcomeReviewSuggestion, string> = {
  rule_improvement: '规则改进',
  llm_semantic_normalization: '语义归一化',
  manual_review: '人工复核',
};

export function outcomeReviewSourceSnippet(item: OutcomeReviewItem): string {
  const source = item.sourceText?.trim();
  return source ? source : '暂无可定位原文片段';
}

export function filterOutcomeReviewQueue(
  items: OutcomeReviewItem[],
  status: OutcomeReviewStatusFilter = 'all',
  reasonCode: OutcomeUnclearReasonCode | '' = '',
  suggestedReviewType: OutcomeReviewSuggestion | '' = '',
): OutcomeReviewItem[] {
  return items.filter((item) => (
    (status === 'all' || item.needsReview)
    && (!reasonCode || item.reasonCode === reasonCode)
    && (!suggestedReviewType || item.suggestedReviewType === suggestedReviewType)
  ));
}

/**
 * Derive a read-only review queue from parsed analysis records.
 * No queue item is persisted and no research provenance is changed.
 */
export function buildOutcomeReviewQueue(records: AnalysisCaseRecord[]): OutcomeReviewItem[] {
  return records.flatMap((record) => (record.outcomeDiagnostics || [])
    .filter((diagnostic) => diagnostic.needsReview)
    .map((diagnostic) => ({
      ...diagnostic,
      caseId: record.caseId,
      title: record.title,
      caseNumber: record.caseNumber,
      employeeParty: record.employeeParty,
      employerParty: record.employerParty,
      applicantRole: record.applicantRole,
      parties: record.parties,
    })));
}
