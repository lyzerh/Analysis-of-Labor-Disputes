import type { ClaimAnalysisScope, ClaimExtractionStatus, GoldOutcome } from './GoldAnnotationStorage';
import type { ClaimIdentityStatus, FrozenClaimIdentity } from './ClaimIdentity';
import type { SemanticSchemaValidationError } from '../semantic/SemanticResult';

export const GOLD_BENCHMARK_STORAGE_KEY = 'labor-analysis-gold-benchmark-v1';

export type BenchmarkAiInvocationStatus = 'success' | 'technical_failure' | 'not_run';
export type BenchmarkCandidateStatus = 'candidate' | 'unresolved' | 'no_candidate';
export type BenchmarkComparison = 'correct' | 'incorrect' | 'unresolved' | 'technical_failure' | 'identity_mismatch';

export interface BenchmarkGoldSnapshotClaim {
  caseId: string;
  caseName: string;
  claimId: string;
  goldClaimId?: string;
  runtimeClaimId?: string;
  claimType: string;
  claimAnalysisScope: ClaimAnalysisScope;
  claimExtractionStatus: Extract<ClaimExtractionStatus, 'correct'>;
  goldOutcome: Exclude<GoldOutcome, 'unclear'>;
  claimIdentityHash?: string;
  claimantPartyIds?: string[];
  claimantRole?: string;
  proceduralRoleContext?: string[];
  normalizedClaimText?: string;
  requestedAmount?: number;
  currency?: string;
  claimSourceKind?: string;
  claimSourceField?: string;
  goldClaimIdentityHash?: string;
  goldClaimIdentity?: FrozenClaimIdentity;
  identityStatus?: ClaimIdentityStatus;
}

export interface BenchmarkClaimResult {
  caseId: string;
  caseName: string;
  claimId: string;
  runtimeClaimId?: string;
  goldClaimId?: string;
  claimType: string;
  goldOutcome: Exclude<GoldOutcome, 'unclear'>;
  claimIdentityHash?: string;
  claimantPartyIds?: string[];
  claimantRole?: string;
  proceduralRoleContext?: string[];
  normalizedClaimText?: string;
  requestedAmount?: number;
  currency?: string;
  claimSourceKind?: string;
  claimSourceField?: string;
  goldClaimIdentityHash?: string;
  goldClaimIdentity?: FrozenClaimIdentity;
  identityStatus?: ClaimIdentityStatus;
  aiInvocationStatus: BenchmarkAiInvocationStatus;
  candidateStatus: BenchmarkCandidateStatus;
  aiOutcome: GoldOutcome | null;
  aiConfidence?: number;
  schemaValid: boolean;
  contractValid: boolean;
  auditDecision: 'pass' | 'fail' | null;
  auditReasonCodes?: string[];
  failureStage?: string;
  failureCode?: string;
  schemaFailureOrigin?: string;
  validatorName?: string;
  validatorPassed?: boolean;
  validatorErrors?: string[];
  contractReasonCodes?: string[];
  providerRawParsed?: boolean;
  semanticSchemaPassed?: boolean;
  normalizationPassed?: boolean;
  contractPassed?: boolean;
  auditRan?: boolean;
  httpStatus?: number;
  errorSummary?: string;
  rawResponseAvailable?: boolean;
  rawResponsePreview?: string;
  parsedJsonCandidate?: unknown;
  schemaValidationErrors?: SemanticSchemaValidationError[];
  latencyMs: number;
  comparison: BenchmarkComparison;
  attempt: number;
}

export interface BenchmarkMetrics {
  eligibleClaims: number;
  invocationSuccess: number;
  invocationSuccessRate: number;
  technicalFailure: number;
  technicalFailureRate: number;
  explicitCandidate: number;
  candidateCoverage: number;
  correct: number;
  incorrect: number;
  unresolved: number;
  outcomeAccuracy: number;
  unresolvedRate: number;
  endToEndCorrectCoverage: number;
  potentialHumanInterventionRate: number;
  averageConfidence: number | null;
  correctAverageConfidence: number | null;
  incorrectAverageConfidence: number | null;
  identityVerifiedClaims: number;
  identityMismatchClaims: number;
  identityVerificationRate: number;
  endToEndCorrectCoverageVerified: number;
}

export interface BenchmarkClaimTypeBreakdown extends BenchmarkMetrics {
  claimType: string;
  smallSample: boolean;
}

export interface BenchmarkRun {
  id: string;
  goldSetId: string;
  goldSetName: string;
  benchmarkStartedAt: string;
  completedAt: string;
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  threshold: number | 'unknown';
  appVersionOrGitHead: string;
  goldSnapshot: {
    goldSetId: string;
    goldSetName: string;
    benchmarkStartedAt: string;
    claims: BenchmarkGoldSnapshotClaim[];
  };
  results: BenchmarkClaimResult[];
  metrics: BenchmarkMetrics;
  claimTypeBreakdown: BenchmarkClaimTypeBreakdown[];
  schemaFailureReasons: Record<string, number>;
  auditFailureReasons: Record<string, number>;
  /** Counts excluded before invocation; old runs may not have these fields. */
  skippedLegacyUnverified?: number;
  skippedIdentityMismatch?: number;
  skippedIdentityMissing?: number;
}

