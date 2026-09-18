import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type {
  AnalysisRun,
  AnalysisCaseRecord,
  CandidatePoolSnapshot,
  CandidatePoolSnapshotHeader,
  SamplingRun,
} from '../../src/types';
import type { BuildSnapshotOptions, CandidateFilterInput } from '../../src/services/dataset/CandidatePoolSnapshotService';
import {
  CURRENT_ANALYSIS_ENGINE_VERSIONS,
  getCurrentAnalysisEngineVersions,
  getDefaultSemanticAnalysisConfig,
} from '../../src/services/analysis/AnalysisEngineVersions';
import {
  ResearchWorkspaceService,
  type ResearchWorkspaceAnalysisRuns,
  type ResearchWorkspaceLocalRecords,
  type ResearchWorkspaceSampling,
  type ResearchWorkspaceSnapshots,
} from '../../src/services/analysis/ResearchWorkspaceService';
import { calculateCandidateHash, calculateSampleHash } from '../../src/services/sampling/SamplingService';
import { ResearchCasePreparationService } from '../../src/services/analysis/ResearchCasePreparationService';
import type { RawDocument } from '../../src/types';
import { analysisRecord } from './helpers/record-factories';

const filters = {
  remoteFilters: { provinces: ['广东省'], startDate: '2023-11-28', endDate: '2023-11-30', caseLevels: ['一审', '二审'] },
  localEligibilityRules: { cities: ['广州', '深圳'] },
};

async function snapshot(
  id: string,
  caseIds: string[],
  status: CandidatePoolSnapshot['status'] = 'complete',
): Promise<CandidatePoolSnapshot> {
  const candidates = caseIds.map((caseId, index) => ({
    caseId,
    year: 2023,
    city: index % 2 ? '深圳' : '广州',
    caseLevel: index % 2 ? '二审' : '一审',
    pbDt: `2023-11-${28 + (index % 3)}`,
  }));
  return {
    id,
    source: 'laborinfo',
    filters,
    candidateCount: caseIds.length,
    createdAt: '2026-09-12T09:00:00.000Z',
    snapshotVersion: 'candidate-pool-v1',
    filterContractVersion: 'laborinfo-filter-v2',
    candidateHash: await calculateCandidateHash(caseIds),
    snapshotFingerprint: `fingerprint-${id}`,
    status,
    expectedPages: 1,
    fetchedPages: status === 'complete' ? 1 : 0,
    failedPages: status === 'complete' ? [] : [1],
    duplicateCount: 0,
    limitedByMaxPages: false,
    exclusions: { excludedKnownTestCases: 0, excludedOther: 0, excludedUnknown: 0 },
    distribution: {
      byCity: { 广州: Math.ceil(caseIds.length / 2), 深圳: Math.floor(caseIds.length / 2) },
      byYear: { '2023': caseIds.length },
      byCaseLevel: { 一审: Math.ceil(caseIds.length / 2), 二审: Math.floor(caseIds.length / 2) },
    },
    candidates,
  };
}

class SnapshotAccess implements ResearchWorkspaceSnapshots {
  buildInputs: CandidateFilterInput[] = [];
  localBuildInputs: CandidateFilterInput[] = [];
  constructor(private values: CandidatePoolSnapshot[]) {}
  async listSnapshots(): Promise<CandidatePoolSnapshotHeader[]> { return this.values.map(({ candidates: _candidates, ...header }) => header); }
  async getSnapshot(id: string): Promise<CandidatePoolSnapshot | undefined> { return this.values.find((item) => item.id === id); }
  async buildSnapshot(input: CandidateFilterInput, _options?: BuildSnapshotOptions): Promise<CandidatePoolSnapshot> {
    this.buildInputs.push(structuredClone(input));
    const created = await snapshot(`snapshot-created-${this.values.length}`, ['REAL-1', 'REAL-2']);
    created.filters.remoteFilters.provinces = Array.isArray(input.province) ? input.province : [input.province ?? ''];
    created.filters.remoteFilters.caseLevels = Array.isArray(input.caseLevels) ? input.caseLevels : [input.caseLevels ?? ''];
    created.filters.localEligibilityRules.cities = Array.isArray(input.cities) ? input.cities : [input.cities ?? ''];
    this.values.push(created);
    return created;
  }
  async buildLocalSnapshot(records: AnalysisCaseRecord[], input: CandidateFilterInput): Promise<CandidatePoolSnapshot> {
    this.localBuildInputs.push(structuredClone(input));
    const created = await snapshot(`snapshot-created-${this.values.length}`, records.map((record) => record.rawDocumentId));
    created.sourceMode = 'local';
    this.values.push(created);
    return created;
  }
}

