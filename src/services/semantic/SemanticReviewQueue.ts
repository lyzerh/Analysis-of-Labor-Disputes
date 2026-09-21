import type {
  ClaimResolution,
  OutcomeStatus,
  PartyRole,
  ProceduralRole,
  SemanticClaim,
  SemanticParty,
  SemanticResolutionResult,
  SemanticTarget,
} from './SemanticResult';
import {
  SEMANTIC_AUDIT_REASON_CODES,
  type SemanticAuditReasonCode,
  type SemanticLocalAuditResult,
} from './SemanticResultAudit';
import { parseSemanticResolutionResult } from './SemanticResultSchema';
import { saveSemanticReviewItem } from './SemanticReviewStorage';

export type SemanticReviewStatus = 'pending' | 'reviewed';
export type SemanticReviewAction = 'accept' | 'edit' | 'unresolved';

export interface SemanticReviewItem {
  id: string;
  caseId: string;
  caseTitle?: string;
  court?: string;
  date?: string;
  status: SemanticReviewStatus;
  semanticResult: SemanticResolutionResult;
  audit: SemanticLocalAuditResult;
  unresolvedTargets?: SemanticTarget[];
  /** Original text or a bounded context excerpt for the reviewer. */
  context?: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedResult?: ReviewedSemanticResult;
}

export interface ReviewedSemanticResult {
  source: 'human_review';
  reviewedResult: SemanticResolutionResult;
  reviewStatus: 'approved';
  reviewedAt: string;
  /** Human action metadata; optional for backwards-compatible persisted items. */
  reviewAction?: SemanticReviewAction;
  /** Immutable snapshot of the AI candidate shown before editing. */
  originalCandidate?: SemanticResolutionResult;
  /** Immutable snapshot of the value saved by the reviewer. */
  finalValue?: SemanticResolutionResult;
}

export interface SemanticReviewActionOptions {
  reviewAction?: SemanticReviewAction;
}

export interface SemanticReviewCorrection {
  partyRoles?: Record<string, { laborRole?: PartyRole; proceduralRoles?: ProceduralRole[] }>;
  claimOwners?: Record<string, { claimantPartyIds?: string[]; claimantRole?: PartyRole }>;
  claimOutcomes?: Record<string, { outcome?: OutcomeStatus; judgmentItemIds?: string[]; awardedAmount?: number }>;
  applicantRole?: SemanticResolutionResult['applicantRole'];
  applicantOutcome?: OutcomeStatus;
  employeeOutcome?: OutcomeStatus;
  employerOutcome?: OutcomeStatus;
}

export interface CreateSemanticReviewItemInput {
  caseId: string;
  caseTitle?: string;
  court?: string;
  date?: string;
  result: SemanticResolutionResult;
  audit: SemanticLocalAuditResult;
  unresolvedTargets?: SemanticTarget[];
  context?: string;
  createdAt: string;
  id?: string;
}

export const semanticReviewReasonLabels: Record<SemanticAuditReasonCode, string> = {
  schema_invalid: '自动结果结构不符合系统要求',
  source_evidence_not_found: '解析依据无法在原文中核验',
  party_id_not_found: '当事人引用与已知主体不一致',
  claim_id_not_found: '诉求引用与已知诉求不一致',
  judgment_item_id_not_found: '裁判项引用与已知裁判项不一致',
  claim_resolution_claim_id_not_found: '诉求结果引用不完整',
  claim_resolution_judgment_item_id_not_found: '诉求与裁判项的关联不完整',
  duplicate_party_id: '当事人标识重复',
  duplicate_claim_id: '诉求标识重复',
  duplicate_judgment_item_id: '裁判项标识重复',
  required_relationship_missing: '关键主体、诉求或裁判关系不完整',
  confidence_below_admission_threshold: '自动解析置信度不足',
  resolved_contains_unclear: '自动结果仍存在关键未明确字段',
  unresolved_result: '系统未能可靠完成自动解析',
  technical_resolution_failure: '系统未能可靠完成自动解析',
};

export function getAuditReasonLabel(code: SemanticAuditReasonCode): string {
  return semanticReviewReasonLabels[code] || '自动解析结果需要人工确认';
}

export function semanticReviewItemId(
  caseId: string,
  audit: Pick<SemanticLocalAuditResult, 'reasonCodes'>,
  targets: SemanticTarget[] = [],
): string {
  const targetKey = targets.map((target) => target.id ? `${target.type}:${target.id}` : target.type).join('|');
  return [caseId, targetKey || 'case', audit.reasonCodes.join('|') || 'audit-fail'].join('::');
}

function cloneResult(result: SemanticResolutionResult): SemanticResolutionResult {
  return JSON.parse(JSON.stringify(result)) as SemanticResolutionResult;
}

export function validateSemanticReviewItem(value: unknown): value is SemanticReviewItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<SemanticReviewItem>;
  if (typeof item.id !== 'string' || !item.id.trim()
    || typeof item.caseId !== 'string' || !item.caseId.trim()
    || (item.status !== 'pending' && item.status !== 'reviewed')
    || typeof item.createdAt !== 'string' || !item.createdAt.trim()
    || !item.semanticResult || !item.audit) return false;
  try {
    parseSemanticResolutionResult(item.semanticResult);
  } catch {
    return false;
  }
  if (item.audit.decision !== 'pass' && item.audit.decision !== 'fail') return false;
  if (!Array.isArray(item.audit.reasonCodes)
    || item.audit.reasonCodes.some((code) => !SEMANTIC_AUDIT_REASON_CODES.includes(code))) return false;
  if (item.audit.decision !== 'fail') return false;
  if (item.status === 'reviewed' && (!item.reviewedAt || !item.reviewedResult)) return false;
  return item.context === undefined || typeof item.context === 'string';
}

