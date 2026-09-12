import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  STRATIFIED_SAMPLING_ALGORITHM_VERSION,
  SamplingService,
  allocateBalanced,
  allocateProportional,
  buildStrata,
  calculateCandidateHash,
  normalizeStratificationDimensions,
  summarizeSamplingRun,
  type SamplingRunStore,
} from '../../src/services/sampling/SamplingService';
import type {
  AllocationStrategy,
  CandidateMetadata,
  CandidatePoolSnapshot,
  CandidateStratum,
  SamplingRun,
  StratificationDimension,
} from '../../src/types';

class SnapshotStore {
  constructor(private readonly snapshot: CandidatePoolSnapshot) {}
  async get(id: string) {
    return id === this.snapshot.id ? structuredClone(this.snapshot) : undefined;
  }
}

class RunStore implements SamplingRunStore {
  runs = new Map<string, SamplingRun>();
  async save(run: SamplingRun) { this.runs.set(run.id, structuredClone(run)); }
  async get(id: string) { const run = this.runs.get(id); return run ? structuredClone(run) : undefined; }
  async list(snapshotId?: string) {
    return [...this.runs.values()].filter((run) => !snapshotId || run.snapshotId === snapshotId).map((run) => structuredClone(run));
  }
}

async function makeSnapshot(candidates: CandidateMetadata[], id = 'stratified-snapshot'): Promise<CandidatePoolSnapshot> {
  return {
    id,
    source: 'laborinfo',
    filters: { remoteFilters: { provinces: ['广东省'], caseLevels: ['一审', '二审'] }, localEligibilityRules: { cities: [] } },
    candidateCount: candidates.length,
    candidates,
    createdAt: '2026-09-12T00:00:00.000Z',
    snapshotVersion: 'candidate-pool-v1',
    filterContractVersion: 'laborinfo-filter-v2',
    candidateHash: await calculateCandidateHash(candidates.map((candidate) => candidate.caseId)),
    snapshotFingerprint: `fingerprint-${id}`,
    status: 'complete',
    expectedPages: 1,
    fetchedPages: 1,
    failedPages: [],
    duplicateCount: 0,
    limitedByMaxPages: false,
    exclusions: { excludedKnownTestCases: 0, excludedOther: 0, excludedUnknown: 0 },
    distribution: { byCity: {}, byYear: {}, byCaseLevel: {} },
  };
}

async function setup(candidates: CandidateMetadata[]) {
  const snapshot = await makeSnapshot(candidates);
  const runs = new RunStore();
  let sequence = 0;
  return {
    runs,
    service: new SamplingService(new SnapshotStore(snapshot), runs, {
      createId: () => `stratified-run-${++sequence}`,
      now: () => `2026-09-12T00:00:0${sequence}.000Z`,
    }),
  };
}

function candidatesByCity(spec: Record<string, number>): CandidateMetadata[] {
  return Object.entries(spec).flatMap(([city, count]) => Array.from({ length: count }, (_, index) => ({
    caseId: `${city}-${String(index + 1).padStart(3, '0')}`,
    city,
    year: 2023,
    caseLevel: '一审',
  })));
}

function strataFor(spec: Record<string, number>): CandidateStratum[] {
  return Object.entries(spec).map(([key, candidateCount]) => ({
    key,
    dimensions: { city: key },
    candidateIds: Array.from({ length: candidateCount }, (_, index) => `${key}-${index}`),
    candidateCount,
  }));
}

function allocationsToObject(allocations: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...allocations.entries()]);
}

const allDimensionCombinations: StratificationDimension[][] = [
  ['city'], ['year'], ['caseLevel'],
  ['city', 'year'], ['city', 'caseLevel'], ['year', 'caseLevel'],
  ['city', 'year', 'caseLevel'],
];

