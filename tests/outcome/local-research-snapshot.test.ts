import { describe, expect, it } from 'vitest';
import type {
  AnalysisCaseRecord,
  AnalysisRun,
  CandidatePoolSnapshot,
  CandidatePoolSnapshotHeader,
  SamplingRun,
} from '../../src/types';
import {
  CandidatePoolSnapshotService,
  type BuildSnapshotOptions,
  type CandidateFilterInput,
  type CandidateMetadataClient,
  type CandidatePoolSnapshotStore,
} from '../../src/services/dataset/CandidatePoolSnapshotService';
import {
  ResearchWorkspaceService,
  type ResearchWorkspaceAnalysisRuns,
  type ResearchWorkspaceCasePreparation,
  type ResearchWorkspaceLocalRecords,
  type ResearchWorkspaceSampling,
  type ResearchWorkspaceSnapshots,
} from '../../src/services/analysis/ResearchWorkspaceService';
import { analysisRecord } from './helpers/record-factories';
import { SamplingService, type SamplingRunStore } from '../../src/services/sampling/SamplingService';
import { AnalysisRunService, type AnalysisRunStore } from '../../src/services/analysis/AnalysisRunService';
import { CURRENT_ANALYSIS_ENGINE_VERSIONS } from '../../src/services/analysis/AnalysisEngineVersions';

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

function localRecords(count = 10): AnalysisCaseRecord[] {
  return Array.from({ length: count }, (_, index) => analysisRecord(`record-${index}`, 'supported', {
    rawDocumentId: `raw-${index}`,
    city: index < 4 ? '广州' : '深圳',
    year: index % 2 ? 2022 : 2023,
    caseLevel: index % 2 ? '二审' : '一审',
    title: index < 4 ? `本地劳动合同案例-${index}` : `本地工资案例-${index}`,
  }));
}

function serviceFixture(records = localRecords()) {
  let networkCalls = 0;
  const client: CandidateMetadataClient = {
    async searchCases() {
      networkCalls++;
      return { items: [], total: 0, page: 1, perPage: 50, totalPages: 1 };
    },
  };
  const store = new MemorySnapshotStore();
  let id = 0;
  const service = new CandidatePoolSnapshotService(client, store, {
    now: () => '2026-09-14T00:00:00.000Z',
    createId: () => `local-snapshot-${++id}`,
  });
  return { service, store, records, networkCalls: () => networkCalls };
}

