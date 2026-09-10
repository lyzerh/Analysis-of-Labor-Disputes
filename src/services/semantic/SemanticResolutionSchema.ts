import type {
  CourtTreatment,
  SemanticReasoningType,
  SemanticResolutionInput,
} from './types';

export const SEMANTIC_COURT_TREATMENTS: readonly CourtTreatment[] = [
  'accepted',
  'partially_accepted',
  'rejected',
  'not_addressed',
  'unclear',
];

export const SEMANTIC_REASONING_TYPES: readonly SemanticReasoningType[] = [
  'ordinal_reference',
  'multi_claim_reference',
  'remaining_claims',
  'anaphora',
  'cross_sentence',
  'appeal_mapping',
  'other',
];

export interface SemanticResolutionWireCandidate {
  fragmentId: string;
  referencedClaimIds: string[];
  courtTreatment: CourtTreatment;
  confidence: number;
  sourceText: string;
  reasoningType: SemanticReasoningType;
  resolutionMethod: 'llm';
}

export interface SemanticResolutionResponse {
  candidates: SemanticResolutionWireCandidate[];
}

export const SEMANTIC_RESPONSE_JSON_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['candidates'],
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'fragmentId',
          'referencedClaimIds',
          'courtTreatment',
          'confidence',
          'sourceText',
          'reasoningType',
          'resolutionMethod',
        ],
        properties: {
          fragmentId: { type: 'string' },
          referencedClaimIds: {
            type: 'array',
            minItems: 1,
            items: { type: 'string' },
          },
          courtTreatment: { type: 'string', enum: [...SEMANTIC_COURT_TREATMENTS] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          sourceText: { type: 'string' },
          reasoningType: { type: 'string', enum: [...SEMANTIC_REASONING_TYPES] },
          resolutionMethod: { type: 'string', enum: ['llm'] },
        },
      },
    },
  },
});

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const hasOnlyKeys = (value: Record<string, unknown>, allowed: readonly string[]): boolean =>
  Object.keys(value).every((key) => allowed.includes(key));

const isStringArray = (value: unknown, allowEmpty = true): value is string[] =>
  Array.isArray(value)
  && (allowEmpty || value.length > 0)
  && value.every((item) => typeof item === 'string');

export class SemanticSchemaError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Semantic response schema invalid: ${issues.join(', ')}`);
    this.name = 'SemanticSchemaError';
  }
}

export const parseSemanticResolutionResponse = (value: unknown): SemanticResolutionResponse => {
  const issues: string[] = [];
  if (!isPlainObject(value)) throw new SemanticSchemaError(['response_not_object']);
  if (!hasOnlyKeys(value, ['candidates'])) issues.push('response_additional_properties');
  if (!Array.isArray(value.candidates)) issues.push('candidates_not_array');

  const candidates = Array.isArray(value.candidates) ? value.candidates : [];
  candidates.forEach((raw, index) => {
    const prefix = `candidates[${index}]`;
    if (!isPlainObject(raw)) {
      issues.push(`${prefix}_not_object`);
      return;
    }
    const allowed = [
      'fragmentId', 'referencedClaimIds', 'courtTreatment', 'confidence',
      'sourceText', 'reasoningType', 'resolutionMethod',
    ];
    if (!hasOnlyKeys(raw, allowed)) issues.push(`${prefix}_additional_properties`);
    if (typeof raw.fragmentId !== 'string' || !raw.fragmentId) issues.push(`${prefix}_fragmentId`);
    if (!isStringArray(raw.referencedClaimIds, false)) issues.push(`${prefix}_referencedClaimIds`);
    if (!SEMANTIC_COURT_TREATMENTS.includes(raw.courtTreatment as CourtTreatment)) issues.push(`${prefix}_courtTreatment`);
    if (typeof raw.confidence !== 'number' || !Number.isFinite(raw.confidence)
      || raw.confidence < 0 || raw.confidence > 1) issues.push(`${prefix}_confidence`);
    if (typeof raw.sourceText !== 'string') issues.push(`${prefix}_sourceText`);
    if (!SEMANTIC_REASONING_TYPES.includes(raw.reasoningType as SemanticReasoningType)) issues.push(`${prefix}_reasoningType`);
    if (raw.resolutionMethod !== 'llm') issues.push(`${prefix}_resolutionMethod`);
  });

  if (issues.length > 0) throw new SemanticSchemaError(issues);
  return value as unknown as SemanticResolutionResponse;
};

export const parseSemanticResolutionInput = (value: unknown): SemanticResolutionInput => {
  const issues: string[] = [];
  if (!isPlainObject(value)) throw new SemanticSchemaError(['input_not_object']);
  if (!hasOnlyKeys(value, ['caseId', 'claims', 'unresolvedFragments', 'judgmentItems'])) {
    issues.push('input_additional_properties');
  }
  if (typeof value.caseId !== 'string' || !value.caseId) issues.push('input_caseId');
  if (!Array.isArray(value.claims)) issues.push('input_claims');
  if (!Array.isArray(value.unresolvedFragments)) issues.push('input_unresolvedFragments');
  if (value.judgmentItems !== undefined && !Array.isArray(value.judgmentItems)) issues.push('input_judgmentItems');
  if (issues.length > 0) throw new SemanticSchemaError(issues);
  return value as unknown as SemanticResolutionInput;
};