/** Creates a pending item only for an audit failure; audit pass returns null. */
export function createSemanticReviewItemFromAudit(
  input: CreateSemanticReviewItemInput,
): SemanticReviewItem | null {
  // Technical failures have no semantic candidate for a reviewer to judge.
  // Keep them retryable and distinct from a valid-but-uncertain candidate.
  if (input.audit.decision !== 'fail'
    || input.result.resolverErrorCode
    || input.audit.reasonCodes.includes('technical_resolution_failure')) return null;
  const targets = input.unresolvedTargets || [];
  return {
    id: input.id?.trim() || semanticReviewItemId(input.caseId, input.audit, targets),
    caseId: input.caseId,
    ...(input.caseTitle !== undefined ? { caseTitle: input.caseTitle } : {}),
    ...(input.court !== undefined ? { court: input.court } : {}),
    ...(input.date !== undefined ? { date: input.date } : {}),
    status: 'pending',
    semanticResult: cloneResult(input.result),
    audit: {
      decision: 'fail',
      reasonCodes: [...input.audit.reasonCodes],
      admissionConfidenceThreshold: input.audit.admissionConfidenceThreshold,
    },
    ...(targets.length > 0 ? { unresolvedTargets: JSON.parse(JSON.stringify(targets)) as SemanticTarget[] } : {}),
    ...(input.context !== undefined ? { context: input.context } : {}),
    createdAt: input.createdAt,
  };
}

function updateParty(party: SemanticParty, correction: SemanticReviewCorrection['partyRoles'][string]): SemanticParty {
  return {
    ...party,
    ...(correction.laborRole ? { laborRole: correction.laborRole } : {}),
    ...(correction.proceduralRoles ? { proceduralRoles: [...correction.proceduralRoles] } : {}),
  };
}

function updateClaim(claim: SemanticClaim, correction: SemanticReviewCorrection['claimOwners'][string]): SemanticClaim {
  return {
    ...claim,
    ...(correction.claimantPartyIds ? { claimantPartyIds: [...correction.claimantPartyIds] } : {}),
    ...(correction.claimantRole ? { claimantRole: correction.claimantRole } : {}),
  };
}

function updateResolution(
  resolution: ClaimResolution,
  correction: SemanticReviewCorrection['claimOutcomes'][string],
): ClaimResolution {
  return {
    ...resolution,
    ...(correction.outcome ? { outcome: correction.outcome } : {}),
    ...(correction.judgmentItemIds ? { judgmentItemIds: [...correction.judgmentItemIds] } : {}),
    ...(correction.awardedAmount !== undefined ? { awardedAmount: correction.awardedAmount } : {}),
  };
}

export function applySemanticReviewCorrection(
  result: SemanticResolutionResult,
  correction: SemanticReviewCorrection,
): SemanticResolutionResult {
  const next = cloneResult(result);
  next.parties = next.parties.map((party) => correction.partyRoles?.[party.id]
    ? updateParty(party, correction.partyRoles[party.id]) : party);
  next.claims = next.claims.map((claim) => correction.claimOwners?.[claim.id]
    ? updateClaim(claim, correction.claimOwners[claim.id]) : claim);
  next.claimResolutions = next.claimResolutions.map((resolution) => correction.claimOutcomes?.[resolution.claimId]
    ? updateResolution(resolution, correction.claimOutcomes[resolution.claimId]) : resolution);
  if (correction.applicantRole !== undefined) next.applicantRole = correction.applicantRole;
  if (correction.applicantOutcome !== undefined) next.applicantOutcome = correction.applicantOutcome;
  if (correction.employeeOutcome !== undefined) next.employeeOutcome = correction.employeeOutcome;
  if (correction.employerOutcome !== undefined) next.employerOutcome = correction.employerOutcome;
  return parseSemanticResolutionResult(next);
}

export function reviewSemanticReviewItem(
  item: SemanticReviewItem,
  correction: SemanticReviewCorrection,
  reviewedAt: string,
  options: SemanticReviewActionOptions = {},
): SemanticReviewItem {
  let reviewedResult = applySemanticReviewCorrection(item.semanticResult, correction);
  if (options.reviewAction === 'unresolved') {
    reviewedResult = parseSemanticResolutionResult({
      ...reviewedResult,
      status: 'unresolved',
      unresolvedReasonCodes: reviewedResult.unresolvedReasonCodes?.length
        ? reviewedResult.unresolvedReasonCodes
        : ['outcome_unclear'],
    });
  }
  const reviewed: ReviewedSemanticResult = {
    source: 'human_review',
    reviewedResult,
    reviewStatus: 'approved',
    reviewedAt,
    reviewAction: options.reviewAction || 'edit',
    originalCandidate: cloneResult(item.semanticResult),
    finalValue: cloneResult(reviewedResult),
  };
  return {
    ...item,
    status: 'reviewed',
    reviewedAt,
    reviewedResult: reviewed,
  };
}

export function enqueueSemanticReviewItem(
  item: SemanticReviewItem,
  storage?: Storage,
): SemanticReviewItem {
  if (!validateSemanticReviewItem(item)) throw new Error('Invalid semantic review item');
  saveSemanticReviewItem(item, storage);
  return item;
}

export function saveReviewedSemanticReviewItem(
  item: SemanticReviewItem,
  correction: SemanticReviewCorrection,
  reviewedAt: string,
  storage?: Storage,
  options: SemanticReviewActionOptions = {},
): SemanticReviewItem {
  const reviewed = reviewSemanticReviewItem(item, correction, reviewedAt, options);
  enqueueSemanticReviewItem(reviewed, storage);
  return reviewed;
}
