import { db } from '../../db';
import type {
  AllocationStrategy,
  CandidateMetadata,
  CandidatePoolSnapshot,
  CandidateStratum,
  SamplingRun,
  SamplingRunSummary,
  SeededRandomSamplingRun,
  StratificationDimension,
  StratifiedSamplingRun,
} from '../../types';
import {
  assertSnapshotReadyForSampling,
  DexieCandidatePoolSnapshotStore,
} from '../dataset/CandidatePoolSnapshotService';

export const SAMPLING_ALGORITHM_VERSION = 'seeded-random-v1' as const;
export const STRATIFIED_SAMPLING_ALGORITHM_VERSION = 'stratified-seeded-v1' as const;

const STRATIFICATION_DIMENSION_ORDER: StratificationDimension[] = ['city', 'year', 'caseLevel'];

export interface CreateSamplingRunInput {
  snapshotId: string;
  seed: string | number;
  sampleSize: number;
}

export interface CreateStratifiedSamplingRunInput extends CreateSamplingRunInput {
  dimensions: StratificationDimension[];
  allocationStrategy: AllocationStrategy;
}

export interface SamplingSnapshotStore {
  get(id: string): Promise<CandidatePoolSnapshot | undefined>;
}

export interface SamplingRunStore {
  save(run: SamplingRun): Promise<void>;
  get(id: string): Promise<SamplingRun | undefined>;
  list(snapshotId?: string): Promise<SamplingRun[]>;
}

export interface SamplingRuntime {
  now: () => string;
  createId: () => string;
}

const compareText = (left: string, right: string): number => (
  left < right ? -1 : left > right ? 1 : 0
);

async function calculateSha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function calculateCandidateHash(caseIds: string[]): Promise<string> {
  return calculateSha256([...caseIds].sort(compareText).join('\n'));
}

export async function calculateSampleHash(caseIds: string[]): Promise<string> {
  return calculateSha256(JSON.stringify(caseIds));
}

export function normalizeSeed(seed: string | number): string {
  if (typeof seed === 'number' && !Number.isFinite(seed)) {
    throw new Error('Sampling seed must be a finite number or non-empty string');
  }
  const normalized = String(seed).trim();
  if (!normalized) throw new Error('Sampling seed is required');
  return normalized;
}

function createSeedState(seed: string): number {
  let state = 1779033703 ^ seed.length;
  for (let index = 0; index < seed.length; index++) {
    state = Math.imul(state ^ seed.charCodeAt(index), 3432918353);
    state = (state << 13) | (state >>> 19);
  }
  state = Math.imul(state ^ (state >>> 16), 2246822507);
  state = Math.imul(state ^ (state >>> 13), 3266489909);
  return (state ^ (state >>> 16)) >>> 0;
}

