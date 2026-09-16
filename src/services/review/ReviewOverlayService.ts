import type {
  AnalysisCaseRecord,
  ClaimSupportStatus,
  LaborInfoClaimItem,
  LaborRole,
  LegalOutcomeType,
  LlmReviewCandidateInput,
  OutcomeReviewItem,
  ReviewOverlay,
  ReviewOverlayValues,
} from '../../types';
import { outcomeReviewEvidence, outcomeReviewItemId } from '../outcome/OutcomeReviewQueue';
import { aggregateClaimOutcomes } from '../outcome/ClaimOutcomeResolver';

export const reviewOverlayStorageKey = 'labor-analysis-review-overlays-v1';
export const reviewOverlaySchemaVersion = 'review-overlay-v1' as const;

const LEGAL_OUTCOMES: readonly LegalOutcomeType[] = [
  'supported', 'partially_supported', 'not_supported', 'unclear',
];
const LABOR_ROLES: readonly LaborRole[] = ['employee', 'employer', 'other', 'unknown'];
const EVIDENCE_KEYS = [
  'claimText', 'dispositionText', 'reasoningText', 'partyText', 'amountText', 'diagnosticText',
] as const;

export type BuildReviewOverlayDraftInput = Omit<ReviewOverlay, 'id' | 'status' | 'updatedAt' | 'schemaVersion'> & {
  id?: string;
  updatedAt?: string;
};

export interface ReviewOverlayImpactSummary {
  totalOverlays: number;
  draftCount: number;
  acceptedCount: number;
  rejectedCount: number;
  affectedCaseCount: number;
  affectedClaimCount: number;
  outcomeChangeCount: number;
}

export interface ReviewOverlayOutcomeStats {
  totalCases: number;
  totalClaims: number;
  byOutcome: Record<LegalOutcomeType, number>;
}

