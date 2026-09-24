import type { AnalysisCaseRecord, RawDocument } from '../../types';
import {
  claimAnalysisScopeForType,
  type GoldCaseAnnotation,
  type GoldOutcome,
  type GoldSetRecord,
} from './GoldAnnotationStorage';
import {
  buildBenchmarkClaimTypeBreakdown,
  buildBenchmarkMetrics,
  buildAuditFailureReasons,
  buildSchemaFailureReasons,
  saveGoldBenchmarkRun,
  type BenchmarkClaimResult,
  type BenchmarkGoldSnapshotClaim,
  type BenchmarkRun,
} from './GoldBenchmarkStorage';
import type { SemanticResolverDiagnosticDetails } from '../semantic/SemanticResultFallback';
import {
  SEMANTIC_LLM_MODEL,
  SEMANTIC_LLM_PROVIDER,
  SEMANTIC_MAX_OUTPUT_TOKENS,
  SEMANTIC_RESULT_PROMPT_VERSION,
} from '../semantic/SemanticPrompt';
import { SEMANTIC_AUTO_ACCEPT_CONFIDENCE } from '../semantic/SemanticConfidenceConfig';
import {
  buildSemanticTask,
  resolveSemanticTaskForBenchmark,
} from '../semantic/LlmRuntimeService';
import type { LlmRuntimeSettings } from '../semantic/LlmRuntimeSettings';
import type { UnresolvedSemanticTask } from '../semantic/SemanticResult';
import type { AuditedSemanticResolution } from '../semantic/SemanticResolutionOrchestrator';
import { TECHNICAL_RESOLVER_ERROR_CODES } from '../semantic/SemanticWorkflowState';
import { LaborAnalysisPipeline } from '../data/LaborAnalysisPipeline';
import { buildClaimIdentity, claimIdentityStatus, findClaimForIdentity, freezeClaimIdentity, type ClaimIdentityStatus, type FrozenClaimIdentity } from './ClaimIdentity';

export interface EligibleBenchmarkClaim extends BenchmarkGoldSnapshotClaim {
  record: AnalysisCaseRecord;
}

export interface GoldBenchmarkEligibilitySummary {
  eligible: number;
  skippedLegacyUnverified: number;
  skippedIdentityMismatch: number;
  skippedIdentityMissing: number;
}

const claimIdentityFields = (record: AnalysisCaseRecord, claimId: string): Pick<BenchmarkGoldSnapshotClaim, 'claimIdentityHash' | 'claimantPartyIds' | 'claimantRole' | 'proceduralRoleContext' | 'normalizedClaimText' | 'requestedAmount' | 'currency' | 'claimSourceKind' | 'claimSourceField'> => {
  const claim = findClaimForIdentity(record, claimId);
  if (!claim) return {};
  const identity = buildClaimIdentity(record, claim);
  return {
    claimIdentityHash: identity.claimIdentityHash,
    claimantPartyIds: identity.claimantPartyIds,
    claimantRole: identity.claimantRole,
    proceduralRoleContext: identity.proceduralRoleContext,
    normalizedClaimText: identity.normalizedClaimText,
    requestedAmount: identity.requestedAmount,
    currency: identity.currency,
    claimSourceKind: identity.sourceKind,
    claimSourceField: identity.sourceField,
  };
};

const identityStatusFor = (record: AnalysisCaseRecord, claimId: string, storedHash?: string): ClaimIdentityStatus => {
  const claim = findClaimForIdentity(record, claimId, storedHash);
  return claimIdentityStatus(storedHash, claim ? buildClaimIdentity(record, claim) : undefined);
};

/**
 * The one admission predicate for a new benchmark claim.  Preview and fresh
 * snapshot creation use this same predicate; identity status is deliberately
 * computed from the frozen hash rather than trusting a presentation flag.
 */
const hasBenchmarkGoldFields = (
  claim: NonNullable<AnalysisCaseRecord['claims']>[number],
  gold: GoldCaseAnnotation['claimAnnotations'][number] | undefined,
): boolean => claimAnalysisScopeForType(claim.claimType) === 'substantive'
  && gold?.claimExtractionStatus === 'correct'
  && Boolean(gold.goldOutcome)
  && gold.goldOutcome !== 'unclear';