function createMulberry32(initialState: number): () => number {
  let state = initialState >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededFisherYates(caseIds: string[], seed: string): string[] {
  const values = [...caseIds].sort(compareText);
  const next = createMulberry32(createSeedState(seed));
  for (let index = values.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(next() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

export function normalizeStratificationDimensions(
  dimensions: StratificationDimension[],
): StratificationDimension[] {
  if (!Array.isArray(dimensions) || dimensions.length === 0) {
    throw new Error('At least one stratification dimension is required');
  }
  const supplied = new Set<string>(dimensions);
  const invalid = [...supplied].filter((dimension) => !STRATIFICATION_DIMENSION_ORDER.includes(
    dimension as StratificationDimension,
  ));
  if (invalid.length > 0) {
    throw new Error(`Unsupported stratification dimension: ${invalid.join(', ')}`);
  }
  return STRATIFICATION_DIMENSION_ORDER.filter((dimension) => supplied.has(dimension));
}

function candidateDimensionValue(
  candidate: CandidateMetadata,
  dimension: StratificationDimension,
): string | number | null {
  const value = candidate[dimension];
  return value === undefined || value === null || value === '' ? null : value;
}

export function buildStrata(
  candidates: CandidateMetadata[],
  dimensions: StratificationDimension[],
): CandidateStratum[] {
  const normalizedDimensions = normalizeStratificationDimensions(dimensions);
  const grouped = new Map<string, CandidateStratum>();

  for (const candidate of candidates) {
    const dimensionValues = Object.fromEntries(normalizedDimensions.map((dimension) => (
      [dimension, candidateDimensionValue(candidate, dimension)]
    ))) as Partial<Record<StratificationDimension, string | number | null>>;
    const key = normalizedDimensions.map((dimension) => (
      `${dimension}=${dimensionValues[dimension] === null ? 'unknown' : String(dimensionValues[dimension])}`
    )).join('|');
    const existing = grouped.get(key);
    if (existing) {
      existing.candidateIds.push(candidate.caseId);
      existing.candidateCount += 1;
    } else {
      grouped.set(key, {
        key,
        dimensions: dimensionValues,
        candidateIds: [candidate.caseId],
        candidateCount: 1,
      });
    }
  }

  return [...grouped.values()]
    .map((stratum) => ({
      ...stratum,
      candidateIds: [...stratum.candidateIds].sort(compareText),
    }))
    .sort((left, right) => compareText(left.key, right.key));
}

function validateAllocationInput(strata: CandidateStratum[], sampleSize: number): CandidateStratum[] {
  if (!Number.isInteger(sampleSize) || sampleSize <= 0) {
    throw new Error('Requested sample size must be a positive integer');
  }
  const sorted = [...strata].sort((left, right) => compareText(left.key, right.key));
  if (new Set(sorted.map((stratum) => stratum.key)).size !== sorted.length) {
    throw new Error('Stratum keys must be unique');
  }
  if (sorted.some((stratum) => !Number.isInteger(stratum.candidateCount) || stratum.candidateCount < 0)) {
    throw new Error('Stratum candidate counts must be non-negative integers');
  }
  const populationSize = sorted.reduce((sum, stratum) => sum + stratum.candidateCount, 0);
  if (sampleSize > populationSize) {
    throw new Error('Requested sample size cannot exceed Candidate Pool size');
  }
  return sorted;
}

export function allocateProportional(
  strata: CandidateStratum[],
  sampleSize: number,
): Map<string, number> {
  const sorted = validateAllocationInput(strata, sampleSize);
  const populationSize = sorted.reduce((sum, stratum) => sum + stratum.candidateCount, 0);
  const quotas = sorted.map((stratum) => {
    const exact = (sampleSize * stratum.candidateCount) / populationSize;
    return { key: stratum.key, allocated: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = sampleSize - quotas.reduce((sum, quota) => sum + quota.allocated, 0);
  const remainderOrder = [...quotas].sort((left, right) => (
    right.remainder - left.remainder || compareText(left.key, right.key)
  ));
  for (const quota of remainderOrder) {
    if (remaining === 0) break;
    quota.allocated += 1;
    remaining -= 1;
  }
  return new Map(quotas
    .sort((left, right) => compareText(left.key, right.key))
    .map((quota) => [quota.key, quota.allocated]));
}

export function allocateBalanced(
  strata: CandidateStratum[],
  sampleSize: number,
): Map<string, number> {
  const sorted = validateAllocationInput(strata, sampleSize);
  const allocations = new Map(sorted.map((stratum) => [stratum.key, 0]));
  let remaining = sampleSize;
  let active = sorted.filter((stratum) => stratum.candidateCount > 0);

  while (remaining > 0) {
    const evenShare = Math.floor(remaining / active.length);
    if (evenShare > 0) {
      for (const stratum of active) {
        const current = allocations.get(stratum.key) ?? 0;
        const increment = Math.min(evenShare, stratum.candidateCount - current);
        allocations.set(stratum.key, current + increment);
        remaining -= increment;
      }
    } else {
      for (const stratum of active) {
        if (remaining === 0) break;
        const current = allocations.get(stratum.key) ?? 0;
        if (current < stratum.candidateCount) {
          allocations.set(stratum.key, current + 1);
          remaining -= 1;
        }
      }
    }
    active = active.filter((stratum) => (
      (allocations.get(stratum.key) ?? 0) < stratum.candidateCount
    ));
    if (remaining > 0 && active.length === 0) {
      throw new Error('Unable to allocate requested sample size across strata');
    }
  }
  return allocations;
}

async function deriveStratumSeed(globalSeed: string, stratumKey: string): Promise<string> {
  const digest = await calculateSha256(JSON.stringify({
    algorithmVersion: STRATIFIED_SAMPLING_ALGORITHM_VERSION,
    globalSeed,
    stratumKey,
  }));
  return `stratum-seed-v1:${digest}`;
}

export class DexieSamplingRunStore implements SamplingRunStore {
  public async save(run: SamplingRun): Promise<void> {
    await db.samplingRuns.put(run);
  }

  public async get(id: string): Promise<SamplingRun | undefined> {
    return db.samplingRuns.get(id);
  }

  public async list(snapshotId?: string): Promise<SamplingRun[]> {
    const runs = snapshotId
      ? await db.samplingRuns.where('snapshotId').equals(snapshotId).toArray()
      : await db.samplingRuns.toArray();
    return runs.sort((left, right) => (
      right.createdAt === left.createdAt
        ? compareText(right.id, left.id)
        : compareText(right.createdAt, left.createdAt)
    ));
  }
}

const defaultRuntime: SamplingRuntime = {
  now: () => new Date().toISOString(),
  createId: () => `sampling-run-${Date.now()}-${globalThis.crypto.randomUUID()}`,
};

export function summarizeSamplingRun(run: SamplingRun): SamplingRunSummary {
  const summary: SamplingRunSummary = {
    snapshotId: run.snapshotId,
    method: run.method,
    seed: run.seed,
    requestedSampleSize: run.requestedSampleSize,
    actualSampleSize: run.actualSampleSize,
    algorithmVersion: run.algorithmVersion,
    sampleHash: run.sampleHash,
    createdAt: run.createdAt,
  };
  if (run.method === 'stratified_seeded_random') {
    summary.dimensions = [...run.stratification.dimensions];
    summary.allocationStrategy = run.stratification.allocationStrategy;
    summary.stratumCount = run.stratification.strata.length;
    summary.candidateCount = run.stratification.strata.reduce(
      (sum, stratum) => sum + stratum.candidateCount,
      0,
    );
    summary.samplingConfigHash = run.samplingConfigHash;
  }
  return summary;
}

export class SamplingService {
  public constructor(
    private readonly snapshotStore: SamplingSnapshotStore = new DexieCandidatePoolSnapshotStore(),
    private readonly runStore: SamplingRunStore = new DexieSamplingRunStore(),
    private readonly runtime: SamplingRuntime = defaultRuntime,
  ) {}

  private async loadValidatedSnapshot(snapshotId: string): Promise<CandidatePoolSnapshot> {
    const snapshot = await this.snapshotStore.get(snapshotId);
    if (!snapshot) throw new Error(`Candidate Pool Snapshot not found: ${snapshotId}`);
    assertSnapshotReadyForSampling(snapshot);
    if (snapshot.candidateCount !== snapshot.candidates.length) {
      throw new Error('Candidate Pool Snapshot candidateCount does not match stored candidate entries');
    }

    const caseIds = snapshot.candidates.map((candidate) => candidate.caseId);
    if (new Set(caseIds).size !== caseIds.length) {
      throw new Error('Candidate Pool Snapshot contains duplicate case IDs');
    }
    const calculatedCandidateHash = await calculateCandidateHash(caseIds);
    if (calculatedCandidateHash !== snapshot.candidateHash) {
      throw new Error('Candidate Pool Snapshot candidateHash does not match stored candidate entries');
    }
    return snapshot;
  }

  private validateSampleSize(sampleSize: number, populationSize: number): void {
    if (!Number.isInteger(sampleSize) || sampleSize <= 0) {
      throw new Error('Requested sample size must be a positive integer');
    }
    if (sampleSize > populationSize) {
      throw new Error('Requested sample size cannot exceed Candidate Pool size');
    }
  }

  public async createSamplingRun(input: CreateSamplingRunInput): Promise<SeededRandomSamplingRun> {
    const snapshot = await this.loadValidatedSnapshot(input.snapshotId);
    const caseIds = snapshot.candidates.map((candidate) => candidate.caseId);
    this.validateSampleSize(input.sampleSize, caseIds.length);

    const seed = normalizeSeed(input.seed);
    const sampledCaseIds = seededFisherYates(caseIds, seed).slice(0, input.sampleSize);
    const sampleHash = await calculateSampleHash(sampledCaseIds);
    const run: SeededRandomSamplingRun = {
      id: this.runtime.createId(),
      snapshotId: snapshot.id,
      snapshotFingerprint: snapshot.snapshotFingerprint,
      candidateHash: snapshot.candidateHash,
      method: 'seeded_random',
      seed,
      requestedSampleSize: input.sampleSize,
      actualSampleSize: sampledCaseIds.length,
      sampledCaseIds,
      algorithmVersion: SAMPLING_ALGORITHM_VERSION,
      sampleHash,
      createdAt: this.runtime.now(),
    };
    await this.runStore.save(run);
    return run;
  }

  public async createStratifiedSamplingRun(
    input: CreateStratifiedSamplingRunInput,
  ): Promise<StratifiedSamplingRun> {
    const snapshot = await this.loadValidatedSnapshot(input.snapshotId);
    this.validateSampleSize(input.sampleSize, snapshot.candidates.length);
    if (input.allocationStrategy !== 'proportional' && input.allocationStrategy !== 'balanced') {
      throw new Error(`Unsupported allocation strategy: ${String(input.allocationStrategy)}`);
    }

    const seed = normalizeSeed(input.seed);
    const dimensions = normalizeStratificationDimensions(input.dimensions);
    const candidateStrata = buildStrata(snapshot.candidates, dimensions);
    const allocations = input.allocationStrategy === 'proportional'
      ? allocateProportional(candidateStrata, input.sampleSize)
      : allocateBalanced(candidateStrata, input.sampleSize);
    const strata = await Promise.all(candidateStrata.map(async (stratum) => {
      const allocatedSampleSize = allocations.get(stratum.key) ?? 0;
      const stratumSeed = await deriveStratumSeed(seed, stratum.key);
      const sampledCaseIds = seededFisherYates(stratum.candidateIds, stratumSeed)
        .slice(0, allocatedSampleSize);
      return {
        key: stratum.key,
        dimensions: stratum.dimensions,
        candidateCount: stratum.candidateCount,
        allocatedSampleSize,
        sampledCaseIds,
        seed: stratumSeed,
        sampleHash: await calculateSampleHash(sampledCaseIds),
        samplingFraction: allocatedSampleSize / stratum.candidateCount,
      };
    }));
    const sampledCaseIds = strata.flatMap((stratum) => stratum.sampledCaseIds);
    const samplingConfigHash = await calculateSha256(JSON.stringify({
      algorithmVersion: STRATIFIED_SAMPLING_ALGORITHM_VERSION,
      dimensions,
      allocationStrategy: input.allocationStrategy,
      sampleSize: input.sampleSize,
    }));
    const run: StratifiedSamplingRun = {
      id: this.runtime.createId(),
      snapshotId: snapshot.id,
      snapshotFingerprint: snapshot.snapshotFingerprint,
      candidateHash: snapshot.candidateHash,
      method: 'stratified_seeded_random',
      seed,
      requestedSampleSize: input.sampleSize,
      actualSampleSize: sampledCaseIds.length,
      sampledCaseIds,
      algorithmVersion: STRATIFIED_SAMPLING_ALGORITHM_VERSION,
      sampleHash: await calculateSampleHash(sampledCaseIds),
      samplingConfigHash,
      stratification: {
        dimensions,
        allocationStrategy: input.allocationStrategy,
        strata,
      },
      createdAt: this.runtime.now(),
    };
    await this.runStore.save(run);
    return run;
  }

  public getSamplingRun(id: string): Promise<SamplingRun | undefined> {
    return this.runStore.get(id);
  }

  public listSamplingRuns(snapshotId?: string): Promise<SamplingRun[]> {
    return this.runStore.list(snapshotId);
  }
}
