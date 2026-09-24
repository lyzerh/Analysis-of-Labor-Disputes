import { describe, expect, it } from 'vitest';
import { getEligibleGoldClaims, runGoldBenchmark } from '../../src/services/gold/GoldBenchmarkRunner';
import { buildGoldBenchmarkCsv, buildGoldBenchmarkJson, buildBenchmarkClaimTypeBreakdown, buildBenchmarkMetrics, GOLD_BENCHMARK_STORAGE_KEY, readGoldBenchmarkRuns, type BenchmarkClaimResult } from '../../src/services/gold/GoldBenchmarkStorage';
import type { GoldCaseAnnotation, GoldSetRecord } from '../../src/services/gold/GoldAnnotationStorage';
import { buildClaimIdentity } from '../../src/services/gold/ClaimIdentity';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) || null; }
  key(index: number) { return [...this.data.keys()][index] || null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

const goldSet: GoldSetRecord = { id: 'gold-1', name: 'Frozen Gold', createdAt: '2026-09-22', updatedAt: '2026-09-22', caseIds: ['case-1'] };
const record = (claims: any[]) => ({ caseId: 'case-1', title: '测试案例', rawDocumentId: 'raw-1', claims: claims.map((claim) => ({ claimName: claim.claimType || '测试诉求', claimant: 'employee', claimantRole: 'employee', claimantPartyId: 'party-employee', supportStatus: 'unclear', ...claim })), parties: [{ id: 'party-employee', name: '员工', laborRole: 'employee', proceduralRoles: ['plaintiff'] }], unresolvedReferences: [], court: '', date: '', caseLevel: '', courtReasoning: '', judgmentDispositionText: '', judgmentReasoningText: '' } as any);
const identityHash = (claimId: string, claimType = 'economic_compensation') => { const current = record([{ id: claimId, claimType }]); return buildClaimIdentity(current, current.claims[0]).claimIdentityHash; };
const annotations: GoldCaseAnnotation[] = [{ id: 'gold-1::case-1', goldSetId: 'gold-1', caseId: 'case-1', updatedAt: '2026-09-22', claimAnnotations: [
  { claimId: 'valid', claimIdentityHash: identityHash('valid'), claimExtractionStatus: 'correct', goldOutcome: 'supported' },
  { claimId: 'wrong', claimIdentityHash: identityHash('wrong'), claimExtractionStatus: 'wrong_type', goldOutcome: 'supported' },
  { claimId: 'procedural', claimIdentityHash: identityHash('procedural', 'procedural_appeal'), claimExtractionStatus: 'correct', goldOutcome: 'supported' },
  { claimId: 'unclear', claimIdentityHash: identityHash('unclear'), claimExtractionStatus: 'correct', goldOutcome: 'unclear' },
] }];

const audited = (claimId: string, outcome: 'supported' | 'not_supported' | 'unclear' = 'supported') => ({
  result: {
    status: outcome === 'unclear' ? 'unresolved' : 'resolved', resolver: 'llm', parties: [], claims: [], judgmentItems: [],
    claimResolutions: [{ claimId, judgmentItemIds: [], outcome, confidence: 0.91 }],
    applicantRole: 'unknown', applicantOutcome: 'unclear', employeeOutcome: 'unclear', employerOutcome: 'unclear', confidence: 0.91,
  },
  audit: { decision: 'pass', reasonCodes: [], admissionConfidenceThreshold: 0.8 },
} as any);

describe('Gold benchmark runner', () => {
  it('eligibility excludes wrong extraction, procedural, and unclear gold claims', () => {
    const eligible = getEligibleGoldClaims(goldSet, [record([
      { id: 'valid', claimType: 'economic_compensation' },
      { id: 'wrong', claimType: 'overtime_pay' },
      { id: 'procedural', claimType: 'procedural_appeal' },
      { id: 'unclear', claimType: 'unpaid_remuneration' },
    ])], annotations);
    expect(eligible.map((item) => item.claimId)).toEqual(['valid']);
    expect(eligible[0].goldOutcome).toBe('supported');
  });

  it('keeps a repaired-but-unconfirmed identity out of benchmark eligibility', () => {
    const repairedButUnconfirmed: GoldCaseAnnotation[] = [{
      id: 'gold-1::case-1', goldSetId: 'gold-1', caseId: 'case-1', updatedAt: '2026-09-22',
      claimAnnotations: [{
        claimId: 'valid', claimExtractionStatus: 'correct', goldOutcome: 'supported',
        identityStatus: 'legacy_unverified',
        repairStatus: 'repaired_ready_for_confirmation',
        goldBindingStatus: 'repaired_ready_for_confirmation',
        previousClaimId: 'legacy-claim-1',
        rebindingReason: '历史 Gold 指向当前解析出的另一条诉求',
      }],
    }];
    expect(getEligibleGoldClaims(goldSet, [record([{ id: 'valid', claimType: 'economic_compensation' }])], repairedButUnconfirmed)).toEqual([]);
  });

  it('uses one verified-only population for preview, snapshot, invocation, and metrics', async () => {
    const claims = Array.from({ length: 12 }, (_, index) => ({
      id: `claim-${index + 1}`,
      claimType: 'economic_compensation',
      sourceText: `请求支付经济补偿金${index + 1}元`,
    }));
    const current = record(claims);
    const annotationsForRun: GoldCaseAnnotation[] = [{
      id: 'gold-1::case-1', goldSetId: 'gold-1', caseId: 'case-1', updatedAt: '2026-09-22',
      claimAnnotations: current.claims.map((claim, index) => ({
        claimId: claim.id,
        claimExtractionStatus: 'correct' as const,
        goldOutcome: 'supported' as const,
        ...(index < 8 ? { claimIdentityHash: buildClaimIdentity(current, claim).claimIdentityHash } : {}),
      })),
    }];
    expect(getEligibleGoldClaims(goldSet, [current], annotationsForRun)).toHaveLength(8);
    const calls: string[] = [];
    const run = await runGoldBenchmark({
      goldSet, records: [current], annotations: annotationsForRun,
      settings: { enabled: true, apiKey: 'xai-test' }, storage: new MemoryStorage(),
      getRawDocument: async () => ({ id: 'raw-1', source: 'laborinfo', title: '测试', contentType: 'txt' as const, rawText: '原文', contentHash: 'hash', importedAt: '2026-09-22' }),
      resolveTask: async (task) => { calls.push(task.unresolvedTargets[0].id || ''); return audited(task.unresolvedTargets[0].id || ''); },
    });
    expect(calls).toHaveLength(8);
    expect(run.goldSnapshot.claims).toHaveLength(8);
    expect(run.results).toHaveLength(8);
    expect(run.metrics.eligibleClaims).toBe(8);
    expect(run.metrics.identityVerifiedClaims).toBe(8);
    expect(run.skippedLegacyUnverified).toBe(4);
  });

  it('filters legacy, mismatched, and missing identities from a diagnostic snapshot before invocation', async () => {
    const current = record([{ id: 'valid', claimType: 'economic_compensation', sourceText: '请求支付经济补偿金' }]);
    const verifiedHash = buildClaimIdentity(current, current.claims[0]).claimIdentityHash;
    const snapshotClaim = (claimId: string, identityStatus: 'verified' | 'legacy_unverified' | 'identity_mismatch' | 'identity_missing', hash?: string) => ({
      caseId: 'case-1', caseName: '测试案例', claimId, runtimeClaimId: claimId, goldClaimId: claimId,
      claimType: 'economic_compensation', claimAnalysisScope: 'substantive' as const, claimExtractionStatus: 'correct' as const,
      goldOutcome: 'supported' as const, claimIdentityHash: hash, goldClaimIdentityHash: hash, identityStatus,
    });
    const calls: string[] = [];
    const run = await runGoldBenchmark({
      goldSet, records: [current], annotations: [], settings: { enabled: true, apiKey: 'xai-test' }, storage: new MemoryStorage(),
      goldSnapshot: {
        goldSetId: goldSet.id, goldSetName: goldSet.name, benchmarkStartedAt: '2026-09-22',
        claims: [
          snapshotClaim('valid', 'verified', verifiedHash),
          snapshotClaim('legacy', 'legacy_unverified'),
          snapshotClaim('mismatch', 'identity_mismatch', 'different-hash'),
          snapshotClaim('missing', 'identity_missing', 'missing-runtime-hash'),
        ],
      },
      getRawDocument: async () => ({ id: 'raw-1', source: 'laborinfo', title: '测试', contentType: 'txt' as const, rawText: '原文', contentHash: 'hash', importedAt: '2026-09-22' }),
      resolveTask: async (task) => { calls.push(task.unresolvedTargets[0].id || ''); return audited('valid'); },
    });
    expect(calls).toEqual(['valid']);
    expect(run.goldSnapshot.claims).toHaveLength(1);
    expect(run.results).toHaveLength(1);
    expect(run.metrics.eligibleClaims).toBe(1);
    expect(run.skippedLegacyUnverified).toBe(1);
    expect(run.skippedIdentityMismatch).toBe(1);
    expect(run.skippedIdentityMissing).toBe(1);
  });

  it('keeps empty progress metrics and claim breakdown safe', () => {
    expect(buildBenchmarkMetrics([])).toMatchObject({ eligibleClaims: 0, identityVerifiedClaims: 0, identityVerificationRate: 0 });
    expect(buildBenchmarkClaimTypeBreakdown([])).toEqual([]);
  });

  it('does not invoke or crash when an old snapshot has no claims array', async () => {
    let invoked = false;
    const run = await runGoldBenchmark({
      goldSet, records: [record([{ id: 'valid', claimType: 'economic_compensation' }])], annotations,
      settings: { enabled: true, apiKey: 'xai-test' }, storage: new MemoryStorage(),
      goldSnapshot: { goldSetId: goldSet.id, goldSetName: goldSet.name, benchmarkStartedAt: '2026-09-22' } as any,
      resolveTask: async () => { invoked = true; return audited('valid'); },
    });
    expect(invoked).toBe(false);
    expect(run.results).toEqual([]);
    expect(run.metrics.eligibleClaims).toBe(0);
    expect(run.goldSnapshot.claims).toEqual([]);
  });

  it('normalizes legacy runs at read time without rewriting their persisted data', () => {
    const storage = new MemoryStorage();
    storage.setItem(GOLD_BENCHMARK_STORAGE_KEY, JSON.stringify({ runs: [{
      id: 'legacy-run', goldSetId: 'gold-1', goldSetName: '历史 Gold', benchmarkStartedAt: '2026-09-20', completedAt: '2026-09-20',
      provider: 'xai', model: 'legacy-model', promptVersion: 'legacy', schemaVersion: 'legacy', threshold: 0.8, appVersionOrGitHead: 'legacy',
      metrics: { eligibleClaims: 12 },
      goldSnapshot: { goldSetId: 'gold-1', goldSetName: '历史 Gold', benchmarkStartedAt: '2026-09-20' },
    }] }));
    const [run] = readGoldBenchmarkRuns(storage);
    expect(run.results).toEqual([]);
    expect(run.goldSnapshot.claims).toEqual([]);
    expect(run.claimTypeBreakdown).toEqual([]);
    expect(run.metrics.eligibleClaims).toBe(12);
    expect(JSON.parse(storage.getItem(GOLD_BENCHMARK_STORAGE_KEY) || '{}').runs[0].results).toBeUndefined();
  });

  it('runs a fresh resolver per eligible claim without using stored candidates and keeps benchmark storage independent', async () => {
    const storage = new MemoryStorage(); const calls: string[] = [];
    expect(getEligibleGoldClaims(goldSet, [record([{ id: 'valid', claimType: 'economic_compensation' }])], annotations).map((item) => item.claimId)).toEqual(['valid']);
    const run = await runGoldBenchmark({
      goldSet, records: [record([{ id: 'valid', claimType: 'economic_compensation' }])], annotations,
      settings: { enabled: true, apiKey: 'xai-test' }, storage,
      getRawDocument: async () => ({ id: 'raw-1', source: 'laborinfo', title: '测试', contentType: 'txt' as const, rawText: '原文', contentHash: 'hash', importedAt: '2026-09-22' }),
      resolveTask: async (task) => { calls.push(task.unresolvedTargets[0].id || ''); return audited('valid'); },
    });
    expect(calls).toEqual(['valid']);
    expect(run.metrics.correct).toBe(1);
    expect(storage.getItem(GOLD_BENCHMARK_STORAGE_KEY)).toContain(run.id);
    expect(storage.getItem('labor-analysis-gold-annotation-v1')).toBeNull();
  });

  it('classifies unresolved and technical results without calling them incorrect', () => {
    const rows: BenchmarkClaimResult[] = [
      { caseId: '1', caseName: 'a', claimId: '1', claimType: 'wage', goldOutcome: 'supported', aiInvocationStatus: 'success', candidateStatus: 'unresolved', aiOutcome: 'unclear', schemaValid: true, contractValid: true, auditDecision: 'fail', latencyMs: 1, comparison: 'unresolved', attempt: 1 },
      { caseId: '2', caseName: 'b', claimId: '2', claimType: 'wage', goldOutcome: 'supported', aiInvocationStatus: 'technical_failure', candidateStatus: 'no_candidate', aiOutcome: null, schemaValid: false, contractValid: false, auditDecision: null, failureCode: 'timeout', latencyMs: 1, comparison: 'technical_failure', attempt: 1 },
      { caseId: '3', caseName: 'c', claimId: '3', claimType: 'wage', goldOutcome: 'supported', aiInvocationStatus: 'success', candidateStatus: 'candidate', aiOutcome: 'not_supported', schemaValid: true, contractValid: true, auditDecision: 'pass', latencyMs: 1, comparison: 'incorrect', attempt: 1 },
    ];
    const metrics = buildBenchmarkMetrics(rows);
    expect(metrics.correct).toBe(0); expect(metrics.incorrect).toBe(1); expect(metrics.unresolved).toBe(1); expect(metrics.technicalFailure).toBe(1); expect(metrics.outcomeAccuracy).toBe(0);
  });

  it('records technical failure as benchmark-only and rejects missing runtime settings before invocation', async () => {
    const storage = new MemoryStorage(); let invoked = false;
    const run = await runGoldBenchmark({
      goldSet, records: [record([{ id: 'valid', claimType: 'economic_compensation' }])], annotations,
      settings: { enabled: true, apiKey: 'xai-test' }, storage,
      getRawDocument: async () => ({ id: 'raw-1', source: 'laborinfo', title: '测试', contentType: 'txt', rawText: '原文', contentHash: 'hash', importedAt: '2026-09-22' }),
      resolveTask: async () => { invoked = true; return { ...audited('valid'), result: { ...audited('valid').result, resolverErrorCode: 'schema_invalid', resolverErrorDetails: { message: 'schema rejected', httpStatus: 422 } } } as any; },
    });
    expect(invoked).toBe(true); expect(run.results[0]).toMatchObject({ comparison: 'technical_failure', failureCode: 'schema_invalid', httpStatus: 422 });
    await expect(runGoldBenchmark({ goldSet, records: [record([{ id: 'valid', claimType: 'economic_compensation' }])], annotations, settings: { enabled: false, apiKey: null }, storage })).rejects.toThrow('未配置可用 AI');
    expect(storage.getItem('labor-analysis-gold-annotation-v1')).toBeNull();
  });

  it('exports frozen run metadata and does not include secrets', async () => {
    const run = await runGoldBenchmark({ goldSet, records: [record([{ id: 'valid', claimType: 'economic_compensation' }])], annotations, settings: { enabled: true, apiKey: 'xai-secret-value' }, storage: new MemoryStorage(), getRawDocument: async () => ({ id: 'raw-1', source: 'laborinfo', title: '测试', contentType: 'txt' as const, rawText: '原文', contentHash: 'hash', importedAt: '2026-09-22' }), resolveTask: async () => audited('valid') });
    expect(buildGoldBenchmarkJson(run)).not.toContain('xai-secret-value');
    expect(buildGoldBenchmarkJson(run)).toContain('goldSnapshot');
    expect(buildGoldBenchmarkCsv(run).startsWith('\uFEFF')).toBe(true);
    expect(readGoldBenchmarkRuns(new MemoryStorage())).toEqual([]);
  });

  it('can rerun the same frozen Gold snapshot without consulting changed annotations', async () => {
    const options = {
      goldSet, records: [record([{ id: 'valid', claimType: 'economic_compensation' }])], annotations,
      settings: { enabled: true, apiKey: 'xai-test' }, storage: new MemoryStorage(),
      getRawDocument: async () => ({ id: 'raw-1', source: 'laborinfo', title: '测试', contentType: 'txt' as const, rawText: '原文', contentHash: 'hash', importedAt: '2026-09-22' }),
      resolveTask: async () => audited('valid'),
    };
    const first = await runGoldBenchmark(options);
    const rerun = await runGoldBenchmark({ ...options, annotations: [], goldSnapshot: first.goldSnapshot });
    expect(rerun.goldSnapshot.claims).toEqual(first.goldSnapshot.claims);
    expect(rerun.results[0].goldOutcome).toBe('supported');
  });
});
