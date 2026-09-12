import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AnalysisRunService,
  compareAnalysisRunProvenance,
  type AnalysisRunStore,
} from '../../src/services/analysis/AnalysisRunService';
import { calculateCandidateHash, calculateSampleHash } from '../../src/services/sampling/SamplingService';
import type {
  AnalysisEngineVersions,
  AnalysisRun,
  CandidatePoolSnapshot,
  CandidatePoolSnapshotHeader,
  CandidatePoolSnapshotStatus,
  SamplingRun,
  SemanticAnalysisConfig,
} from '../../src/types';
import type { CandidatePoolSnapshotStore } from '../../src/services/dataset/CandidatePoolSnapshotService';
import type { SamplingRunStore } from '../../src/services/sampling/SamplingService';

class SnapshotStore implements CandidatePoolSnapshotStore {
  snapshots = new Map<string, CandidatePoolSnapshot>();
  async save(snapshot: CandidatePoolSnapshot) { this.snapshots.set(snapshot.id, structuredClone(snapshot)); }
  async get(id: string) { const value = this.snapshots.get(id); return value ? structuredClone(value) : undefined; }
  async list(): Promise<CandidatePoolSnapshotHeader[]> {
    return [...this.snapshots.values()].map(({ candidates: _candidates, ...header }) => structuredClone(header));
  }
}

class SamplingStore implements SamplingRunStore {
  runs = new Map<string, SamplingRun>();
  async save(run: SamplingRun) { this.runs.set(run.id, structuredClone(run)); }
  async get(id: string) { const value = this.runs.get(id); return value ? structuredClone(value) : undefined; }
  async list(snapshotId?: string) {
    return [...this.runs.values()].filter((run) => !snapshotId || run.snapshotId === snapshotId).map((run) => structuredClone(run));
  }
}

class RunStore implements AnalysisRunStore {
  runs = new Map<string, AnalysisRun>();
  async save(run: AnalysisRun) { this.runs.set(run.id, structuredClone(run)); }
  async get(id: string) { const value = this.runs.get(id); return value ? structuredClone(value) : undefined; }
  async list() { return [...this.runs.values()].map((run) => structuredClone(run)); }
}

const versions: AnalysisEngineVersions = { parserVersion: 'parser-v1.4', rulesetVersion: 'rules-v3' };
const semanticEnabled: SemanticAnalysisConfig = {
  enabled: true,
  promptVersion: 'semantic-reference-v1',
  provider: 'google',
  model: 'gemini-test',
};
const semanticDisabled: SemanticAnalysisConfig = { enabled: false };

async function makeSnapshot(
  id = 'snapshot-A',
  ids = ['A', 'B', 'C', 'D'],
  status: CandidatePoolSnapshotStatus = 'complete',
): Promise<CandidatePoolSnapshot> {
  return {
    id,
    source: 'laborinfo',
    filters: { remoteFilters: { provinces: ['广东省'], caseLevels: ['一审'] }, localEligibilityRules: { cities: [] } },
    candidateCount: ids.length,
    candidates: ids.map((caseId) => ({ caseId, year: 2023 })),
    createdAt: '2026-09-12T00:00:00.000Z',
    snapshotVersion: 'candidate-pool-v1',
    filterContractVersion: 'laborinfo-filter-v2',
    candidateHash: await calculateCandidateHash(ids),
    snapshotFingerprint: `fingerprint-${id}`,
    status,
    expectedPages: 1,
    fetchedPages: status === 'complete' ? 1 : 0,
    failedPages: status === 'complete' ? [] : [1],
    duplicateCount: 0,
    limitedByMaxPages: false,
    exclusions: { excludedKnownTestCases: 0, excludedOther: 0, excludedUnknown: 0 },
    distribution: { byCity: {}, byYear: { 2023: ids.length }, byCaseLevel: { 一审: ids.length } },
  };
}

