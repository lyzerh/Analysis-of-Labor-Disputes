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
  auditSemanticResolutionResult,
  type SemanticAuditContext,
  type SemanticAuditReasonCode,
  type SemanticLocalAuditResult,
} from './SemanticResultAudit';
import { parseSemanticResolutionResult } from './SemanticResultSchema';
import { saveSemanticReviewItem } from './SemanticReviewStorage';
import { semanticAuditReasonLabel } from '../presentation/WorkflowPresentation';
import type { UnresolvedSemanticTask } from './SemanticResult';
import type { SemanticTechnicalFailure } from './SemanticTechnicalFailureStorage';

export type SemanticReviewStatus = 'pending' | 'reviewed';
export type SemanticReviewAction = 'accept' | 'edit' | 'unresolved';

/**
 * Source facts needed to re-run the current audit.  The admission threshold
 * is deliberately excluded: it is a centralized runtime rule, not persisted
 * provenance.
 */
export type SemanticReviewAuditContext = Omit<SemanticAuditContext, 'admissionConfidenceThreshold'>;

export interface SemanticReviewItem {
  id: string;
  caseId: string;
  caseTitle?: string;
  court?: string;
  date?: string;
  status: SemanticReviewStatus;
  semanticResult: SemanticResolutionResult;
  /** Distinguishes an actual AI candidate from a manual-only scaffold. */
  candidateStatus?: 'ai_candidate' | 'no_candidate';
  audit: SemanticLocalAuditResult;
  /** Immutable source context for current-rule audit recomputation. */
  auditContext?: SemanticReviewAuditContext;
  unresolvedTargets?: SemanticTarget[];
  /** Original text or a bounded context excerpt for the reviewer. */
  context?: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedResult?: ReviewedSemanticResult;
  /** Technical attempts remain available after retry or human annotation. */
  technicalFailureHistory?: SemanticTechnicalFailure[];
}

export interface ReviewedSemanticResult {
  source: 'human_review';
  reviewedResult: SemanticResolutionResult;
  reviewStatus: 'approved';
  reviewedAt: string;
  /** Human action metadata; optional for backwards-compatible persisted items. */
  reviewAction?: SemanticReviewAction;
  /** Immutable snapshot of the AI candidate shown before editing. */
  originalCandidate?: SemanticResolutionResult | null;
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
  auditContext?: SemanticReviewAuditContext;
  unresolvedTargets?: SemanticTarget[];
  context?: string;
  createdAt: string;
  id?: string;
  candidateStatus?: 'ai_candidate' | 'no_candidate';
  technicalFailureHistory?: SemanticTechnicalFailure[];
}

export const semanticReviewReasonLabels: Record<SemanticAuditReasonCode, string> = {
  schema_invalid: semanticAuditReasonLabel('schema_invalid'),
  source_evidence_not_found: semanticAuditReasonLabel('source_evidence_not_found'),
  party_id_not_found: semanticAuditReasonLabel('party_id_not_found'),
  claim_id_not_found: semanticAuditReasonLabel('claim_id_not_found'),
  judgment_item_id_not_found: semanticAuditReasonLabel('judgment_item_id_not_found'),
  claim_resolution_claim_id_not_found: semanticAuditReasonLabel('claim_resolution_claim_id_not_found'),
  claim_resolution_judgment_item_id_not_found: semanticAuditReasonLabel('claim_resolution_judgment_item_id_not_found'),
  duplicate_party_id: semanticAuditReasonLabel('duplicate_party_id'),
  duplicate_claim_id: semanticAuditReasonLabel('duplicate_claim_id'),
  duplicate_judgment_item_id: semanticAuditReasonLabel('duplicate_judgment_item_id'),
  required_relationship_missing: semanticAuditReasonLabel('required_relationship_missing'),
  confidence_below_admission_threshold: semanticAuditReasonLabel('confidence_below_admission_threshold'),
  resolved_contains_unclear: semanticAuditReasonLabel('resolved_contains_unclear'),
  unresolved_result: semanticAuditReasonLabel('unresolved_result'),
  technical_resolution_failure: semanticAuditReasonLabel('technical_resolution_failure'),
};

