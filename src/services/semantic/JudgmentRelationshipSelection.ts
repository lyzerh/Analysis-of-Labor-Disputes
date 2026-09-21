import type { SourceEvidence, SemanticTaskClaim } from './SemanticResult';

export type JudgmentRelationshipSelectionStatus = 'selected' | 'unresolved';

export type JudgmentRelationshipUnresolvedReasonCode =
  | 'judgment_scope_unclear'
  | 'conflicting_judgment_candidates'
  | 'insufficient_context'
  | 'appellate_dependency';

export interface JudgmentRelationshipSelectionTask {
  caseId: string;
  targetClaim: Pick<SemanticTaskClaim, 'id' | 'claimType' | 'claimText' | 'requestedAmount'> & {
    claimLabel?: string;
  };
  candidateJudgmentItems: Array<{ id: string; text: string }>;
  judgmentDispositionText?: string;
  judgmentReasoningText?: string;
  focusedSourceText?: string;
  caseLevel?: string;
  proceduralRole?: string;
  partyRole?: string;
}

export interface JudgmentRelationshipSelectionResult {
  status: JudgmentRelationshipSelectionStatus;
  claimId: string;
  selectedJudgmentItemIds: string[];
  confidence: number;
  sourceEvidence: SourceEvidence[];
  unresolvedReasonCodes: JudgmentRelationshipUnresolvedReasonCode[];
}

export const JUDGMENT_RELATIONSHIP_SELECTION_JSON_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'status', 'claimId', 'selectedJudgmentItemIds', 'confidence', 'sourceEvidence', 'unresolvedReasonCodes',
  ],
  properties: {
    status: { type: 'string', enum: ['selected', 'unresolved'] },
    claimId: { type: 'string' },
    selectedJudgmentItemIds: { type: 'array', items: { type: 'string' } },
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
      items: {
        type: 'string',
        enum: [
          'judgment_scope_unclear',
          'conflicting_judgment_candidates',
          'insufficient_context',
          'appellate_dependency',
        ],
      },
    },
  },
} as const);

type PlainObject = Record<string, unknown>;

const isObject = (value: unknown): value is PlainObject => Boolean(value)
  && typeof value === 'object' && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isEvidence = (value: unknown): value is SourceEvidence => {
  if (!isObject(value) || !isNonEmptyString(value.text)) return false;
  const keys = Object.keys(value);
  if (keys.some((key) => !['text', 'start', 'end'].includes(key))) return false;
  if (value.start !== undefined && (!Number.isInteger(value.start) || (value.start as number) < 0)) return false;
  if (value.end !== undefined && (!Number.isInteger(value.end) || (value.end as number) < 0)) return false;
  return value.start === undefined || value.end === undefined || (value.end as number) >= (value.start as number);
};

const isReasonCode = (value: unknown): value is JudgmentRelationshipUnresolvedReasonCode =>
  ['judgment_scope_unclear', 'conflicting_judgment_candidates', 'insufficient_context', 'appellate_dependency']
    .includes(value as string);

export const parseJudgmentRelationshipSelectionResult = (
  raw: unknown,
): JudgmentRelationshipSelectionResult => {
  if (!isObject(raw)
    || Object.keys(raw).some((key) => ![
      'status', 'claimId', 'selectedJudgmentItemIds', 'confidence', 'sourceEvidence', 'unresolvedReasonCodes',
    ].includes(key))
    || (raw.status !== 'selected' && raw.status !== 'unresolved')
    || !isNonEmptyString(raw.claimId)
    || !Array.isArray(raw.selectedJudgmentItemIds)
    || raw.selectedJudgmentItemIds.some((id) => !isNonEmptyString(id))
    || typeof raw.confidence !== 'number'
    || !Number.isFinite(raw.confidence)
    || raw.confidence < 0 || raw.confidence > 1
    || !Array.isArray(raw.sourceEvidence)
    || raw.sourceEvidence.some((item) => !isEvidence(item))
    || !Array.isArray(raw.unresolvedReasonCodes)
    || raw.unresolvedReasonCodes.some((code) => !isReasonCode(code))) {
    throw new Error('Invalid JudgmentRelationshipSelectionResult');
  }
  return raw as unknown as JudgmentRelationshipSelectionResult;
};