class LocalRecordAccess implements ResearchWorkspaceLocalRecords {
  async listLocalAnalysisRecords(): Promise<AnalysisCaseRecord[]> {
    return ['A', 'B', 'C'].map((id) => analysisRecord(id, 'supported', {
      rawDocumentId: id,
      title: `案例 ${id}`,
      city: '广州',
      year: 2023,
      date: '2023-11-28',
      caseLevel: '一审',
      court: '广州市中级人民法院',
    }));
  }
}

class SamplingAccess implements ResearchWorkspaceSampling {
  runs: SamplingRun[] = [];
  async listSamplingRuns(snapshotId?: string): Promise<SamplingRun[]> { return this.runs.filter((run) => !snapshotId || run.snapshotId === snapshotId); }
  async createSamplingRun(input: { snapshotId: string; seed: string | number; sampleSize: number }): Promise<SamplingRun> {
    const run: SamplingRun = {
      id: `seeded-${this.runs.length + 1}`,
      snapshotId: input.snapshotId,
      snapshotFingerprint: `fingerprint-${input.snapshotId}`,
      candidateHash: 'candidate-hash',
      method: 'seeded_random',
      seed: String(input.seed),
      requestedSampleSize: input.sampleSize,
      actualSampleSize: input.sampleSize,
      sampledCaseIds: Array.from({ length: input.sampleSize }, (_, index) => `${input.snapshotId}-${index}`),
      algorithmVersion: 'seeded-random-v1',
      sampleHash: await calculateSampleHash(Array.from({ length: input.sampleSize }, (_, index) => `${input.snapshotId}-${index}`)),
      createdAt: '2026-09-12T10:00:00.000Z',
    };
    this.runs.push(run);
    return run;
  }
  async createStratifiedSamplingRun(input: { snapshotId: string; seed: string | number; sampleSize: number; dimensions: ('city' | 'year' | 'caseLevel')[]; allocationStrategy: 'proportional' | 'balanced' }): Promise<SamplingRun> {
    const ids = Array.from({ length: input.sampleSize }, (_, index) => `${input.snapshotId}-${index}`);
    const run: SamplingRun = {
      id: `stratified-${this.runs.length + 1}`,
      snapshotId: input.snapshotId,
      snapshotFingerprint: `fingerprint-${input.snapshotId}`,
      candidateHash: 'candidate-hash',
      method: 'stratified_seeded_random',
      seed: String(input.seed),
      requestedSampleSize: input.sampleSize,
      actualSampleSize: input.sampleSize,
      sampledCaseIds: ids,
      algorithmVersion: 'stratified-seeded-v1',
      sampleHash: await calculateSampleHash(ids),
      samplingConfigHash: 'config-hash',
      stratification: { dimensions: input.dimensions, allocationStrategy: input.allocationStrategy, strata: [] },
      createdAt: '2026-09-12T10:00:00.000Z',
    };
    this.runs.push(run);
    return run;
  }
}

class AnalysisAccess implements ResearchWorkspaceAnalysisRuns {
  runs: AnalysisRun[] = [];
  async listAnalysisRuns(): Promise<AnalysisRun[]> { return [...this.runs]; }
  async createAnalysisRun(input: Parameters<ResearchWorkspaceAnalysisRuns['createAnalysisRun']>[0]): Promise<AnalysisRun> {
    const samplingRunId = input.mode === 'sampled' ? input.samplingRunId : undefined;
    const run: AnalysisRun = {
      id: `analysis-${this.runs.length + 1}`,
      analysisContractVersion: 'analysis-provenance-v1',
      mode: input.mode,
      snapshotId: input.snapshotId,
      snapshotFingerprint: `fingerprint-${input.snapshotId}`,
      candidateHash: 'candidate-hash',
      ...(samplingRunId ? { samplingRunId } : {}),
      inputCaseIds: input.mode === 'exhaustive' ? ['A', 'B', 'C'] : ['B'],
      inputCaseCount: input.mode === 'exhaustive' ? 3 : 1,
      engineVersions: input.engineVersions,
      semantic: input.semantic,
      status: 'pending',
      createdAt: '2026-09-12T11:00:00.000Z',
      provenanceHash: `hash-${this.runs.length + 1}`,
    };
    this.runs.push(run);
    return run;
  }
}

