import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type {
  AnalysisResultSummary,
  AnalysisRun,
  CandidatePoolSnapshot,
  SamplingRun,
} from '../../src/types';
import {
  ResearchAnalysisService,
  type ResearchAnalysisRunAccess,
  type ResearchRecordLoader,
} from '../../src/services/analysis/ResearchAnalysisService';
import type { CandidatePoolSnapshotStore } from '../../src/services/dataset/CandidatePoolSnapshotService';
import type { SamplingRunStore } from '../../src/services/sampling/SamplingService';
import { calculateCandidateHash, calculateSampleHash } from '../../src/services/sampling/SamplingService';
import { analysisRecord } from './helpers/record-factories';
import {
  calculateProvenanceHash,
  calculateSamplingRunProvenanceHash,
} from '../../src/services/analysis/AnalysisRunService';

class SnapshotStore implements CandidatePoolSnapshotStore {
  constructor(private readonly snapshot: CandidatePoolSnapshot) {}
  async save() {}
  async get(id: string) { return id === this.snapshot.id ? structuredClone(this.snapshot) : undefined; }
  async list() { const { candidates: _candidates, ...header } = this.snapshot; return [structuredClone(header)]; }
}

class SamplingStore implements SamplingRunStore {
  constructor(private readonly samplingRun?: SamplingRun) {}
  async save() {}
  async get(id: string) { return id === this.samplingRun?.id ? structuredClone(this.samplingRun) : undefined; }
  async list() { return this.samplingRun ? [structuredClone(this.samplingRun)] : []; }
}

class RunAccess implements ResearchAnalysisRunAccess {
  public saved: AnalysisRun;
  constructor(run: AnalysisRun) { this.saved = structuredClone(run); }
  async getAnalysisRun(id: string) { return id === this.saved.id ? structuredClone(this.saved) : undefined; }
  async listAnalysisRuns() { return [structuredClone(this.saved)]; }
  async markAnalysisRunRunning(id: string) {
    if (id !== this.saved.id || this.saved.status !== 'pending') throw new Error('invalid running transition');
    this.saved = { ...this.saved, status: 'running' };
    return structuredClone(this.saved);
  }
  async markAnalysisRunCompleted(id: string, resultSummary: AnalysisResultSummary) {
    if (id !== this.saved.id || this.saved.status !== 'running') throw new Error('invalid completed transition');
    this.saved = { ...this.saved, status: 'completed', completedAt: '2026-09-12T01:00:00.000Z', resultSummary };
    return structuredClone(this.saved);
  }
  async markAnalysisRunFailed(id: string, error: { code?: string; message?: string }) {
    if (id !== this.saved.id) throw new Error('invalid failed transition');
    this.saved = { ...this.saved, status: 'failed', errorCode: error.code, errorMessage: error.message };
    return structuredClone(this.saved);
  }
}

class RecordLoader implements ResearchRecordLoader {
  public requestedIds: string[] = [];
  constructor(private readonly records: Map<string, ReturnType<typeof analysisRecord>>) {}
  async loadByInputCaseIds(inputCaseIds: string[]) {
    this.requestedIds = [...inputCaseIds];
    return new Map(inputCaseIds.flatMap((id) => {
      const record = this.records.get(id);
      return record ? [[id, structuredClone(record)] as const] : [];
    }));
  }
}

