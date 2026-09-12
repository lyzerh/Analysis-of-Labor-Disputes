import { db } from '../../db';
import type {
  CandidateMetadata,
  CandidatePoolEntry,
  CandidatePoolSnapshot,
  CandidatePoolSnapshotHeader,
  CandidatePoolSnapshotStatus,
  DocumentMetadata,
  LaborInfoSearchParams,
  LaborInfoSearchResult,
  NormalizedCandidateFilters,
} from '../../types';
import { CityResolver } from '../parser/CityResolver';
import {
  LaborInfoAdapter,
  normalizeLaborInfoPerPage,
} from '../dataSource/LaborInfoAdapter';
import { isExcludedLaborInfoTestCase } from '../dataSource/LaborInfoEligibility';

export const CANDIDATE_POOL_SNAPSHOT_VERSION = 'candidate-pool-v1' as const;
export const LABORINFO_FILTER_CONTRACT_VERSION = 'laborinfo-filter-v2' as const;

export interface CandidateFilterInput {
  province?: string | string[];
  caseLevels?: string | string[];
  startDate?: string;
  endDate?: string;
  q?: string;
  cities?: string | string[];
}

export interface CandidatePoolProgress {
  fetchedPages: number;
  totalPages: number;
  candidateCount: number;
}

export interface BuildSnapshotOptions {
  perPage?: number;
  concurrency?: number;
  maxPages?: number;
  signal?: AbortSignal;
  onProgress?: (progress: CandidatePoolProgress) => void;
}

export interface CandidateMetadataClient {
  searchCases(params: LaborInfoSearchParams): Promise<LaborInfoSearchResult>;
}

export interface CandidatePoolSnapshotStore {
  save(snapshot: CandidatePoolSnapshot): Promise<void>;
  get(id: string): Promise<CandidatePoolSnapshot | undefined>;
  list(): Promise<CandidatePoolSnapshotHeader[]>;
}

interface ServiceRuntime {
  now: () => string;
  createId: () => string;
}

const defaultRuntime: ServiceRuntime = {
  now: () => new Date().toISOString(),
  createId: () => `candidate-pool-${Date.now()}-${globalThis.crypto.randomUUID()}`,
};

function normalizeList(value?: string | string[], mapValue: (item: string) => string = (item) => item): string[] {
  const values = Array.isArray(value) ? value : (value ? [value] : []);
  return [...new Set(values.map((item) => mapValue(item.trim())).filter(Boolean))].sort(compareText);
}

