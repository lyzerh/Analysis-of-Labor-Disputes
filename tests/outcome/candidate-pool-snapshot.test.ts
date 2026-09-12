import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CandidatePoolSnapshotService,
  assertSnapshotReadyForSampling,
  normalizeCandidateFilters,
  type CandidatePoolSnapshotStore,
} from '../../src/services/dataset/CandidatePoolSnapshotService';
import type {
  CandidatePoolSnapshot,
  CandidatePoolSnapshotHeader,
  DocumentMetadata,
  LaborInfoSearchParams,
} from '../../src/types';

function item(
  caseId: string,
  overrides: Partial<DocumentMetadata> = {},
): DocumentMetadata {
  return {
    sourceId: caseId,
    source: 'laborinfo',
    title: `case-${caseId}`,
    url: `https://example.test/cases/${caseId}`,
    pbDt: '2023-11-30',
    date: '2023-11-30',
    caseLevel: '一审',
    court: '广东省广州市中级人民法院',
    ...overrides,
  };
}

function api(pages: Record<number, DocumentMetadata[]>, failures: number[] = []) {
  const calls: LaborInfoSearchParams[] = [];
  const searchCases = vi.fn(async (params: LaborInfoSearchParams) => {
    calls.push(params);
    const page = params.page ?? 1;
    if (failures.includes(page)) throw new Error(`page ${page} failed`);
    return {
      items: pages[page] ?? [],
      total: Object.values(pages).reduce((sum, values) => sum + values.length, 0),
      totalPages: Math.max(...Object.keys(pages).map(Number)),
      page,
      perPage: params.per_page ?? 50,
    };
  });
  return { searchCases, calls };
}

class MemoryStore implements CandidatePoolSnapshotStore {
  headers = new Map<string, CandidatePoolSnapshotHeader>();
  candidates = new Map<string, CandidatePoolSnapshot['candidates']>();

  async save(snapshot: CandidatePoolSnapshot): Promise<void> {
    const { candidates, ...header } = structuredClone(snapshot);
    this.headers.set(snapshot.id, header);
    this.candidates.set(snapshot.id, candidates);
  }

  async get(id: string): Promise<CandidatePoolSnapshot | undefined> {
    const header = this.headers.get(id);
    if (!header) return undefined;
    return structuredClone({ ...header, candidates: this.candidates.get(id) ?? [] });
  }

  async list(): Promise<CandidatePoolSnapshotHeader[]> {
    return structuredClone([...this.headers.values()]);
  }
}

function service(
  pages: Record<number, DocumentMetadata[]>,
  failures: number[] = [],
  store: CandidatePoolSnapshotStore = new MemoryStore(),
) {
  const client = api(pages, failures);
  let id = 0;
  return {
    client,
    store,
    snapshotService: new CandidatePoolSnapshotService(client, store, {
      now: () => '2026-09-12T00:00:00.000Z',
      createId: () => `snapshot-${++id}`,
    }),
  };
}

const defaultFilters = {
  province: ['广东省'],
  caseLevels: ['一审', '二审'],
  startDate: '2021-01-01',
  endDate: '2023-12-31',
};

