import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SAMPLING_ALGORITHM_VERSION,
  SamplingService,
  calculateCandidateHash,
  normalizeSeed,
  summarizeSamplingRun,
  type SamplingRunStore,
} from '../../src/services/sampling/SamplingService';
import type {
  CandidateMetadata,
  CandidatePoolSnapshot,
  CandidatePoolSnapshotHeader,
  CandidatePoolSnapshotStatus,
  SamplingRun,
} from '../../src/types';
import type { CandidatePoolSnapshotStore } from '../../src/services/dataset/CandidatePoolSnapshotService';

class MemorySnapshotStore implements CandidatePoolSnapshotStore {
  snapshots = new Map<string, CandidatePoolSnapshot>();

  async save(snapshot: CandidatePoolSnapshot): Promise<void> {
    this.snapshots.set(snapshot.id, structuredClone(snapshot));
  }

  async get(id: string): Promise<CandidatePoolSnapshot | undefined> {
    const snapshot = this.snapshots.get(id);
    return snapshot ? structuredClone(snapshot) : undefined;
  }

  async list(): Promise<CandidatePoolSnapshotHeader[]> {
    return [...this.snapshots.values()].map(({ candidates: _candidates, ...header }) => structuredClone(header));
  }
}

class MemoryRunStore implements SamplingRunStore {
  runs = new Map<string, SamplingRun>();

  async save(run: SamplingRun): Promise<void> {
    this.runs.set(run.id, structuredClone(run));
  }

  async get(id: string): Promise<SamplingRun | undefined> {
    const run = this.runs.get(id);
    return run ? structuredClone(run) : undefined;
  }

  async list(snapshotId?: string): Promise<SamplingRun[]> {
    return [...this.runs.values()]
      .filter((run) => !snapshotId || run.snapshotId === snapshotId)
      .map((run) => structuredClone(run));
  }
}

