import type { AnalysisCaseRecord, ClaimSupportStatus, LaborRole } from '../../types';
import {
  buildClaimIdentity,
  claimIdentityStatus,
  findClaimForIdentity,
  type ClaimIdentity,
  type ClaimIdentityStatus,
} from './ClaimIdentity';

export type GoldOutcome = ClaimSupportStatus;
export type GoldCaseStatus = 'not_started' | 'in_progress' | 'completed';
export type GoldComparison = 'correct' | 'incorrect' | 'no_candidate' | 'unclear_gold';
export type ClaimExtractionStatus = 'correct' | 'wrong_type' | 'spurious' | 'duplicate' | 'uncertain';
export type ClaimAnalysisScope = 'substantive' | 'procedural';
export type GoldIdentityRepairStatus = 'repaired_ready_for_confirmation' | 'gold_rebind_required' | 'target_missing' | 'unresolved_identity';
export type GoldBindingStatus = 'bound' | 'repaired_ready_for_confirmation' | 'target_missing';
export function claimAnalysisScopeForType(claimType?: string): ClaimAnalysisScope {
  return claimType?.trim() === 'procedural_appeal' ? 'procedural' : 'substantive';
}

export interface GoldSetRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  description?: string;
  caseIds: string[];
}

export interface GoldIdentityBindingHistory {
  claimId?: string;
  identityStatus?: ClaimIdentityStatus;
  claimIdentityHash?: string;
  claimantPartyIds?: string[];
  claimantRole?: LaborRole;
  proceduralRoleContext?: string[];
  normalizedClaimText?: string;
  claimType?: string;
  requestedAmount?: number;
  currency?: string;
  claimSourceKind?: string;
  claimSourceField?: string;
}

export interface GoldClaimAnnotation {
  claimId: string;
  claimExtractionStatus?: ClaimExtractionStatus;
  goldOutcome?: GoldOutcome;
  notes?: string;
  /** Frozen identity captured when the claim is explicitly confirmed for Gold. */
  claimIdentityHash?: string;
  claimantPartyIds?: string[];
  claimantRole?: LaborRole;
  proceduralRoleContext?: string[];
  normalizedClaimText?: string;
  claimType?: string;
  requestedAmount?: number;
  currency?: string;
  claimSourceKind?: string;
  claimSourceField?: string;
  identityStatus?: ClaimIdentityStatus;
  repairStatus?: GoldIdentityRepairStatus;
  goldBindingStatus?: GoldBindingStatus;
  previousClaimId?: string;
  previousIdentityStatus?: ClaimIdentityStatus;
  previousClaimIdentityHash?: string;
  previousGoldIdentity?: GoldIdentityBindingHistory;
  rebindingReason?: string;
  reboundAt?: string;
}

export interface GoldCaseAnnotation {
  id: string;
  goldSetId: string;
  caseId: string;
  claimAnnotations: GoldClaimAnnotation[];
  updatedAt: string;
}

interface GoldState { sets: GoldSetRecord[]; annotations: GoldCaseAnnotation[]; }
export const GOLD_STORAGE_KEY = 'labor-analysis-gold-annotation-v1';
const emptyState = (): GoldState => ({ sets: [], annotations: [] });