async function fixture(options: {
  ids?: string[];
  sampledIds?: string[];
  records?: Map<string, ReturnType<typeof analysisRecord>>;
  method?: 'seeded_random' | 'stratified_seeded_random';
  allocationStrategy?: 'proportional' | 'balanced';
  status?: AnalysisRun['status'];
  inputCaseCount?: number;
  inputCaseIds?: string[];
} = {}) {
  const ids = options.ids ?? ['A', 'B', 'C'];
  const snapshot: CandidatePoolSnapshot = {
    id: 'snapshot-1', source: 'laborinfo',
    filters: { remoteFilters: { provinces: ['广东省'], caseLevels: ['一审'] }, localEligibilityRules: { cities: [] } },
    candidateCount: ids.length,
    candidates: ids.map((caseId, index) => ({ caseId, city: index % 2 ? '广州' : '深圳', year: 2023, caseLevel: '一审' })),
    createdAt: '2026-09-12T00:00:00.000Z', snapshotVersion: 'candidate-pool-v1', filterContractVersion: 'laborinfo-filter-v2',
    candidateHash: await calculateCandidateHash(ids), snapshotFingerprint: 'snapshot-fingerprint-1', status: 'complete',
    expectedPages: 1, fetchedPages: 1, failedPages: [], duplicateCount: 0, limitedByMaxPages: false,
    exclusions: { excludedKnownTestCases: 0, excludedOther: 0, excludedUnknown: 0 },
    distribution: { byCity: { 深圳: Math.ceil(ids.length / 2), 广州: Math.floor(ids.length / 2) }, byYear: { 2023: ids.length }, byCaseLevel: { 一审: ids.length } },
  };
  const sampledIds = options.sampledIds;
  let samplingRun: SamplingRun | undefined;
  if (sampledIds) {
    const common = {
      id: 'sampling-1', snapshotId: snapshot.id, snapshotFingerprint: snapshot.snapshotFingerprint,
      candidateHash: snapshot.candidateHash, seed: 'fixed-seed', requestedSampleSize: sampledIds.length,
      actualSampleSize: sampledIds.length, sampledCaseIds: sampledIds,
      sampleHash: await calculateSampleHash(sampledIds), createdAt: '2026-09-12T00:05:00.000Z',
    };
    samplingRun = options.method === 'stratified_seeded_random'
      ? {
          ...common, method: 'stratified_seeded_random', algorithmVersion: 'stratified-seeded-v1', samplingConfigHash: 'config-hash',
          stratification: {
            dimensions: ['city'], allocationStrategy: options.allocationStrategy ?? 'proportional',
            strata: [
              {
                key: 'city=深圳', dimensions: { city: '深圳' }, candidateCount: ids.length,
                allocatedSampleSize: sampledIds.length, sampledCaseIds: sampledIds, seed: 'stratum-seed',
                sampleHash: await calculateSampleHash(sampledIds), samplingFraction: sampledIds.length / ids.length,
              },
            ],
          },
        }
      : { ...common, method: 'seeded_random', algorithmVersion: 'seeded-random-v1' };
  }
  const inputCaseIds = options.inputCaseIds ?? sampledIds ?? [...ids].sort();
  const samplingRunProvenanceHash = samplingRun
    ? await calculateSamplingRunProvenanceHash(samplingRun)
    : undefined;
  const provenanceHash = await calculateProvenanceHash({
    mode: sampledIds ? 'sampled' : 'exhaustive',
    snapshotFingerprint: snapshot.snapshotFingerprint,
    candidateHash: snapshot.candidateHash,
    ...(samplingRunProvenanceHash ? { samplingRunProvenanceHash } : {}),
    inputCaseIds,
    engineVersions: { parserVersion: 'parser-v1', rulesetVersion: 'rules-v1' },
    semantic: { enabled: false },
  });
  const run: AnalysisRun = {
    id: 'analysis-1', analysisContractVersion: 'analysis-provenance-v1', mode: sampledIds ? 'sampled' : 'exhaustive',
    snapshotId: snapshot.id, snapshotFingerprint: snapshot.snapshotFingerprint, candidateHash: snapshot.candidateHash,
    ...(samplingRun ? { samplingRunId: samplingRun.id, samplingRunSampleHash: samplingRun.sampleHash, samplingRunProvenanceHash } : {}),
    inputCaseIds, inputCaseCount: options.inputCaseCount ?? inputCaseIds.length,
    engineVersions: { parserVersion: 'parser-v1', rulesetVersion: 'rules-v1' }, semantic: { enabled: false },
    status: options.status ?? 'pending', createdAt: '2026-09-12T00:10:00.000Z', provenanceHash,
  };
  const records = options.records ?? new Map(ids.map((id) => [id, analysisRecord(id, 'supported')]));
  const runs = new RunAccess(run);
  const loader = new RecordLoader(records);
  const service = new ResearchAnalysisService(runs, new SnapshotStore(snapshot), new SamplingStore(samplingRun), loader);
  return { service, runs, loader, run, snapshot, samplingRun };
}