function defaultReviewStorage(): Storage | undefined {
  try {
    return typeof globalThis !== 'undefined' ? globalThis.localStorage : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneValues(values: ReviewOverlayValues): ReviewOverlayValues {
  return {
    ...(values.outcome !== undefined ? { outcome: values.outcome } : {}),
    ...(values.claimType !== undefined ? { claimType: values.claimType } : {}),
    ...(values.claimantRole !== undefined ? { claimantRole: values.claimantRole } : {}),
    ...(values.beneficiaryRole !== undefined ? { beneficiaryRole: values.beneficiaryRole } : {}),
    ...(values.requestedAmount !== undefined ? { requestedAmount: values.requestedAmount } : {}),
    ...(values.awardedAmount !== undefined ? { awardedAmount: values.awardedAmount } : {}),
  };
}

function cloneEvidence(evidence: ReviewOverlay['evidence']): ReviewOverlay['evidence'] {
  return {
    ...(evidence.claimText !== undefined ? { claimText: evidence.claimText } : {}),
    ...(evidence.dispositionText !== undefined ? { dispositionText: evidence.dispositionText } : {}),
    ...(evidence.reasoningText !== undefined ? { reasoningText: evidence.reasoningText } : {}),
    ...(evidence.partyText !== undefined ? { partyText: evidence.partyText } : {}),
    ...(evidence.amountText !== undefined ? { amountText: evidence.amountText } : {}),
    ...(evidence.diagnosticText !== undefined ? { diagnosticText: evidence.diagnosticText } : {}),
  };
}

function overlayIdentity(input: Pick<ReviewOverlay, 'analysisRunId' | 'caseId' | 'reviewItemId' | 'claimId' | 'target'>): string {
  return [input.analysisRunId, input.caseId, input.reviewItemId, input.claimId || 'case', input.target].join('::');
}

/**
 * Builds a local draft without reading the clock or generating randomness.
 * Callers can provide their own id/time source, keeping this helper pure and
 * making draft creation deterministic in tests and offline runtimes.
 */
export function buildReviewOverlayDraft(input: BuildReviewOverlayDraftInput): ReviewOverlay {
  const createdAt = input.createdAt?.trim();
  if (!createdAt) throw new Error('ReviewOverlay createdAt is required');
  const updatedAt = input.updatedAt?.trim() || createdAt;
  const id = input.id?.trim() || overlayIdentity(input);
  if (!id) throw new Error('ReviewOverlay id is required');
  return {
    id,
    analysisRunId: input.analysisRunId,
    caseId: input.caseId,
    reviewItemId: input.reviewItemId,
    ...(input.claimId !== undefined ? { claimId: input.claimId } : {}),
    target: input.target,
    original: cloneValues(input.original),
    reviewed: cloneValues(input.reviewed),
    evidence: cloneEvidence(input.evidence),
    source: input.source,
    status: 'draft',
    ...(input.note !== undefined ? { note: input.note } : {}),
    createdAt,
    updatedAt,
    schemaVersion: reviewOverlaySchemaVersion,
  };
}

function validOptionalString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

function validValues(value: unknown): value is ReviewOverlayValues {
  if (!isRecord(value)) return false;
  if (value.outcome !== undefined && value.outcome !== null
    && !LEGAL_OUTCOMES.includes(value.outcome as LegalOutcomeType)) return false;
  for (const key of ['claimantRole', 'beneficiaryRole'] as const) {
    if (value[key] !== undefined && value[key] !== null
      && !LABOR_ROLES.includes(value[key] as LaborRole)) return false;
  }
  for (const key of ['requestedAmount', 'awardedAmount'] as const) {
    if (value[key] !== undefined && value[key] !== null
      && (typeof value[key] !== 'number' || !Number.isFinite(value[key] as number))) return false;
  }
  return validOptionalString(value.claimType);
}

function validEvidence(value: unknown): value is ReviewOverlay['evidence'] {
  if (!isRecord(value)) return false;
  return EVIDENCE_KEYS.every((key) => value[key] === undefined || typeof value[key] === 'string');
}

/** Runtime guard for persisted or future provider-produced overlays. */
export function validateReviewOverlay(value: unknown): value is ReviewOverlay {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== reviewOverlaySchemaVersion
    || typeof value.id !== 'string' || !value.id.trim()
    || typeof value.analysisRunId !== 'string' || !value.analysisRunId.trim()
    || typeof value.caseId !== 'string' || !value.caseId.trim()
    || typeof value.reviewItemId !== 'string' || !value.reviewItemId.trim()) return false;
  if (value.claimId !== undefined && value.claimId !== null && typeof value.claimId !== 'string') return false;
  if (!['case', 'claim', 'outcome', 'amount', 'party', 'evidence'].includes(value.target as string)) return false;
  if (!validValues(value.original) || !validValues(value.reviewed) || !validEvidence(value.evidence)) return false;
  if (value.source !== 'human' && value.source !== 'llm_validated') return false;
  if (!['draft', 'accepted', 'rejected'].includes(value.status as string)) return false;
  if (typeof value.createdAt !== 'string' || !value.createdAt.trim()
    || typeof value.updatedAt !== 'string' || !value.updatedAt.trim()) return false;
  return value.note === undefined || typeof value.note === 'string';
}

export function readReviewOverlays(storage: Storage | undefined = defaultReviewStorage()): ReviewOverlay[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(reviewOverlayStorageKey) || '[]');
    return Array.isArray(parsed) ? parsed.filter(validateReviewOverlay) : [];
  } catch {
    return [];
  }
}

export function writeReviewOverlays(
  overlays: ReviewOverlay[],
  storage: Storage | undefined = defaultReviewStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(reviewOverlayStorageKey, JSON.stringify(overlays.filter(validateReviewOverlay)));
  } catch {
    // Review drafts are optional local state and must never break the app.
  }
}

export function saveReviewOverlay(
  overlay: ReviewOverlay,
  storage: Storage | undefined = defaultReviewStorage(),
): boolean {
  if (!validateReviewOverlay(overlay)) return false;
  const overlays = readReviewOverlays(storage);
  const next = [...overlays.filter((item) => item.id !== overlay.id), overlay];
  writeReviewOverlays(next, storage);
  return true;
}

function compareRecency(left: ReviewOverlay, right: ReviewOverlay): number {
  return left.updatedAt.localeCompare(right.updatedAt)
    || left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id);
}