export function getAuditReasonLabel(code: SemanticAuditReasonCode): string {
  return semanticReviewReasonLabels[code] || '需要人工复核';
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

function cloneAuditContext(context: SemanticReviewAuditContext): SemanticReviewAuditContext {
  return JSON.parse(JSON.stringify(context)) as SemanticReviewAuditContext;
}

const isAuditContext = (value: unknown): value is SemanticReviewAuditContext => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const context = value as Partial<SemanticReviewAuditContext>;
  return typeof context.rawText === 'string'
    && (context.knownParties === undefined || Array.isArray(context.knownParties))
    && (context.knownClaims === undefined || Array.isArray(context.knownClaims))
    && (context.knownJudgmentItems === undefined || Array.isArray(context.knownJudgmentItems))
    && (context.requiredClaimResolutionIds === undefined || Array.isArray(context.requiredClaimResolutionIds));
};

const legacyAuditContext = (item: SemanticReviewItem): SemanticReviewAuditContext | undefined => {
  if (item.auditContext) return item.auditContext;
  // Older persisted items have only the reviewer context.  Reuse it as a
  // conservative source window and the result's own IDs for mechanical
  // checks; evidence outside that window remains blocked rather than guessed.
  return {
    rawText: item.context || '',
    knownParties: item.semanticResult.parties,
    knownClaims: item.semanticResult.claims,
    knownJudgmentItems: item.semanticResult.judgmentItems,
    requiredClaimResolutionIds: (item.unresolvedTargets || [])
      .filter((target) => target.type === 'claim_resolution' && Boolean(target.id))
      .map((target) => target.id as string),
  };
};

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
  return (item.context === undefined || typeof item.context === 'string')
    && (item.auditContext === undefined || isAuditContext(item.auditContext))
    && (item.candidateStatus === undefined || item.candidateStatus === 'ai_candidate' || item.candidateStatus === 'no_candidate')
    && (item.technicalFailureHistory === undefined || Array.isArray(item.technicalFailureHistory));
}

/** Returns the effective semantic result without mutating persisted history. */
export function currentSemanticReviewResult(item: SemanticReviewItem): SemanticResolutionResult {
  if (item.status === 'reviewed' && item.reviewedResult?.reviewedResult) {
    return item.reviewedResult.reviewedResult;
  }
  return item.semanticResult;
}

/**
 * Re-runs the current centralized audit rules for a persisted review item.
 * Legacy items use their bounded context (or an empty source window) so
 * missing evidence stays a failure rather than being invented.
 */
export function getCurrentSemanticReviewAudit(
  item: SemanticReviewItem,
  contextOverride?: SemanticReviewAuditContext,
): SemanticLocalAuditResult | undefined {
  const context = contextOverride || legacyAuditContext(item);
  if (!context || !isAuditContext(context)) return undefined;
  return auditSemanticResolutionResult(currentSemanticReviewResult(item), context);
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
    candidateStatus: input.candidateStatus || 'ai_candidate',
    audit: {
      decision: 'fail',
      reasonCodes: [...input.audit.reasonCodes],
      admissionConfidenceThreshold: input.audit.admissionConfidenceThreshold,
    },
    ...(input.auditContext ? { auditContext: cloneAuditContext(input.auditContext) } : {}),
    ...(targets.length > 0 ? { unresolvedTargets: JSON.parse(JSON.stringify(targets)) as SemanticTarget[] } : {}),
    ...(input.context !== undefined ? { context: input.context } : {}),
    ...(input.technicalFailureHistory ? { technicalFailureHistory: JSON.parse(JSON.stringify(input.technicalFailureHistory)) as SemanticTechnicalFailure[] } : {}),
    createdAt: input.createdAt,
  };
}

