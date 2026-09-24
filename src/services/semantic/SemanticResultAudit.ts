import type {
  SemanticClaim,
  SemanticJudgmentItem,
  SemanticParty,
  SemanticResolutionResult,
} from './SemanticResult';
import { SEMANTIC_AUTO_ACCEPT_CONFIDENCE } from './SemanticConfidenceConfig';
export { SEMANTIC_AUTO_ACCEPT_CONFIDENCE } from './SemanticConfidenceConfig';

/**
 * The local audit is deliberately narrower than a legal or outcome audit. It
 * only checks whether a schema-valid semantic result is safe to admit into a
 * later pipeline stage.
 */
export type SemanticAuditDecision = 'pass' | 'fail';

export type SemanticAuditReasonCode =
  | 'schema_invalid'
  | 'source_evidence_not_found'
  | 'party_id_not_found'
  | 'claim_id_not_found'
  | 'judgment_item_id_not_found'
  | 'claim_resolution_claim_id_not_found'
  | 'claim_resolution_judgment_item_id_not_found'
  | 'duplicate_party_id'
  | 'duplicate_claim_id'
  | 'duplicate_judgment_item_id'
  | 'required_relationship_missing'
  | 'confidence_below_admission_threshold'
  | 'resolved_contains_unclear'
  | 'unresolved_result'
  | 'technical_resolution_failure';

export const SEMANTIC_AUDIT_REASON_CODES: readonly SemanticAuditReasonCode[] = [
  'schema_invalid',
  'source_evidence_not_found',
  'party_id_not_found',
  'claim_id_not_found',
  'judgment_item_id_not_found',
  'claim_resolution_claim_id_not_found',
  'claim_resolution_judgment_item_id_not_found',
  'duplicate_party_id',
  'duplicate_claim_id',
  'duplicate_judgment_item_id',
  'required_relationship_missing',
  'confidence_below_admission_threshold',
  'resolved_contains_unclear',
  'unresolved_result',
  'technical_resolution_failure',
];

/** Single production automatic-admission confidence gate for semantic results. */
export const DEFAULT_SEMANTIC_RESULT_ADMISSION_THRESHOLD = SEMANTIC_AUTO_ACCEPT_CONFIDENCE;

export interface SemanticAuditContext {
  rawText: string;
  knownParties?: readonly SemanticParty[];
  knownClaims?: readonly SemanticClaim[];
  knownJudgmentItems?: readonly SemanticJudgmentItem[];
  /**
   * Claim-resolution targets required by the current semantic task.  A
   * resolved result is target-scoped, so non-target claims are not required
   * to have a ClaimResolution.  Omitted keeps the legacy all-claims default
   * for direct callers; production orchestration always supplies this list.
   */
  requiredClaimResolutionIds?: readonly string[];
  admissionConfidenceThreshold?: number;
}

export interface SemanticLocalAuditResult {
  decision: SemanticAuditDecision;
  reasonCodes: SemanticAuditReasonCode[];
  admissionConfidenceThreshold: number;
}

const addReason = (
  reasons: Set<SemanticAuditReasonCode>,
  reason: SemanticAuditReasonCode,
): void => {
  reasons.add(reason);
};

const ids = (items: readonly { id: string }[]): Set<string> => new Set(items.map((item) => item.id));

const hasDuplicateIds = (items: readonly { id: string }[]): boolean =>
  ids(items).size !== items.length;

const evidenceExistsInRawText = (rawText: string, text: string): boolean =>
  typeof text === 'string' && text.trim().length > 0 && rawText.includes(text.trim());

const auditEvidence = (
  result: SemanticResolutionResult,
  rawText: string,
  reasons: Set<SemanticAuditReasonCode>,
): void => {
  const evidence = [
    ...result.parties.map((item) => item.sourceEvidence),
    ...result.claims.map((item) => item.sourceEvidence),
    ...result.judgmentItems.map((item) => item.sourceEvidence),
    ...result.claimResolutions.map((item) => item.sourceEvidence),
  ];

  evidence.forEach((item) => {
    if (item && !evidenceExistsInRawText(rawText, item.text)) {
      addReason(reasons, 'source_evidence_not_found');
    }
  });
};

/**
 * Audits a schema-valid result without changing it. The caller can decide
 * whether a failed result enters a later audit/review stage.
 */