describe('Stage 5 Candidate Pool Snapshot', () => {
  afterEach(() => vi.restoreAllMocks());

  it('enumerates every metadata page and reports complete progress', async () => {
    const { snapshotService, client } = service({
      1: [item('A'), item('B'), item('C')],
      2: [item('D'), item('E'), item('F')],
      3: [item('G'), item('H')],
    });
    const progress = vi.fn();
    const snapshot = await snapshotService.buildSnapshot(defaultFilters, { onProgress: progress });

    expect(snapshot.status).toBe('complete');
    expect(snapshot.expectedPages).toBe(3);
    expect(snapshot.fetchedPages).toBe(3);
    expect(snapshot.candidateCount).toBe(8);
    expect(snapshot.filters).toEqual(normalizeCandidateFilters(defaultFilters));
    expect(client.searchCases).toHaveBeenCalledTimes(3);
    expect(client.calls.every((call) => (
      Array.isArray(call.province)
      && Array.isArray(call.caseLevel)
      && call.start_date === '2021-01-01'
      && call.end_date === '2023-12-31'
    ))).toBe(true);
    expect(progress).toHaveBeenLastCalledWith({ fetchedPages: 3, totalPages: 3, candidateCount: 8 });
  });

  it('never plans a metadata page above the LaborInfo per_page maximum', async () => {
    const { snapshotService, client } = service({ 1: [item('A')] });
    await snapshotService.buildSnapshot(defaultFilters, { perPage: 100 });
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].per_page).toBe(50);
    expect(client.calls[0].caseLevel).toEqual(['一审', '二审']);
  });

  it('marks a page failure partial and records the failed page', async () => {
    const { snapshotService } = service({ 1: [item('A')], 2: [item('B')], 3: [item('C')] }, [2]);
    const snapshot = await snapshotService.buildSnapshot(defaultFilters);
    expect(snapshot.status).toBe('partial');
    expect(snapshot.failedPages).toEqual([2]);
    expect(snapshot.fetchedPages).toBe(2);
    expect(() => assertSnapshotReadyForSampling(snapshot)).toThrow(/complete/);
  });

  it('marks a first-page failure failed rather than inventing a population', async () => {
    const { snapshotService } = service({ 1: [item('A')] }, [1]);
    const snapshot = await snapshotService.buildSnapshot(defaultFilters);
    expect(snapshot.status).toBe('failed');
    expect(snapshot.expectedPages).toBe(0);
    expect(snapshot.fetchedPages).toBe(0);
    expect(snapshot.failedPages).toEqual([1]);
    expect(snapshot.candidateCount).toBe(0);
  });

  it('deduplicates by caseId and records duplicateCount', async () => {
    const { snapshotService } = service({ 1: [item('A'), item('B'), item('C')], 2: [item('C'), item('D'), item('E')] });
    const snapshot = await snapshotService.buildSnapshot(defaultFilters);
    expect(snapshot.candidates.map((candidate) => candidate.caseId)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(snapshot.duplicateCount).toBe(1);
  });

  it('uses stable caseId ordering and hash regardless of API order', async () => {
    const first = await service({ 1: [item('C'), item('A'), item('B')] }).snapshotService.buildSnapshot(defaultFilters);
    const second = await service({ 1: [item('B'), item('C'), item('A')] }).snapshotService.buildSnapshot(defaultFilters);
    expect(first.candidates.map((candidate) => candidate.caseId)).toEqual(['A', 'B', 'C']);
    expect(first.candidateHash).toBe(second.candidateHash);
    expect(first.candidateHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes candidateHash when the candidate set changes', async () => {
    const first = await service({ 1: [item('A'), item('B'), item('C')] }).snapshotService.buildSnapshot(defaultFilters);
    const second = await service({ 1: [item('A'), item('B'), item('C'), item('D')] }).snapshotService.buildSnapshot(defaultFilters);
    expect(first.candidateHash).not.toBe(second.candidateHash);
  });

  it('normalizes, deduplicates and stably orders real request filters', () => {
    expect(normalizeCandidateFilters({
      province: [' 广东省 ', '广东省'],
      caseLevels: ['二审', '', '一审', '二审'],
      cities: ['深圳市', '广州', '深圳'],
      startDate: '2021/1/2',
      endDate: '2023年12月31日',
      q: '  加班工资  ',
    })).toEqual({
      remoteFilters: {
        provinces: ['广东省'],
        caseLevels: ['一审', '二审'],
        startDate: '2021-01-02',
        endDate: '2023-12-31',
        q: '加班工资',
      },
      localEligibilityRules: { cities: ['广州', '深圳'] },
    });
  });

  it('keeps candidateHash set-only but makes fingerprint filter-sensitive', async () => {
    const first = await service({ 1: [item('A')] }).snapshotService.buildSnapshot(defaultFilters);
    const second = await service({ 1: [item('A')] }).snapshotService.buildSnapshot({ ...defaultFilters, cities: ['广州'] });
    expect(first.candidateHash).toBe(second.candidateHash);
    expect(first.snapshotFingerprint).not.toBe(second.snapshotFingerprint);
  });

  it('applies shared metadata city classification and counts exclusions', async () => {
    const { snapshotService } = service({ 1: [
      item('GZ', { court: '广东省广州市中级人民法院' }),
      item('SZ', { court: '广东省深圳市南山区人民法院' }),
      item('DG', { court: '广东省东莞市中级人民法院' }),
      item('FS', { court: '广东省佛山市中级人民法院' }),
      item('UNKNOWN', { court: '' }),
    ] });
    const snapshot = await snapshotService.buildSnapshot({ ...defaultFilters, cities: ['广州', '深圳', '东莞'] });
    expect(snapshot.candidates.map((candidate) => candidate.caseId)).toEqual(['DG', 'GZ', 'SZ']);
    expect(snapshot.exclusions).toEqual({ excludedKnownTestCases: 0, excludedOther: 1, excludedUnknown: 1 });
    expect(snapshot.distribution.byCity).toEqual({ 东莞: 1, 广州: 1, 深圳: 1 });
  });

  it('shares the crawler rule that excludes known LaborInfo test cases', async () => {
    const { snapshotService } = service({ 1: [item('A'), item('276061')] });
    const snapshot = await snapshotService.buildSnapshot(defaultFilters);
    expect(snapshot.candidates.map((candidate) => candidate.caseId)).toEqual(['A']);
    expect(snapshot.exclusions.excludedKnownTestCases).toBe(1);
  });

  it('takes year only from pbDt and caseLevel directly from metadata', async () => {
    const { snapshotService } = service({ 1: [
      item('VALID', { pbDt: '2023-11-30', date: '2005-06-01', caseLevel: '二审' }),
      item('INVALID', { pbDt: 'garbage', date: '2022-01-01', caseLevel: '一审' }),
    ] });
    const snapshot = await snapshotService.buildSnapshot(defaultFilters);
    expect(snapshot.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ caseId: 'VALID', pbDt: '2023-11-30', year: 2023, caseLevel: '二审' }),
      expect.objectContaining({ caseId: 'INVALID', pbDt: 'garbage', year: null, caseLevel: '一审' }),
    ]));
  });

  it('never calls a fulltext endpoint', async () => {
    const { snapshotService, client } = service({ 1: [item('A')] });
    await snapshotService.buildSnapshot(defaultFilters);
    expect(client.calls.every((call) => typeof call.page === 'number')).toBe(true);
    expect(Object.keys(client).sort()).toEqual(['calls', 'searchCases']);
  });

  it('has no Parser, Outcome or Gemini dependency', () => {
    const source = readFileSync(
      new URL('../../src/services/dataset/CandidatePoolSnapshotService.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/LaborInfoParserAdapter|OutcomeResolver|Gemini/);
    expect(source).not.toMatch(/\.fetchCaseDetail\s*\(/);
  });

  it('persists and reloads a snapshot independently of service instances', async () => {
    const store = new MemoryStore();
    const first = service({ 1: [item('A'), item('B')] }, [], store);
    const snapshot = await first.snapshotService.buildSnapshot(defaultFilters);
    const second = service({ 1: [] }, [], store);
    expect(await second.snapshotService.getSnapshot(snapshot.id)).toEqual(snapshot);
    expect(await second.snapshotService.listSnapshots()).toEqual([
      expect.objectContaining({ id: snapshot.id, candidateCount: 2 }),
    ]);
  });

  it('marks maxPages debug snapshots partial instead of falsely complete', async () => {
    const { snapshotService, client } = service({ 1: [item('A')], 2: [item('B')], 3: [item('C')] });
    const snapshot = await snapshotService.buildSnapshot(defaultFilters, { maxPages: 2 });
    expect(snapshot.status).toBe('partial');
    expect(snapshot.limitedByMaxPages).toBe(true);
    expect(snapshot.expectedPages).toBe(3);
    expect(snapshot.fetchedPages).toBe(2);
    expect(client.searchCases).toHaveBeenCalledTimes(2);
  });

  it('gives separate creation IDs to equivalent populations', async () => {
    const setup = service({ 1: [item('A')] });
    const first = await setup.snapshotService.buildSnapshot(defaultFilters);
    const second = await setup.snapshotService.buildSnapshot(defaultFilters);
    expect(first.id).not.toBe(second.id);
    expect(first.candidateHash).toBe(second.candidateHash);
    expect(first.snapshotFingerprint).toBe(second.snapshotFingerprint);
  });
});