describe('Local Candidate Pool Snapshot contract', () => {
  it('creates a ten-case local Snapshot with zero network calls', async () => {
    const fixture = serviceFixture();
    const created = await fixture.service.buildLocalSnapshot(fixture.records, {});
    expect(created.sourceMode).toBe('local');
    expect(created.candidateCount).toBe(10);
    expect(created.candidates.map((item) => item.caseId)).toEqual(
      Array.from({ length: 10 }, (_, index) => `raw-${index}`),
    );
    expect(fixture.networkCalls()).toBe(0);
  });

  it('filters local records through the shared city, case-level, and keyword contract', async () => {
    const fixture = serviceFixture();
    const created = await fixture.service.buildLocalSnapshot(fixture.records, {
      cities: ['广州'],
      caseLevels: ['一审'],
      q: '劳动合同',
    });
    expect(created.candidateCount).toBe(2);
    expect(created.candidates.map((item) => item.caseId)).toEqual(['raw-0', 'raw-2']);
    expect(fixture.networkCalls()).toBe(0);
  });

  it('applies cross-province region rules without a global-city false exclusion', async () => {
    const fixture = serviceFixture([
      analysisRecord('gz', 'supported', { rawDocumentId: 'raw-gz', city: '广州', court: '广东省广州市中级人民法院' }),
      analysisRecord('sz', 'supported', { rawDocumentId: 'raw-sz', city: '深圳', court: '广东省深圳市中级人民法院' }),
      analysisRecord('sh', 'supported', { rawDocumentId: 'raw-sh', city: '上海', court: '上海市第一中级人民法院' }),
      analysisRecord('nj', 'supported', { rawDocumentId: 'raw-nj', city: '南京', court: '江苏省南京市中级人民法院' }),
    ]);
    const created = await fixture.service.buildLocalSnapshot(fixture.records, {
      regionIds: ['guangdong-guangzhou', 'shanghai', 'jiangsu'],
    });
    expect(created.candidates.map((candidate) => candidate.caseId)).toEqual(['raw-gz', 'raw-nj', 'raw-sh']);
    expect(fixture.networkCalls()).toBe(0);
  });

  it('deduplicates stable local raw-document IDs deterministically', async () => {
    const fixture = serviceFixture();
    const duplicate = { ...fixture.records[0], caseId: 'different-derived-id' };
    const created = await fixture.service.buildLocalSnapshot([...fixture.records, duplicate], {});
    expect(created.candidateCount).toBe(10);
    expect(created.duplicateCount).toBe(1);
    expect(new Set(created.candidates.map((item) => item.caseId)).size).toBe(10);
  });

  it('produces stable hashes for identical local records and filters', async () => {
    const fixture = serviceFixture();
    const first = await fixture.service.buildLocalSnapshot(fixture.records, { cities: ['广州'] });
    const second = await fixture.service.buildLocalSnapshot([...fixture.records].reverse(), { cities: ['广州'] });
    expect(second.candidateHash).toBe(first.candidateHash);
    expect(second.snapshotFingerprint).toBe(first.snapshotFingerprint);
  });

  it('distinguishes local provenance from a remote Snapshot with the same IDs and filters', async () => {
    const fixture = serviceFixture();
    const local = await fixture.service.buildLocalSnapshot(fixture.records, {});
    const remote = new CandidatePoolSnapshotService({
      async searchCases() {
        return {
          items: fixture.records.map((record) => ({
            sourceId: record.rawDocumentId,
            source: 'laborinfo' as const,
            url: `https://example.test/${record.rawDocumentId}`,
            title: record.title,
            pbDt: record.date,
            caseLevel: record.caseLevel,
            court: record.court,
          })),
          total: fixture.records.length,
          page: 1,
          perPage: 50,
          totalPages: 1,
        };
      },
    }, new MemorySnapshotStore(), {
      now: () => '2026-09-14T00:00:00.000Z',
      createId: () => 'remote-snapshot',
    });
    const remoteSnapshot = await remote.buildSnapshot({});
    expect(local.sourceMode).toBe('local');
    expect(remoteSnapshot.sourceMode).toBe('remote');
    expect(remoteSnapshot.candidateHash).toBe(local.candidateHash);
    expect(remoteSnapshot.snapshotFingerprint).not.toBe(local.snapshotFingerprint);
  });

  it('derives remote provinces once and applies region-aware eligibility across provinces', async () => {
    let requestedProvinces: string[] = [];
    const service = new CandidatePoolSnapshotService({
      async searchCases(params) {
        requestedProvinces = Array.isArray(params.province) ? params.province : [params.province ?? ''];
        return {
          items: [
            { sourceId: 'gz', source: 'laborinfo', url: 'https://example.test/gz', title: '广州', province: '广东省', court: '广东省广州市中级人民法院' },
            { sourceId: 'sz', source: 'laborinfo', url: 'https://example.test/sz', title: '深圳', province: '广东省', court: '广东省深圳市中级人民法院' },
            { sourceId: 'sh', source: 'laborinfo', url: 'https://example.test/sh', title: '上海', province: '上海市', court: '上海市第一中级人民法院' },
            { sourceId: 'nj', source: 'laborinfo', url: 'https://example.test/nj', title: '南京', province: '江苏省', court: '江苏省南京市中级人民法院' },
          ],
          total: 4, page: 1, perPage: 50, totalPages: 1,
        };
      },
    }, new MemorySnapshotStore());
    const created = await service.buildSnapshot({
      regionIds: ['guangdong-guangzhou', 'shanghai', 'jiangsu'],
    });
    expect(requestedProvinces).toEqual(['广东省', '上海市', '江苏省']);
    expect(created.candidates.map((candidate) => candidate.caseId)).toEqual(['gz', 'nj', 'sh']);
  });

  it('rejects an empty local scope instead of persisting or falling back to remote', async () => {
    const fixture = serviceFixture([]);
    await expect(fixture.service.buildLocalSnapshot([], {})).rejects.toThrow(/本地|local|empty/i);
    expect(fixture.store.values).toHaveLength(0);
    expect(fixture.networkCalls()).toBe(0);
  });

  it('reports an empty selected region locally without any remote fallback', async () => {
    const fixture = serviceFixture();
    await expect(fixture.service.buildLocalSnapshot(fixture.records, { regionIds: ['jiangsu'] }))
      .rejects.toThrow('当前本地案例库中没有符合该地区条件的案例。');
    expect(fixture.networkCalls()).toBe(0);
  });

  it('supports exhaustive and sampled AnalysisRuns using only the fixed local IDs', async () => {
    const fixture = serviceFixture();
    const snapshot = await fixture.service.buildLocalSnapshot(fixture.records, {});
    const samplingRuns = new MemorySamplingRunStore();
    const analysisRuns = new MemoryAnalysisRunStore();
    const sampling = new SamplingService(fixture.store, samplingRuns, {
      now: () => '2026-09-14T00:01:00.000Z',
      createId: () => 'local-sample',
    });
    const analyses = new AnalysisRunService(fixture.store, samplingRuns, analysisRuns, {
      now: () => '2026-09-14T00:02:00.000Z',
      createId: () => `local-analysis-${analysisRuns.values.length + 1}`,
    });
    const exhaustive = await analyses.createAnalysisRun({
      mode: 'exhaustive', snapshotId: snapshot.id,
      engineVersions: CURRENT_ANALYSIS_ENGINE_VERSIONS, semantic: { enabled: false },
    });
    const samplingRun = await sampling.createSamplingRun({ snapshotId: snapshot.id, seed: 'local', sampleSize: 4 });
    const sampled = await analyses.createAnalysisRun({
      mode: 'sampled', snapshotId: snapshot.id, samplingRunId: samplingRun.id,
      engineVersions: CURRENT_ANALYSIS_ENGINE_VERSIONS, semantic: { enabled: false },
    });
    const localIds = new Set(snapshot.candidates.map((candidate) => candidate.caseId));
    expect(exhaustive.inputCaseIds).toEqual([...localIds].sort());
    expect(sampled.inputCaseIds).toEqual(samplingRun.sampledCaseIds);
    expect(sampled.inputCaseIds.every((id) => localIds.has(id))).toBe(true);
  });
});