const goldAnnotationForClaim = (
  record: AnalysisCaseRecord,
  annotation: GoldCaseAnnotation | undefined,
  claim: NonNullable<AnalysisCaseRecord['claims']>[number],
): GoldCaseAnnotation['claimAnnotations'][number] | undefined => annotation?.claimAnnotations.find((item) => item.claimId === claim.id)
  || annotation?.claimAnnotations.find((item) => item.claimIdentityHash === buildClaimIdentity(record, claim).claimIdentityHash);

const isBenchmarkClaimEligible = (
  record: AnalysisCaseRecord,
  claim: NonNullable<AnalysisCaseRecord['claims']>[number],
  gold: GoldCaseAnnotation['claimAnnotations'][number] | undefined,
): boolean => hasBenchmarkGoldFields(claim, gold)
  && identityStatusFor(record, claim.id || '', gold.claimIdentityHash) === 'verified';

const snapshotClaimIsEligible = (claim: BenchmarkGoldSnapshotClaim): boolean => claim.claimAnalysisScope === 'substantive'
  && claim.claimExtractionStatus === 'correct'
  && Boolean(claim.goldOutcome)
  && (claim.goldOutcome as string) !== 'unclear'
  && claim.identityStatus === 'verified';

const snapshotIdentityStatus = (claim: BenchmarkGoldSnapshotClaim): ClaimIdentityStatus => claim.identityStatus || 'legacy_unverified';

const frozenGoldIdentityFor = (record: AnalysisCaseRecord, claimId: string, gold: GoldCaseAnnotation['claimAnnotations'][number] | undefined): FrozenClaimIdentity | undefined => {
  if (!gold?.claimIdentityHash) return undefined;
  const current = findClaimForIdentity(record, claimId, gold.claimIdentityHash);
  if (!current) return undefined;
  const identity = buildClaimIdentity(record, current);
  return freezeClaimIdentity({
    ...identity,
    claimIdentityHash: gold.claimIdentityHash,
    claimantPartyIds: gold.claimantPartyIds || identity.claimantPartyIds,
    claimantRole: gold.claimantRole || identity.claimantRole,
    proceduralRoleContext: gold.proceduralRoleContext || identity.proceduralRoleContext,
    normalizedClaimText: gold.normalizedClaimText ?? identity.normalizedClaimText,
    claimType: gold.claimType || identity.claimType,
    ...(gold.requestedAmount === undefined ? {} : { requestedAmount: gold.requestedAmount }),
    ...(gold.currency ? { currency: gold.currency } : {}),
    ...(gold.claimSourceKind ? { sourceKind: gold.claimSourceKind } : {}),
    ...(gold.claimSourceField ? { sourceField: gold.claimSourceField } : {}),
  }, 'verified');
};

export interface GoldBenchmarkProgress {
  current: number;
  total: number;
  caseId: string;
  caseName: string;
  claimId: string;
  invocationSuccess: number;
  explicitCandidate: number;
  unresolved: number;
  technicalFailure: number;
}

export interface GoldBenchmarkRunnerOptions {
  goldSet: GoldSetRecord;
  records: AnalysisCaseRecord[];
  annotations: GoldCaseAnnotation[];
  settings: LlmRuntimeSettings;
  /** Optional frozen snapshot for a diagnostic rerun; live Gold is ignored. */
  goldSnapshot?: BenchmarkRun['goldSnapshot'];
  storage?: Storage;
  appVersionOrGitHead?: string;
  onProgress?: (progress: GoldBenchmarkProgress) => void;
  getRawDocument?: (record: AnalysisCaseRecord) => Promise<RawDocument | null>;
  resolveTask?: (task: UnresolvedSemanticTask, settings: LlmRuntimeSettings) => Promise<AuditedSemanticResolution>;
}