async function makeSamplingRun(
  snapshot: CandidatePoolSnapshot,
  id = 'sampling-42',
  sampledCaseIds = ['B', 'D'],
  seed = '42',
): Promise<SamplingRun> {
  return {
    id,
    snapshotId: snapshot.id,
    snapshotFingerprint: snapshot.snapshotFingerprint,
    candidateHash: snapshot.candidateHash,
    method: 'seeded_random',
    seed,
    requestedSampleSize: sampledCaseIds.length,
    actualSampleSize: sampledCaseIds.length,
    sampledCaseIds,
    algorithmVersion: 'seeded-random-v1',
    sampleHash: await calculateSampleHash(sampledCaseIds),
    createdAt: '2026-09-12T00:01:00.000Z',
  };
}

async function setup(snapshot?: CandidatePoolSnapshot) {
  const snapshotValue = snapshot ?? await makeSnapshot();
  const snapshots = new SnapshotStore();
  const samplingRuns = new SamplingStore();
  const analysisRuns = new RunStore();
  await snapshots.save(snapshotValue);
  let idSequence = 0;
  let timeSequence = 0;
  const service = new AnalysisRunService(snapshots, samplingRuns, analysisRuns, {
    createId: () => `analysis-${++idSequence}`,
    now: () => `2026-09-12T00:02:${String(++timeSequence).padStart(2, '0')}.000Z`,
  });
  return { service, snapshots, samplingRuns, analysisRuns, snapshot: snapshotValue };
}