describe('Stage 5 stratified seeded sampling', () => {
  it.each(allDimensionCombinations.map((dimensions) => [dimensions] as const))('supports dimension combination %j', (dimensions) => {
    const strata = buildStrata([
      { caseId: 'A', city: '广州', year: 2022, caseLevel: '一审' },
      { caseId: 'B', city: '深圳', year: 2023, caseLevel: '二审' },
    ], dimensions);
    expect(strata.reduce((sum, stratum) => sum + stratum.candidateCount, 0)).toBe(2);
  });

  it('canonicalizes dimension order and removes duplicates', () => {
    expect(normalizeStratificationDimensions(['caseLevel', 'city', 'year', 'city'])).toEqual(['city', 'year', 'caseLevel']);
    expect(normalizeStratificationDimensions(['year', 'city'])).toEqual(['city', 'year']);
  });

  it('creates deterministic strata, membership and candidate order', () => {
    const candidates = [
      { caseId: 'C', city: '广州', year: 2023, caseLevel: '二审' },
      { caseId: 'A', city: '广州', year: 2023, caseLevel: '一审' },
      { caseId: 'B', city: '广州', year: 2023, caseLevel: '一审' },
    ];
    expect(buildStrata(candidates, ['year', 'city'])).toEqual(buildStrata([...candidates].reverse(), ['city', 'year']));
    expect(buildStrata(candidates, ['city', 'year'])[0].candidateIds).toEqual(['A', 'B', 'C']);
  });

  it('keeps missing values in an explicit unknown stratum', () => {
    const [stratum] = buildStrata([{ caseId: 'UNKNOWN', year: null }], ['city', 'year', 'caseLevel']);
    expect(stratum.key).toBe('city=unknown|year=unknown|caseLevel=unknown');
    expect(stratum.dimensions).toEqual({ city: null, year: null, caseLevel: null });
  });

  it('allocates proportional 50/30/20 capacity as 5/3/2', () => {
    expect(allocationsToObject(allocateProportional(strataFor({ A: 50, B: 30, C: 20 }), 10))).toEqual({ A: 5, B: 3, C: 2 });
  });

  it('uses largest remainder with stable key tie-breaking', () => {
    expect(allocationsToObject(allocateProportional(strataFor({ A: 1, B: 1, C: 1 }), 2))).toEqual({ A: 1, B: 1, C: 0 });
  });

  it('allocates equal-capacity balanced strata equally', () => {
    expect(allocationsToObject(allocateBalanced(strataFor({ A: 100, B: 100, C: 100 }), 60))).toEqual({ A: 20, B: 20, C: 20 });
  });

  it('redistributes balanced quota when a small stratum reaches capacity', () => {
    expect(allocationsToObject(allocateBalanced(strataFor({ A: 100, B: 100, C: 5 }), 45))).toEqual({ A: 20, B: 20, C: 5 });
  });

  it('uses stable key tie-breaking for an uneven balanced remainder', () => {
    expect(allocationsToObject(allocateBalanced(strataFor({ A: 100, B: 100, C: 100 }), 10))).toEqual({ A: 4, B: 3, C: 3 });
  });

  it('reproduces the same strata, allocation, members and hashes for the same design', async () => {
    const { service } = await setup(candidatesByCity({ 广州: 8, 深圳: 6, 东莞: 4 }));
    const input = { snapshotId: 'stratified-snapshot', seed: 42, sampleSize: 9, dimensions: ['year', 'city'] as StratificationDimension[], allocationStrategy: 'balanced' as AllocationStrategy };
    const first = await service.createStratifiedSamplingRun(input);
    const second = await service.createStratifiedSamplingRun(input);
    expect(first.id).not.toBe(second.id);
    expect(first.stratification).toEqual(second.stratification);
    expect(first.sampledCaseIds).toEqual(second.sampledCaseIds);
    expect(first.sampleHash).toBe(second.sampleHash);
    expect(first.samplingConfigHash).toBe(second.samplingConfigHash);
  });

  it('produces the same final sample when Candidate Pool entry order changes', async () => {
    const candidates = candidatesByCity({ 广州: 8, 深圳: 6, 东莞: 4 });
    const firstSetup = await setup(candidates);
    const secondSetup = await setup([...candidates].reverse());
    const input = {
      snapshotId: 'stratified-snapshot', seed: 42, sampleSize: 9,
      dimensions: ['city', 'year'] as StratificationDimension[], allocationStrategy: 'balanced' as AllocationStrategy,
    };
    const first = await firstSetup.service.createStratifiedSamplingRun(input);
    const second = await secondSetup.service.createStratifiedSamplingRun(input);
    expect(first.sampledCaseIds).toEqual(second.sampledCaseIds);
    expect(first.sampleHash).toBe(second.sampleHash);
  });

  it('changes members but not allocation when only the global seed changes', async () => {
    const { service } = await setup(candidatesByCity({ 广州: 10, 深圳: 10, 东莞: 10 }));
    const base = { snapshotId: 'stratified-snapshot', sampleSize: 15, dimensions: ['city'] as StratificationDimension[], allocationStrategy: 'balanced' as AllocationStrategy };
    const first = await service.createStratifiedSamplingRun({ ...base, seed: 42 });
    const second = await service.createStratifiedSamplingRun({ ...base, seed: 43 });
    expect(first.stratification.strata.map((stratum) => stratum.allocatedSampleSize)).toEqual(second.stratification.strata.map((stratum) => stratum.allocatedSampleSize));
    expect(first.sampledCaseIds).not.toEqual(second.sampledCaseIds);
  });

  it('records different allocations for proportional and balanced designs', async () => {
    const { service } = await setup(candidatesByCity({ 广州: 12, 深圳: 6, 东莞: 2 }));
    const base = { snapshotId: 'stratified-snapshot', seed: 42, sampleSize: 10, dimensions: ['city'] as StratificationDimension[] };
    const proportional = await service.createStratifiedSamplingRun({ ...base, allocationStrategy: 'proportional' });
    const balanced = await service.createStratifiedSamplingRun({ ...base, allocationStrategy: 'balanced' });
    expect(proportional.stratification.strata.map((stratum) => stratum.allocatedSampleSize)).not.toEqual(balanced.stratification.strata.map((stratum) => stratum.allocatedSampleSize));
    expect(proportional.stratification.allocationStrategy).toBe('proportional');
    expect(balanced.stratification.allocationStrategy).toBe('balanced');
  });

  it('builds canonical city × year × caseLevel membership', () => {
    const strata = buildStrata([
      { caseId: 'G22F', city: '广州', year: 2022, caseLevel: '一审' },
      { caseId: 'G22S', city: '广州', year: 2022, caseLevel: '二审' },
      { caseId: 'G23F', city: '广州', year: 2023, caseLevel: '一审' },
      { caseId: 'S22F', city: '深圳', year: 2022, caseLevel: '一审' },
    ], ['caseLevel', 'year', 'city']);
    expect(strata.map((stratum) => stratum.key)).toEqual([
      'city=广州|year=2022|caseLevel=一审',
      'city=广州|year=2022|caseLevel=二审',
      'city=广州|year=2023|caseLevel=一审',
      'city=深圳|year=2022|caseLevel=一审',
    ]);
  });

  it('fingerprints different stratification designs differently', async () => {
    const { service } = await setup(candidatesByCity({ 广州: 6, 深圳: 6 }));
    const base = { snapshotId: 'stratified-snapshot', seed: 42, sampleSize: 6, allocationStrategy: 'balanced' as AllocationStrategy };
    const city = await service.createStratifiedSamplingRun({ ...base, dimensions: ['city'] });
    const cityYear = await service.createStratifiedSamplingRun({ ...base, dimensions: ['year', 'city'] });
    expect(city.samplingConfigHash).not.toBe(cityYear.samplingConfigHash);
    expect(city.stratification.dimensions).toEqual(['city']);
    expect(cityYear.stratification.dimensions).toEqual(['city', 'year']);
  });

  it('locks the stratified-seeded-v1 regression fixture', async () => {
    const candidates = ['广州', '深圳', '东莞'].flatMap((city) => [1, 2, 3, 4].map((index) => ({
      caseId: `${city[0]}${index}`, city, year: 2023, caseLevel: '一审',
    })));
    const { service } = await setup(candidates);
    const run = await service.createStratifiedSamplingRun({
      snapshotId: 'stratified-snapshot', seed: 'legal-analytics-stratified-test', sampleSize: 6,
      dimensions: ['city'], allocationStrategy: 'balanced',
    });
    expect(run.algorithmVersion).toBe(STRATIFIED_SAMPLING_ALGORITHM_VERSION);
    expect(run.stratification.strata.map((stratum) => ({ key: stratum.key, ids: stratum.sampledCaseIds }))).toEqual([
      { key: 'city=东莞', ids: ['东4', '东3'] },
      { key: 'city=广州', ids: ['广4', '广3'] },
      { key: 'city=深圳', ids: ['深2', '深3'] },
    ]);
  });

  it('persists and reloads stratified provenance', async () => {
    const setupValue = await setup(candidatesByCity({ 广州: 4, 深圳: 4 }));
    const run = await setupValue.service.createStratifiedSamplingRun({
      snapshotId: 'stratified-snapshot', seed: 42, sampleSize: 4,
      dimensions: ['city'], allocationStrategy: 'balanced',
    });
    expect(await setupValue.service.getSamplingRun(run.id)).toEqual(run);
    expect(run.stratification.strata.every((stratum) => stratum.sampleHash && stratum.seed && stratum.samplingFraction === 0.5)).toBe(true);
  });

  it('keeps old seeded_random runs and summaries backward compatible', async () => {
    const { service } = await setup(candidatesByCity({ 广州: 4 }));
    const oldRun = await service.createSamplingRun({ snapshotId: 'stratified-snapshot', seed: 42, sampleSize: 2 });
    expect(oldRun.method).toBe('seeded_random');
    expect('stratification' in oldRun).toBe(false);
    expect(summarizeSamplingRun(oldRun)).not.toHaveProperty('dimensions');
  });

  it('rejects empty dimensions and sample sizes above the population', async () => {
    const { service } = await setup(candidatesByCity({ 广州: 2 }));
    await expect(service.createStratifiedSamplingRun({
      snapshotId: 'stratified-snapshot', seed: 42, sampleSize: 1,
      dimensions: [], allocationStrategy: 'balanced',
    })).rejects.toThrow(/dimension/i);
    await expect(service.createStratifiedSamplingRun({
      snapshotId: 'stratified-snapshot', seed: 42, sampleSize: 3,
      dimensions: ['city'], allocationStrategy: 'balanced',
    })).rejects.toThrow(/sample size/i);
  });

  it('has no fulltext, Parser, Gemini, Outcome or Analytics dependency', () => {
    const source = readFileSync(new URL('../../src/services/sampling/SamplingService.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/fetchCaseDetail|LaborInfoParserAdapter|Gemini|OutcomeResolver|Analytics/);
  });
});