export const auditSemanticResolutionResult = (
  result: SemanticResolutionResult,
  context: SemanticAuditContext,
): SemanticLocalAuditResult => {
  const reasons = new Set<SemanticAuditReasonCode>();
  const threshold = context.admissionConfidenceThreshold
    ?? DEFAULT_SEMANTIC_RESULT_ADMISSION_THRESHOLD;
  const partyIds = ids(result.parties);
  const claimIds = ids(result.claims);
  const judgmentItemIds = ids(result.judgmentItems);
  const knownPartyIds = context.knownParties ? ids(context.knownParties) : undefined;
  const knownClaimIds = context.knownClaims ? ids(context.knownClaims) : undefined;
  const knownJudgmentItemIds = context.knownJudgmentItems ? ids(context.knownJudgmentItems) : undefined;
  const requiredClaimResolutionIds = context.requiredClaimResolutionIds
    ?? result.claims.map((claim) => claim.id);

  if (hasDuplicateIds(result.parties)) addReason(reasons, 'duplicate_party_id');
  if (hasDuplicateIds(result.claims)) addReason(reasons, 'duplicate_claim_id');
  if (hasDuplicateIds(result.judgmentItems)) addReason(reasons, 'duplicate_judgment_item_id');

  result.parties.forEach((party) => {
    if (knownPartyIds && !knownPartyIds.has(party.id)) {
      addReason(reasons, 'party_id_not_found');
    }
  });
  result.claims.forEach((claim) => {
    if (knownClaimIds && !knownClaimIds.has(claim.id)) addReason(reasons, 'claim_id_not_found');
    if (claim.claimantPartyIds.length === 0 && claim.claimantRole !== 'unknown') {
      addReason(reasons, 'required_relationship_missing');
    }
    claim.claimantPartyIds.forEach((partyId) => {
      if (!partyIds.has(partyId) || (knownPartyIds && !knownPartyIds.has(partyId))) {
        addReason(reasons, 'party_id_not_found');
      }
    });

    if (claim.claimantRole !== 'unknown' && claim.claimantPartyIds.length > 0) {
      const claimantRoles = claim.claimantPartyIds
        .map((partyId) => result.parties.find((party) => party.id === partyId)?.laborRole)
        .filter((role): role is SemanticParty['laborRole'] => role !== undefined);
      if (claimantRoles.length > 0 && !claimantRoles.includes(claim.claimantRole)) {
        addReason(reasons, 'required_relationship_missing');
      }
    }
  });
  result.judgmentItems.forEach((item) => {
    if (knownJudgmentItemIds && !knownJudgmentItemIds.has(item.id)) {
      addReason(reasons, 'judgment_item_id_not_found');
    }
  });

  result.claimResolutions.forEach((resolution) => {
    if (!claimIds.has(resolution.claimId) || (knownClaimIds && !knownClaimIds.has(resolution.claimId))) {
      addReason(reasons, 'claim_resolution_claim_id_not_found');
    }
    resolution.judgmentItemIds.forEach((judgmentItemId) => {
      if (!judgmentItemIds.has(judgmentItemId)
        || (knownJudgmentItemIds && !knownJudgmentItemIds.has(judgmentItemId))) {
        addReason(reasons, 'claim_resolution_judgment_item_id_not_found');
      }
    });
  });

  if (result.applicantRole !== 'unknown'
    && !result.parties.some((party) => party.laborRole === result.applicantRole)) {
    addReason(reasons, 'required_relationship_missing');
  }

  if (result.status === 'resolved') {
    // "resolved" closes the supplied semantic task, not every claim in the
    // case. Coverage therefore follows the explicit task target scope below.
    if (result.applicantRole === 'unknown'
      || result.applicantOutcome === 'unclear'
      || result.employeeOutcome === 'unclear'
      || result.employerOutcome === 'unclear'
      || result.claimResolutions.some((resolution) => resolution.outcome === 'unclear')
      || (result.unresolvedReasonCodes?.length ?? 0) > 0) {
      addReason(reasons, 'resolved_contains_unclear');
    }
    if (result.claims.some((claim) => claim.claimantRole === 'unknown'
      || claim.claimantPartyIds.length === 0)) {
      addReason(reasons, 'required_relationship_missing');
    }

    const resolutionCounts = new Map<string, number>();
    result.claimResolutions.forEach((resolution) => {
      resolutionCounts.set(resolution.claimId, (resolutionCounts.get(resolution.claimId) ?? 0) + 1);
    });
    [...new Set(requiredClaimResolutionIds)].forEach((claimId) => {
      if (!claimIds.has(claimId)) {
        addReason(reasons, 'claim_id_not_found');
        addReason(reasons, 'required_relationship_missing');
      } else if (resolutionCounts.get(claimId) !== 1) {
        addReason(reasons, 'required_relationship_missing');
      }
    });
  } else {
    addReason(reasons, 'unresolved_result');
  }

  if (result.claimResolutions.some((resolution) => resolution.outcome !== 'unclear'
    && resolution.judgmentItemIds.length === 0)) {
    addReason(reasons, 'required_relationship_missing');
  }

  if (!Number.isFinite(result.confidence) || result.confidence < threshold
    || result.claimResolutions.some((resolution) => resolution.confidence < threshold)) {
    addReason(reasons, 'confidence_below_admission_threshold');
  }

  if (result.resolverErrorCode) addReason(reasons, 'technical_resolution_failure');
  auditEvidence(result, context.rawText, reasons);

  const reasonCodes = [...reasons];
  return {
    decision: reasonCodes.length === 0 ? 'pass' : 'fail',
    reasonCodes,
    admissionConfidenceThreshold: threshold,
  };
};

/** Alias that makes the stage boundary explicit for orchestration callers. */
export const runSemanticLocalAudit = auditSemanticResolutionResult;