async function setup() {
  const a = await snapshot('snapshot-A', ['A', 'B', 'C']);
  const b = await snapshot('snapshot-B', ['D', 'E', 'F']);
  const partial = await snapshot('snapshot-partial', ['P'], 'partial');
  const snapshots = new SnapshotAccess([a, b, partial]);
  const sampling = new SamplingAccess();
  const analyses = new AnalysisAccess();
  return { service: new ResearchWorkspaceService(snapshots, sampling, analyses, undefined, new LocalRecordAccess()), snapshots, sampling, analyses };
}

describe('Research Workspace service contract', () => {
  it('delegates valid Snapshot form arrays to CandidatePoolSnapshotService', async () => {
    const { service, snapshots } = await setup();
    const created = await service.createRemoteSnapshot({ province: ['广东省', '广西壮族自治区'], caseLevels: ['一审', '二审'], startDate: '2023-11-28', endDate: '2023-11-30', cities: ['广州', '深圳', '东莞'], q: '劳动合同' });
    expect(created.status).toBe('complete');
    expect(snapshots.buildInputs[0]).toMatchObject({ province: ['广东省', '广西壮族自治区'], caseLevels: ['一审', '二审'], cities: ['广州', '深圳', '东莞'] });
  });

  it('blocks an invalid date range before invoking SnapshotService', async () => {
    const { service, snapshots } = await setup();
    await expect(service.createRemoteSnapshot({ province: ['广东省'], caseLevels: ['一审'], startDate: '2023-12-01', endDate: '2023-11-01', cities: [] })).rejects.toThrow(/日期|date/i);
    expect(snapshots.buildInputs).toHaveLength(0);
  });

  it('Snapshot creation does not auto-create SamplingRun or AnalysisRun', async () => {
    const { service, sampling, analyses } = await setup();
    await service.createSnapshot({ province: ['广东省'], caseLevels: ['一审', '二审'], cities: ['广州'] });
    expect(sampling.runs).toHaveLength(0);
    expect(analyses.runs).toHaveLength(0);
  });

  it('reloads and exposes a newly persisted complete Snapshot as selectable', async () => {
    const { service } = await setup();
    const created = await service.createSnapshot({ province: ['广东省'], caseLevels: ['一审'], cities: [] });
    const reloaded = await service.loadWorkspace();
    expect(reloaded.snapshots.find((item) => item.id === created.id)?.isSelectable).toBe(true);
  });

  it('can create exhaustive and sampled AnalysisRuns from a newly created Snapshot', async () => {
    const { service } = await setup();
    const created = await service.createSnapshot({ province: ['广东省'], caseLevels: ['一审'], cities: [] });
    const exhaustive = await service.createAnalysisRun({ snapshotId: created.id, mode: 'exhaustive', semanticEnabled: false });
    const sampling = await service.createSamplingRun({ method: 'seeded_random', snapshotId: created.id, sampleSize: 1, seed: 42 });
    const sampled = await service.createAnalysisRun({ snapshotId: created.id, mode: 'sampled', samplingRunId: sampling.id, semanticEnabled: false });
    expect([exhaustive.mode, sampled.mode]).toEqual(['exhaustive', 'sampled']);
  });
  it('lists snapshots while identifying only complete non-empty snapshots as selectable', async () => {
    const { service } = await setup();
    const workspace = await service.loadWorkspace();
    expect(workspace.snapshots.map((item) => [item.id, item.isSelectable])).toEqual([
      ['snapshot-A', true], ['snapshot-B', true], ['snapshot-partial', false],
    ]);
  });

  it('rejects partial and empty snapshots before creating formal objects', async () => {
    const { service } = await setup();
    await expect(service.createAnalysisRun({ snapshotId: 'snapshot-partial', mode: 'exhaustive', semanticEnabled: false })).rejects.toThrow(/完整|complete/i);
    const empty = await snapshot('empty', []);
    const isolated = new ResearchWorkspaceService(new SnapshotAccess([empty]), new SamplingAccess(), new AnalysisAccess());
    await expect(isolated.createAnalysisRun({ snapshotId: 'empty', mode: 'exhaustive', semanticEnabled: false })).rejects.toThrow(/空|empty/i);
  });

  it('creates exhaustive AnalysisRun without a SamplingRun and fixes current engine versions', async () => {
    const { service, analyses } = await setup();
    const run = await service.createAnalysisRun({ snapshotId: 'snapshot-A', mode: 'exhaustive', semanticEnabled: false });
    expect(run.samplingRunId).toBeUndefined();
    expect(run.engineVersions).toEqual(CURRENT_ANALYSIS_ENGINE_VERSIONS);
    expect(run.semantic).toEqual({ enabled: false });
    expect(analyses.runs).toHaveLength(1);
  });

  it('requires a SamplingRun for sampled mode', async () => {
    const { service } = await setup();
    await expect(service.createAnalysisRun({ snapshotId: 'snapshot-A', mode: 'sampled', semanticEnabled: false } as never)).rejects.toThrow(/SamplingRun/i);
  });

  it('scopes SamplingRun lists to the selected Snapshot', async () => {
    const { service, sampling } = await setup();
    await sampling.createSamplingRun({ snapshotId: 'snapshot-A', seed: 1, sampleSize: 1 });
    await sampling.createSamplingRun({ snapshotId: 'snapshot-B', seed: 2, sampleSize: 1 });
    expect((await service.listSamplingRuns('snapshot-A')).map((run) => run.snapshotId)).toEqual(['snapshot-A']);
  });

  it('creates seeded and stratified runs through the existing sampling service boundary', async () => {
    const { service } = await setup();
    const seeded = await service.createSamplingRun({ method: 'seeded_random', snapshotId: 'snapshot-A', sampleSize: 1, seed: '42' });
    const stratified = await service.createSamplingRun({ method: 'stratified_seeded_random', snapshotId: 'snapshot-A', sampleSize: 2, seed: 'stable', dimensions: ['city', 'year'], allocationStrategy: 'balanced' });
    expect(seeded.method).toBe('seeded_random');
    expect(stratified.method).toBe('stratified_seeded_random');
    expect(stratified.method === 'stratified_seeded_random' && stratified.stratification.allocationStrategy).toBe('balanced');
  });

  it('rejects a SamplingRun from another Snapshot', async () => {
    const { service, sampling } = await setup();
    const other = await sampling.createSamplingRun({ snapshotId: 'snapshot-B', seed: 2, sampleSize: 1 });
    await expect(service.createAnalysisRun({ snapshotId: 'snapshot-A', mode: 'sampled', samplingRunId: other.id, semanticEnabled: false })).rejects.toThrow(/Snapshot/i);
  });

  it('adds created runs to the workspace without mutating historical runs', async () => {
    const { service, analyses } = await setup();
    const first = await service.createAnalysisRun({ snapshotId: 'snapshot-A', mode: 'exhaustive', semanticEnabled: false });
    const frozen = structuredClone(first);
    await service.createAnalysisRun({ snapshotId: 'snapshot-B', mode: 'exhaustive', semanticEnabled: false });
    expect(analyses.runs).toHaveLength(2);
    expect(analyses.runs[0]).toEqual(frozen);
  });

  it('reloads persisted workspace objects through fresh service orchestration', async () => {
    const { service, snapshots, sampling, analyses } = await setup();
    const created = await service.createAnalysisRun({ snapshotId: 'snapshot-A', mode: 'exhaustive', semanticEnabled: false });
    const reloaded = await new ResearchWorkspaceService(snapshots, sampling, analyses).loadWorkspace();
    expect(reloaded.analysisRuns.map((run) => run.id)).toContain(created.id);
    expect(reloaded.analysisRuns[0].engineVersions).toEqual(CURRENT_ANALYSIS_ENGINE_VERSIONS);
  });

  it('keeps multiple and overlapping research inputs as references rather than copied records', async () => {
    const { service } = await setup();
    const a = await service.createAnalysisRun({ snapshotId: 'snapshot-A', mode: 'exhaustive', semanticEnabled: false });
    const b = await service.createAnalysisRun({ snapshotId: 'snapshot-B', mode: 'exhaustive', semanticEnabled: false });
    expect(a.id).not.toBe(b.id);
    expect(new Set([...a.inputCaseIds, ...b.inputCaseIds]).size).toBeLessThanOrEqual(a.inputCaseIds.length + b.inputCaseIds.length);
    expect('records' in a).toBe(false);
  });

  it('uses centralized versions and explicit semantic configuration', () => {
    expect(getCurrentAnalysisEngineVersions()).toEqual(CURRENT_ANALYSIS_ENGINE_VERSIONS);
    expect(getCurrentAnalysisEngineVersions()).not.toBe(CURRENT_ANALYSIS_ENGINE_VERSIONS);
    expect(getDefaultSemanticAnalysisConfig()).toEqual({ enabled: false });
  });

  it('requires explicit semantic provider metadata when enabled', async () => {
    const { service } = await setup();
    const run = await service.createAnalysisRun({ snapshotId: 'snapshot-A', mode: 'exhaustive', semanticEnabled: true });
    expect(run.semantic).toMatchObject({ enabled: true, promptVersion: expect.any(String), provider: 'openrouter', model: 'openrouter/free' });
  });
});

