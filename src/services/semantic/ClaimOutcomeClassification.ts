import type { SourceEvidence, SemanticTaskClaim } from './SemanticResult';

export type ClaimOutcomeClassificationStatus = 'classified' | 'unresolved';
export type ClaimOutcomeClassificationOutcome = 'supported' | 'partially_supported' | 'not_supported' | 'unclear';

export type ClaimOutcomeUnresolvedReasonCode =
  | 'disposition_semantics_unclear'
  | 'amount_relationship_unclear'
  | 'conflicting_disposition';

export interface ClaimOutcomeClassificationTask {
  caseId: string;
  targetClaim: Pick<SemanticTaskClaim, 'id' | 'claimType' | 'claimText' | 'requestedAmount'> & {
    claimLabel?: string;
  };
  selectedJudgmentItems: Array<{ id: string; text: string }>;
  judgmentDispositionText?: string;
  judgmentReasoningText?: string;
}

export interface ClaimOutcomeClassificationResult {
  status: ClaimOutcomeClassificationStatus;
  claimId: string;
  judgmentItemIds: string[];
  outcome: ClaimOutcomeClassificationOutcome;
  confidence: number;
  sourceEvidence: SourceEvidence[];
  unresolvedReasonCodes: ClaimOutcomeUnresolvedReasonCode[];
}

export const CLAIM_OUTCOME_CLASSIFICATION_JSON_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'status', 'claimId', 'judgmentItemIds', 'outcome', 'confidence', 'sourceEvidence', 'unresolvedReasonCodes',
  ],
  properties: {
    status: { type: 'string', enum: ['classified', 'unresolved'] },
    claimId: { type: 'string' },
    judgmentItemIds: { type: 'array', items: { type: 'string' } },
    outcome: { type: 'string', enum: ['supported', 'partially_supported', 'not_supported', 'unclear'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    sourceEvidence: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text'],
        properties: {
          text: { type: 'string' },
          start: { type: 'integer', minimum: 0 },
          end: { type: 'integer', minimum: 0 },
        },
      },
    },
    unresolvedReasonCodes: {
      type: 'array',
      items: { type: 'string', enum: ['disposition_semantics_unclear', 'amount_relationship_unclear', 'conflicting_disposition'] },
    },
  },
} as const);

type PlainObject = Record<string, unknown>;
const isObject = (value: unknown): value is PlainObject => Boolean(value)
  && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const outcomeValues: readonly ClaimOutcomeClassificationOutcome[] = ['supported', 'partially_supported', 'not_supported', 'unclear'];
const reasonValues: readonly ClaimOutcomeUnresolvedReasonCode[] = ['disposition_semantics_unclear', 'amount_relationship_unclear', 'conflicting_disposition'];

const isEvidence = (value: unknown): value is SourceEvidence => {
  if (!isObject(value) || !isNonEmptyString(value.text)) return false;
  if (Object.keys(value).some((key) => !['text', 'start', 'end'].includes(key))) return false;
  if (value.start !== undefined && (!Number.isInteger(value.start) || (value.start as number) < 0)) return false;
  if (value.end !== undefined && (!Number.isInteger(value.end) || (value.end as number) < 0)) return false;
  return value.start === undefined || value.end === undefined || (value.end as number) >= (value.start as number);
};

export const parseClaimOutcomeClassificationResult = (raw: unknown): ClaimOutcomeClassificationResult => {
  if (!isObject(raw)
    || Object.keys(raw).some((key) => ![
      'status', 'claimId', 'judgmentItemIds', 'outcome', 'confidence', 'sourceEvidence', 'unresolvedReasonCodes',
    ].includes(key))
    || (raw.status !== 'classified' && raw.status !== 'unresolved')
    || !isNonEmptyString(raw.claimId)
    || !Array.isArray(raw.judgmentItemIds)
    || raw.judgmentItemIds.some((id) => !isNonEmptyString(id))
    || !outcomeValues.includes(raw.outcome as ClaimOutcomeClassificationOutcome)
    || typeof raw.confidence !== 'number'
    || !Number.isFinite(raw.confidence) || raw.confidence < 0 || raw.confidence > 1
    || !Array.isArray(raw.sourceEvidence) || raw.sourceEvidence.some((item) => !isEvidence(item))
    || !Array.isArray(raw.unresolvedReasonCodes)
    || raw.unresolvedReasonCodes.some((reason) => !reasonValues.includes(reason as ClaimOutcomeUnresolvedReasonCode))) {
    throw new Error('Invalid ClaimOutcomeClassificationResult');
  }
  return raw as unknown as ClaimOutcomeClassificationResult;
};