const manualResultFromTask = (task: UnresolvedSemanticTask): SemanticResolutionResult => parseSemanticResolutionResult({
  status: 'unresolved',
  resolver: 'llm',
  parties: task.knownParties || [],
  // For a manual-only item, keep an explicit display fallback rather than
  // fabricating a request excerpt; an empty claimText is valid contract data
  // and means reliable request provenance is unavailable. The original
  // task/audit context remains available for the reviewer to inspect.
  claims: (task.knownClaims || []).map(({ claimLabel: _claimLabel, ...claim }) => ({
    ...claim,
    claimText: claim.claimText || '暂未定位到明确的请求原文',
  })),
  judgmentItems: task.knownJudgmentItems || [],
  claimResolutions: (task.knownClaims || []).map((claim) => ({
    claimId: claim.id,
    judgmentItemIds: [],
    outcome: 'unclear',
    confidence: 0,
  })),
  applicantRole: 'unknown',
  applicantOutcome: 'unclear',
  employeeOutcome: 'unclear',
  employerOutcome: 'unclear',
  confidence: 0,
  unresolvedReasonCodes: ['insufficient_context'],
});

/** Creates a pending claim-centric review item without pretending AI produced a candidate. */
export function createTechnicalManualReviewItem(input: {
  task: UnresolvedSemanticTask;
  caseTitle?: string;
  court?: string;
  date?: string;
  technicalFailureHistory: SemanticTechnicalFailure[];
  createdAt: string;
}): SemanticReviewItem {
  const result = manualResultFromTask(input.task);
  const audit: SemanticLocalAuditResult = {
    decision: 'fail',
    reasonCodes: ['technical_resolution_failure'],
    admissionConfidenceThreshold: 0.8,
  };
  const requiredClaimResolutionIds = input.task.unresolvedTargets
    .filter((target) => target.type === 'claim_resolution' && Boolean(target.id))
    .map((target) => target.id as string);
  return {
    id: semanticReviewItemId(input.task.caseId, audit, input.task.unresolvedTargets) + '::manual',
    caseId: input.task.caseId,
    ...(input.caseTitle !== undefined ? { caseTitle: input.caseTitle } : {}),
    ...(input.court !== undefined ? { court: input.court } : {}),
    ...(input.date !== undefined ? { date: input.date } : {}),
    status: 'pending',
    semanticResult: result,
    candidateStatus: 'no_candidate',
    audit,
    auditContext: {
      rawText: input.task.rawText,
      ...(input.task.knownParties ? { knownParties: input.task.knownParties } : {}),
      ...(input.task.knownClaims ? { knownClaims: input.task.knownClaims.map(({ claimLabel: _claimLabel, ...claim }) => claim) } : {}),
      ...(input.task.knownJudgmentItems ? { knownJudgmentItems: input.task.knownJudgmentItems } : {}),
      requiredClaimResolutionIds,
    },
    unresolvedTargets: JSON.parse(JSON.stringify(input.task.unresolvedTargets)) as SemanticTarget[],
    context: input.task.context || input.task.rawText,
    technicalFailureHistory: JSON.parse(JSON.stringify(input.technicalFailureHistory)) as SemanticTechnicalFailure[],
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
  } else if (item.candidateStatus === 'no_candidate') {
    const hasUnclearClaim = reviewedResult.claimResolutions.some((resolution) => resolution.outcome === 'unclear');
    const hasUnclearOutcome = [
      reviewedResult.applicantOutcome,
      reviewedResult.employeeOutcome,
      reviewedResult.employerOutcome,
    ].some((outcome) => outcome === 'unclear');
    reviewedResult = parseSemanticResolutionResult({
      ...reviewedResult,
      status: hasUnclearClaim || hasUnclearOutcome ? 'unresolved' : 'resolved',
      confidence: hasUnclearClaim || hasUnclearOutcome ? 0 : 1,
      ...(hasUnclearClaim || hasUnclearOutcome ? { unresolvedReasonCodes: ['outcome_unclear'] } : { unresolvedReasonCodes: undefined }),
      resolverErrorCode: undefined,
      claimResolutions: reviewedResult.claimResolutions.map((resolution) => resolution.outcome === 'unclear'
        ? resolution
        : { ...resolution, confidence: 1 }),
    });
  }
  const reviewed: ReviewedSemanticResult = {
    source: 'human_review',
    reviewedResult,
    reviewStatus: 'approved',
    reviewedAt,
    reviewAction: options.reviewAction || 'edit',
    originalCandidate: item.candidateStatus === 'no_candidate' ? null : cloneResult(item.semanticResult),
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