function readState(storage: Storage | undefined = typeof window !== 'undefined' ? window.localStorage : undefined): GoldState {
  if (!storage) return emptyState();
  try {
    const value = JSON.parse(storage.getItem(GOLD_STORAGE_KEY) || '{}');
    return { sets: Array.isArray(value.sets) ? value.sets : [], annotations: Array.isArray(value.annotations) ? value.annotations : [] };
  } catch { return emptyState(); }
}
function writeState(state: GoldState, storage: Storage | undefined = typeof window !== 'undefined' ? window.localStorage : undefined): void {
  storage?.setItem(GOLD_STORAGE_KEY, JSON.stringify(state));
}
export function readGoldState(storage?: Storage): GoldState { return readState(storage); }
export function getActiveGoldSet(storage?: Storage): GoldSetRecord | undefined { return readState(storage).sets[0]; }
export function createGoldSet(name: string, description = '', storage?: Storage): GoldSetRecord {
  const now = new Date().toISOString();
  const set = { id: `gold-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: name.trim() || 'Competition Gold Set', description: description.trim() || undefined, createdAt: now, updatedAt: now, caseIds: [] };
  const state = readState(storage); state.sets.unshift(set); writeState(state, storage); return set;
}
export function updateGoldSet(set: GoldSetRecord, storage?: Storage): void {
  const state = readState(storage); state.sets = state.sets.map((item) => item.id === set.id ? { ...set, updatedAt: new Date().toISOString() } : item); writeState(state, storage);
}
export function addCaseToGoldSet(goldSetId: string, caseId: string, storage?: Storage): boolean {
  const state = readState(storage); const set = state.sets.find((item) => item.id === goldSetId); if (!set || set.caseIds.includes(caseId)) return false;
  set.caseIds = [...set.caseIds, caseId]; set.updatedAt = new Date().toISOString(); writeState(state, storage); return true;
}
export function removeCaseFromGoldSet(goldSetId: string, caseId: string, storage?: Storage): boolean {
  const state = readState(storage); const set = state.sets.find((item) => item.id === goldSetId); if (!set || !set.caseIds.includes(caseId)) return false;
  set.caseIds = set.caseIds.filter((id) => id !== caseId); set.updatedAt = new Date().toISOString();
  state.annotations = state.annotations.filter((item) => !(item.goldSetId === goldSetId && item.caseId === caseId)); writeState(state, storage); return true;
}
export function getGoldCaseAnnotation(goldSetId: string, caseId: string, storage?: Storage): GoldCaseAnnotation | undefined { return readState(storage).annotations.find((item) => item.goldSetId === goldSetId && item.caseId === caseId); }

export function getGoldClaimIdentity(
  record: AnalysisCaseRecord,
  claimId: string,
  annotation?: GoldCaseAnnotation,
): { current?: ClaimIdentity; annotation?: GoldClaimAnnotation; status: ClaimIdentityStatus } {
  const gold = annotation?.claimAnnotations.find((item) => item.claimId === claimId)
    || annotation?.claimAnnotations.find((item) => item.claimIdentityHash && findClaimForIdentity(record, claimId, item.claimIdentityHash));
  const claim = findClaimForIdentity(record, claimId, gold?.claimIdentityHash);
  const current = claim ? buildClaimIdentity(record, claim) : undefined;
  // Missing stored identity is intentionally not guessed from the current
  // parser output.  Existing records remain readable, but are explicitly
  // legacy_unverified until a reviewer confirms them.
  const status = !gold?.claimIdentityHash
    ? 'legacy_unverified'
    : claimIdentityStatus(gold.claimIdentityHash, current);
  return { current, annotation: gold, status };
}

export function getGoldClaimIdentityStatusForRecord(
  record: AnalysisCaseRecord | undefined,
  annotation: GoldClaimAnnotation | undefined,
): ClaimIdentityStatus {
  if (!annotation?.claimIdentityHash) return 'legacy_unverified';
  if (!record) return 'identity_missing';
  const claim = findClaimForIdentity(record, annotation.claimId, annotation.claimIdentityHash);
  return claimIdentityStatus(annotation.claimIdentityHash, claim ? buildClaimIdentity(record, claim) : undefined);
}

/**
 * Explicitly bind a legacy Gold annotation to the identity currently shown to
 * the reviewer.  This helper is intentionally opt-in: ordinary Gold saves do
 * not freeze identity, and an existing mismatch is never overwritten.
 */
export function freezeGoldClaimIdentity(
  record: AnalysisCaseRecord,
  annotation: GoldClaimAnnotation | undefined,
  claimId: string,
): GoldClaimAnnotation | undefined {
  // A claim explicitly marked as extraction-invalid is not a safe target for
  // identity confirmation.  Keep it legacy/unverified until a separate Gold
  // correction flow exists.
  if (['wrong_type', 'spurious', 'duplicate', 'uncertain'].includes(annotation?.claimExtractionStatus || '')) return annotation;
  const currentStatus = getGoldClaimIdentityStatusForRecord(record, annotation);
  if (currentStatus === 'identity_mismatch') return annotation;
  const claim = findClaimForIdentity(record, claimId, annotation?.claimIdentityHash);
  if (!claim) return annotation;
  const identity = buildClaimIdentity(record, claim);
  return {
    ...(annotation || { claimId }),
    claimId: annotation?.claimId || claimId,
    claimIdentityHash: identity.claimIdentityHash,
    claimantPartyIds: identity.claimantPartyIds,
    claimantRole: identity.claimantRole,
    proceduralRoleContext: identity.proceduralRoleContext,
    normalizedClaimText: identity.normalizedClaimText,
    claimType: identity.claimType,
    requestedAmount: identity.requestedAmount,
    currency: identity.currency,
    claimSourceKind: identity.sourceKind,
    claimSourceField: identity.sourceField,
    identityStatus: 'verified',
    repairStatus: undefined,
    goldBindingStatus: 'bound',
  };
}

/** Rebind a legacy Gold annotation only after a reviewer chooses a concrete
 * current claim. The old identity is copied into history; no outcome is
 * changed and the new binding remains unverified until explicit confirmation.
 */
export function rebindGoldClaimIdentity(
  record: AnalysisCaseRecord,
  annotation: GoldClaimAnnotation | undefined,
  targetClaimId: string,
  reason: string,
  reboundAt = new Date().toISOString(),
): GoldClaimAnnotation | undefined {
  if (!annotation) return undefined;
  const target = record.claims?.find((claim) => claim.id === targetClaimId);
  if (!target) {
    return { ...annotation, goldBindingStatus: 'target_missing', repairStatus: 'target_missing', rebindingReason: reason.trim() || undefined, reboundAt };
  }
  const previousIdentityStatus = getGoldClaimIdentityStatusForRecord(record, annotation);
  const previousGoldIdentity: GoldIdentityBindingHistory = {
    claimId: annotation.claimId,
    identityStatus: previousIdentityStatus,
    claimIdentityHash: annotation.claimIdentityHash,
    claimantPartyIds: annotation.claimantPartyIds,
    claimantRole: annotation.claimantRole,
    proceduralRoleContext: annotation.proceduralRoleContext,
    normalizedClaimText: annotation.normalizedClaimText,
    claimType: annotation.claimType,
    requestedAmount: annotation.requestedAmount,
    currency: annotation.currency,
    claimSourceKind: annotation.claimSourceKind,
    claimSourceField: annotation.claimSourceField,
  };
  const identity = buildClaimIdentity(record, target);
  return {
    ...annotation,
    claimId: targetClaimId,
    claimIdentityHash: undefined,
    claimantPartyIds: identity.claimantPartyIds,
    claimantRole: identity.claimantRole,
    proceduralRoleContext: identity.proceduralRoleContext,
    normalizedClaimText: identity.normalizedClaimText,
    claimType: identity.claimType,
    requestedAmount: identity.requestedAmount,
    currency: identity.currency,
    claimSourceKind: identity.sourceKind,
    claimSourceField: identity.sourceField,
    identityStatus: 'legacy_unverified',
    repairStatus: 'repaired_ready_for_confirmation',
    goldBindingStatus: 'repaired_ready_for_confirmation',
    previousClaimId: annotation.claimId,
    previousIdentityStatus,
    previousClaimIdentityHash: annotation.claimIdentityHash,
    previousGoldIdentity,
    rebindingReason: reason.trim() || undefined,
    reboundAt,
  };
}

export function saveGoldCaseAnnotation(goldSetId: string, caseId: string, claimAnnotations: GoldClaimAnnotation[], storage?: Storage): GoldCaseAnnotation {
  const state = readState(storage); const normalizedAnnotations = claimAnnotations.map((item) => item.claimExtractionStatus === 'spurious' || item.claimExtractionStatus === 'duplicate' ? { ...item, goldOutcome: undefined } : item); const value = { id: `${goldSetId}::${caseId}`, goldSetId, caseId, claimAnnotations: normalizedAnnotations, updatedAt: new Date().toISOString() };
  state.annotations = [...state.annotations.filter((item) => item.id !== value.id), value]; const set = state.sets.find((item) => item.id === goldSetId); if (set) set.updatedAt = value.updatedAt; writeState(state, storage); return value;
}
export function goldCaseStatus(record: AnalysisCaseRecord, annotation?: GoldCaseAnnotation): GoldCaseStatus {
  const claims = record.claims || []; const items = claims.map((claim) => ({ claim, annotation: annotation?.claimAnnotations.find((item) => item.claimId === claim.id) }));
  const complete = items.filter(({ claim, annotation: item }) => item && item.claimExtractionStatus && item.claimExtractionStatus !== 'uncertain' && (claimAnalysisScopeForType(claim.claimType) === 'procedural' || item.claimExtractionStatus === 'spurious' || item.claimExtractionStatus === 'duplicate' || Boolean(item.goldOutcome))).length;
  if (complete === 0) return 'not_started'; return complete >= claims.length && claims.length > 0 ? 'completed' : 'in_progress';
}
export function comparisonForClaim(aiOutcome: GoldOutcome | undefined, goldOutcome: GoldOutcome | undefined): GoldComparison {
  if (goldOutcome === 'unclear') return 'unclear_gold'; if (!aiOutcome) return 'no_candidate'; return aiOutcome === goldOutcome ? 'correct' : 'incorrect';
}
export interface GoldAiCandidate { outcome?: GoldOutcome; confidence?: number; }
type AiByClaim = Record<string, GoldOutcome | GoldAiCandidate | undefined>;
const aiValue = (value: GoldOutcome | GoldAiCandidate | undefined): GoldAiCandidate | undefined => typeof value === 'string' ? { outcome: value } : value;
export function buildGoldMetrics(records: AnalysisCaseRecord[], annotations: GoldCaseAnnotation[], aiByClaim: AiByClaim, technicalFailureCaseIds: readonly string[] = []) {
  const recordsByCase = new Map(records.map((record) => [record.caseId, record]));
  const scopeFor = (caseId: string, claimId: string): ClaimAnalysisScope => claimAnalysisScopeForType(recordsByCase.get(caseId)?.claims?.find((claim) => claim.id === claimId)?.claimType);
  const annotatedClaims = annotations.flatMap((item) => item.claimAnnotations
    .filter((claim) => claim.goldOutcome && scopeFor(item.caseId, claim.claimId) === 'substantive')
    .map((claim) => ({ ...claim, caseId: item.caseId, identityStatus: getGoldClaimIdentityStatusForRecord(recordsByCase.get(item.caseId), claim) })));
  const gold = annotatedClaims.filter((item) => item.identityStatus === 'verified');
  const identityVerifiedClaims = annotatedClaims.filter((item) => item.identityStatus === 'verified').length;
  const identityMismatchClaims = annotatedClaims.filter((item) => item.identityStatus === 'identity_mismatch').length;
  const identityLegacyClaims = annotatedClaims.filter((item) => item.identityStatus === 'legacy_unverified').length;
  const identityMissingClaims = annotatedClaims.filter((item) => item.identityStatus === 'identity_missing').length;
  const identityVerificationRate = annotatedClaims.length ? identityVerifiedClaims / annotatedClaims.length : 0;
  const proceduralClaims = records.reduce((count, record) => count + (record.claims?.filter((claim) => claimAnalysisScopeForType(claim.claimType) === 'procedural').length || 0), 0);
  // Extraction-quality metrics are part of the substantive Gold metrics.  A
  // procedural claim can still carry an extraction annotation for auditability,
  // but it must not change entity-claim extraction accuracy or its rates.
  const extractionLabeled = annotations.flatMap((item) => item.claimAnnotations.filter((claim) => claim.claimExtractionStatus && scopeFor(item.caseId, claim.claimId) === 'substantive' && getGoldClaimIdentityStatusForRecord(recordsByCase.get(item.caseId), claim) === 'verified'));
  const extractionDeterminate = extractionLabeled.filter((item) => item.claimExtractionStatus !== 'uncertain');
  const validClaims = gold.filter((item) => item.claimExtractionStatus === 'correct');
  const determinate = validClaims.filter((item) => item.goldOutcome !== 'unclear');
  const comparisons = gold.map((item) => ({ item, comparison: comparisonForClaim(aiValue(aiByClaim[`${item.caseId}::${item.claimId}`])?.outcome, item.goldOutcome) }));
  const candidateCount = gold.filter((item) => aiValue(aiByClaim[`${item.caseId}::${item.claimId}`])?.outcome).length;
  const outcomeEligible = determinate.filter((item) => aiValue(aiByClaim[`${item.caseId}::${item.claimId}`])?.outcome);
  const validCandidateCount = validClaims.filter((item) => aiValue(aiByClaim[`${item.caseId}::${item.claimId}`])?.outcome).length;
  return {
    cases: records.length, claims: records.reduce((sum, record) => sum + (record.claims?.filter((claim) => claimAnalysisScopeForType(claim.claimType) === 'substantive').length || 0), 0), proceduralClaims, labeledClaims: gold.length,
    extractionLabeledClaims: extractionLabeled.length, extractionAccuracy: extractionDeterminate.length ? extractionDeterminate.filter((item) => item.claimExtractionStatus === 'correct').length / extractionDeterminate.length : 0,
    wrongTypeRate: extractionDeterminate.length ? extractionDeterminate.filter((item) => item.claimExtractionStatus === 'wrong_type').length / extractionDeterminate.length : 0,
    spuriousRate: extractionDeterminate.length ? extractionDeterminate.filter((item) => item.claimExtractionStatus === 'spurious').length / extractionDeterminate.length : 0,
    duplicateRate: extractionDeterminate.length ? extractionDeterminate.filter((item) => item.claimExtractionStatus === 'duplicate').length / extractionDeterminate.length : 0,
    candidateCoverage: gold.length ? candidateCount / gold.length : 0, validClaimCoverage: validClaims.length ? validCandidateCount / validClaims.length : 0,
    aiAccuracy: outcomeEligible.length ? comparisons.filter(({ item, comparison }) => item.claimExtractionStatus === 'correct' && item.goldOutcome !== 'unclear' && comparison === 'correct').length / outcomeEligible.length : 0,
    correctionRate: outcomeEligible.length ? comparisons.filter(({ item, comparison }) => item.claimExtractionStatus === 'correct' && item.goldOutcome !== 'unclear' && comparison === 'incorrect').length / outcomeEligible.length : 0,
    manualOnlyRate: gold.length ? comparisons.filter(({ comparison }) => comparison === 'no_candidate').length / gold.length : 0, technicalFailureRate: records.length ? new Set(technicalFailureCaseIds).size / records.length : 0, goldUnclearRate: gold.length ? comparisons.filter(({ comparison }) => comparison === 'unclear_gold').length / gold.length : 0,
    identityVerifiedClaims, identityMismatchClaims, identityLegacyClaims, identityMissingClaims, identityVerificationRate,
  };
}
export function buildGoldExportPayload(set: GoldSetRecord, records: AnalysisCaseRecord[], annotations: GoldCaseAnnotation[], aiByClaim: AiByClaim = {}) {
  return { goldSet: set, cases: set.caseIds.map((caseId) => { const record = records.find((item) => item.caseId === caseId); const annotation = annotations.find((item) => item.caseId === caseId && item.goldSetId === set.id); return { caseId, caseName: record?.title, title: record?.title, caseNumber: record?.caseNumber, claims: (record?.claims || []).map((claim) => { const gold = annotation?.claimAnnotations.find((item) => item.claimId === claim.id); const ai = aiValue(aiByClaim[`${caseId}::${claim.id}`]); const claimAnalysisScope = claimAnalysisScopeForType(claim.claimType); const runtimeIdentity = record ? buildClaimIdentity(record, claim) : undefined; const identityStatus = record ? getGoldClaimIdentityStatusForRecord(record, gold) : 'identity_missing'; const goldClaimIdentity = gold?.claimIdentityHash ? { claimIdentityHash: gold.claimIdentityHash, claimantPartyIds: gold.claimantPartyIds || [], claimantRole: gold.claimantRole || 'unknown', proceduralRoleContext: gold.proceduralRoleContext || [], normalizedClaimText: gold.normalizedClaimText || '', claimType: gold.claimType || claim.claimType || claim.claimName || '', ...(gold.requestedAmount === undefined ? {} : { requestedAmount: gold.requestedAmount }), ...(gold.currency ? { currency: gold.currency } : {}), ...(gold.claimSourceKind ? { sourceKind: gold.claimSourceKind } : {}), ...(gold.claimSourceField ? { sourceField: gold.claimSourceField } : {}), identityStatus: gold.identityStatus || 'verified' as const } : undefined; return { claimId: claim.id, runtimeClaimId: claim.id, goldClaimId: gold?.claimId, claimType: claim.claimType, claimAnalysisScope, claimExtractionStatus: gold?.claimExtractionStatus, aiCandidate: ai?.outcome, aiConfidence: ai?.confidence, goldOutcome: claimAnalysisScope === 'procedural' ? undefined : gold?.goldOutcome, comparison: claimAnalysisScope === 'procedural' ? undefined : (identityStatus === 'verified' ? comparisonForClaim(ai?.outcome, gold?.goldOutcome) : undefined), notes: gold?.notes, claimIdentityHash: runtimeIdentity?.claimIdentityHash, claimantPartyIds: runtimeIdentity?.claimantPartyIds, claimantRole: runtimeIdentity?.claimantRole, proceduralRoleContext: runtimeIdentity?.proceduralRoleContext, normalizedClaimText: runtimeIdentity?.normalizedClaimText, requestedAmount: runtimeIdentity?.requestedAmount, currency: runtimeIdentity?.currency, claimSourceKind: runtimeIdentity?.sourceKind, claimSourceField: runtimeIdentity?.sourceField, goldClaimIdentityHash: gold?.claimIdentityHash, goldClaimIdentity, identityStatus, repairStatus: gold?.repairStatus, goldBindingStatus: gold?.goldBindingStatus, previousClaimId: gold?.previousClaimId, previousIdentityStatus: gold?.previousIdentityStatus, previousClaimIdentityHash: gold?.previousClaimIdentityHash, previousGoldIdentity: gold?.previousGoldIdentity, rebindingReason: gold?.rebindingReason, reboundAt: gold?.reboundAt }; }) }; }) };
}
export function buildGoldCsv(payload: ReturnType<typeof buildGoldExportPayload>): string {
  const rows = [['caseId', 'caseName', 'claimId', 'runtimeClaimId', 'goldClaimId', 'claimType', 'claimAnalysisScope', 'claimExtractionStatus', 'claimIdentityHash', 'goldClaimIdentityHash', 'identityStatus', 'repairStatus', 'goldBindingStatus', 'previousClaimId', 'previousIdentityStatus', 'previousClaimIdentityHash', 'rebindingReason', 'reboundAt', 'claimantPartyIds', 'claimantRole', 'proceduralRoleContext', 'normalizedClaimText', 'requestedAmount', 'currency', 'claimSourceKind', 'claimSourceField', 'aiCandidate', 'aiConfidence', 'goldOutcome', 'comparison', 'notes']];
  payload.cases.forEach((item) => item.claims.forEach((claim) => rows.push([item.caseId, item.caseName || '', claim.claimId || '', claim.runtimeClaimId || claim.claimId || '', claim.goldClaimId || '', claim.claimType || '', claim.claimAnalysisScope || 'substantive', claim.claimExtractionStatus || '', claim.claimIdentityHash || '', claim.goldClaimIdentityHash || '', claim.identityStatus || '', claim.repairStatus || '', claim.goldBindingStatus || '', claim.previousClaimId || '', claim.previousIdentityStatus || '', claim.previousClaimIdentityHash || '', claim.rebindingReason || '', claim.reboundAt || '', (claim.claimantPartyIds || []).join('|'), claim.claimantRole || '', (claim.proceduralRoleContext || []).join('|'), claim.normalizedClaimText || '', claim.requestedAmount === undefined ? '' : String(claim.requestedAmount), claim.currency || '', claim.claimSourceKind || '', claim.claimSourceField || '', claim.aiCandidate || '', claim.aiConfidence === undefined ? '' : String(claim.aiConfidence), claim.goldOutcome || '', claim.comparison || '', claim.notes || ''])));
  return `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')}`;
}
