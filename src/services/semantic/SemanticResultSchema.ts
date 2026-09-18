import { SemanticSchemaError } from './SemanticResolutionSchema';
import type {
  ClaimResolution,
  OutcomeStatus,
  ProceduralRole,
  SemanticClaim,
  SemanticJudgmentItem,
  SemanticParty,
  SemanticReasonCode,
  SemanticResolutionResult,
  SemanticTargetType,
  SourceEvidence,
} from './SemanticResult';
import type { SemanticResolverErrorCode } from './types';

export const SEMANTIC_PARTY_ROLES: readonly SemanticParty['laborRole'][] = [
  'employee', 'employer', 'other', 'unknown',
];

export const SEMANTIC_PROCEDURAL_ROLES: readonly ProceduralRole[] = [
  'plaintiff', 'defendant', 'appellant', 'appellee', 'applicant', 'respondent',
  'counterclaimPlaintiff', 'counterclaimDefendant', 'counterclaimant', 'third_party', 'other', 'unknown',
];

export const SEMANTIC_OUTCOME_STATUSES: readonly OutcomeStatus[] = [
  'supported', 'partially_supported', 'not_supported', 'unclear',
];

export const SEMANTIC_REASON_CODES: readonly SemanticReasonCode[] = [
  'party_role_unclear',
  'claimant_unclear',
  'claim_judgment_match_unclear',
  'payment_direction_unclear',
  'outcome_unclear',
  'multiple_possible_matches',
  'conflicting_rule_results',
  'insufficient_context',
  'unsupported_structure',
];

export const SEMANTIC_TARGET_TYPES: readonly SemanticTargetType[] = [
  'party_role', 'claim', 'judgment_item', 'claim_resolution', 'case_outcome',
];

export const SEMANTIC_RESOLVER_ERROR_CODES: readonly SemanticResolverErrorCode[] = [
  'timeout', 'network_error', 'rate_limited', 'provider_error', 'output_truncated', 'invalid_json',
  'schema_invalid', 'empty_response', 'validation_rejected',
];

const evidenceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['text'],
  properties: {
    text: { type: 'string' },
    start: { type: 'integer', minimum: 0 },
    end: { type: 'integer', minimum: 0 },
  },
} as const;

const partySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'laborRole', 'proceduralRoles'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    laborRole: { type: 'string', enum: [...SEMANTIC_PARTY_ROLES] },
    proceduralRoles: {
      type: 'array',
      items: { type: 'string', enum: [...SEMANTIC_PROCEDURAL_ROLES] },
    },
    sourceEvidence: evidenceSchema,
  },
} as const;

const claimSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'claimantPartyIds', 'claimantRole', 'claimType', 'claimText'],
  properties: {
    id: { type: 'string' },
    claimantPartyIds: { type: 'array', items: { type: 'string' } },
    claimantRole: { type: 'string', enum: [...SEMANTIC_PARTY_ROLES] },
    claimType: { type: 'string' },
    claimText: { type: 'string' },
    requestedAmount: { type: 'number' },
    currency: { type: 'string', enum: ['CNY'] },
    sourceEvidence: evidenceSchema,
  },
} as const;

const judgmentItemSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'text'],
  properties: {
    id: { type: 'string' },
    text: { type: 'string' },
    awardedAmount: { type: 'number' },
    currency: { type: 'string', enum: ['CNY'] },
    sourceEvidence: evidenceSchema,
  },
} as const;

const claimResolutionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['claimId', 'judgmentItemIds', 'outcome', 'confidence'],
  properties: {
    claimId: { type: 'string' },
    judgmentItemIds: { type: 'array', items: { type: 'string' } },
    outcome: { type: 'string', enum: [...SEMANTIC_OUTCOME_STATUSES] },
    awardedAmount: { type: 'number' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    sourceEvidence: evidenceSchema,
  },
} as const;