function acceptedOverlays(overlays: ReviewOverlay[], analysisRunId?: string): ReviewOverlay[] {
  return overlays
    .filter((overlay) => validateReviewOverlay(overlay)
      && overlay.status === 'accepted'
      && (!analysisRunId || overlay.analysisRunId === analysisRunId))
    .sort(compareRecency);
}

function latestClaimOverlay(claim: LaborInfoClaimItem, overlays: ReviewOverlay[]): ReviewOverlay | undefined {
  if (!claim.id) return undefined;
  return overlays
    .filter((overlay) => overlay.claimId === claim.id && overlay.reviewed.outcome !== undefined)
    .sort(compareRecency)
    .at(-1);
}

/** Returns the explicitly reviewed outcome, or the immutable rule outcome. */
export function getReviewedOutcomeForClaim(
  claim: LaborInfoClaimItem,
  overlays: ReviewOverlay[],
): ClaimSupportStatus {
  return latestClaimOverlay(claim, acceptedOverlays(overlays))?.reviewed.outcome || claim.supportStatus;
}

function optionalValue<T extends keyof ReviewOverlayValues>(
  values: ReviewOverlayValues,
  key: T,
): ReviewOverlayValues[T] | undefined {
  return values[key];
}

function applyOverlayToClaim(claim: LaborInfoClaimItem, overlay: ReviewOverlay): LaborInfoClaimItem {
  const reviewed = overlay.reviewed;
  const next: LaborInfoClaimItem = { ...claim };
  const outcome = optionalValue(reviewed, 'outcome');
  const claimType = optionalValue(reviewed, 'claimType');
  const claimantRole = optionalValue(reviewed, 'claimantRole');
  const requestedAmount = optionalValue(reviewed, 'requestedAmount');
  const awardedAmount = optionalValue(reviewed, 'awardedAmount');
  if (outcome !== undefined && outcome !== null) next.supportStatus = outcome;
  if (claimType !== undefined) next.claimType = claimType || undefined;
  if (claimantRole !== undefined && claimantRole !== null) {
    next.claimant = claimantRole;
    next.claimantRole = claimantRole;
  }
  if (requestedAmount !== undefined) next.requestedAmount = requestedAmount ?? undefined;
  if (awardedAmount !== undefined) next.awardedAmount = awardedAmount ?? undefined;
  return next;
}

function setRoleOutcome(
  record: AnalysisCaseRecord,
  role: LaborRole,
  outcome: LegalOutcomeType,
): AnalysisCaseRecord {
  if (role === 'employee') {
    return {
      ...record,
      employeeOutcome: outcome,
      ...(record.applicantRole === 'employee' ? { applicantOutcome: outcome, overallResult: outcome } : {}),
    };
  }
  if (role === 'employer') {
    return {
      ...record,
      employerOutcome: outcome,
      ...(record.applicantRole === 'employer' ? { applicantOutcome: outcome, overallResult: outcome } : {}),
    };
  }
  return record;
}

/**
 * Purely derives a reviewed projection. Only accepted overlays are applied;
 * original records and their nested claims are never mutated. When timestamps
 * tie, id is the deterministic final tie-breaker (latest-wins).
 */
export function applyAcceptedReviewOverlays(
  records: AnalysisCaseRecord[],
  overlays: ReviewOverlay[],
  analysisRunId?: string,
): AnalysisCaseRecord[] {
  const accepted = acceptedOverlays(Array.isArray(overlays) ? overlays : [], analysisRunId);
  if (accepted.length === 0) return records;
  return records.map((record) => {
    const recordOverlays = accepted.filter((overlay) => overlay.caseId === record.caseId);
    if (recordOverlays.length === 0) return record;
    const changedRoles = new Set<LaborRole>();
    const claims = (record.claims || []).map((claim) => {
      const matching = recordOverlays
        .filter((overlay) => overlay.claimId && overlay.claimId === claim.id)
        .sort(compareRecency);
      const latest = matching.at(-1);
      if (!latest) return claim;
      const next = applyOverlayToClaim(claim, latest);
      if (next.supportStatus !== claim.supportStatus || next.claimantRole !== claim.claimantRole
        || next.claimant !== claim.claimant) {
        changedRoles.add(claim.claimantRole ?? claim.claimant);
        changedRoles.add(next.claimantRole ?? next.claimant);
      }
      return next;
    });
    let nextRecord: AnalysisCaseRecord = { ...record, claims };
    for (const role of changedRoles) {
      if (role !== 'employee' && role !== 'employer') continue;
      const roleClaims = claims.filter((claim) => (claim.claimantRole ?? claim.claimant) === role);
      const current = role === 'employee' ? nextRecord.employeeOutcome : nextRecord.employerOutcome;
      nextRecord = setRoleOutcome(nextRecord, role, aggregateClaimOutcomes(roleClaims, current));
    }
    for (const overlay of recordOverlays
      .filter((item) => !item.claimId && (item.target === 'case' || item.target === 'outcome') && item.reviewed.outcome)
      .sort(compareRecency)) {
      const role = overlay.reviewed.claimantRole ?? overlay.original.claimantRole;
      if (role === 'employee' || role === 'employer') {
        nextRecord = setRoleOutcome(nextRecord, role, overlay.reviewed.outcome as LegalOutcomeType);
      }
    }
    return nextRecord;
  });
}