interface GoldBenchmarkState { runs: BenchmarkRun[]; }

const emptyState = (): GoldBenchmarkState => ({ runs: [] });

const emptyBenchmarkMetrics = (): BenchmarkMetrics => ({
  eligibleClaims: 0,
  invocationSuccess: 0,
  invocationSuccessRate: 0,
  technicalFailure: 0,
  technicalFailureRate: 0,
  explicitCandidate: 0,
  candidateCoverage: 0,
  correct: 0,
  incorrect: 0,
  unresolved: 0,
  outcomeAccuracy: 0,
  unresolvedRate: 0,
  endToEndCorrectCoverage: 0,
  potentialHumanInterventionRate: 0,
  averageConfidence: null,
  correctAverageConfidence: null,
  incorrectAverageConfidence: null,
  identityVerifiedClaims: 0,
  identityMismatchClaims: 0,
  identityVerificationRate: 0,
  endToEndCorrectCoverageVerified: 0,
});

/** Read-time defaults keep pre-identity benchmark runs renderable without
 * rewriting their persisted historical JSON. */
const normalizeBenchmarkRun = (run: BenchmarkRun): BenchmarkRun => ({
  ...run,
  results: Array.isArray(run.results) ? run.results : [],
  goldSnapshot: {
    ...(run.goldSnapshot || {}),
    goldSetId: run.goldSnapshot?.goldSetId || run.goldSetId,
    goldSetName: run.goldSnapshot?.goldSetName || run.goldSetName,
    benchmarkStartedAt: run.goldSnapshot?.benchmarkStartedAt || run.benchmarkStartedAt,
    claims: Array.isArray(run.goldSnapshot?.claims) ? run.goldSnapshot.claims : [],
  },
  metrics: { ...emptyBenchmarkMetrics(), ...(run.metrics || {}) },
  claimTypeBreakdown: Array.isArray(run.claimTypeBreakdown) ? run.claimTypeBreakdown : [],
  schemaFailureReasons: run.schemaFailureReasons || {},
  auditFailureReasons: run.auditFailureReasons || {},
});

const defaultStorage = (): Storage | undefined => {
  try { return typeof window !== 'undefined' ? window.localStorage : undefined; } catch { return undefined; }
};

const readState = (storage: Storage | undefined = defaultStorage()): GoldBenchmarkState => {
  if (!storage) return emptyState();
  try {
    const value = JSON.parse(storage.getItem(GOLD_BENCHMARK_STORAGE_KEY) || '{}') as Partial<GoldBenchmarkState>;
    return { runs: Array.isArray(value.runs) ? (value.runs as BenchmarkRun[]).map(normalizeBenchmarkRun) : [] };
  } catch { return emptyState(); }
};

const writeState = (state: GoldBenchmarkState, storage: Storage | undefined = defaultStorage()): void => {
  try { storage?.setItem(GOLD_BENCHMARK_STORAGE_KEY, JSON.stringify(state)); } catch { /* local benchmark storage is best effort */ }
};

export const readGoldBenchmarkRuns = (storage?: Storage): BenchmarkRun[] => readState(storage).runs;

export const saveGoldBenchmarkRun = (run: BenchmarkRun, storage?: Storage): BenchmarkRun => {
  const state = readState(storage);
  state.runs = [run, ...state.runs.filter((item) => item.id !== run.id)];
  writeState(state, storage);
  return run;
};

const ratio = (value: number, denominator: number): number => denominator > 0 ? value / denominator : 0;

export const buildBenchmarkMetrics = (results: BenchmarkClaimResult[]): BenchmarkMetrics => {
  const eligibleClaims = results.length;
  const invocationSuccess = results.filter((item) => item.aiInvocationStatus === 'success').length;
  const technicalFailure = results.filter((item) => item.comparison === 'technical_failure').length;
  const explicit = results.filter((item) => item.candidateStatus === 'candidate' && item.aiOutcome !== 'unclear').length;
  const identityMismatch = results.filter((item) => item.comparison === 'identity_mismatch' || item.identityStatus === 'identity_mismatch').length;
  // Old persisted benchmark rows predate the identity fields. They remain
  // readable for historical reporting; newly produced rows always carry an
  // explicit identityStatus and are scored only when verified.
  const identityVerified = results.filter((item) => !item.identityStatus || item.identityStatus === 'verified');
  const correct = identityVerified.filter((item) => item.comparison === 'correct').length;
  const incorrect = identityVerified.filter((item) => item.comparison === 'incorrect').length;
  const unresolved = results.filter((item) => item.comparison === 'unresolved').length;
  const confidenceValues = results.filter((item) => typeof item.aiConfidence === 'number').map((item) => item.aiConfidence as number);
  const average = (values: number[]): number | null => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return {
    eligibleClaims,
    invocationSuccess,
    invocationSuccessRate: ratio(invocationSuccess, eligibleClaims),
    technicalFailure,
    technicalFailureRate: ratio(technicalFailure, eligibleClaims),
    explicitCandidate: explicit,
    candidateCoverage: ratio(explicit, eligibleClaims),
    correct,
    incorrect,
    unresolved,
    outcomeAccuracy: ratio(correct, correct + incorrect),
    unresolvedRate: ratio(unresolved, eligibleClaims),
    endToEndCorrectCoverage: ratio(correct, eligibleClaims),
    potentialHumanInterventionRate: ratio(technicalFailure + unresolved, eligibleClaims),
    averageConfidence: average(confidenceValues),
    correctAverageConfidence: average(identityVerified.filter((item) => item.comparison === 'correct' && typeof item.aiConfidence === 'number').map((item) => item.aiConfidence as number)),
    incorrectAverageConfidence: average(identityVerified.filter((item) => item.comparison === 'incorrect' && typeof item.aiConfidence === 'number').map((item) => item.aiConfidence as number)),
    identityVerifiedClaims: identityVerified.length,
    identityMismatchClaims: identityMismatch,
    identityVerificationRate: ratio(identityVerified.length, eligibleClaims),
    endToEndCorrectCoverageVerified: ratio(correct, identityVerified.length),
  };
};