export const getEligibleGoldClaims = (
  goldSet: GoldSetRecord,
  records: AnalysisCaseRecord[],
  annotations: GoldCaseAnnotation[],
): EligibleBenchmarkClaim[] => {
  const recordsById = new Map(records.map((record) => [record.caseId, record]));
  return goldSet.caseIds.flatMap((caseId) => {
    const record = recordsById.get(caseId);
    if (!record) return [];
    const annotation = annotations.find((item) => item.goldSetId === goldSet.id && item.caseId === caseId);
    return (record.claims || []).flatMap((claim) => {
      const gold = goldAnnotationForClaim(record, annotation, claim);
      if (!isBenchmarkClaimEligible(record, claim, gold)) return [];
      const identity = claimIdentityFields(record, claim.id || '');
      const frozenGoldIdentity = frozenGoldIdentityFor(record, claim.id || '', gold);
      return [{
        caseId,
        caseName: record.title || caseId,
        claimId: claim.id,
        goldClaimId: claim.id,
        runtimeClaimId: claim.id,
        claimType: claim.claimType || claim.claimName || 'unknown',
        claimAnalysisScope: 'substantive' as const,
        claimExtractionStatus: 'correct' as const,
        goldOutcome: gold.goldOutcome as Exclude<GoldOutcome, 'unclear'>,
        ...identity,
        goldClaimIdentityHash: gold.claimIdentityHash,
        goldClaimIdentity: frozenGoldIdentity,
        identityStatus: 'verified' as const,
        record,
      }];
    });
  });
};

/** Counts only claims that pass the non-identity Gold checks, then classifies
 * the identity statuses that explain why they were skipped.  This keeps the
 * panel's preview and run metadata about the same candidate population. */
export const getGoldBenchmarkEligibilitySummary = (
  goldSet: GoldSetRecord,
  records: AnalysisCaseRecord[],
  annotations: GoldCaseAnnotation[],
): GoldBenchmarkEligibilitySummary => {
  const recordsById = new Map(records.map((record) => [record.caseId, record]));
  const summary: GoldBenchmarkEligibilitySummary = { eligible: 0, skippedLegacyUnverified: 0, skippedIdentityMismatch: 0, skippedIdentityMissing: 0 };
  goldSet.caseIds.forEach((caseId) => {
    const record = recordsById.get(caseId);
    if (!record) return;
    const annotation = annotations.find((item) => item.goldSetId === goldSet.id && item.caseId === caseId);
    (record.claims || []).forEach((claim) => {
      const gold = goldAnnotationForClaim(record, annotation, claim);
      if (!hasBenchmarkGoldFields(claim, gold)) return;
      const status = identityStatusFor(record, claim.id || '', gold.claimIdentityHash);
      if (status === 'verified') summary.eligible += 1;
      else if (status === 'legacy_unverified') summary.skippedLegacyUnverified += 1;
      else if (status === 'identity_mismatch') summary.skippedIdentityMismatch += 1;
      else summary.skippedIdentityMissing += 1;
    });
  });
  return summary;
};

const buildClaimTask = (record: AnalysisCaseRecord, rawDocument: RawDocument, claimId: string): UnresolvedSemanticTask => ({
  ...buildSemanticTask(record, rawDocument),
  unresolvedTargets: [{ type: 'claim_resolution', id: claimId, reasonCode: 'claim_judgment_match_unclear' }],
});

