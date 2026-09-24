import { describe, expect, it } from 'vitest';
import { analysisRecord } from './helpers/record-factories';
import {
  filterRecordsByResearchGeographicScope,
  getResearchGeographicOptions,
  normalizeResearchCity,
  PEARL_RIVER_DELTA_CITIES,
} from '../../src/services/research/ResearchGeographicScope';
import {
  CandidatePoolSnapshotService,
  type CandidatePoolSnapshotStore,
} from '../../src/services/dataset/CandidatePoolSnapshotService';
import { AnalysisRunService, type AnalysisRunStore, type AnalysisRunSnapshotStore, type AnalysisRunSamplingStore } from '../../src/services/analysis/AnalysisRunService';
import { calculateCandidateHash } from '../../src/services/sampling/SamplingService';
import type { AnalysisCaseRecord, CandidatePoolSnapshot, CandidatePoolSnapshotHeader } from '../../src/types';

class MemoryStore implements CandidatePoolSnapshotStore {
  values: CandidatePoolSnapshot[] = [];
  async save(snapshot: CandidatePoolSnapshot) { this.values.push(snapshot); }
  async get(id: string) { return this.values.find((snapshot) => snapshot.id === id); }
  async list(): Promise<CandidatePoolSnapshotHeader[]> { return this.values.map(({ candidates: _candidates, ...header }) => header); }
}

function records(): AnalysisCaseRecord[] {
  return [
    analysisRecord('gz', 'supported', { city: '广州市', court: '广东省广州市中级人民法院', year: 2023 }),
    analysisRecord('sz', 'supported', { city: '深圳', court: '广东省深圳市中级人民法院', year: 2023 }),
    analysisRecord('shantou', 'supported', { city: '汕尾市', court: '广东省汕尾市中级人民法院', year: 2022 }),
    analysisRecord('shanghai', 'supported', { city: '上海', court: '上海市第一中级人民法院', year: 2023 }),
  ];
}

describe('Research Geographic Scope', () => {
  it('normalizes only the comparison suffix and preserves empty values', () => {
    expect(normalizeResearchCity(' 佛山市 ')).toBe('佛山');
    expect(normalizeResearchCity('佛山')).toBe('佛山');
    expect(normalizeResearchCity('')).toBe('');
  });

  it('filters all, province, Pearl River Delta and custom cities deterministically', () => {
    const input = records();
    expect(filterRecordsByResearchGeographicScope(input, { mode: 'all' })).toHaveLength(4);
    expect(filterRecordsByResearchGeographicScope(input, { mode: 'province', provinces: ['广东省'] }).map((r) => r.caseId)).toEqual(['gz', 'sz', 'shantou']);
    expect(filterRecordsByResearchGeographicScope(input, { mode: 'pearl_river_delta' }).map((r) => r.caseId)).toEqual(['gz', 'sz']);
    expect(filterRecordsByResearchGeographicScope(input, { mode: 'custom_cities', cities: ['上海'] }).map((r) => r.caseId)).toEqual(['shanghai']);
    expect(PEARL_RIVER_DELTA_CITIES).toHaveLength(9);
  });

  it('builds options only from real records and excludes empty cities', () => {
    const options = getResearchGeographicOptions([...records(), analysisRecord('unknown', 'supported', { city: '', court: '' })]);
    expect(options.cities).toEqual(['上海', '广州', '汕尾', '深圳']);
    expect(options.provinces).toEqual(['上海市', '广东省']);
    expect(options.cityCounts['上海']).toBe(1);
    expect(options.cities).not.toContain('');
  });

  it('freezes scope in a local snapshot and composes it with year and case level', async () => {
    const service = new CandidatePoolSnapshotService(undefined, new MemoryStore(), {
      now: () => '2026-09-24T00:00:00.000Z',
      createId: () => 'geo-snapshot',
    });
    const snapshot = await service.buildLocalSnapshot(records(), {
      geographicScope: { mode: 'pearl_river_delta' },
      caseLevels: ['一审'],
      startDate: '2023-01-01',
      endDate: '2023-12-31',
    });
    expect(snapshot.candidates.map((candidate) => candidate.caseId)).toEqual(['raw-gz', 'raw-sz']);
    expect(snapshot.geographicScope).toEqual({ mode: 'pearl_river_delta' });
    expect(snapshot.filters.geographicScope).toEqual({ mode: 'pearl_river_delta' });
  });

  it('does not persist an empty population or widen a zero-result scope', async () => {
    const service = new CandidatePoolSnapshotService(undefined, new MemoryStore());
    await expect(service.buildLocalSnapshot(records(), { geographicScope: { mode: 'custom_cities', cities: ['不存在'] } }))
      .rejects.toThrow('当前本地案例库中没有符合该地区条件的案例。');
  });

  it('copies the frozen scope into new AnalysisRuns and defaults legacy runs to all', async () => {
    const snapshot = await serviceSnapshot('run-snapshot', { mode: 'custom_cities', cities: ['广州'] });
    const snapshots: AnalysisRunSnapshotStore = { get: async () => snapshot };
    const sampling: AnalysisRunSamplingStore = { get: async () => undefined };
    const runs: AnalysisRunStore = {
      values: [] as any[],
      async save(run) { this.values.push(run); },
      async get(id) { return this.values.find((run) => run.id === id); },
      async list() { return this.values; },
    } as AnalysisRunStore & { values: any[] };
    const service = new AnalysisRunService(snapshots, sampling, runs, { now: () => '2026-09-24T00:00:00.000Z', createId: () => 'run-1' });
    const run = await service.createAnalysisRun({ mode: 'exhaustive', snapshotId: snapshot.id, engineVersions: { parserVersion: 'p1', rulesetVersion: 'r1' }, semantic: { enabled: false } });
    expect(run.geographicScope).toEqual({ mode: 'custom_cities', cities: ['广州'] });
  });
});

async function serviceSnapshot(id: string, geographicScope?: CandidatePoolSnapshot['geographicScope']): Promise<CandidatePoolSnapshot> {
  const candidates = [{ caseId: 'case-1', year: 2023, caseLevel: '一审', city: '广州' }];
  const candidateHash = await calculateCandidateHash(candidates.map((candidate) => candidate.caseId));
  return {
    id, source: 'laborinfo', filters: { remoteFilters: { provinces: [], caseLevels: [] }, localEligibilityRules: { cities: [] }, ...(geographicScope ? { geographicScope } : {}) },
    geographicScope, candidateCount: 1, candidates, createdAt: '2026-09-24T00:00:00.000Z', snapshotVersion: 'candidate-pool-v1', filterContractVersion: 'laborinfo-filter-v2', candidateHash, snapshotFingerprint: `fingerprint-${id}`, status: 'complete', expectedPages: 0, fetchedPages: 0, failedPages: [], duplicateCount: 0, limitedByMaxPages: false, exclusions: { excludedKnownTestCases: 0, excludedOther: 0, excludedUnknown: 0 }, distribution: { byCity: { 广州: 1 }, byYear: { '2023': 1 }, byCaseLevel: { 一审: 1 } },
  };
}
