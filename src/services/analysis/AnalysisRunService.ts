import { db } from '../../db';
import type {
  AnalysisEngineVersions,
  AnalysisMode,
  AnalysisResultSummary,
  AnalysisRun,
  AnalysisRunProvenanceComparison,
  AnalysisRunStatus,
  CandidatePoolSnapshot,
  SamplingRun,
  SemanticAnalysisConfig,
} from '../../types';
import {
  assertSnapshotReadyForSampling,
  DexieCandidatePoolSnapshotStore,
} from '../dataset/CandidatePoolSnapshotService';
import {
  calculateCandidateHash,
  calculateSampleHash,
  DexieSamplingRunStore,
} from '../sampling/SamplingService';

export const ANALYSIS_PROVENANCE_VERSION = 'analysis-provenance-v1' as const;

export type CreateAnalysisRunInput = {
  mode: 'exhaustive';
  snapshotId: string;
  engineVersions: AnalysisEngineVersions;
  semantic: SemanticAnalysisConfig;
} | {
  mode: 'sampled';
  snapshotId: string;
  samplingRunId: string;
  engineVersions: AnalysisEngineVersions;
  semantic: SemanticAnalysisConfig;
};

export interface AnalysisRunListFilters {
  snapshotId?: string;
  mode?: AnalysisMode;
  status?: AnalysisRunStatus;
}

export interface AnalysisRunSnapshotStore {
  get(id: string): Promise<CandidatePoolSnapshot | undefined>;
}

export interface AnalysisRunSamplingStore {
  get(id: string): Promise<SamplingRun | undefined>;
}

export interface AnalysisRunStore {
  save(run: AnalysisRun): Promise<void>;
  get(id: string): Promise<AnalysisRun | undefined>;
  list(): Promise<AnalysisRun[]>;
}

export interface AnalysisRunRuntime {
  now: () => string;
  createId: () => string;
}

