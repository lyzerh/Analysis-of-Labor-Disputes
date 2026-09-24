import { OrdinalReferenceResolver } from './OrdinalReferenceResolver';
import {
  SEMANTIC_AUTO_ACCEPT_CONFIDENCE,
  SEMANTIC_HUMAN_REVIEW_CONFIDENCE,
} from './SemanticConfidenceConfig';
import type {
  CourtTreatment,
  SemanticResolutionCandidate,
  SemanticResolutionInput,
  SemanticValidationResult,
  SemanticValidatorDecision,
} from './types';

export const SEMANTIC_CONFIDENCE_THRESHOLDS = Object.freeze({
  accepted: SEMANTIC_AUTO_ACCEPT_CONFIDENCE,
  humanReview: SEMANTIC_HUMAN_REVIEW_CONFIDENCE,
});

const COURT_TREATMENTS = new Set<CourtTreatment>([
  'accepted',
  'partially_accepted',
  'rejected',
  'not_addressed',
  'unclear',
]);

const REASONING_TYPES = new Set([
  'ordinal_reference',
  'multi_claim_reference',
  'remaining_claims',
  'anaphora',
  'cross_sentence',
  'appeal_mapping',
  'other',
]);

const FORBIDDEN_MUTATION_KEYS = new Set([
  'amount',
  'requestedAmount',
  'awardedAmount',
  'employeeOutcome',
  'employerOutcome',
  'overallResult',
  'applicantOutcome',
  'claimOutcome',
  'outcome',
  'supportStatus',
]);

const hasForbiddenMutation = (value: unknown, seen = new Set<unknown>()): boolean => {
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  return Object.entries(value).some(([key, nested]) =>
    FORBIDDEN_MUTATION_KEYS.has(key) || hasForbiddenMutation(nested, seen)
  );
};

const sameIds = (left: string[], right: string[]): boolean =>
  left.length === right.length
  && [...left].sort().every((id, index) => id === [...right].sort()[index]);

const treatmentMatchesAction = (
  action: SemanticResolutionInput['judgmentItems'] extends Array<infer T> | undefined
    ? T extends { action: infer A } ? A : never
    : never,
  treatment: CourtTreatment,
): boolean => {
  if (action === 'reject') return treatment === 'rejected';
  if (action === 'support') return treatment === 'accepted';
  if (action === 'pay') return treatment === 'accepted' || treatment === 'partially_accepted';
  return true;
};