function normalizeDate(value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  const match = value.trim().match(/^(\d{4})(?:-|\/|年)(\d{1,2})(?:-|\/|月)(\d{1,2})(?:日)?$/);
  if (!match) throw new Error(`Invalid filter date: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Invalid filter date: ${value}`);
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function normalizeCandidateFilters(input: CandidateFilterInput): NormalizedCandidateFilters {
  const startDate = normalizeDate(input.startDate);
  const endDate = normalizeDate(input.endDate);
  return {
    remoteFilters: {
      provinces: normalizeList(input.province),
      caseLevels: normalizeList(input.caseLevels),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
      ...(input.q?.trim() ? { q: input.q.trim() } : {}),
    },
    localEligibilityRules: {
      cities: normalizeList(input.cities, (city) => city.replace(/市$/, '')),
    },
  };
}

function normalizeCandidate(metadata: DocumentMetadata): CandidateMetadata {
  const city = CityResolver.resolveCity({
    province: metadata.province,
    court: metadata.court,
    caseNumber: metadata.caseNumber,
  }).city ?? undefined;
  const validDate = metadata.pbDt?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let year: number | null = null;
  if (validDate) {
    const y = Number(validDate[1]);
    const m = Number(validDate[2]);
    const d = Number(validDate[3]);
    const candidate = new Date(Date.UTC(y, m - 1, d));
    if (candidate.getUTCFullYear() === y && candidate.getUTCMonth() === m - 1 && candidate.getUTCDate() === d) {
      year = y;
    }
  }
  return {
    caseId: metadata.sourceId,
    ...(metadata.pbDt ? { pbDt: metadata.pbDt } : {}),
    year,
    ...(metadata.caseLevel ? { caseLevel: metadata.caseLevel } : {}),
    ...(metadata.court ? { court: metadata.court } : {}),
    ...(city ? { city } : {}),
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareText(left, right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function increment(distribution: Record<string, number>, value?: string | number | null): void {
  const key = value === undefined || value === null || value === '' ? 'unknown' : String(value);
  distribution[key] = (distribution[key] ?? 0) + 1;
}

function splitSnapshot(snapshot: CandidatePoolSnapshot): {
  header: CandidatePoolSnapshotHeader;
  entries: CandidatePoolEntry[];
} {
  const { candidates, ...header } = snapshot;
  return {
    header,
    entries: candidates.map((candidate) => ({
      ...candidate,
      id: `${snapshot.id}:${candidate.caseId}`,
      snapshotId: snapshot.id,
    })),
  };
}

export class DexieCandidatePoolSnapshotStore implements CandidatePoolSnapshotStore {
  public async save(snapshot: CandidatePoolSnapshot): Promise<void> {
    const { header, entries } = splitSnapshot(snapshot);
    await db.transaction('rw', db.candidatePoolSnapshots, db.candidatePoolEntries, async () => {
      await db.candidatePoolEntries.where('snapshotId').equals(snapshot.id).delete();
      await db.candidatePoolSnapshots.put(header);
      if (entries.length > 0) await db.candidatePoolEntries.bulkPut(entries);
    });
  }

  public async get(id: string): Promise<CandidatePoolSnapshot | undefined> {
    const header = await db.candidatePoolSnapshots.get(id);
    if (!header) return undefined;
    const entries = await db.candidatePoolEntries.where('snapshotId').equals(id).toArray();
    const candidates = entries
      .map(({ id: _id, snapshotId: _snapshotId, ...candidate }) => candidate)
      .sort((left, right) => compareText(left.caseId, right.caseId));
    return { ...header, candidates };
  }

  public async list(): Promise<CandidatePoolSnapshotHeader[]> {
    return db.candidatePoolSnapshots.orderBy('createdAt').reverse().toArray();
  }
}

export function assertSnapshotReadyForSampling(snapshot: CandidatePoolSnapshot): void {
  if (snapshot.status !== 'complete') {
    throw new Error(`Candidate Pool Snapshot must be complete; received ${snapshot.status}`);
  }
  if (snapshot.candidateCount < 1) {
    throw new Error('Candidate Pool Snapshot must contain at least one candidate');
  }
}

export class CandidatePoolSnapshotService {
  public constructor(
    private readonly client: CandidateMetadataClient = new LaborInfoAdapter(),
    private readonly store: CandidatePoolSnapshotStore = new DexieCandidatePoolSnapshotStore(),
    private readonly runtime: ServiceRuntime = defaultRuntime,
  ) {}

  public async buildSnapshot(
    input: CandidateFilterInput,
    options: BuildSnapshotOptions = {},
  ): Promise<CandidatePoolSnapshot> {
    const filters = normalizeCandidateFilters(input);
    const perPage = normalizeLaborInfoPerPage(options.perPage ?? 50);
    const concurrency = Math.max(1, Math.min(5, Math.floor(options.concurrency ?? 4)));
    const baseParams: LaborInfoSearchParams = {
      province: filters.remoteFilters.provinces,
      caseLevel: filters.remoteFilters.caseLevels,
      start_date: filters.remoteFilters.startDate,
      end_date: filters.remoteFilters.endDate,
      q: filters.remoteFilters.q,
      per_page: perPage,
    };
    const metadataById = new Map<string, DocumentMetadata>();
    const failedPages: number[] = [];
    let expectedPages = 0;
    let fetchedPages = 0;
    let limitedByMaxPages = false;
    let cancelled = false;
    let returnedItemCount = 0;

    const addMetadata = (items: DocumentMetadata[]) => {
      returnedItemCount += items.length;
      for (const metadata of items) {
        const existing = metadataById.get(metadata.sourceId);
        if (!existing || stableStringify(metadata) < stableStringify(existing)) {
          metadataById.set(metadata.sourceId, metadata);
        }
      }
    };
    const report = () => options.onProgress?.({
      fetchedPages,
      totalPages: expectedPages,
      candidateCount: metadataById.size,
    });

    try {
      if (options.signal?.aborted) throw new DOMException('Snapshot enumeration cancelled', 'AbortError');
      const first = await this.client.searchCases({ ...baseParams, page: 1 });
      expectedPages = Math.max(1, first.totalPages);
      fetchedPages = 1;
      addMetadata(first.items);
      report();

      const requestedPages = options.maxPages === undefined
        ? expectedPages
        : Math.max(1, Math.min(expectedPages, Math.floor(options.maxPages)));
      limitedByMaxPages = requestedPages < expectedPages;
      const pages = Array.from({ length: Math.max(0, requestedPages - 1) }, (_, index) => index + 2);
      let cursor = 0;
      const worker = async () => {
        while (cursor < pages.length) {
          const page = pages[cursor++];
          if (options.signal?.aborted) {
            cancelled = true;
            return;
          }
          try {
            const result = await this.client.searchCases({ ...baseParams, page });
            fetchedPages++;
            addMetadata(result.items);
          } catch (error) {
            if (options.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
              cancelled = true;
              return;
            }
            failedPages.push(page);
          }
          report();
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, pages.length) }, () => worker()));
    } catch (error) {
      if (options.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        cancelled = true;
      } else {
        failedPages.push(1);
      }
    }

    const rawUniqueCount = metadataById.size;
    const normalized = [...metadataById.values()].map(normalizeCandidate);
    const allowedCities = new Set(filters.localEligibilityRules.cities);
    let excludedOther = 0;
    let excludedUnknown = 0;
    let excludedKnownTestCases = 0;
    const candidates = normalized.filter((candidate) => {
      if (isExcludedLaborInfoTestCase(candidate.caseId)) {
        excludedKnownTestCases++;
        return false;
      }
      if (allowedCities.size === 0) return true;
      if (!candidate.city) {
        excludedUnknown++;
        return false;
      }
      if (!allowedCities.has(candidate.city)) {
        excludedOther++;
        return false;
      }
      return true;
    }).sort((left, right) => compareText(left.caseId, right.caseId));
    const actualDuplicateCount = Math.max(0, returnedItemCount - rawUniqueCount);
    const distribution = { byCity: {}, byYear: {}, byCaseLevel: {} } as CandidatePoolSnapshot['distribution'];
    for (const candidate of candidates) {
      increment(distribution.byCity, candidate.city);
      increment(distribution.byYear, candidate.year);
      increment(distribution.byCaseLevel, candidate.caseLevel);
    }
    const candidateHash = await sha256(candidates.map((candidate) => candidate.caseId).join('\n'));
    const snapshotFingerprint = await sha256(stableStringify({
      snapshotVersion: CANDIDATE_POOL_SNAPSHOT_VERSION,
      filterContractVersion: LABORINFO_FILTER_CONTRACT_VERSION,
      filters,
      candidateHash,
    }));
    const status: CandidatePoolSnapshotStatus = cancelled
      ? 'cancelled'
      : fetchedPages === 0
        ? 'failed'
        : failedPages.length > 0 || limitedByMaxPages
          ? 'partial'
          : 'complete';
    const snapshot: CandidatePoolSnapshot = {
      id: this.runtime.createId(),
      source: 'laborinfo',
      filters,
      candidateCount: candidates.length,
      candidates,
      createdAt: this.runtime.now(),
      snapshotVersion: CANDIDATE_POOL_SNAPSHOT_VERSION,
      filterContractVersion: LABORINFO_FILTER_CONTRACT_VERSION,
      candidateHash,
      snapshotFingerprint,
      status,
      expectedPages,
      fetchedPages,
      failedPages: failedPages.sort((left, right) => left - right),
      duplicateCount: actualDuplicateCount,
      limitedByMaxPages,
      exclusions: { excludedKnownTestCases, excludedOther, excludedUnknown },
      distribution,
    };
    await this.store.save(snapshot);
    return snapshot;
  }

  public getSnapshot(id: string): Promise<CandidatePoolSnapshot | undefined> {
    return this.store.get(id);
  }

  public listSnapshots(): Promise<CandidatePoolSnapshotHeader[]> {
    return this.store.list();
  }
}