const compareText = (left: string, right: string): number => (
  left < right ? -1 : left > right ? 1 : 0
);

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => compareText(left, right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function requiredVersion(value: string | undefined, label: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${label} version is required`);
  return normalized;
}

function normalizeEngineVersions(versions: AnalysisEngineVersions): AnalysisEngineVersions {
  return {
    parserVersion: requiredVersion(versions?.parserVersion, 'Parser'),
    rulesetVersion: requiredVersion(versions?.rulesetVersion, 'Ruleset'),
  };
}

function normalizeSemanticConfig(config: SemanticAnalysisConfig): SemanticAnalysisConfig {
  if (!config || typeof config.enabled !== 'boolean') {
    throw new Error('Semantic analysis configuration must be explicitly provided');
  }
  if (!config.enabled) return { enabled: false };
  const promptVersion = config.promptVersion?.trim();
  const provider = config.provider?.trim();
  const model = config.model?.trim();
  if (!promptVersion || !provider || !model) {
    throw new Error('Enabled Semantic analysis requires promptVersion, provider and model');
  }
  return { enabled: true, promptVersion, provider, model };
}

export async function calculateSamplingRunProvenanceHash(run: SamplingRun): Promise<string> {
  const common = {
    method: run.method,
    seed: run.seed,
    requestedSampleSize: run.requestedSampleSize,
    actualSampleSize: run.actualSampleSize,
    algorithmVersion: run.algorithmVersion,
    sampleHash: run.sampleHash,
  };
  return sha256(stableStringify(run.method === 'stratified_seeded_random'
    ? {
        ...common,
        samplingConfigHash: run.samplingConfigHash,
        dimensions: run.stratification.dimensions,
        allocationStrategy: run.stratification.allocationStrategy,
      }
    : common));
}

export async function calculateProvenanceHash(input: {
  mode: AnalysisMode;
  snapshotFingerprint: string;
  candidateHash: string;
  samplingRunProvenanceHash?: string;
  inputCaseIds: string[];
  engineVersions: AnalysisEngineVersions;
  semantic: SemanticAnalysisConfig;
}): Promise<string> {
  return sha256(stableStringify({
    analysisContractVersion: ANALYSIS_PROVENANCE_VERSION,
    ...input,
    samplingRunProvenanceHash: input.samplingRunProvenanceHash ?? null,
  }));
}

async function validateSnapshot(snapshot: CandidatePoolSnapshot): Promise<string[]> {
  assertSnapshotReadyForSampling(snapshot);
  if (snapshot.candidateCount !== snapshot.candidates.length) {
    throw new Error('Candidate Pool Snapshot candidateCount does not match stored candidate entries');
  }
  const caseIds = snapshot.candidates.map((candidate) => candidate.caseId);
  if (new Set(caseIds).size !== caseIds.length) {
    throw new Error('Candidate Pool Snapshot contains duplicate case IDs');
  }
  if (await calculateCandidateHash(caseIds) !== snapshot.candidateHash) {
    throw new Error('Candidate Pool Snapshot candidateHash does not match stored candidate entries');
  }
  return [...caseIds].sort(compareText);
}

async function validateSamplingRun(
  run: SamplingRun,
  snapshot: CandidatePoolSnapshot,
  snapshotCaseIds: string[],
): Promise<void> {
  if (run.snapshotId !== snapshot.id || run.snapshotFingerprint !== snapshot.snapshotFingerprint) {
    throw new Error('SamplingRun does not belong to the requested Snapshot');
  }
  if (run.candidateHash !== snapshot.candidateHash) {
    throw new Error('SamplingRun candidateHash does not match Snapshot');
  }
  if (run.actualSampleSize !== run.sampledCaseIds.length) {
    throw new Error('SamplingRun actualSampleSize does not match sampled case IDs');
  }
  if (new Set(run.sampledCaseIds).size !== run.sampledCaseIds.length) {
    throw new Error('SamplingRun contains duplicate sampled case IDs');
  }
  const population = new Set(snapshotCaseIds);
  if (run.sampledCaseIds.some((caseId) => !population.has(caseId))) {
    throw new Error('SamplingRun contains case IDs outside its Snapshot');
  }
  if (await calculateSampleHash(run.sampledCaseIds) !== run.sampleHash) {
    throw new Error('SamplingRun sampleHash does not match sampled case IDs');
  }
}

function validateResultSummary(summary: AnalysisResultSummary, inputCaseCount: number): AnalysisResultSummary {
  const values = Object.values(summary);
  if (values.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new Error('Analysis result summary counts must be non-negative integers');
  }
  if (summary.processedCaseCount > inputCaseCount) {
    throw new Error('Processed case count cannot exceed AnalysisRun input count');
  }
  if (summary.includedCaseCount + summary.excludedCaseCount + summary.failedCaseCount !== summary.processedCaseCount) {
    throw new Error('Analysis result summary disposition counts must equal processedCaseCount');
  }
  if (summary.unknownOutcomeCount > summary.includedCaseCount) {
    throw new Error('Unknown outcome count cannot exceed included case count');
  }
  return { ...summary };
}

function sanitizeErrorValue(value: string | undefined, fallback: string, limit: number): string {
  const source = (value?.trim() || fallback).slice(0, limit);
  return source
    .replace(/\b[A-Z][A-Z0-9_]{2,}_KEY\s*[=:]\s*[^\s,;]+/g, '[REDACTED]')
    .replace(/\b(?:api[ _-]?key|authorization|bearer)\s*[=:]?\s*[^\s,;]+/gi, '[REDACTED]');
}

export class DexieAnalysisRunStore implements AnalysisRunStore {
  public async save(run: AnalysisRun): Promise<void> {
    await db.analysisRuns.put(run);
  }

  public async get(id: string): Promise<AnalysisRun | undefined> {
    return db.analysisRuns.get(id);
  }

  public async list(): Promise<AnalysisRun[]> {
    return db.analysisRuns.orderBy('createdAt').reverse().toArray();
  }
}

const defaultRuntime: AnalysisRunRuntime = {
  now: () => new Date().toISOString(),
  createId: () => `analysis-run-${Date.now()}-${globalThis.crypto.randomUUID()}`,
};

export function compareAnalysisRunProvenance(
  left: AnalysisRun,
  right: AnalysisRun,
): AnalysisRunProvenanceComparison {
  return {
    snapshotChanged: left.snapshotFingerprint !== right.snapshotFingerprint
      || left.candidateHash !== right.candidateHash,
    samplingChanged: left.mode !== right.mode
      || left.samplingRunProvenanceHash !== right.samplingRunProvenanceHash,
    parserChanged: left.engineVersions.parserVersion !== right.engineVersions.parserVersion,
    rulesetChanged: left.engineVersions.rulesetVersion !== right.engineVersions.rulesetVersion,
    semanticChanged: stableStringify(left.semantic) !== stableStringify(right.semantic),
    inputCasesChanged: stableStringify(left.inputCaseIds) !== stableStringify(right.inputCaseIds),
  };
}

export class AnalysisRunService {
  public constructor(
    private readonly snapshotStore: AnalysisRunSnapshotStore = new DexieCandidatePoolSnapshotStore(),
    private readonly samplingStore: AnalysisRunSamplingStore = new DexieSamplingRunStore(),
    private readonly runStore: AnalysisRunStore = new DexieAnalysisRunStore(),
    private readonly runtime: AnalysisRunRuntime = defaultRuntime,
  ) {}

  public async createAnalysisRun(input: CreateAnalysisRunInput): Promise<AnalysisRun> {
    const snapshot = await this.snapshotStore.get(input.snapshotId);
    if (!snapshot) throw new Error(`Candidate Pool Snapshot not found: ${input.snapshotId}`);
    const snapshotCaseIds = await validateSnapshot(snapshot);
    const engineVersions = normalizeEngineVersions(input.engineVersions);
    const semantic = normalizeSemanticConfig(input.semantic);

    let inputCaseIds: string[];
    let samplingRunId: string | undefined;
    let samplingRunSampleHash: string | undefined;
    let samplingRunProvenanceHash: string | undefined;
    if (input.mode === 'sampled') {
      if (!input.samplingRunId?.trim()) throw new Error('Sampled analysis requires a SamplingRun ID');
      const samplingRun = await this.samplingStore.get(input.samplingRunId);
      if (!samplingRun) throw new Error(`SamplingRun not found: ${input.samplingRunId}`);
      await validateSamplingRun(samplingRun, snapshot, snapshotCaseIds);
      inputCaseIds = [...samplingRun.sampledCaseIds];
      samplingRunId = samplingRun.id;
      samplingRunSampleHash = samplingRun.sampleHash;
      samplingRunProvenanceHash = await calculateSamplingRunProvenanceHash(samplingRun);
    } else if (input.mode === 'exhaustive') {
      if ('samplingRunId' in input && input.samplingRunId !== undefined) {
        throw new Error('Exhaustive analysis must not reference a SamplingRun');
      }
      inputCaseIds = snapshotCaseIds;
    } else {
      throw new Error(`Unsupported analysis mode: ${String((input as { mode?: unknown }).mode)}`);
    }

    const provenanceHash = await calculateProvenanceHash({
      mode: input.mode,
      snapshotFingerprint: snapshot.snapshotFingerprint,
      candidateHash: snapshot.candidateHash,
      samplingRunProvenanceHash,
      inputCaseIds,
      engineVersions,
      semantic,
    });
    const run: AnalysisRun = {
      id: this.runtime.createId(),
      analysisContractVersion: ANALYSIS_PROVENANCE_VERSION,
      mode: input.mode,
      snapshotId: snapshot.id,
      snapshotFingerprint: snapshot.snapshotFingerprint,
      candidateHash: snapshot.candidateHash,
      ...(samplingRunId ? { samplingRunId, samplingRunSampleHash, samplingRunProvenanceHash } : {}),
      inputCaseIds,
      inputCaseCount: inputCaseIds.length,
      engineVersions,
      semantic,
      status: 'pending',
      createdAt: this.runtime.now(),
      provenanceHash,
    };
    await this.runStore.save(run);
    return run;
  }

  public getAnalysisRun(id: string): Promise<AnalysisRun | undefined> {
    return this.runStore.get(id);
  }

  public async listAnalysisRuns(filters: AnalysisRunListFilters = {}): Promise<AnalysisRun[]> {
    const runs = await this.runStore.list();
    return runs.filter((run) => (
      (!filters.snapshotId || run.snapshotId === filters.snapshotId)
      && (!filters.mode || run.mode === filters.mode)
      && (!filters.status || run.status === filters.status)
    ));
  }

  public async markAnalysisRunRunning(id: string): Promise<AnalysisRun> {
    const run = await this.requireRun(id);
    if (run.status !== 'pending') throw new Error(`AnalysisRun ${id} must be pending before running`);
    const updated = { ...run, status: 'running' as const };
    await this.runStore.save(updated);
    return updated;
  }

  public async markAnalysisRunCompleted(
    id: string,
    resultSummary: AnalysisResultSummary,
  ): Promise<AnalysisRun> {
    const run = await this.requireRun(id);
    if (run.status !== 'running') throw new Error(`AnalysisRun ${id} must be running before completion`);
    const updated: AnalysisRun = {
      ...run,
      status: 'completed',
      completedAt: this.runtime.now(),
      resultSummary: validateResultSummary(resultSummary, run.inputCaseCount),
    };
    await this.runStore.save(updated);
    return updated;
  }

  public async markAnalysisRunFailed(
    id: string,
    error: { code?: string; message?: string },
  ): Promise<AnalysisRun> {
    const run = await this.requireRun(id);
    if (run.status !== 'pending' && run.status !== 'running') {
      throw new Error(`AnalysisRun ${id} cannot fail from status ${run.status}`);
    }
    const updated: AnalysisRun = {
      ...run,
      status: 'failed',
      completedAt: this.runtime.now(),
      errorCode: sanitizeErrorValue(error.code, 'ANALYSIS_FAILED', 100),
      errorMessage: sanitizeErrorValue(error.message, 'Analysis failed', 1_000),
    };
    await this.runStore.save(updated);
    return updated;
  }

  private async requireRun(id: string): Promise<AnalysisRun> {
    const run = await this.runStore.get(id);
    if (!run) throw new Error(`AnalysisRun not found: ${id}`);
    return run;
  }
}