async function snapshot(
  ids: string[],
  status: CandidatePoolSnapshotStatus = 'complete',
  id = 'snapshot-A',
): Promise<CandidatePoolSnapshot> {
  const candidates: CandidateMetadata[] = ids.map((caseId) => ({ caseId, year: 2023 }));
  return {
    id,
    source: 'laborinfo',
    filters: { remoteFilters: { provinces: ['广东省'], caseLevels: ['一审'] }, localEligibilityRules: { cities: [] } },
    candidateCount: candidates.length,
    candidates,
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

async function setup(snapshotValue: CandidatePoolSnapshot) {
  const snapshots = new MemorySnapshotStore();
  const runs = new MemoryRunStore();
  await snapshots.save(snapshotValue);
  let sequence = 0;
  const service = new SamplingService(snapshots, runs, {
    now: () => `2026-09-12T00:00:0${sequence}.000Z`,
    createId: () => `run-${++sequence}`,
  });
  return { service, runs, snapshots };
}

const tenIds = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

describe('Stage 5 deterministic seeded random sampling', () => {
  it('reproduces identical samples for the same snapshot, seed, size and algorithm', async () => {
    const { service } = await setup(await snapshot(tenIds));
    const first = await service.createSamplingRun({ snapshotId: 'snapshot-A', seed: 42, sampleSize: 5 });
    const second = await service.createSamplingRun({ snapshotId: 'snapshot-A', seed: 42, sampleSize: 5 });
    expect(first.id).not.toBe(second.id);
    expect(first.createdAt).not.toBe(second.createdAt);
    expect(first.sampledCaseIds).toEqual(second.sampledCaseIds);
    expect(first.sampleHash).toBe(second.sampleHash);
  });

  it('rejects SamplingRun creation for an archived research population', async () => {
    const archived = await snapshot(tenIds);
    archived.lifecycleStatus = 'archived';
    const { service, runs } = await setup(archived);
    await expect(service.createSamplingRun({ snapshotId: archived.id, seed: 42, sampleSize: 2 })).rejects.toThrow(/归档/);
    expect(await runs.list()).toHaveLength(0);
  });

  it('produces distinct deterministic orders for fixed different seeds', async () => {
    const { service } = await setup(await snapshot(tenIds));
    const first = await service.createSamplingRun({ snapshotId: 'snapshot-A', seed: 42, sampleSize: 7 });
    const second = await service.createSamplingRun({ snapshotId: 'snapshot-A', seed: 43, sampleSize: 7 });
    expect(first.sampledCaseIds).not.toEqual(second.sampledCaseIds);
  });

  it('sorts candidate IDs before shuffle so storage order cannot affect the result', async () => {
    const firstSetup = await setup(await snapshot(['A', 'B', 'C', 'D', 'E']));
    const secondSetup = await setup(await snapshot(['D', 'B', 'A', 'E', 'C']));
    const first = await firstSetup.service.createSamplingRun({ snapshotId: 'snapshot-A', seed: 'stable', sampleSize: 4 });
    const second = await secondSetup.service.createSamplingRun({ snapshotId: 'snapshot-A', seed: 'stable', sampleSize: 4 });
    expect(first.sampledCaseIds).toEqual(second.sampledCaseIds);
  });

  it('supports sample sizes 1, candidateCount - 1, and candidateCount', async () => {
    const { service } = await setup(await snapshot(['A', 'B', 'C', 'D']));
    expect((await service.createSamplingRun({ snapshotId: 'snapshot-A', seed: 'size', sampleSize: 1 })).actualSampleSize).toBe(1);
    expect((await service.createSamplingRun({ snapshotId: 'snapshot-A', seed: 'size', sampleSize: 3 })).actualSampleSize).toBe(3);
    const all = await service.createSamplingRun({ snapshotId: 'snapshot-A', seed: 'size', sampleSize: 4 });
    expect(all.actualSampleSize).toBe(4);
    expect(new Set(all.sampledCaseIds)).toEqual(new Set(['A', 'B', 'C', 'D']));
  });

  it.each([0, -1, 5, Number.NaN])('rejects invalid sample size %s', async (sampleSize) => {
    const { service } = await setup(await snapshot(['A', 'B', 'C', 'D']));
    await expect(service.createSamplingRun({ snapshotId: 'snapshot-A', seed: 42, sampleSize })).rejects.toThrow(/sample size/i);
  });

  it.each(['partial', 'failed', 'cancelled'] as const)('rejects %s snapshots', async (status) => {
    const { service } = await setup(await snapshot(['A', 'B'], status));
    await expect(service.createSamplingRun({ snapshotId: 'snapshot-A', seed: 42, sampleSize: 1 })).rejects.toThrow(/complete/);
  });

  it('rejects an empty complete snapshot', async () => {
    const { service } = await setup(await snapshot([]));
    await expect(service.createSamplingRun({ snapshotId: 'snapshot-A', seed: 42, sampleSize: 1 })).rejects.toThrow(/candidate/i);
  });

  it('rejects duplicate candidate IDs as a broken Snapshot invariant', async () => {
    const broken = await snapshot(['A', 'A', 'B']);
    const { service } = await setup(broken);
    await expect(service.createSamplingRun({ snapshotId: 'snapshot-A', seed: 42, sampleSize: 1 })).rejects.toThrow(/duplicate/i);
  });

  it('normalizes numeric and string seeds to the same value', async () => {
    expect(normalizeSeed(42)).toBe('42');
    expect(normalizeSeed(' 42 ')).toBe('42');
    const { service } = await setup(await snapshot(tenIds));
    const numeric = await service.createSamplingRun({ snapshotId: 'snapshot-A', seed: 42, sampleSize: 5 });
    const textual = await service.createSamplingRun({ snapshotId: 'snapshot-A', seed: '42', sampleSize: 5 });
    expect(numeric.sampledCaseIds).toEqual(textual.sampledCaseIds);
  });

  it('locks the seeded-random-v1 algorithm output with a regression fixture', async () => {
    const { service } = await setup(await snapshot(tenIds));
    const run = await service.createSamplingRun({
      snapshotId: 'snapshot-A',
      seed: 'legal-analytics-test',
      sampleSize: 5,
    });
    expect(run.algorithmVersion).toBe(SAMPLING_ALGORITHM_VERSION);
    expect(run.sampledCaseIds).toEqual(['B', 'A', 'J', 'E', 'F']);
  });

  it('persists and reloads every reproducibility field', async () => {
    const setupValue = await setup(await snapshot(tenIds));
    const created = await setupValue.service.createSamplingRun({ snapshotId: 'snapshot-A', seed: 42, sampleSize: 5 });
    const reloaded = await new SamplingService(setupValue.snapshots, setupValue.runs).getSamplingRun(created.id);
    expect(reloaded).toEqual(created);
    expect(await setupValue.service.listSamplingRuns('snapshot-A')).toEqual([created]);
  });

  it('rejects a snapshot whose stored candidateHash no longer matches its entries', async () => {
    const broken = await snapshot(['A', 'B', 'C']);
    broken.candidateHash = 'tampered';
    const { service } = await setup(broken);
    await expect(service.createSamplingRun({ snapshotId: 'snapshot-A', seed: 42, sampleSize: 2 })).rejects.toThrow(/candidateHash/);
  });

  it('records changed snapshot identity as different provenance', async () => {
    const firstSetup = await setup(await snapshot(['A', 'B', 'C', 'D'], 'complete', 'snapshot-A'));
    const secondSetup = await setup(await snapshot(['A', 'B', 'C', 'D', 'E'], 'complete', 'snapshot-B'));
    const first = await firstSetup.service.createSamplingRun({ snapshotId: 'snapshot-A', seed: 42, sampleSize: 3 });
    const second = await secondSetup.service.createSamplingRun({ snapshotId: 'snapshot-B', seed: 42, sampleSize: 3 });
    expect(first.snapshotId).not.toBe(second.snapshotId);
    expect(first.candidateHash).not.toBe(second.candidateHash);
  });

  it('provides a compact provenance summary', async () => {
    const { service } = await setup(await snapshot(tenIds));
    const run = await service.createSamplingRun({ snapshotId: 'snapshot-A', seed: 42, sampleSize: 5 });
    expect(summarizeSamplingRun(run)).toEqual({
      snapshotId: 'snapshot-A',
      method: 'seeded_random',
      seed: '42',
      requestedSampleSize: 5,
      actualSampleSize: 5,
      algorithmVersion: SAMPLING_ALGORITHM_VERSION,
      sampleHash: run.sampleHash,
      createdAt: run.createdAt,
    });
  });

  it('does not use Math.random, fulltext, Parser, Gemini, Outcome or Analytics', () => {
    const source = readFileSync(new URL('../../src/services/sampling/SamplingService.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/Math\.random|fetchCaseDetail|LaborInfoParserAdapter|Gemini|OutcomeResolver|Analytics/);
  });
});
