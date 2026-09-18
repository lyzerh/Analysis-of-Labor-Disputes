import type {
  ClaimProceduralBasis,
  JudgmentAction,
  LaborRole,
} from '../../types';

/** Court treatment of a referenced claim, not a party-level or case-level outcome. */
export type CourtTreatment =
  | 'accepted'
  | 'partially_accepted'
  | 'rejected'
  | 'not_addressed'
  | 'unclear';

export type SemanticReasoningType =
  | 'ordinal_reference'
  | 'multi_claim_reference'
  | 'remaining_claims'
  | 'anaphora'
  | 'cross_sentence'
  | 'appeal_mapping'
  | 'other';

export interface SemanticClaimInput {
  id: string;
  order: number;
  claimType?: string;
  claimantRole: LaborRole;
  claimantPartyId?: string;
  proceduralBasis?: ClaimProceduralBasis;
  requestedAmount?: number;
  sourceText?: string;
}

export interface SemanticUnresolvedFragment {
  id: string;
  sourceText: string;
  surroundingText?: string;
  candidateClaimIds?: string[];
  resolutionMethod: 'unresolved';
  needsSemanticResolution: true;
}

export interface SemanticJudgmentItemInput {
  id: string;
  action: JudgmentAction;
  sourceText: string;
  targetClaimType?: string;
  referencedClaimIds: string[];
}

export interface SemanticResolutionInput {
  caseId: string;
  claims: SemanticClaimInput[];
  unresolvedFragments: SemanticUnresolvedFragment[];
  judgmentItems?: SemanticJudgmentItemInput[];
}

export interface SemanticResolutionProvenance {
  provider: 'gemini' | 'mock' | string;
  modelName: string;
  modelVersion: string;
  promptVersion: string;
  resolvedAt: string;
  confidence: number;
  sourceText: string;
  validatorDecision: SemanticValidatorDecision;
}

/**
 * A model may propose relationships only. Deliberately absent are amounts and
 * employee/employer/overall outcomes; those remain owned by the deterministic
 * outcome pipeline.
 */
export interface SemanticResolutionCandidate {
  fragmentId: string;
  referencedClaimIds: string[];
  courtTreatment: CourtTreatment;
  confidence: number;
  sourceText: string;
  reasoningType: SemanticReasoningType;
  resolutionMethod: 'llm';
  claimantPartyId?: string;
  provenance: Omit<SemanticResolutionProvenance, 'validatorDecision'>;
}

export type SemanticValidatorDecision = 'accepted' | 'rejected' | 'human_review';

export interface ReviewableSemanticResolutionCandidate {
  candidate: SemanticResolutionCandidate;
  validatorDecision: SemanticValidatorDecision;
  validationReasons: string[];
  provenance: SemanticResolutionProvenance;
}

export interface DeterministicReferenceCandidate {
  fragmentId: string;
  referencedClaimIds: string[];
  courtTreatment: CourtTreatment;
  confidence: number;
  sourceText: string;
  reasoningType: Exclude<SemanticReasoningType, 'anaphora' | 'cross_sentence' | 'other'>;
  resolutionMethod: 'ordinal' | 'rule';
  judgmentAction?: JudgmentAction;
}

export interface DeterministicResolutionResult {
  status: 'resolved' | 'unresolved';
  candidates: DeterministicReferenceCandidate[];
  reason: string;
}

export interface SemanticValidationResult {
  decision: SemanticValidatorDecision;
  reasons: string[];
  reviewableCandidate?: ReviewableSemanticResolutionCandidate;
}

export type SemanticResolverErrorCode =
  | 'timeout'
  | 'network_error'
  | 'rate_limited'
  | 'provider_error'
  | 'output_truncated'
  | 'invalid_json'
  | 'schema_invalid'
  | 'empty_response'
  | 'validation_rejected';

export interface RejectedSemanticResolutionCandidate {
  candidate?: SemanticResolutionCandidate;
  reasons: string[];
}

export interface ValidatedSemanticResolutionResult {
  accepted: ReviewableSemanticResolutionCandidate[];
  humanReview: ReviewableSemanticResolutionCandidate[];
  rejected: RejectedSemanticResolutionCandidate[];
  unresolvedFragments: SemanticUnresolvedFragment[];
  status: 'not_needed' | 'completed' | 'fallback_unresolved';
  errorCode?: SemanticResolverErrorCode;
  attemptCount?: number;
}

export type SemanticResolutionStatus =
  | 'not_needed'
  | 'pending'
  | 'partially_resolved'
  | 'resolved'
  | 'needs_review'
  | 'provider_unavailable';

export type AppliedSemanticRelation = ReviewableSemanticResolutionCandidate;
