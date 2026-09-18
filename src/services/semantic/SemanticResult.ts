import type {
  ApplicantRole,
  LaborRole,
  LegalOutcomeType,
  ProceduralRole as ExistingProceduralRole,
} from '../../types';
import type { SemanticResolverErrorCode } from './types';

/** Semantic roles intentionally reuse the stable Outcome/party vocabulary. */
export type PartyRole = LaborRole;
export type OutcomeStatus = LegalOutcomeType;
export type SemanticApplicantRole = ApplicantRole;

/** Existing procedural labels remain valid; semantic routing adds generic aliases. */
export type ProceduralRole = ExistingProceduralRole | 'counterclaimant' | 'other';

export interface SourceEvidence {
  text: string;
  start?: number;
  end?: number;
}

export interface SemanticParty {
  id: string;
  name: string;
  laborRole: PartyRole;
  proceduralRoles: ProceduralRole[];
  sourceEvidence?: SourceEvidence;
}

export interface SemanticClaim {
  id: string;
  claimantPartyIds: string[];
  claimantRole: PartyRole;
  claimType: string;
  claimText: string;
  requestedAmount?: number;
  currency?: 'CNY';
  sourceEvidence?: SourceEvidence;
}

export interface SemanticJudgmentItem {
  id: string;
  text: string;
  awardedAmount?: number;
  currency?: 'CNY';
  sourceEvidence?: SourceEvidence;
}

export interface ClaimResolution {
  claimId: string;
  judgmentItemIds: string[];
  outcome: OutcomeStatus;
  awardedAmount?: number;
  confidence: number;
  sourceEvidence?: SourceEvidence;
}

export type SemanticReasonCode =
  | 'party_role_unclear'
  | 'claimant_unclear'
  | 'claim_judgment_match_unclear'
  | 'payment_direction_unclear'
  | 'outcome_unclear'
  | 'multiple_possible_matches'
  | 'conflicting_rule_results'
  | 'insufficient_context'
  | 'unsupported_structure';

export type SemanticTargetType =
  | 'party_role'
  | 'claim'
  | 'judgment_item'
  | 'claim_resolution'
  | 'case_outcome';

export interface SemanticTarget {
  type: SemanticTargetType;
  id?: string;
  reasonCode: SemanticReasonCode;
}

export interface SemanticFactSet {
  parties: SemanticParty[];
  claims: SemanticClaim[];
  judgmentItems: SemanticJudgmentItem[];
  claimResolutions: ClaimResolution[];
  applicantRole: SemanticApplicantRole;
  applicantOutcome: OutcomeStatus;
  employeeOutcome: OutcomeStatus;
  employerOutcome: OutcomeStatus;
  confidence: number;
}

export interface ResolvedSemanticResult extends SemanticFactSet {
  status: 'resolved';
}

export interface UnresolvedSemanticTask {
  status: 'unresolved';
  caseId: string;
  reasonCodes: SemanticReasonCode[];
  rawText: string;
  knownParties?: SemanticParty[];
  knownClaims?: SemanticClaim[];
  knownJudgmentItems?: SemanticJudgmentItem[];
  unresolvedTargets: SemanticTarget[];
  context?: string;
}

export interface SemanticResolutionResult extends SemanticFactSet {
  status: 'resolved' | 'unresolved';
  resolver: 'llm';
  unresolvedReasonCodes?: SemanticReasonCode[];
  /** Technical provider/schema failures are distinct from semantic uncertainty. */
  resolverErrorCode?: SemanticResolverErrorCode;
}

/** Shared routing contract between deterministic rules and a future resolver. */
export type SemanticRuleResult = ResolvedSemanticResult | UnresolvedSemanticTask;

export const isResolvedSemanticResult = (
  result: SemanticRuleResult,
): result is ResolvedSemanticResult => result.status === 'resolved';

export const isUnresolvedSemanticTask = (
  result: SemanticRuleResult,
): result is UnresolvedSemanticTask => result.status === 'unresolved';
