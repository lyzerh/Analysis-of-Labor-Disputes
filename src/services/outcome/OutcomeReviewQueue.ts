import type {
  AnalysisCaseRecord,
  OutcomeDiagnosticEvidence,
  OutcomeReviewItem,
  OutcomeReviewSuggestion,
  OutcomeUnclearReasonCode,
} from '../../types';

export type OutcomeReviewUserStatus =
  | 'unseen'
  | 'viewed'
  | 'llm_candidate'
  | 'manual_review'
  | 'rule_improvement'
  | 'deferred';

export type OutcomeReviewStatusFilter = 'all' | 'needs_review' | OutcomeReviewUserStatus;
export type OutcomeReviewStatusMap = Record<string, OutcomeReviewUserStatus>;
export type OutcomeDiagnosticFilter = 'all' | 'needs_review' | 'unclear' | 'evidence' | 'relationship' | 'technical';
export type OutcomeDiagnosticCategory = Exclude<OutcomeDiagnosticFilter, 'all' | 'needs_review'>;

export const outcomeReviewStatusStorageKey = 'labor-analysis-review-status-v1';

export const outcomeReviewStatusLabels: Record<OutcomeReviewUserStatus, string> = {
  unseen: '未查看',
  viewed: '已查看',
  llm_candidate: 'LLM候选',
  manual_review: '人工复核',
  rule_improvement: '规则改进',
  deferred: '暂缓',
};

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

export const outcomeDiagnosticFilterLabels: Record<OutcomeDiagnosticFilter, string> = {
  all: '全部',
  needs_review: '需要人工复核',
  unclear: '未明确',
  evidence: '证据问题',
  relationship: '关系问题',
  technical: '技术问题',
};

const evidenceDiagnosticReasons = new Set<OutcomeUnclearReasonCode>([
  'source_text_missing',
  'missing_disposition_text',
  'amount_conflict',
]);

const relationshipDiagnosticReasons = new Set<OutcomeUnclearReasonCode>([
  'missing_party_roles',
  'missing_labor_role',
  'missing_claim_owner',
  'disposition_not_matched',
  'payment_beneficiary_unclear',
  'rejection_owner_unclear',
  'appeal_inheritance_unclear',
  'ambiguous_multiple_claims',
]);

export function outcomeDiagnosticCategory(item: Pick<OutcomeReviewItem, 'reasonCode' | 'outcome'>): OutcomeDiagnosticCategory {
  if (item.reasonCode && evidenceDiagnosticReasons.has(item.reasonCode)) return 'evidence';
  if (item.reasonCode && relationshipDiagnosticReasons.has(item.reasonCode)) return 'relationship';
  if (item.reasonCode && /technical|schema|network|timeout/i.test(item.reasonCode)) return 'technical';
  return 'unclear';
}

export function outcomeReviewSearchText(item: OutcomeReviewItem): string {
  const evidence = outcomeReviewEvidence(item);
  return [
    item.caseId,
    item.title,
    item.caseNumber,
    item.claimType,
    item.claimId,
    item.target,
    item.reasonCode,
    item.reasonMessage,
    item.reasonCode ? outcomeReviewReasonLabels[item.reasonCode] : undefined,
    evidence.claimText,
    evidence.dispositionText,
    evidence.reasoningText,
    evidence.partyText,
    evidence.amountText,
    evidence.diagnosticText,
  ].filter(Boolean).join('\n').toLocaleLowerCase();
}

export function matchesOutcomeDiagnosticFilter(
  item: OutcomeReviewItem,
  filter: OutcomeDiagnosticFilter,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'needs_review') return item.needsReview;
  return outcomeDiagnosticCategory(item) === filter;
}

export const outcomeReviewSuggestionLabels: Record<OutcomeReviewSuggestion, string> = {
  rule_improvement: '建议规则库改进',
  llm_semantic_normalization: '适合 LLM 语义复核',
  manual_review: '建议人工复核',
};

export const outcomeReviewSuggestionHints: Record<OutcomeReviewSuggestion, string> = {
  rule_improvement: '建议完善规则库',
  llm_semantic_normalization: '可加入 LLM 复核候选',
  manual_review: '建议人工判断',
};