export const buildBenchmarkClaimTypeBreakdown = (results: BenchmarkClaimResult[]): BenchmarkClaimTypeBreakdown[] => {
  const types = [...new Set(results.map((item) => item.claimType))];
  return types.map((claimType) => ({
    claimType,
    ...buildBenchmarkMetrics(results.filter((item) => item.claimType === claimType)),
    smallSample: results.filter((item) => item.claimType === claimType).length < 5,
  }));
};

export const buildSchemaFailureReasons = (results: BenchmarkClaimResult[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  results.filter((item) => item.failureCode === 'schema_invalid' || item.failureStage === 'schema' || item.failureStage === 'contract').forEach((item) => {
    const reasons = item.schemaValidationErrors?.map((error) => error.errorCode) || [item.failureCode === 'validation_rejected' ? 'contract_mismatch' : item.failureCode || 'schema_invalid'];
    reasons.forEach((reason) => { counts[reason] = (counts[reason] || 0) + 1; });
  });
  return counts;
};

export const buildAuditFailureReasons = (results: BenchmarkClaimResult[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  results.forEach((item) => (item.auditReasonCodes || []).forEach((reason) => { counts[reason] = (counts[reason] || 0) + 1; }));
  return counts;
};

export const buildGoldBenchmarkJson = (run: BenchmarkRun): string => JSON.stringify(run, null, 2);

export const buildGoldBenchmarkCsv = (run: BenchmarkRun): string => {
  const rows = [[
    'benchmarkRunId', 'caseId', 'caseName', 'claimId', 'claimType', 'claimIdentityHash', 'goldClaimIdentityHash', 'identityStatus', 'claimantPartyIds', 'claimantRole', 'proceduralRoleContext', 'normalizedClaimText', 'requestedAmount', 'currency', 'claimSourceKind', 'claimSourceField', 'goldOutcome', 'aiOutcome',
    'aiConfidence', 'aiInvocationStatus', 'candidateStatus', 'comparison', 'failureStage', 'failureCode', 'schemaFailureOrigin', 'validatorName', 'validatorPassed', 'validatorErrors', 'providerRawParsed', 'semanticSchemaPassed', 'normalizationPassed', 'contractPassed', 'auditRan', 'contractReasonCodes', 'httpStatus', 'auditDecision', 'auditReasonCodes', 'latencyMs',
  ]];
  run.results.forEach((item) => rows.push([
    run.id, item.caseId, item.caseName, item.claimId, item.claimType, item.claimIdentityHash || '', item.goldClaimIdentityHash || '', item.identityStatus || '', (item.claimantPartyIds || []).join('|'), item.claimantRole || '', (item.proceduralRoleContext || []).join('|'), item.normalizedClaimText || '', item.requestedAmount === undefined ? '' : String(item.requestedAmount), item.currency || '', item.claimSourceKind || '', item.claimSourceField || '', item.goldOutcome, item.aiOutcome || '',
    item.aiConfidence === undefined ? '' : String(item.aiConfidence), item.aiInvocationStatus, item.candidateStatus,
    item.comparison, item.failureStage || '', item.failureCode || '', item.schemaFailureOrigin || '', item.validatorName || '', item.validatorPassed === undefined ? '' : String(item.validatorPassed), (item.validatorErrors || []).join('|'), item.providerRawParsed === undefined ? '' : String(item.providerRawParsed), item.semanticSchemaPassed === undefined ? '' : String(item.semanticSchemaPassed), item.normalizationPassed === undefined ? '' : String(item.normalizationPassed), item.contractPassed === undefined ? '' : String(item.contractPassed), item.auditRan === undefined ? '' : String(item.auditRan), (item.contractReasonCodes || []).join('|'), item.httpStatus === undefined ? '' : String(item.httpStatus), item.auditDecision || '', (item.auditReasonCodes || []).join('|'), String(item.latencyMs),
  ]));
  return `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')}`;
};