describe('Stage 5 Step 6 research-aware analytics', () => {
  it('requires an explicit AnalysisRun and never falls back to the database', async () => {
    const { service, loader } = await fixture();
    await expect(service.loadResearchAnalysisContext('missing')).rejects.toThrow(/AnalysisRun not found/);
    expect(loader.requestedIds).toEqual([]);
  });

  it('uses every exhaustive AnalysisRun input ID and marks the scope as corpus', async () => {
    const { service, loader } = await fixture({ ids: ['C', 'A', 'B'] });
    const context = await service.loadResearchAnalysisContext('analysis-1');
    expect(loader.requestedIds).toEqual(['A', 'B', 'C']);
    expect(context.records.map((record) => record.caseId)).toEqual(['A', 'B', 'C']);
    expect(context.statisticalScope).toBe('corpus');
  });

  it('uses only fixed SamplingRun IDs and ignores extra local records', async () => {
    const records = new Map(['A', 'B', 'C', 'D', 'E', 'F'].map((id) => [id, analysisRecord(id, 'supported')]));
    const { service, loader } = await fixture({ ids: ['A', 'B', 'C', 'D', 'E', 'F'], sampledIds: ['B', 'E'], records });
    const context = await service.loadResearchAnalysisContext('analysis-1');
    expect(loader.requestedIds).toEqual(['B', 'E']);
    expect(context.records.map((record) => record.caseId)).toEqual(['B', 'E']);
    expect(context.statisticalScope).toBe('sample');
  });

  it('detects missing records without replacing or resampling them', async () => {
    const records = new Map([['A', analysisRecord('A', 'supported')], ['B', analysisRecord('B', 'supported')]]);
    const { service } = await fixture({ records });
    const context = await service.loadResearchAnalysisContext('analysis-1');
    expect(context.missingCaseIds).toEqual(['C']);
    expect(context.quality.metrics).toMatchObject({ expectedInputCount: 3, availableRecordCount: 2, missingRecordCount: 1, inputCoverageRate: 2 / 3 });
    expect(context.quality.issues.map((issue) => issue.code)).toContain('MISSING_ANALYSIS_RECORDS');
    expect(context.quality.status).toBe('warning');
  });

  it('blocks zero available records and never invokes analytics', async () => {
    const { service, runs } = await fixture({ records: new Map() });
    let invoked = false;
    const execution = await service.executeResearchAnalysis('analysis-1', () => { invoked = true; return {}; });
    expect(invoked).toBe(false);
    expect(execution.context.quality.status).toBe('blocked');
    expect(execution.result).toBeUndefined();
    expect(runs.saved.status).toBe('failed');
    expect(runs.saved.errorCode).toBe('ANALYSIS_INPUT_BLOCKED');
  });

  it('warns for balanced sampling and says it is not population representative', async () => {
    const { service } = await fixture({ sampledIds: ['A', 'B'], method: 'stratified_seeded_random', allocationStrategy: 'balanced' });
    const context = await service.loadResearchAnalysisContext('analysis-1');
    const issue = context.quality.issues.find((item) => item.code === 'BALANCED_SAMPLE_NOT_POPULATION_REPRESENTATIVE');
    expect(issue?.message).toMatch(/不能.*总体|非比例/);
  });

  it.each([
    ['seeded_random', undefined],
    ['stratified_seeded_random', 'proportional'],
  ] as const)('keeps %s sampling in sample scope', async (method, allocationStrategy) => {
    const { service } = await fixture({ sampledIds: ['A', 'B'], method, allocationStrategy });
    expect((await service.loadResearchAnalysisContext('analysis-1')).statisticalScope).toBe('sample');
  });

  it('adds an operational small-N warning without blocking analysis', async () => {
    const { service } = await fixture();
    const context = await service.loadResearchAnalysisContext('analysis-1');
    expect(context.quality.issues.map((issue) => issue.code)).toContain('SMALL_SAMPLE');
    expect(context.quality.status).toBe('warning');
  });

  it('passes a complete exhaustive input at or above the operational small-N threshold', async () => {
    const ids = Array.from({ length: 30 }, (_, index) => `C${index + 1}`);
    const { service } = await fixture({ ids });
    const context = await service.loadResearchAnalysisContext('analysis-1');
    expect(context.quality.status).toBe('pass');
    expect(context.quality.metrics).toMatchObject({ expectedInputCount: 30, availableRecordCount: 30, includedCaseCount: 30 });
  });

  it('computes unknown outcome rate over included cases only', async () => {
    const records = new Map([
      ['A', analysisRecord('A', 'unclear')],
      ['B', analysisRecord('B', 'supported')],
      ['C', analysisRecord('C', 'not_supported', { isIncludedInAnalysisSet: false })],
    ]);
    const { service } = await fixture({ records });
    const context = await service.loadResearchAnalysisContext('analysis-1');
    expect(context.quality.metrics).toMatchObject({ includedCaseCount: 2, excludedCaseCount: 1, unknownOutcomeCount: 1, knownOutcomeCount: 1, unknownOutcomeRate: 0.5 });
    expect(context.quality.issues.map((issue) => issue.code)).toContain('HIGH_UNKNOWN_OUTCOME_RATE');
  });

  it('never classifies unclear as not_supported and exposes the rate denominator', async () => {
    const records = new Map([
      ['A', analysisRecord('A', 'unclear')],
      ['B', analysisRecord('B', 'not_supported')],
      ['C', analysisRecord('C', 'supported')],
    ]);
    const { service } = await fixture({ records });
    const execution = await service.executeResearchAnalysis('analysis-1', (input) => input.length);
    expect(execution.result?.metadata.denominatorContract).toMatchObject({ knownOutcomeCount: 2, unknownOutcomeExcludedCount: 1 });
    expect(execution.context.quality.metrics.outcomeCounts.not_supported).toBe(1);
  });

  it('updates AnalysisRun with real execution counts and preserves provenance', async () => {
    const records = new Map([
      ['A', analysisRecord('A', 'supported')],
      ['B', analysisRecord('B', 'unclear')],
    ]);
    const { service, runs, run } = await fixture({ records });
    const execution = await service.executeResearchAnalysis('analysis-1', (input) => ({ n: input.length }));
    expect(execution.result?.result).toEqual({ n: 2 });
    expect(runs.saved.status).toBe('completed');
    expect(runs.saved.resultSummary).toEqual({ processedCaseCount: 3, includedCaseCount: 2, excludedCaseCount: 0, failedCaseCount: 1, unknownOutcomeCount: 1 });
    expect(runs.saved.provenanceHash).toBe(run.provenanceHash);
    expect(runs.saved.inputCaseIds).toEqual(run.inputCaseIds);
  });

  it('includes sampled provenance, seed, hash, allocation and dimensions in report metadata', async () => {
    const { service, samplingRun } = await fixture({ sampledIds: ['A', 'B'], method: 'stratified_seeded_random', allocationStrategy: 'proportional' });
    const execution = await service.executeResearchAnalysis('analysis-1', () => 'report');
    expect(execution.result?.metadata).toMatchObject({
      analysisRunId: 'analysis-1', snapshotId: 'snapshot-1', samplingRunId: 'sampling-1', statisticalScope: 'sample',
      sampling: { method: 'stratified_seeded_random', seed: 'fixed-seed', sampleHash: samplingRun?.sampleHash, allocationStrategy: 'proportional', dimensions: ['city'] },
    });
  });

  it('reports a completely missing sampled stratum', async () => {
    const { service } = await fixture({ sampledIds: ['A', 'B'], method: 'stratified_seeded_random', records: new Map() });
    const context = await service.loadResearchAnalysisContext('analysis-1');
    expect(context.quality.issues.map((issue) => issue.code)).toContain('STRATUM_MISSING_AFTER_PROCESSING');
    expect(context.quality.metrics.strata?.[0]).toMatchObject({ expectedCount: 2, availableCount: 0, coverageRate: 0 });
  });

  it('reports partial stratum attrition', async () => {
    const records = new Map([['A', analysisRecord('A', 'supported')]]);
    const { service } = await fixture({ sampledIds: ['A', 'B'], method: 'stratified_seeded_random', records });
    const context = await service.loadResearchAnalysisContext('analysis-1');
    expect(context.quality.issues.map((issue) => issue.code)).toContain('STRATUM_ATTRITION');
    expect(context.quality.metrics.strata?.[0].coverageRate).toBe(0.5);
  });

  it('blocks input count mismatch and duplicate IDs before loading records', async () => {
    const mismatch = await fixture({ inputCaseCount: 99 });
    const mismatchContext = await mismatch.service.loadResearchAnalysisContext('analysis-1');
    expect(mismatchContext.quality.issues.map((issue) => issue.code)).toContain('INPUT_CASE_COUNT_MISMATCH');
    expect(mismatch.loader.requestedIds).toEqual([]);

    const duplicate = await fixture({ inputCaseIds: ['A', 'A', 'B'], inputCaseCount: 3 });
    const duplicateContext = await duplicate.service.loadResearchAnalysisContext('analysis-1');
    expect(duplicateContext.quality.issues.map((issue) => issue.code)).toContain('DUPLICATE_INPUT_CASE_IDS');
    expect(duplicate.loader.requestedIds).toEqual([]);
  });

  it('blocks a tampered AnalysisRun provenance hash before loading records', async () => {
    const setupValue = await fixture();
    setupValue.runs.saved.provenanceHash = 'tampered';
    const context = await setupValue.service.loadResearchAnalysisContext('analysis-1');
    expect(context.quality.status).toBe('blocked');
    expect(context.quality.issues.map((issue) => issue.code)).toContain('ANALYSIS_PROVENANCE_HASH_MISMATCH');
    expect(setupValue.loader.requestedIds).toEqual([]);
  });

  it('uses research-aware wording for corpus and sample reports', async () => {
    const corpus = await fixture();
    const sample = await fixture({ sampledIds: ['A', 'B'] });
    expect((await corpus.service.executeResearchAnalysis('analysis-1', () => ({}))).result?.metadata.scopeStatement).toMatch(/Snapshot.*语料总体/);
    expect((await sample.service.executeResearchAnalysis('analysis-1', () => ({}))).result?.metadata.scopeStatement).toMatch(/本次.*样本/);
  });

  it('keeps analytics quality thresholds centralized and versioned', async () => {
    const { service } = await fixture();
    const result = await service.executeResearchAnalysis('analysis-1', () => ({}));
    expect(result.result?.metadata.analyticsVersion).toBe('analytics-rules-v1');
    expect(result.context.quality.guardrailVersion).toBe('analytics-quality-v1');
    expect(result.context.quality.thresholds).toMatchObject({ smallSample: 30, unknownOutcomeWarningRate: 0.1, thresholdKind: 'operational' });
  });

  it('keeps formal UI free of database-wide AnalysisCaseRecord loading', () => {
    for (const file of ['LaborAnalyticsTest.tsx', 'DefenseStrategyAnalysis.tsx']) {
      const source = readFileSync(new URL(`../../src/components/${file}`, import.meta.url), 'utf8');
      expect(source).not.toMatch(/LaborAnalysisPipeline|getAllAnalysisRecords/);
      expect(source).toMatch(/ResearchAnalysisService/);
      expect(source).toMatch(/selectedAnalysisRunId/);
      expect(source).not.toMatch(/抗辩未被采纳|采纳支持率|未获采纳/);
      expect(source).toMatch(/共现/);
    }
  });

  it('uses no network, provider, fulltext, random or Node-only dependency', () => {
    const serviceSource = readFileSync(new URL('../../src/services/analysis/ResearchAnalysisService.ts', import.meta.url), 'utf8');
    const guardrailSource = readFileSync(new URL('../../src/services/analytics/AnalysisQualityGuardrails.ts', import.meta.url), 'utf8');
    expect(serviceSource + guardrailSource).not.toMatch(/fetch\(|Gemini|fetchCaseDetail|Math\.random|node:crypto|Buffer|node:fs/);
  });
});