export const SEMANTIC_RESOLUTION_RESULT_JSON_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'status', 'resolver', 'parties', 'claims', 'judgmentItems', 'claimResolutions',
    'applicantRole', 'applicantOutcome', 'employeeOutcome', 'employerOutcome', 'confidence',
  ],
  properties: {
    status: { type: 'string', enum: ['resolved', 'unresolved'] },
    resolver: { type: 'string', enum: ['llm'] },
    parties: { type: 'array', items: partySchema },
    claims: { type: 'array', items: claimSchema },
    judgmentItems: { type: 'array', items: judgmentItemSchema },
    claimResolutions: { type: 'array', items: claimResolutionSchema },
    applicantRole: { type: 'string', enum: ['employee', 'employer', 'unknown'] },
    applicantOutcome: { type: 'string', enum: [...SEMANTIC_OUTCOME_STATUSES] },
    employeeOutcome: { type: 'string', enum: [...SEMANTIC_OUTCOME_STATUSES] },
    employerOutcome: { type: 'string', enum: [...SEMANTIC_OUTCOME_STATUSES] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    unresolvedReasonCodes: { type: 'array', items: { type: 'string', enum: [...SEMANTIC_REASON_CODES] } },
    resolverErrorCode: { type: 'string', enum: [...SEMANTIC_RESOLVER_ERROR_CODES] },
  },
} as const);

type PlainObject = Record<string, unknown>;

const isPlainObject = (value: unknown): value is PlainObject => Boolean(value)
  && typeof value === 'object'
  && !Array.isArray(value);

const hasOnlyKeys = (value: PlainObject, allowed: readonly string[]): boolean =>
  Object.keys(value).every((key) => allowed.includes(key));

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isFiniteNumberInRange = (value: unknown, min = 0, max = Number.POSITIVE_INFINITY): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isEvidence = (value: unknown): value is SourceEvidence => {
  if (!isPlainObject(value) || !hasOnlyKeys(value, ['text', 'start', 'end']) || !isNonEmptyString(value.text)) return false;
  if (value.start !== undefined && (typeof value.start !== 'number' || !Number.isInteger(value.start) || value.start < 0)) return false;
  if (value.end !== undefined && (typeof value.end !== 'number' || !Number.isInteger(value.end) || value.end < 0)) return false;
  return value.start === undefined || value.end === undefined || value.end >= value.start;
};

const optionalEvidence = (value: PlainObject, key: string): boolean =>
  value[key] === undefined || isEvidence(value[key]);

const isParty = (value: unknown): value is SemanticParty => {
  if (!isPlainObject(value)
    || !hasOnlyKeys(value, ['id', 'name', 'laborRole', 'proceduralRoles', 'sourceEvidence'])
    || !isNonEmptyString(value.id)
    || !isNonEmptyString(value.name)
    || !SEMANTIC_PARTY_ROLES.includes(value.laborRole as SemanticParty['laborRole'])
    || !Array.isArray(value.proceduralRoles)
    || value.proceduralRoles.some((role) => !SEMANTIC_PROCEDURAL_ROLES.includes(role as ProceduralRole))
    || !optionalEvidence(value, 'sourceEvidence')) return false;
  return true;
};

const isClaim = (value: unknown): value is SemanticClaim => {
  if (!isPlainObject(value)
    || !hasOnlyKeys(value, ['id', 'claimantPartyIds', 'claimantRole', 'claimType', 'claimText', 'requestedAmount', 'currency', 'sourceEvidence'])
    || !isNonEmptyString(value.id)
    || !isStringArray(value.claimantPartyIds)
    || !SEMANTIC_PARTY_ROLES.includes(value.claimantRole as SemanticParty['laborRole'])
    || !isNonEmptyString(value.claimType)
    || !isNonEmptyString(value.claimText)
    || !optionalEvidence(value, 'sourceEvidence')) return false;
  if (value.requestedAmount !== undefined && !isFiniteNumberInRange(value.requestedAmount)) return false;
  return value.currency === undefined || value.currency === 'CNY';
};

