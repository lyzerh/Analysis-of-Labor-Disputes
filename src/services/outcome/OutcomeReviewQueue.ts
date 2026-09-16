import type {
  AnalysisCaseRecord,
  OutcomeDiagnosticEvidence,
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

export type OutcomeReviewEvidenceKey = keyof OutcomeDiagnosticEvidence;

export interface OutcomeReviewEvidenceField {
  key: OutcomeReviewEvidenceKey;
  label: string;
  text?: string;
  placeholder?: string;
}

const outcomeReviewEvidenceLabels: Record<OutcomeReviewEvidenceKey, string> = {
  claimText: '诉求片段',
  dispositionText: '裁判主文片段',
  reasoningText: '说理/认定片段',
  partyText: '当事人片段',
  amountText: '金额片段',
  diagnosticText: '诊断依据',
};

const outcomeReviewEvidencePlaceholders: Partial<Record<OutcomeReviewEvidenceKey, string>> = {
  claimText: '暂无可定位诉求片段',
  dispositionText: '暂无可定位裁判主文片段',
  reasoningText: '暂无可定位说理/认定片段',
  partyText: '暂无可定位当事人片段',
  amountText: '暂无可定位金额片段',
  diagnosticText: '暂无可定位诊断依据',
};

const claimFallbackReasons: OutcomeUnclearReasonCode[] = [
  'payment_beneficiary_unclear',
  'rejection_owner_unclear',
  'disposition_not_matched',
  'missing_claim_owner',
  'amount_conflict',
  'source_text_missing',
];

/**
 * Normalizes typed evidence while keeping legacy sourceText records readable.
 * Legacy sourceText is intentionally treated as a claim/diagnostic snippet only;
 * it is never promoted to a court-disposition snippet.
 */
export function outcomeReviewEvidence(item: OutcomeReviewItem): OutcomeDiagnosticEvidence {
  const typed = item.evidence || {};
  const legacy = item.sourceText?.trim();
  const claimText = typed.claimText?.trim()
    || (legacy && claimFallbackReasons.includes(item.reasonCode as OutcomeUnclearReasonCode) ? legacy : undefined);
  const diagnosticText = typed.diagnosticText?.trim()
    || (!claimText && !typed.dispositionText && !typed.reasoningText && !typed.partyText && !typed.amountText ? legacy : undefined);
  return {
    ...typed,
    claimText,
    dispositionText: typed.dispositionText?.trim() || undefined,
    reasoningText: typed.reasoningText?.trim() || undefined,
    partyText: typed.partyText?.trim() || undefined,
    amountText: typed.amountText?.trim() || undefined,
    diagnosticText: diagnosticText || undefined,
  };
}

function evidenceField(
  evidence: OutcomeDiagnosticEvidence,
  key: OutcomeReviewEvidenceKey,
  withPlaceholder = false,
): OutcomeReviewEvidenceField {
  return {
    key,
    label: outcomeReviewEvidenceLabels[key],
    text: evidence[key],
    placeholder: withPlaceholder ? outcomeReviewEvidencePlaceholders[key] : undefined,
  };
}

/**
 * Returns reason-aware evidence fields for Review Queue and Case Analysis.
 * Empty fields are omitted except for required safety placeholders.
 */
export function outcomeReviewEvidenceFields(item: OutcomeReviewItem): OutcomeReviewEvidenceField[] {
  const evidence = outcomeReviewEvidence(item);
  const field = (key: OutcomeReviewEvidenceKey, withPlaceholder = false) => evidenceField(evidence, key, withPlaceholder);
  const diagnostic = field('diagnosticText');
  switch (item.reasonCode) {
    case 'payment_beneficiary_unclear':
    case 'rejection_owner_unclear':
      return [field('claimText', !!evidence.claimText), field('dispositionText', true), diagnostic]
        .filter((entry) => entry.text || entry.placeholder);
    case 'disposition_not_matched':
      {
        const disposition = field('dispositionText', true);
        if (!disposition.text) disposition.placeholder = '未定位到对应裁判主文';
        return [field('claimText', true), disposition, diagnostic]
        .filter((entry) => entry.text || entry.placeholder);
      }
    case 'missing_claim_owner':
      return [field('claimText', true), field('partyText', true), diagnostic]
        .filter((entry) => entry.text || entry.placeholder);
    case 'missing_party_roles':
    case 'missing_labor_role':
      return [field('partyText', true), diagnostic]
        .filter((entry) => entry.text || entry.placeholder);
    case 'appeal_inheritance_unclear':
      return [field('dispositionText', true), field('reasoningText'), diagnostic]
        .filter((entry) => entry.text || entry.placeholder);
    case 'amount_conflict':
      return [field('claimText', true), field('dispositionText', true), field('amountText', true), diagnostic]
        .filter((entry) => entry.text || entry.placeholder);
    default:
      return [
        field('claimText'), field('dispositionText'), field('reasoningText'),
        field('partyText'), field('amountText'), diagnostic,
      ].filter((entry) => entry.text || entry.placeholder);
  }
}

export function outcomeReviewSourceSnippet(item: OutcomeReviewItem): string {
  const evidence = outcomeReviewEvidence(item);
  const source = evidence.diagnosticText || evidence.claimText || evidence.dispositionText
    || evidence.reasoningText || evidence.partyText || evidence.amountText;
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
