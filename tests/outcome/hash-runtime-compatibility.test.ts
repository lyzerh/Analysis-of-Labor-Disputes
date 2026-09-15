import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AnalysisCaseRecord,
  AnalysisRun,
  CandidatePoolSnapshot,
  CandidatePoolSnapshotHeader,
  SamplingRun,
} from '../../src/types';
import { hashString } from '../../src/services/crypto/HashUtils';
import {
  CandidatePoolSnapshotService,
  type CandidateMetadataClient,
  type CandidatePoolSnapshotStore,
} from '../../src/services/dataset/CandidatePoolSnapshotService';
import {
  SamplingService,
  type SamplingRunStore,
} from '../../src/services/sampling/SamplingService';
import {
  AnalysisRunService,
  type AnalysisRunStore,
} from '../../src/services/analysis/AnalysisRunService';
import { CURRENT_ANALYSIS_ENGINE_VERSIONS } from '../../src/services/analysis/AnalysisEngineVersions';
import { analysisRecord } from './helpers/record-factories';

class MemorySnapshotStore implements CandidatePoolSnapshotStore {
  values: CandidatePoolSnapshot[] = [];

  async save(snapshot: CandidatePoolSnapshot): Promise<void> {
    this.values = [...this.values.filter((item) => item.id !== snapshot.id), structuredClone(snapshot)];
  }

  async get(id: string): Promise<CandidatePoolSnapshot | undefined> {
    return this.values.find((item) => item.id === id);
  }

  async list(): Promise<CandidatePoolSnapshotHeader[]> {
    return this.values.map(({ candidates: _candidates, ...header }) => header);
  }
}

class MemorySamplingRunStore implements SamplingRunStore {
  values: SamplingRun[] = [];

  async save(run: SamplingRun): Promise<void> {
    this.values = [...this.values.filter((item) => item.id !== run.id), structuredClone(run)];
  }

  async get(id: string): Promise<SamplingRun | undefined> {
    return this.values.find((item) => item.id === id);
  }

  async list(snapshotId?: string): Promise<SamplingRun[]> {
    return this.values.filter((item) => !snapshotId || item.snapshotId === snapshotId);
  }
}

class MemoryAnalysisRunStore implements AnalysisRunStore {
  values: AnalysisRun[] = [];

  async save(run: AnalysisRun): Promise<void> {
    this.values = [...this.values.filter((item) => item.id !== run.id), structuredClone(run)];
  }

  async get(id: string): Promise<AnalysisRun | undefined> {
    return this.values.find((item) => item.id === id);
  }

  async list(): Promise<AnalysisRun[]> {
    return [...this.values];
  }
}

const originalCrypto = globalThis.crypto;

afterEach(() => {
  vi.stubGlobal('crypto', originalCrypto);
  vi.restoreAllMocks();
});

function localRecords(): AnalysisCaseRecord[] {
  return [
    analysisRecord('hash-case-1', 'supported', { rawDocumentId: 'hash-raw-1', city: '广州' }),
    analysisRecord('hash-case-2', 'supported', { rawDocumentId: 'hash-raw-2', city: '深圳' }),
    analysisRecord('hash-case-3', 'supported', { rawDocumentId: 'hash-raw-3', city: '上海' }),
  ];
}

function localSnapshotFixture() {
  let networkCalls = 0;
  const client: CandidateMetadataClient = {
    async searchCases() {
      networkCalls += 1;
      throw new Error('local snapshot must not call the network');
    },
  };
  const snapshotStore = new MemorySnapshotStore();
  let snapshotId = 0;
  const service = new CandidatePoolSnapshotService(client, snapshotStore, {
    now: () => '2026-09-15T00:00:00.000Z',
    createId: () => `hash-snapshot-${++snapshotId}`,
  });
  return { service, snapshotStore, networkCalls: () => networkCalls };
}

describe('cross-runtime hash compatibility', () => {
  it('uses crypto.subtle SHA-256 when available', async () => {
    vi.stubGlobal('crypto', originalCrypto);
    await expect(hashString('hello')).resolves.toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('uses the deterministic SHA-256-compatible fallback when subtle is missing', async () => {
    vi.stubGlobal('crypto', { subtle: undefined });
    await expect(hashString('hello')).resolves.toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('is stable for repeated input and distinct for different input', async () => {
    vi.stubGlobal('crypto', { subtle: undefined });
    const first = await hashString('same input');
    const second = await hashString('same input');
    const different = await hashString('different input');
    expect(first).toBe(second);
    expect(first).not.toBe(different);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('creates a local research snapshot without subtle or network access', async () => {
    vi.stubGlobal('crypto', { subtle: undefined });
    const fixture = localSnapshotFixture();
    await expect(fixture.service.buildLocalSnapshot(localRecords(), {})).resolves.toMatchObject({
      sourceMode: 'local',
      status: 'complete',
      candidateCount: 3,
      candidateHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      snapshotFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(fixture.networkCalls()).toBe(0);
  });

  it('does not mutate Snapshot or SamplingRun provenance while creating an AnalysisRun without subtle', async () => {
    vi.stubGlobal('crypto', { subtle: undefined });
    const fixture = localSnapshotFixture();
    const snapshot = await fixture.service.buildLocalSnapshot(localRecords(), {});
    const snapshotBefore = structuredClone(snapshot);
    const samplingRuns = new MemorySamplingRunStore();
    const analysisRuns = new MemoryAnalysisRunStore();
    const sampling = new SamplingService(fixture.snapshotStore, samplingRuns, {
      now: () => '2026-09-15T00:01:00.000Z',
      createId: () => 'hash-sampling-1',
    });
    const analysis = new AnalysisRunService(fixture.snapshotStore, samplingRuns, analysisRuns, {
      now: () => '2026-09-15T00:02:00.000Z',
      createId: () => 'hash-analysis-1',
    });
    const samplingRun = await sampling.createSamplingRun({ snapshotId: snapshot.id, seed: 'fixed', sampleSize: 2 });
    const samplingBefore = structuredClone(samplingRun);
    await analysis.createAnalysisRun({
      mode: 'sampled',
      snapshotId: snapshot.id,
      samplingRunId: samplingRun.id,
      engineVersions: CURRENT_ANALYSIS_ENGINE_VERSIONS,
      semantic: { enabled: false },
    });
    expect(await fixture.snapshotStore.get(snapshot.id)).toEqual(snapshotBefore);
    expect(await samplingRuns.get(samplingRun.id)).toEqual(samplingBefore);
  });
});