const inferredSuggestionByReason: Record<OutcomeUnclearReasonCode, OutcomeReviewSuggestion> = {
  unsupported_claim_type: 'llm_semantic_normalization',
  disposition_not_matched: 'llm_semantic_normalization',
  low_confidence: 'llm_semantic_normalization',
  amount_conflict: 'manual_review',
  ambiguous_multiple_claims: 'manual_review',
  missing_party_roles: 'manual_review',
  missing_labor_role: 'manual_review',
  missing_claim_owner: 'manual_review',
  payment_beneficiary_unclear: 'manual_review',
  rejection_owner_unclear: 'manual_review',
  appeal_inheritance_unclear: 'manual_review',
  missing_disposition_text: 'manual_review',
  source_text_missing: 'manual_review',
  unknown: 'manual_review',
};

export function outcomeReviewSuggestionForDisplay(item: Pick<OutcomeReviewItem, 'suggestedReviewType' | 'reasonCode'>): OutcomeReviewSuggestion | undefined {
  return item.suggestedReviewType || (item.reasonCode ? inferredSuggestionByReason[item.reasonCode] : undefined);
}

export function outcomeReviewSuggestionHint(item: Pick<OutcomeReviewItem, 'suggestedReviewType' | 'reasonCode'>): string | undefined {
  const suggestion = outcomeReviewSuggestionForDisplay(item);
  return suggestion ? outcomeReviewSuggestionHints[suggestion] : undefined;
}

export function outcomeReviewItemId(item: Pick<OutcomeReviewItem, 'reviewItemId' | 'caseId' | 'claimId' | 'target' | 'claimType' | 'reasonCode'>): string {
  return item.reviewItemId || [item.caseId, item.claimId || item.target || 'outcome', item.claimType || '', item.reasonCode || 'unknown'].join('::');
}

function defaultReviewStorage(): Storage | undefined {
  try {
    return typeof globalThis !== 'undefined' ? globalThis.localStorage : undefined;
  } catch {
    return undefined;
  }
}

export function readOutcomeReviewStatusMap(storage: Storage | undefined = defaultReviewStorage()): OutcomeReviewStatusMap {
  if (!storage) return {};
  try {
    const parsed: unknown = JSON.parse(storage.getItem(outcomeReviewStatusStorageKey) || '{}');
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => (
      typeof value === 'string' && Object.prototype.hasOwnProperty.call(outcomeReviewStatusLabels, value)
    ))) as OutcomeReviewStatusMap;
  } catch {
    return {};
  }
}

export function writeOutcomeReviewStatusMap(statuses: OutcomeReviewStatusMap, storage: Storage | undefined = defaultReviewStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(outcomeReviewStatusStorageKey, JSON.stringify(statuses));
  } catch {
    // UI-only state must degrade safely when storage is blocked or full.
  }
}

export function outcomeReviewUserStatus(item: OutcomeReviewItem, statuses: OutcomeReviewStatusMap): OutcomeReviewUserStatus {
  return statuses[outcomeReviewItemId(item)] || 'unseen';
}

/**
 * Opening a review item may acknowledge an unseen item, but must not overwrite
 * an explicit review decision that the user has already recorded.
 */
export function shouldMarkOutcomeReviewItemViewed(item: OutcomeReviewItem, statuses: OutcomeReviewStatusMap): boolean {
  return outcomeReviewUserStatus(item, statuses) === 'unseen';
}

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
      return [field('claimText', true), field('dispositionText', true), diagnostic]
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
  userStatuses: OutcomeReviewStatusMap = {},
): OutcomeReviewItem[] {
  return items.filter((item) => (
    (status === 'all'
      || (status === 'needs_review' && item.needsReview)
      || (status !== 'needs_review' && outcomeReviewUserStatus(item, userStatuses) === status))
    && (!reasonCode || item.reasonCode === reasonCode)
    && (!suggestedReviewType || outcomeReviewSuggestionForDisplay(item) === suggestedReviewType)
  ));
}

/**
 * Derive a read-only review queue from parsed analysis records.
 * No queue item is persisted and no research provenance is changed.
 */
export function buildOutcomeReviewQueue(records: AnalysisCaseRecord[]): OutcomeReviewItem[] {
  return records.flatMap((record) => (record.outcomeDiagnostics || [])
    .filter((diagnostic) => diagnostic.needsReview)
    .map((diagnostic, index) => ({
      ...diagnostic,
      reviewItemId: `${record.caseId}::${diagnostic.claimId || diagnostic.target || 'outcome'}::${diagnostic.claimType || ''}::${diagnostic.reasonCode || 'unknown'}::${index}`,
      caseId: record.caseId,
      title: record.title,
      caseNumber: record.caseNumber,
      employeeParty: record.employeeParty,
      employerParty: record.employerParty,
      applicantRole: record.applicantRole,
      parties: record.parties,
    })));
}