const isJudgmentItem = (value: unknown): value is SemanticJudgmentItem => {
  if (!isPlainObject(value)
    || !hasOnlyKeys(value, ['id', 'text', 'awardedAmount', 'currency', 'sourceEvidence'])
    || !isNonEmptyString(value.id)
    || !isNonEmptyString(value.text)
    || !optionalEvidence(value, 'sourceEvidence')) return false;
  if (value.awardedAmount !== undefined && !isFiniteNumberInRange(value.awardedAmount)) return false;
  return value.currency === undefined || value.currency === 'CNY';
};

const isClaimResolution = (value: unknown): value is ClaimResolution => {
  if (!isPlainObject(value)
    || !hasOnlyKeys(value, ['claimId', 'judgmentItemIds', 'outcome', 'awardedAmount', 'confidence', 'sourceEvidence'])
    || !isNonEmptyString(value.claimId)
    || !isStringArray(value.judgmentItemIds)
    || !SEMANTIC_OUTCOME_STATUSES.includes(value.outcome as OutcomeStatus)
    || !isFiniteNumberInRange(value.confidence, 0, 1)
    || !optionalEvidence(value, 'sourceEvidence')) return false;
  return value.awardedAmount === undefined || isFiniteNumberInRange(value.awardedAmount);
};

const issuesFor = (value: PlainObject): string[] => {
  const issues: string[] = [];
  if (!hasOnlyKeys(value, [
    'status', 'resolver', 'parties', 'claims', 'judgmentItems', 'claimResolutions',
    'applicantRole', 'applicantOutcome', 'employeeOutcome', 'employerOutcome',
    'confidence', 'unresolvedReasonCodes', 'resolverErrorCode',
  ])) issues.push('additional_properties');
  if (value.status !== 'resolved' && value.status !== 'unresolved') issues.push('status');
  if (value.resolver !== 'llm') issues.push('resolver');
  if (!Array.isArray(value.parties) || value.parties.some((item) => !isParty(item))) issues.push('parties');
  if (!Array.isArray(value.claims) || value.claims.some((item) => !isClaim(item))) issues.push('claims');
  if (!Array.isArray(value.judgmentItems) || value.judgmentItems.some((item) => !isJudgmentItem(item))) issues.push('judgmentItems');
  if (!Array.isArray(value.claimResolutions) || value.claimResolutions.some((item) => !isClaimResolution(item))) issues.push('claimResolutions');
  if (!['employee', 'employer', 'unknown'].includes(value.applicantRole as string)) issues.push('applicantRole');
  if (!SEMANTIC_OUTCOME_STATUSES.includes(value.applicantOutcome as OutcomeStatus)) issues.push('applicantOutcome');
  if (!SEMANTIC_OUTCOME_STATUSES.includes(value.employeeOutcome as OutcomeStatus)) issues.push('employeeOutcome');
  if (!SEMANTIC_OUTCOME_STATUSES.includes(value.employerOutcome as OutcomeStatus)) issues.push('employerOutcome');
  if (!isFiniteNumberInRange(value.confidence, 0, 1)) issues.push('confidence');
  if (value.unresolvedReasonCodes !== undefined
    && (!isStringArray(value.unresolvedReasonCodes)
      || value.unresolvedReasonCodes.some((code) => !SEMANTIC_REASON_CODES.includes(code as SemanticReasonCode)))) {
    issues.push('unresolvedReasonCodes');
  }
  if (value.resolverErrorCode !== undefined
    && !SEMANTIC_RESOLVER_ERROR_CODES.includes(value.resolverErrorCode as SemanticResolverErrorCode)) {
    issues.push('resolverErrorCode');
  }
  return issues;
};

/** Strict, offline validation for the future LLM result contract. */
export const parseSemanticResolutionResult = (value: unknown): SemanticResolutionResult => {
  if (!isPlainObject(value)) throw new SemanticSchemaError(['result_not_object']);
  const issues = issuesFor(value);
  if (issues.length > 0) throw new SemanticSchemaError(issues.map((issue) => `result_${issue}`));
  return value as unknown as SemanticResolutionResult;
};