export const buildClaimOutcomeClassificationPrompt = (
  task: ClaimOutcomeClassificationTask,
): { system: string; user: string } => ({
  system: `You are Stage 2 of a labor-dispute semantic pipeline.
You are given a target claim and judgment items that are already known to apply to that claim.
Do not decide whether these judgment items are related to the claim; that relationship is already established.
Your only task is to classify how the supplied judgment items dispose of the target claim.
Direct grant means supported; direct rejection means not_supported; a clearly lower award or partial scope means partially_supported.
If the supplied wording is insufficient or conflicting, return unresolved with outcome unclear.
Do not select new judgment items. Do not analyze other claims. Do not create new IDs.
Use only the supplied judgmentItemIds. Return exactly one JSON object matching the strict schema. Do not output parties, applicantOutcome, employeeOutcome, employerOutcome, claimResolutions, or any outcome for another claim.
Return JSON only; do not include markdown or chain-of-thought.`,
  user: `Stage 2 target task:\n${JSON.stringify(task)}`,
});

/** Diagnostic-only Stage 2 experiment policy; not the production admission gate. */
export const CLAIM_OUTCOME_CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.9;

export interface ClaimOutcomeClassificationContractResult {
  valid: boolean;
  reasonCodes: string[];
}

export const validateClaimOutcomeClassificationContract = (
  task: ClaimOutcomeClassificationTask,
  result: ClaimOutcomeClassificationResult,
): ClaimOutcomeClassificationContractResult => {
  const reasons: string[] = [];
  if (result.claimId !== task.targetClaim.id) reasons.push('claim_id_mismatch');
  const suppliedIds = new Set(task.selectedJudgmentItems.map((item) => item.id));
  result.judgmentItemIds.forEach((id) => {
    if (!suppliedIds.has(id)) reasons.push('unknown_judgment_item_id');
  });
  if (new Set(result.judgmentItemIds).size !== result.judgmentItemIds.length) reasons.push('duplicate_judgment_item_id');
  if (result.status === 'classified' && result.outcome === 'unclear') reasons.push('classified_outcome_unclear');
  if (result.status === 'classified' && result.sourceEvidence.length === 0) reasons.push('classified_evidence_missing');
  if (result.status === 'unresolved' && result.outcome !== 'unclear') reasons.push('unresolved_outcome_not_unclear');
  if (result.status === 'unresolved' && result.unresolvedReasonCodes.length === 0) reasons.push('unresolved_reason_missing');
  return { valid: reasons.length === 0, reasonCodes: [...new Set(reasons)] };
};

export interface ClaimOutcomeClassificationAuditResult {
  decision: 'pass' | 'fail';
  reasonCodes: string[];
  confidenceThreshold: number;
}

export const auditClaimOutcomeClassification = (
  task: ClaimOutcomeClassificationTask,
  result: ClaimOutcomeClassificationResult,
): ClaimOutcomeClassificationAuditResult => {
  const reasons = new Set<string>();
  validateClaimOutcomeClassificationContract(task, result).reasonCodes.forEach((reason) => reasons.add(reason));
  if (result.confidence < CLAIM_OUTCOME_CLASSIFICATION_CONFIDENCE_THRESHOLD) reasons.add('confidence_below_admission_threshold');
  const context = [
    task.judgmentDispositionText,
    task.judgmentReasoningText,
    ...task.selectedJudgmentItems.map((item) => item.text),
  ].filter((value): value is string => Boolean(value));
  result.sourceEvidence.forEach((evidence) => {
    if (!context.some((text) => text.includes(evidence.text.trim()))) reasons.add('source_evidence_not_found');
  });
  return {
    decision: reasons.size === 0 ? 'pass' : 'fail',
    reasonCodes: [...reasons],
    confidenceThreshold: CLAIM_OUTCOME_CLASSIFICATION_CONFIDENCE_THRESHOLD,
  };
};