const technicalResult = (claim: EligibleBenchmarkClaim, startedAt: number, failureCode: string, errorSummary: string, httpStatus?: number, diagnostics?: SemanticResolverDiagnosticDetails): BenchmarkClaimResult => ({
  caseId: claim.caseId,
  caseName: claim.caseName,
  claimId: claim.runtimeClaimId || claim.claimId,
  runtimeClaimId: claim.runtimeClaimId || claim.claimId,
  goldClaimId: claim.goldClaimId || claim.claimId,
  claimType: claim.claimType,
  goldOutcome: claim.goldOutcome,
  claimIdentityHash: claim.claimIdentityHash,
  claimantPartyIds: claim.claimantPartyIds,
  claimantRole: claim.claimantRole,
  proceduralRoleContext: claim.proceduralRoleContext,
  normalizedClaimText: claim.normalizedClaimText,
  requestedAmount: claim.requestedAmount,
  currency: claim.currency,
  claimSourceKind: claim.claimSourceKind,
  claimSourceField: claim.claimSourceField,
  goldClaimIdentityHash: claim.goldClaimIdentityHash || claim.claimIdentityHash,
  goldClaimIdentity: claim.goldClaimIdentity,
  identityStatus: claim.identityStatus,
  aiInvocationStatus: 'technical_failure',
  candidateStatus: 'no_candidate',
  aiOutcome: null,
  schemaValid: false,
  contractValid: false,
  auditDecision: null,
  auditReasonCodes: [],
  ...(diagnostics?.failureStage ? { failureStage: diagnostics.failureStage } : {}),
  ...(diagnostics?.contractReasonCodes ? { contractReasonCodes: diagnostics.contractReasonCodes } : {}),
  ...(diagnostics?.schemaFailureOrigin ? { schemaFailureOrigin: diagnostics.schemaFailureOrigin } : {}),
  ...(diagnostics?.validatorName ? { validatorName: diagnostics.validatorName } : {}),
  ...(diagnostics?.validatorPassed === undefined ? {} : { validatorPassed: diagnostics.validatorPassed }),
  ...(diagnostics?.validatorErrors ? { validatorErrors: diagnostics.validatorErrors } : {}),
  ...(diagnostics?.providerRawParsed === undefined ? {} : { providerRawParsed: diagnostics.providerRawParsed }),
  ...(diagnostics?.semanticSchemaPassed === undefined ? {} : { semanticSchemaPassed: diagnostics.semanticSchemaPassed }),
  ...(diagnostics?.normalizationPassed === undefined ? {} : { normalizationPassed: diagnostics.normalizationPassed }),
  ...(diagnostics?.contractPassed === undefined ? {} : { contractPassed: diagnostics.contractPassed }),
  ...(diagnostics?.auditRan === undefined ? {} : { auditRan: diagnostics.auditRan }),
  ...(httpStatus === undefined ? {} : { httpStatus }),
  failureCode,
  errorSummary,
  ...(diagnostics?.rawResponseAvailable === undefined ? {} : { rawResponseAvailable: diagnostics.rawResponseAvailable }),
  ...(diagnostics?.rawResponsePreview ? { rawResponsePreview: diagnostics.rawResponsePreview } : {}),
  ...(diagnostics?.parsedJsonCandidate === undefined ? {} : { parsedJsonCandidate: diagnostics.parsedJsonCandidate }),
  ...(diagnostics?.schemaValidationErrors ? { schemaValidationErrors: diagnostics.schemaValidationErrors } : {}),
  latencyMs: Math.max(0, Date.now() - startedAt),
  comparison: 'technical_failure',
  attempt: 1,
});

const resultForAuditedResolution = (claim: EligibleBenchmarkClaim, audited: AuditedSemanticResolution, latencyMs: number): BenchmarkClaimResult => {
  const { result, audit } = audited;
  const errorCode = result.resolverErrorCode;
  const failureCode = result.resolverErrorDetails?.failureCode || errorCode;
  const isTechnical = Boolean(errorCode && TECHNICAL_RESOLVER_ERROR_CODES.includes(errorCode));
  if (isTechnical) {
    return {
      ...technicalResult(claim, Date.now() - latencyMs, failureCode!, result.resolverErrorDetails?.message || `语义解析失败：${errorCode}`, result.resolverErrorDetails?.httpStatus, result.resolverErrorDetails),
      latencyMs,
      auditDecision: audit.decision,
      auditReasonCodes: audit.reasonCodes,
    };
  }
  const identityStatus = identityStatusFor(claim.record, claim.claimId, claim.goldClaimIdentity?.claimIdentityHash || claim.goldClaimIdentityHash || claim.claimIdentityHash);
  if (identityStatus !== 'verified') {
    return {
      ...technicalResult(claim, Date.now() - latencyMs, 'identity_mismatch', 'Gold claim identity was not verified before comparison.'),
      latencyMs,
      aiInvocationStatus: 'success',
      schemaValid: true,
      contractValid: true,
      auditDecision: audit.decision,
      auditReasonCodes: audit.reasonCodes,
      comparison: 'identity_mismatch',
    };
  }
  const runtimeClaimId = claim.runtimeClaimId || claim.claimId;
  const resolution = result.claimResolutions.find((item) => item.claimId === runtimeClaimId || item.claimId === claim.claimId);
  const aiOutcome = (resolution?.outcome || 'unclear') as GoldOutcome;
  const explicit = aiOutcome !== 'unclear';
  const comparison = !explicit ? 'unresolved' : aiOutcome === claim.goldOutcome ? 'correct' : 'incorrect';
  return {
    caseId: claim.caseId,
    caseName: claim.caseName,
    claimId: claim.runtimeClaimId || claim.claimId,
    runtimeClaimId: claim.runtimeClaimId || claim.claimId,
    goldClaimId: claim.goldClaimId || claim.claimId,
    claimType: claim.claimType,
    goldOutcome: claim.goldOutcome,
    claimIdentityHash: claim.claimIdentityHash,
    claimantPartyIds: claim.claimantPartyIds,
    claimantRole: claim.claimantRole,
    proceduralRoleContext: claim.proceduralRoleContext,
    normalizedClaimText: claim.normalizedClaimText,
    requestedAmount: claim.requestedAmount,
    currency: claim.currency,
    claimSourceKind: claim.claimSourceKind,
    claimSourceField: claim.claimSourceField,
    goldClaimIdentityHash: claim.goldClaimIdentityHash || claim.claimIdentityHash,
    goldClaimIdentity: claim.goldClaimIdentity,
    identityStatus,
    aiInvocationStatus: 'success',
    candidateStatus: explicit ? 'candidate' : 'unresolved',
    aiOutcome,
    ...(resolution?.confidence === undefined ? {} : { aiConfidence: resolution.confidence }),
    schemaValid: true,
    contractValid: true,
    auditDecision: audit.decision,
    auditReasonCodes: audit.reasonCodes,
    latencyMs,
    comparison,
    attempt: 1,
  };
};