describe('Research Workspace UI contract', () => {
  const workspaceSource = readFileSync(new URL('../../src/components/ResearchWorkspace.tsx', import.meta.url), 'utf8');
  const appSource = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');

  it('is orchestration-only and does not invoke analytics engines or database-wide loaders', () => {
    expect(workspaceSource).not.toMatch(/LaborDisputeAnalyticsEngine|DefenseStrategyAnalyzer|getAllAnalysisRecords/);
  });

  it('does not auto-select the latest Snapshot or AnalysisRun', () => {
    expect(workspaceSource).toMatch(/请选择研究总体/);
    expect(workspaceSource).not.toMatch(/(?:snapshots|analysisRuns)\s*\[\s*0\s*\]/);
  });

  it('shows balanced representativeness warning during creation', () => {
    expect(workspaceSource).toMatch(/平衡抽样适合组间比较/);
    expect(workspaceSource).toMatch(/不代表总体分布/);
  });

  it('supports safe failed-state output without stack or raw provider responses', () => {
    expect(workspaceSource).toMatch(/errorCode/);
    expect(workspaceSource).toMatch(/errorMessage/);
    expect(workspaceSource).not.toMatch(/\.stack|raw provider response/i);
  });

  it('carries analysisRunId to both formal destinations', () => {
    expect(workspaceSource).toMatch(/onOpenLaborAnalytics\(run\.id\)/);
    expect(workspaceSource).toMatch(/onOpenDefenseAnalysis\(run\.id\)/);
    expect(appSource).toMatch(/initialAnalysisRunId/);
  });

  it('has an empty state and no delete or mutation controls', () => {
    expect(workspaceSource).toMatch(/尚无研究总体/);
    expect(workspaceSource).toMatch(/创建研究总体/);
    expect(workspaceSource).not.toMatch(/删除研究|deleteAnalysisRun|updateAnalysisRun/);
  });

  it('exposes explicit create flow and disables sampled creation without a SamplingRun', () => {
    expect(workspaceSource).toMatch(/创建研究运行/);
    expect(workspaceSource).toMatch(/mode === 'sampled'.*!selectedSamplingRunId/s);
  });

  it('adds a dedicated Research Workspace navigation entry', () => {
    const sidebarSource = readFileSync(new URL('../../src/components/Sidebar.tsx', import.meta.url), 'utf8');
    expect(sidebarSource).toMatch(/researchWorkspace/);
    expect(sidebarSource).toMatch(/研究工作区/);
  });

  it('Snapshot form preserves multi-select concepts and does not expose per_page', () => {
    expect(workspaceSource).toMatch(/一审/);
    expect(workspaceSource).toMatch(/二审/);
    expect(workspaceSource).toMatch(/REGION_OPTIONS/);
    expect(workspaceSource).toMatch(/地区范围/);
    expect(workspaceSource).not.toMatch(/per_page|perPage/);
  });

  it('makes local records the ordinary create path and isolates remote enumeration behind an advanced entry', () => {
    expect(workspaceSource).toMatch(/基于本地已入库案例创建固定研究范围，不会重新请求远程数据/);
    expect(workspaceSource).toMatch(/workspaceService\.createSnapshot\(\{ caseLevels:/);
    expect(workspaceSource).toMatch(/从远程数据源构建总体（高级）/);
    expect(workspaceSource).toMatch(/workspaceService\.createRemoteSnapshot/);
  });

  it('disables local creation for an empty corpus without silently falling back to remote', () => {
    expect(workspaceSource).toMatch(/disabled=\{localRecordCount === 0\}/);
    expect(workspaceSource).toMatch(/当前本地案例库为空，请先导入或准备案例/);
  });

  it('Snapshot creation UI does not invoke fulltext, Parser, Gemini, Sampling, or Analysis creation', () => {
    const createPanel = workspaceSource.slice(workspaceSource.indexOf('handleCreateSnapshot'), workspaceSource.indexOf('handleSnapshotChange'));
    expect(createPanel).not.toMatch(/fetchCaseDetail|Parser|Gemini|createSamplingRun|createAnalysisRun/);
  });

  it('exposes exact-ID case preparation separately from metadata-only Snapshot creation', () => {
    expect(workspaceSource).toMatch(/准备研究案例/);
    expect(workspaceSource).toMatch(/prepareSnapshotRecords/);
  });
});

describe('exact-ID research case preparation', () => {
  const raw = (sourceId: string): RawDocument => ({ id: `raw-${sourceId}`, source: 'laborinfo', sourceId, title: sourceId, contentType: 'json', rawText: `真实正文 ${sourceId}`, contentHash: `hash-${sourceId}`, importedAt: '2026-09-12T00:00:00.000Z' });

  it('fetches exactly Snapshot candidate IDs and stores matching sourceIds', async () => {
    const target = await snapshot('snapshot-real', ['A', 'B', 'C']);
    const fetched: string[] = [];
    const stored: RawDocument[] = [];
    const service = new ResearchCasePreparationService(
      { fetchCaseDetail: async (id) => { fetched.push(String(id)); return raw(String(id)); } },
      { list: async () => [raw('UNRELATED')], save: async (document) => { stored.push(document); return { saved: true, isDuplicate: false, docId: document.id }; } },
    );
    const result = await service.prepareSnapshot(target);
    expect(fetched).toEqual(['A', 'B', 'C']);
    expect(stored.map((item) => item.sourceId)).toEqual(['A', 'B', 'C']);
    expect(result).toMatchObject({ requestedCount: 3, fetchedCount: 3, savedCount: 3, failedCaseIds: [] });
  });

  it('skips existing exact IDs and never processes unrelated records', async () => {
    const target = await snapshot('snapshot-real', ['A', 'B']);
    const fetched: string[] = [];
    const service = new ResearchCasePreparationService(
      { fetchCaseDetail: async (id) => { fetched.push(String(id)); return raw(String(id)); } },
      { list: async () => [raw('A'), raw('EXTRA')], save: async (document) => ({ saved: true, isDuplicate: false, docId: document.id }) },
    );
    expect(await service.prepareSnapshot(target)).toMatchObject({ requestedCount: 2, alreadyAvailableCount: 1, fetchedCount: 1 });
    expect(fetched).toEqual(['B']);
  });

  it('rejects mismatched source IDs and reports failed detail fetches without replacement', async () => {
    const target = await snapshot('snapshot-real', ['A', 'B']);
    const service = new ResearchCasePreparationService(
      { fetchCaseDetail: async (id) => { if (id === 'A') return raw('WRONG'); throw new Error('HTTP 500'); } },
      { list: async () => [], save: async (document) => ({ saved: true, isDuplicate: false, docId: document.id }) },
    );
    const result = await service.prepareSnapshot(target);
    expect(result.failedCaseIds).toEqual(['A', 'B']);
    expect(result.savedCount).toBe(0);
  });
});