export function summarizeReviewOverlayImpact(
  records: AnalysisCaseRecord[],
  overlays: ReviewOverlay[],
  analysisRunId?: string,
): ReviewOverlayImpactSummary {
  const safe = (Array.isArray(overlays) ? overlays : []).filter((overlay) => validateReviewOverlay(overlay)
    && (!analysisRunId || overlay.analysisRunId === analysisRunId));
  const accepted = safe.filter((overlay) => overlay.status === 'accepted');
  const recordCaseIds = new Set((Array.isArray(records) ? records : []).map((record) => record.caseId));
  const affectedCases = new Set(accepted.filter((overlay) => recordCaseIds.has(overlay.caseId)).map((overlay) => overlay.caseId));
  const affectedClaims = new Set(accepted
    .filter((overlay) => overlay.claimId && recordCaseIds.has(overlay.caseId))
    .map((overlay) => `${overlay.caseId}::${overlay.claimId}`));
  const outcomeChanges = accepted.filter((overlay) => (
    overlay.reviewed.outcome !== undefined && overlay.reviewed.outcome !== overlay.original.outcome
  )).length;
  return {
    totalOverlays: safe.length,
    draftCount: safe.filter((overlay) => overlay.status === 'draft').length,
    acceptedCount: accepted.length,
    rejectedCount: safe.filter((overlay) => overlay.status === 'rejected').length,
    affectedCaseCount: affectedCases.size,
    affectedClaimCount: affectedClaims.size,
    outcomeChangeCount: outcomeChanges,
  };
}

export function buildLlmReviewCandidateInput(item: OutcomeReviewItem): LlmReviewCandidateInput {
  return {
    reviewItemId: outcomeReviewItemId(item),
    caseId: item.caseId,
    claimId: item.claimId ?? null,
    currentOutcome: item.outcome,
    reasonCode: item.reasonCode || 'unknown',
    evidence: cloneEvidence(outcomeReviewEvidence(item)),
  };
}

function outcomeStats(records: AnalysisCaseRecord[]): ReviewOverlayOutcomeStats {
  const byOutcome: Record<LegalOutcomeType, number> = {
    supported: 0,
    partially_supported: 0,
    not_supported: 0,
    unclear: 0,
  };
  const claims = (Array.isArray(records) ? records : []).flatMap((record) => record.claims || []);
  for (const claim of claims) {
    const status = LEGAL_OUTCOMES.includes(claim.supportStatus) ? claim.supportStatus : 'unclear';
    byOutcome[status] += 1;
  }
  return { totalCases: Array.isArray(records) ? records.length : 0, totalClaims: claims.length, byOutcome };
}

/** Default analytics remains rule-only; reviewed mode must be explicitly requested. */
export function computeRuleOnlyStats(records: AnalysisCaseRecord[]): ReviewOverlayOutcomeStats {
  return outcomeStats(records);
}

export function computeReviewedStats(
  records: AnalysisCaseRecord[],
  overlays: ReviewOverlay[],
  analysisRunId?: string,
): ReviewOverlayOutcomeStats {
  return outcomeStats(applyAcceptedReviewOverlays(records, overlays, analysisRunId));
}