class MemorySamplingRunStore implements SamplingRunStore {
  values: SamplingRun[] = [];
  async save(run: SamplingRun) { this.values.push(structuredClone(run)); }
  async get(id: string) { return this.values.find((run) => run.id === id); }
  async list(snapshotId?: string) { return this.values.filter((run) => !snapshotId || run.snapshotId === snapshotId); }
}

class MemoryAnalysisRunStore implements AnalysisRunStore {
  values: AnalysisRun[] = [];
  async save(run: AnalysisRun) { this.values.push(structuredClone(run)); }
  async get(id: string) { return this.values.find((run) => run.id === id); }
  async list() { return [...this.values]; }
}

class WorkspaceSnapshots implements ResearchWorkspaceSnapshots {
  localCalls = 0;
  remoteCalls = 0;
  values: CandidatePoolSnapshot[] = [];
  async listSnapshots() { return this.values.map(({ candidates: _candidates, ...header }) => header); }
  async getSnapshot(id: string) { return this.values.find((item) => item.id === id); }
  async buildLocalSnapshot(records: AnalysisCaseRecord[], input: CandidateFilterInput) {
    this.localCalls++;
    const fixture = serviceFixture(records);
    const created = await fixture.service.buildLocalSnapshot(records, input);
    this.values.push(created);
    return created;
  }
  async buildSnapshot(_input: CandidateFilterInput, _options?: BuildSnapshotOptions) {
    this.remoteCalls++;
    const fixture = serviceFixture([]);
    const created = await fixture.service.buildLocalSnapshot([analysisRecord('remote', 'supported', { rawDocumentId: 'remote' })], {});
    created.sourceMode = 'remote';
    this.values.push(created);
    return created;
  }
}

class LocalRecords implements ResearchWorkspaceLocalRecords {
  constructor(private readonly values: AnalysisCaseRecord[]) {}
  async listLocalAnalysisRecords() { return this.values; }
}

class NoopSampling implements ResearchWorkspaceSampling {
  async listSamplingRuns(): Promise<SamplingRun[]> { return []; }
  async createSamplingRun(): Promise<SamplingRun> { throw new Error('not used'); }
  async createStratifiedSamplingRun(): Promise<SamplingRun> { throw new Error('not used'); }
}

class NoopAnalysis implements ResearchWorkspaceAnalysisRuns {
  async listAnalysisRuns(): Promise<AnalysisRun[]> { return []; }
  async createAnalysisRun(): Promise<AnalysisRun> { throw new Error('not used'); }
}

class NoopPreparation implements ResearchWorkspaceCasePreparation {
  async prepareSnapshot() { return { requestedCount: 0, alreadyAvailableCount: 0, fetchedCount: 0, savedCount: 0, failedCaseIds: [] }; }
}

describe('Research Workspace source mode contract', () => {
  it('uses local records by default and never invokes the remote builder', async () => {
    const snapshots = new WorkspaceSnapshots();
    const service = new ResearchWorkspaceService(
      snapshots,
      new NoopSampling(),
      new NoopAnalysis(),
      new NoopPreparation(),
      new LocalRecords(localRecords()),
    );
    const created = await service.createSnapshot({});
    expect(created.candidateCount).toBe(10);
    expect(snapshots.localCalls).toBe(1);
    expect(snapshots.remoteCalls).toBe(0);
  });

  it('invokes remote enumeration only through the explicit remote method', async () => {
    const snapshots = new WorkspaceSnapshots();
    const service = new ResearchWorkspaceService(
      snapshots,
      new NoopSampling(),
      new NoopAnalysis(),
      new NoopPreparation(),
      new LocalRecords(localRecords()),
    );
    await service.createRemoteSnapshot({ province: ['广东省'] });
    expect(snapshots.remoteCalls).toBe(1);
    expect(snapshots.localCalls).toBe(0);
  });

  it('does not silently fall back to remote when the local corpus is empty', async () => {
    const snapshots = new WorkspaceSnapshots();
    const service = new ResearchWorkspaceService(
      snapshots,
      new NoopSampling(),
      new NoopAnalysis(),
      new NoopPreparation(),
      new LocalRecords([]),
    );
    await expect(service.createSnapshot({})).rejects.toThrow(/本地|local|empty/i);
    expect(snapshots.localCalls).toBe(0);
    expect(snapshots.remoteCalls).toBe(0);
  });
});