describe('Stage 5 AnalysisRun research provenance', () => {
  it('creates exhaustive input from every Snapshot candidate without a SamplingRun', async () => {
    const { service } = await setup();
    const run = await service.createAnalysisRun({ mode: 'exhaustive', snapshotId: 'snapshot-A', engineVersions: versions, semantic: semanticDisabled });
    expect(run.inputCaseIds).toEqual(['A', 'B', 'C', 'D']);
    expect(run.inputCaseCount).toBe(4);
    expect(run.samplingRunId).toBeUndefined();
    expect(run.status).toBe('pending');
  });

  it('creates sampled input only from its SamplingRun', async () => {
    const setupValue = await setup();
    const sampling = await makeSamplingRun(setupValue.snapshot);
    await setupValue.samplingRuns.save(sampling);
    const run = await setupValue.service.createAnalysisRun({ mode: 'sampled', snapshotId: 'snapshot-A', samplingRunId: sampling.id, engineVersions: versions, semantic: semanticEnabled });
    expect(run.inputCaseIds).toEqual(sampling.sampledCaseIds);
    expect(run.inputCaseCount).toBe(sampling.actualSampleSize);
    expect(run.samplingRunId).toBe(sampling.id);
    expect(run.samplingRunSampleHash).toBe(sampling.sampleHash);
  });

  it('rejects sampled mode without a SamplingRun ID', async () => {
    const { service } = await setup();
    await expect(service.createAnalysisRun({ mode: 'sampled', snapshotId: 'snapshot-A', engineVersions: versions, semantic: semanticDisabled } as never)).rejects.toThrow(/sampling/i);
  });

  it('rejects a SamplingRun belonging to another Snapshot', async () => {
    const setupValue = await setup();
    const other = await makeSnapshot('snapshot-B');
    await setupValue.samplingRuns.save(await makeSamplingRun(other));
    await expect(setupValue.service.createAnalysisRun({ mode: 'sampled', snapshotId: 'snapshot-A', samplingRunId: 'sampling-42', engineVersions: versions, semantic: semanticDisabled })).rejects.toThrow(/snapshot/i);
  });

  it.each(['partial', 'failed', 'cancelled'] as const)('rejects a %s Snapshot', async (status) => {
    const { service } = await setup(await makeSnapshot('snapshot-A', ['A'], status));
    await expect(service.createAnalysisRun({ mode: 'exhaustive', snapshotId: 'snapshot-A', engineVersions: versions, semantic: semanticDisabled })).rejects.toThrow(/complete/i);
  });

  it('rejects SamplingRun candidateHash and sampleHash corruption', async () => {
    const first = await setup();
    const badCandidateHash = await makeSamplingRun(first.snapshot);
    badCandidateHash.candidateHash = 'tampered';
    await first.samplingRuns.save(badCandidateHash);
    await expect(first.service.createAnalysisRun({ mode: 'sampled', snapshotId: 'snapshot-A', samplingRunId: badCandidateHash.id, engineVersions: versions, semantic: semanticDisabled })).rejects.toThrow(/candidateHash/);

    const second = await setup();
    const badSampleHash = await makeSamplingRun(second.snapshot);
    badSampleHash.sampleHash = 'tampered';
    await second.samplingRuns.save(badSampleHash);
    await expect(second.service.createAnalysisRun({ mode: 'sampled', snapshotId: 'snapshot-A', samplingRunId: badSampleHash.id, engineVersions: versions, semantic: semanticDisabled })).rejects.toThrow(/sampleHash/);
  });

  it('gives the same design the same provenanceHash but distinct run identity', async () => {
    const { service } = await setup();
    const first = await service.createAnalysisRun({ mode: 'exhaustive', snapshotId: 'snapshot-A', engineVersions: versions, semantic: semanticEnabled });
    const second = await service.createAnalysisRun({ mode: 'exhaustive', snapshotId: 'snapshot-A', engineVersions: versions, semantic: semanticEnabled });
    expect(first.id).not.toBe(second.id);
    expect(first.createdAt).not.toBe(second.createdAt);
    expect(first.provenanceHash).toBe(second.provenanceHash);
    expect(first.inputCaseIds).toEqual(second.inputCaseIds);
  });

  it.each([
    ['parser', { parserVersion: 'parser-v2', rulesetVersion: 'rules-v3' }, semanticEnabled],
    ['ruleset', { parserVersion: 'parser-v1.4', rulesetVersion: 'rules-v4' }, semanticEnabled],
    ['semantic', versions, { ...semanticEnabled, promptVersion: 'semantic-reference-v2' }],
  ] as const)('changes provenance when %s changes', async (_name, changedVersions, changedSemantic) => {
    const { service } = await setup();
    const baseline = await service.createAnalysisRun({ mode: 'exhaustive', snapshotId: 'snapshot-A', engineVersions: versions, semantic: semanticEnabled });
    const changed = await service.createAnalysisRun({ mode: 'exhaustive', snapshotId: 'snapshot-A', engineVersions: changedVersions, semantic: changedSemantic });
    expect(changed.provenanceHash).not.toBe(baseline.provenanceHash);
  });

  it('changes provenance when the SamplingRun changes', async () => {
    const setupValue = await setup();
    const firstSampling = await makeSamplingRun(setupValue.snapshot, 'sampling-42', ['B', 'D'], '42');
    const secondSampling = await makeSamplingRun(setupValue.snapshot, 'sampling-43', ['A', 'C'], '43');
    await setupValue.samplingRuns.save(firstSampling);
    await setupValue.samplingRuns.save(secondSampling);
    const first = await setupValue.service.createAnalysisRun({ mode: 'sampled', snapshotId: 'snapshot-A', samplingRunId: firstSampling.id, engineVersions: versions, semantic: semanticDisabled });
    const second = await setupValue.service.createAnalysisRun({ mode: 'sampled', snapshotId: 'snapshot-A', samplingRunId: secondSampling.id, engineVersions: versions, semantic: semanticDisabled });
    expect(first.provenanceHash).not.toBe(second.provenanceHash);
  });

  it('changes provenance when the Snapshot changes', async () => {
    const first = await setup(await makeSnapshot('snapshot-A', ['A', 'B']));
    const second = await setup(await makeSnapshot('snapshot-B', ['A', 'B', 'C']));
    const firstRun = await first.service.createAnalysisRun({ mode: 'exhaustive', snapshotId: 'snapshot-A', engineVersions: versions, semantic: semanticDisabled });
    const secondRun = await second.service.createAnalysisRun({ mode: 'exhaustive', snapshotId: 'snapshot-B', engineVersions: versions, semantic: semanticDisabled });
    expect(firstRun.provenanceHash).not.toBe(secondRun.provenanceHash);
  });

  it('persists and reloads complete provenance', async () => {
    const setupValue = await setup();
    const run = await setupValue.service.createAnalysisRun({ mode: 'exhaustive', snapshotId: 'snapshot-A', engineVersions: versions, semantic: semanticEnabled });
    expect(await setupValue.service.getAnalysisRun(run.id)).toEqual(run);
    expect(await setupValue.service.listAnalysisRuns({ snapshotId: 'snapshot-A', mode: 'exhaustive', status: 'pending' })).toEqual([run]);
  });

  it('supports pending to running to completed without changing provenance', async () => {
    const { service } = await setup();
    const pending = await service.createAnalysisRun({ mode: 'exhaustive', snapshotId: 'snapshot-A', engineVersions: versions, semantic: semanticDisabled });
    const running = await service.markAnalysisRunRunning(pending.id);
    const completed = await service.markAnalysisRunCompleted(pending.id, {
      processedCaseCount: 4, includedCaseCount: 3, excludedCaseCount: 1, failedCaseCount: 0, unknownOutcomeCount: 1,
    });
    expect(running.status).toBe('running');
    expect(completed.status).toBe('completed');
    expect(completed.completedAt).toBeTruthy();
    expect(completed.provenanceHash).toBe(pending.provenanceHash);
    expect(completed.inputCaseIds).toEqual(pending.inputCaseIds);
  });

  it('retains failed research provenance and only a sanitized error', async () => {
    const { service } = await setup();
    const pending = await service.createAnalysisRun({ mode: 'exhaustive', snapshotId: 'snapshot-A', engineVersions: versions, semantic: semanticDisabled });
    const failed = await service.markAnalysisRunFailed(pending.id, {
      code: 'PROVIDER_ERROR',
      message: 'GEMINI_API_KEY=super-secret provider failed',
    });
    expect(failed.status).toBe('failed');
    expect(failed.errorCode).toBe('PROVIDER_ERROR');
    expect(failed.errorMessage).not.toContain('super-secret');
    expect(failed.provenanceHash).toBe(pending.provenanceHash);
    expect(failed.inputCaseIds).toEqual(pending.inputCaseIds);
  });

  it('does not persist API keys or unknown semantic fields', async () => {
    const { service } = await setup();
    const run = await service.createAnalysisRun({
      mode: 'exhaustive', snapshotId: 'snapshot-A', engineVersions: versions,
      semantic: { ...semanticEnabled, apiKey: 'super-secret', GEMINI_API_KEY: 'super-secret' },
    } as never);
    expect(JSON.stringify(run)).not.toContain('super-secret');
    expect(JSON.stringify(run)).not.toContain('apiKey');
    expect(JSON.stringify(run)).not.toContain('GEMINI_API_KEY');
  });

  it('requires explicit engine versions and actual enabled semantic configuration', async () => {
    const { service } = await setup();
    await expect(service.createAnalysisRun({ mode: 'exhaustive', snapshotId: 'snapshot-A', engineVersions: { parserVersion: '', rulesetVersion: 'v1' }, semantic: semanticDisabled })).rejects.toThrow(/parser/i);
    await expect(service.createAnalysisRun({ mode: 'exhaustive', snapshotId: 'snapshot-A', engineVersions: versions } as never)).rejects.toThrow(/semantic/i);
    await expect(service.createAnalysisRun({ mode: 'exhaustive', snapshotId: 'snapshot-A', engineVersions: versions, semantic: { enabled: true } } as never)).rejects.toThrow(/semantic/i);
  });

  it('does not allow a completed run to be completed or failed again', async () => {
    const { service } = await setup();
    const pending = await service.createAnalysisRun({ mode: 'exhaustive', snapshotId: 'snapshot-A', engineVersions: versions, semantic: semanticDisabled });
    await service.markAnalysisRunRunning(pending.id);
    await service.markAnalysisRunCompleted(pending.id, {
      processedCaseCount: 4, includedCaseCount: 4, excludedCaseCount: 0, failedCaseCount: 0, unknownOutcomeCount: 0,
    });
    await expect(service.markAnalysisRunCompleted(pending.id, {
      processedCaseCount: 4, includedCaseCount: 0, excludedCaseCount: 4, failedCaseCount: 0, unknownOutcomeCount: 0,
    })).rejects.toThrow(/running/i);
    await expect(service.markAnalysisRunFailed(pending.id, { message: 'late failure' })).rejects.toThrow(/cannot fail/i);
  });

  it('compares provenance dimensions deterministically', async () => {
    const setupValue = await setup();
    const baseline = await setupValue.service.createAnalysisRun({ mode: 'exhaustive', snapshotId: 'snapshot-A', engineVersions: versions, semantic: semanticDisabled });
    const changed = await setupValue.service.createAnalysisRun({ mode: 'exhaustive', snapshotId: 'snapshot-A', engineVersions: { ...versions, parserVersion: 'parser-v2' }, semantic: semanticEnabled });
    expect(compareAnalysisRunProvenance(baseline, changed)).toEqual({
      snapshotChanged: false,
      samplingChanged: false,
      parserChanged: true,
      rulesetChanged: false,
      semanticChanged: true,
      inputCasesChanged: false,
    });
  });

  it('locks the analysis-provenance-v1 hash contract', async () => {
    const setupValue = await setup();
    const sampling = await makeSamplingRun(setupValue.snapshot);
    await setupValue.samplingRuns.save(sampling);
    const run = await setupValue.service.createAnalysisRun({ mode: 'sampled', snapshotId: 'snapshot-A', samplingRunId: sampling.id, engineVersions: versions, semantic: semanticEnabled });
    expect(run.provenanceHash).toBe('131dad5167918984d4572edae77b3a54f85b05fc8146fa811d4b558211596d79');
  });

  it('keeps Snapshot and SamplingRun records unchanged', async () => {
    const setupValue = await setup();
    const sampling = await makeSamplingRun(setupValue.snapshot);
    await setupValue.samplingRuns.save(sampling);
    await setupValue.service.createAnalysisRun({ mode: 'sampled', snapshotId: 'snapshot-A', samplingRunId: sampling.id, engineVersions: versions, semantic: semanticDisabled });
    expect(await setupValue.snapshots.get(setupValue.snapshot.id)).toEqual(setupValue.snapshot);
    expect(await setupValue.samplingRuns.get(sampling.id)).toEqual(sampling);
  });

  it('registers a dedicated Dexie table and includes it in clear-all behavior', () => {
    const dbSource = readFileSync(new URL('../../src/db/index.ts', import.meta.url), 'utf8');
    const dataSource = readFileSync(new URL('../../src/services/data/dataService.ts', import.meta.url), 'utf8');
    expect(dbSource).toMatch(/analysisRuns!:\s*Table<AnalysisRun/);
    expect(dbSource).toMatch(/version\(7\)[\s\S]*analysisRuns:/);
    expect(dataSource).toMatch(/db\.analysisRuns\.clear\(\)/);
  });

  it('has no Parser execution, fulltext, provider SDK, API key or Node-only dependency', () => {
    const source = readFileSync(new URL('../../src/services/analysis/AnalysisRunService.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/LaborInfoParserAdapter|fetchCaseDetail|@google\/genai|GEMINI_API_KEY|node:crypto|Buffer/);
  });
});