export class SemanticResolutionValidator {
  public static validate(
    input: SemanticResolutionInput,
    rawCandidate: unknown,
    existingCandidates: SemanticResolutionCandidate[] = [],
  ): SemanticValidationResult {
    const reasons: string[] = [];

    if (!rawCandidate || typeof rawCandidate !== 'object') {
      return { decision: 'rejected', reasons: ['candidate_not_object'] };
    }
    if (hasForbiddenMutation(rawCandidate)) {
      reasons.push('candidate_attempts_outcome_or_amount_mutation');
    }

    const candidate = rawCandidate as SemanticResolutionCandidate;
    const fragment = input.unresolvedFragments.find((item) => item.id === candidate.fragmentId);
    if (!fragment) reasons.push('fragment_not_found');
    if (candidate.resolutionMethod !== 'llm') reasons.push('invalid_resolution_method');
    if (!Array.isArray(candidate.referencedClaimIds) || candidate.referencedClaimIds.length === 0) {
      reasons.push('empty_referenced_claim_ids');
    }
    if (candidate.referencedClaimIds?.some((id) => typeof id !== 'string' || id.trim() === '')) {
      reasons.push('blank_claim_id');
    }
    if (new Set(candidate.referencedClaimIds || []).size !== (candidate.referencedClaimIds || []).length) {
      reasons.push('duplicate_claim_id');
    }

    const claimsById = new Map(input.claims.map((claim) => [claim.id, claim]));
    if (candidate.referencedClaimIds?.some((id) => !claimsById.has(id))) {
      reasons.push('claim_id_not_found');
    }
    if (fragment && candidate.sourceText !== fragment.sourceText) {
      reasons.push('source_text_not_exact');
    }
    if (fragment?.candidateClaimIds?.length
      && candidate.referencedClaimIds?.some((id) => !fragment.candidateClaimIds?.includes(id))) {
      reasons.push('claim_outside_fragment_candidates');
    }
    if (typeof candidate.confidence !== 'number'
      || !Number.isFinite(candidate.confidence)
      || candidate.confidence < 0
      || candidate.confidence > 1) {
      reasons.push('confidence_out_of_range');
    }
    if (!COURT_TREATMENTS.has(candidate.courtTreatment)) reasons.push('invalid_court_treatment');
    if (!REASONING_TYPES.has(candidate.reasoningType)) reasons.push('invalid_reasoning_type');

    const deterministicJudgment = input.judgmentItems?.find((item) =>
      item.sourceText === candidate.sourceText && item.action !== 'unclear'
    );
    if (deterministicJudgment
      && !treatmentMatchesAction(deterministicJudgment.action, candidate.courtTreatment)) {
      reasons.push('court_treatment_conflicts_with_deterministic_action');
    }

    if (candidate.claimantPartyId) {
      const referencedClaims = (candidate.referencedClaimIds || [])
        .map((id) => claimsById.get(id))
        .filter(Boolean);
      if (!referencedClaims.some((claim) => claim?.claimantPartyId === candidate.claimantPartyId)) {
        reasons.push('unrelated_claimant_party');
      }
    }

    if (!candidate.provenance
      || !candidate.provenance.provider
      || candidate.provenance.sourceText !== candidate.sourceText
      || candidate.provenance.confidence !== candidate.confidence
      || !candidate.provenance.modelName
      || !candidate.provenance.modelVersion
      || !candidate.provenance.promptVersion
      || !candidate.provenance.resolvedAt) {
      reasons.push('invalid_provenance');
    }

    if (fragment) {
      const deterministic = OrdinalReferenceResolver.resolveFragment(input, fragment);
      if (deterministic.status === 'resolved' && deterministic.reason === 'deterministic_ordinal_match') {
        const exactRelation = deterministic.candidates.find((item) =>
          sameIds(item.referencedClaimIds, candidate.referencedClaimIds || [])
          && (item.courtTreatment === 'unclear' || item.courtTreatment === candidate.courtTreatment)
        );
        if (!exactRelation) reasons.push('conflicts_with_deterministic_ordinal_resolution');
      } else if (deterministic.reason === 'ordinal_out_of_range') {
        reasons.push('ordinal_out_of_range');
      }
    }

    const conflicts = existingCandidates.some((existing) =>
      existing.fragmentId === candidate.fragmentId
      && existing.referencedClaimIds.some((id) => candidate.referencedClaimIds?.includes(id))
      && existing.courtTreatment !== candidate.courtTreatment
    );
    if (conflicts) reasons.push('conflicts_with_existing_candidate');

    let decision: SemanticValidatorDecision;
    if (reasons.length > 0 || candidate.confidence < SEMANTIC_CONFIDENCE_THRESHOLDS.humanReview) {
      if (reasons.length === 0) reasons.push('confidence_below_rejection_threshold');
      decision = 'rejected';
    } else if (candidate.confidence < SEMANTIC_CONFIDENCE_THRESHOLDS.accepted) {
      reasons.push('confidence_requires_human_review');
      decision = 'human_review';
    } else {
      decision = 'accepted';
    }

    return {
      decision,
      reasons,
      reviewableCandidate: decision === 'rejected' ? undefined : {
        candidate,
        validatorDecision: decision,
        validationReasons: reasons,
        provenance: {
          ...candidate.provenance,
          validatorDecision: decision,
        },
      },
    };
  }
}