export const runGoldBenchmark = async (options: GoldBenchmarkRunnerOptions): Promise<BenchmarkRun> => {
  const recordsById = new Map(options.records.map((record) => [record.caseId, record]));
  // A historical snapshot may predate the `claims` field, and callers should
  // never be able to turn an arbitrary event/object into a fresh benchmark.
  // Treat a supplied malformed snapshot as an empty frozen population.
  const snapshotClaims = options.goldSnapshot && Array.isArray(options.goldSnapshot.claims)
    ? options.goldSnapshot.claims
    : undefined;
  const skipped = snapshotClaims
    ? snapshotClaims.reduce((counts, claim) => {
      const status = snapshotIdentityStatus(claim);
      if (status === 'legacy_unverified') counts.skippedLegacyUnverified += 1;
      else if (status === 'identity_mismatch') counts.skippedIdentityMismatch += 1;
      else if (status === 'identity_missing') counts.skippedIdentityMissing += 1;
      return counts;
    }, { skippedLegacyUnverified: 0, skippedIdentityMismatch: 0, skippedIdentityMissing: 0 })
    : options.goldSnapshot
      ? { skippedLegacyUnverified: 0, skippedIdentityMismatch: 0, skippedIdentityMissing: 0 }
    : getGoldBenchmarkEligibilitySummary(options.goldSet, options.records, options.annotations);
  const eligible = options.goldSnapshot
    ? (snapshotClaims || []).filter(snapshotClaimIsEligible).map((snapshotClaim) => {
      const record = recordsById.get(snapshotClaim.caseId) || ({ caseId: snapshotClaim.caseId, title: snapshotClaim.caseName, claims: [], parties: [], unresolvedReferences: [], court: '', date: '', caseLevel: '', courtReasoning: '' } as unknown as AnalysisCaseRecord);
      const goldHash = snapshotClaim.goldClaimIdentity?.claimIdentityHash || snapshotClaim.goldClaimIdentityHash || snapshotClaim.claimIdentityHash;
      const runtimeClaim = findClaimForIdentity(record, snapshotClaim.runtimeClaimId || snapshotClaim.claimId, goldHash);
      const runtimeId = runtimeClaim?.id || snapshotClaim.runtimeClaimId || snapshotClaim.claimId;
      return {
        ...snapshotClaim,
        goldClaimId: snapshotClaim.goldClaimId || snapshotClaim.claimId,
        runtimeClaimId: runtimeId,
        ...(runtimeClaim ? claimIdentityFields(record, runtimeId) : {}),
        record,
      };
    })
    : getEligibleGoldClaims(options.goldSet, options.records, options.annotations);
  if (!options.settings.enabled || !options.settings.apiKey?.trim()) {
    throw new Error('当前未配置可用 AI，请先在 AI 设置中完成连接测试。');
  }
  const startedAtIso = new Date().toISOString();
  const getRawDocument = options.getRawDocument || ((record: AnalysisCaseRecord) => LaborAnalysisPipeline.getRawDocumentForRecord(record));
  const resolveTask = options.resolveTask || resolveSemanticTaskForBenchmark;
  const results: BenchmarkClaimResult[] = [];
  const skippedCounts = { ...skipped };
  for (let index = 0; index < eligible.length; index += 1) {
    const claim = eligible[index];
    const emitProgress = (): void => {
      const partial = buildBenchmarkMetrics(results);
      options.onProgress?.({ current: index + 1, total: eligible.length, caseId: claim.caseId, caseName: claim.caseName, claimId: claim.claimId, invocationSuccess: partial.invocationSuccess, explicitCandidate: partial.explicitCandidate, unresolved: partial.unresolved, technicalFailure: partial.technicalFailure });
    };
    emitProgress();
    const requestStarted = Date.now();
    try {
      const identityStatus = identityStatusFor(claim.record, claim.runtimeClaimId || claim.claimId, claim.goldClaimIdentity?.claimIdentityHash || claim.goldClaimIdentityHash || claim.claimIdentityHash);
      if (identityStatus !== 'verified') {
        if (identityStatus === 'legacy_unverified') skippedCounts.skippedLegacyUnverified += 1;
        else if (identityStatus === 'identity_mismatch') skippedCounts.skippedIdentityMismatch += 1;
        else skippedCounts.skippedIdentityMissing += 1;
        emitProgress();
        continue;
      }
      const rawDocument = await getRawDocument(claim.record);
      if (!rawDocument) {
        results.push(technicalResult(claim, requestStarted, 'raw_document_missing', '未找到对应原始文书。'));
        emitProgress();
        continue;
      }
      const audited = await resolveTask(buildClaimTask(claim.record, rawDocument, claim.runtimeClaimId || claim.claimId), options.settings);
      results.push(resultForAuditedResolution(claim, audited, Date.now() - requestStarted));
      emitProgress();
    } catch (error) {
      results.push(technicalResult(claim, requestStarted, 'provider_error', error instanceof Error ? error.message : 'Benchmark AI 调用失败。', undefined, { failureStage: 'provider', failureCode: 'provider_error' }));
      emitProgress();
    }
  }
  const run: BenchmarkRun = {
    id: `benchmark-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    goldSetId: options.goldSnapshot?.goldSetId || options.goldSet.id,
    goldSetName: options.goldSnapshot?.goldSetName || options.goldSet.name,
    benchmarkStartedAt: startedAtIso,
    completedAt: new Date().toISOString(),
    provider: SEMANTIC_LLM_PROVIDER,
    model: SEMANTIC_LLM_MODEL,
    promptVersion: SEMANTIC_RESULT_PROMPT_VERSION,
    schemaVersion: 'unknown',
    threshold: SEMANTIC_AUTO_ACCEPT_CONFIDENCE,
    appVersionOrGitHead: options.appVersionOrGitHead || 'unknown',
    goldSnapshot: {
      goldSetId: options.goldSnapshot?.goldSetId || options.goldSet.id,
      goldSetName: options.goldSnapshot?.goldSetName || options.goldSet.name,
      benchmarkStartedAt: startedAtIso,
      claims: eligible.map(({ record: _record, ...claim }) => claim),
    },
    results,
    metrics: buildBenchmarkMetrics(results),
    claimTypeBreakdown: buildBenchmarkClaimTypeBreakdown(results),
    schemaFailureReasons: buildSchemaFailureReasons(results),
    auditFailureReasons: buildAuditFailureReasons(results),
    skippedLegacyUnverified: skippedCounts.skippedLegacyUnverified,
    skippedIdentityMismatch: skippedCounts.skippedIdentityMismatch,
    skippedIdentityMissing: skippedCounts.skippedIdentityMissing,
  };
  return saveGoldBenchmarkRun(run, options.storage);
};

export const GOLD_BENCHMARK_MAX_OUTPUT_TOKENS = SEMANTIC_MAX_OUTPUT_TOKENS;