export const buildJudgmentRelationshipSelectionPrompt = (
  task: JudgmentRelationshipSelectionTask,
): { system: string; user: string } => ({
  system: `You are a judgment relationship selector for a labor-dispute semantic pipeline.
You are not deciding whether the claim is supported, partially supported, or rejected.
Your only task is to identify which existing judgment item or items determine the disposition of the supplied target claim.
Select only IDs from candidateJudgmentItems. Do not classify outcome. Do not analyze other claims.
Do not create new claims or judgment items. A global or residual judgment item may be selected when its scope clearly covers this target claim.
A judgment item may be selected for more than one claim in separate calls. If the relationship cannot be established reliably, return unresolved.
Return exactly one JSON object matching the supplied strict schema. The object has no outcome, supportStatus, applicantOutcome, employeeOutcome, employerOutcome, or claimResolutions field.
Return JSON only; do not include markdown or chain-of-thought.`,
  user: `Stage 1 target task:\n${JSON.stringify(task)}`,
});

export const JUDGMENT_RELATIONSHIP_SELECTION_CONFIDENCE_THRESHOLD = 0.9;

export interface JudgmentRelationshipSelectionContractResult {
  valid: boolean;
  reasonCodes: string[];
}

export const validateJudgmentRelationshipSelectionContract = (
  task: JudgmentRelationshipSelectionTask,
  result: JudgmentRelationshipSelectionResult,
): JudgmentRelationshipSelectionContractResult => {
  const reasons: string[] = [];
  if (result.claimId !== task.targetClaim.id) reasons.push('claim_id_mismatch');
  const candidateIds = new Set(task.candidateJudgmentItems.map((item) => item.id));
  result.selectedJudgmentItemIds.forEach((id) => {
    if (!candidateIds.has(id)) reasons.push('unknown_judgment_item_id');
  });
  if (new Set(result.selectedJudgmentItemIds).size !== result.selectedJudgmentItemIds.length) {
    reasons.push('duplicate_selected_judgment_item_id');
  }
  if (result.status === 'selected' && result.selectedJudgmentItemIds.length === 0) {
    reasons.push('selected_ids_empty');
  }
  if (result.status === 'selected' && result.unresolvedReasonCodes.length > 0) {
    reasons.push('selected_unresolved_reason_conflict');
  }
  if (result.status === 'unresolved' && result.unresolvedReasonCodes.length === 0) {
    reasons.push('unresolved_reason_missing');
  }
  return { valid: reasons.length === 0, reasonCodes: [...new Set(reasons)] };
};

export interface JudgmentRelationshipSelectionAuditResult {
  decision: 'pass' | 'fail';
  reasonCodes: string[];
  confidenceThreshold: number;
}

export const auditJudgmentRelationshipSelection = (
  task: JudgmentRelationshipSelectionTask,
  result: JudgmentRelationshipSelectionResult,
): JudgmentRelationshipSelectionAuditResult => {
  const reasons = new Set<string>();
  const contract = validateJudgmentRelationshipSelectionContract(task, result);
  contract.reasonCodes.forEach((reason) => reasons.add(reason));
  if (result.confidence < JUDGMENT_RELATIONSHIP_SELECTION_CONFIDENCE_THRESHOLD) {
    reasons.add('confidence_below_admission_threshold');
  }
  const sourceText = [
    task.focusedSourceText,
    task.judgmentDispositionText,
    task.judgmentReasoningText,
    ...task.candidateJudgmentItems.map((item) => item.text),
  ].filter((value): value is string => Boolean(value));
  result.sourceEvidence.forEach((evidence) => {
    if (!sourceText.some((text) => text.includes(evidence.text.trim()))) reasons.add('source_evidence_not_found');
  });
  return {
    decision: reasons.size === 0 ? 'pass' : 'fail',
    reasonCodes: [...reasons],
    confidenceThreshold: JUDGMENT_RELATIONSHIP_SELECTION_CONFIDENCE_THRESHOLD,
  };
};
