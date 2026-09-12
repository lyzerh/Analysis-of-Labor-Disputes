import type {
  AnalysisCaseRecord,
  AnalysisResultSummary,
  AnalysisRun,
  CandidatePoolSnapshot,
  CandidatePoolSnapshotHeader,
  SamplingRun,
  StratificationDimension,
} from '../../types';
import {
  ANALYTICS_QUALITY_THRESHOLDS,
  evaluateAnalysisQuality,
  type AnalysisQualityAssessment,
  type AnalysisQualityIssue,
} from '../analytics/AnalysisQualityGuardrails';
import { LaborAnalysisPipeline } from '../data/LaborAnalysisPipeline';
import {
  DexieCandidatePoolSnapshotStore,
  type CandidatePoolSnapshotStore,
} from '../dataset/CandidatePoolSnapshotService';
import {
  calculateCandidateHash,
  calculateSampleHash,
  DexieSamplingRunStore,
  type SamplingRunStore,
} from '../sampling/SamplingService';
import {
  AnalysisRunService,
  calculateProvenanceHash,
  calculateSamplingRunProvenanceHash,
} from './AnalysisRunService';

export const ANALYTICS_VERSION = 'analytics-rules-v1' as const;

export type StatisticalScope = 'corpus' | 'sample';

export interface ResearchAnalysisRunAccess {
  getAnalysisRun(id: string): Promise<AnalysisRun | undefined>;
  listAnalysisRuns(): Promise<AnalysisRun[]>;
  markAnalysisRunRunning(id: string): Promise<AnalysisRun>;
  markAnalysisRunCompleted(id: string, resultSummary: AnalysisResultSummary): Promise<AnalysisRun>;
  markAnalysisRunFailed(id: string, error: { code?: string; message?: string }): Promise<AnalysisRun>;
}

export interface ResearchRecordLoader {
  loadByInputCaseIds(inputCaseIds: string[], analysisRun: AnalysisRun): Promise<Map<string, AnalysisCaseRecord>>;
}

export interface ResearchAnalysisContext {
  analysisRun: AnalysisRun;
  snapshot: CandidatePoolSnapshotHeader;
  samplingRun?: SamplingRun;
  inputCaseIds: string[];
  records: AnalysisCaseRecord[];
  missingCaseIds: string[];
  statisticalScope: StatisticalScope;
  quality: AnalysisQualityAssessment;
}

export interface ResearchAnalyticsMetadata {
  analysisRunId: string;
  mode: AnalysisRun['mode'];
  snapshotId: string;
  samplingRunId?: string;
  inputCaseCount: number;
  availableRecordCount: number;
  usableCaseCount: number;
  provenanceHash: string;
  statisticalScope: StatisticalScope;
  scopeStatement: string;
  analyticsVersion: typeof ANALYTICS_VERSION;
  denominatorContract: {
    outcomeRatePolicy: 'known_outcomes_only';
    knownOutcomeCount: number;
    unknownOutcomeExcludedCount: number;
    includedCaseCount: number;
  };
  sampling?: {
    method: SamplingRun['method'];
    seed: string;
    sampleHash: string;
    actualSampleSize: number;
    allocationStrategy?: 'proportional' | 'balanced';
    dimensions?: StratificationDimension[];
  };
}

export interface ResearchAnalyticsResult<T> {
  metadata: ResearchAnalyticsMetadata;
  quality: AnalysisQualityAssessment;
  result: T;
}

export interface ResearchAnalysisExecution<T> {
  context: ResearchAnalysisContext;
  analysisRun: AnalysisRun;
  result?: ResearchAnalyticsResult<T>;
}

const defaultRecordLoader: ResearchRecordLoader = {
  loadByInputCaseIds: (inputCaseIds, analysisRun) => (
    LaborAnalysisPipeline.getAnalysisRecordsBySourceIds(inputCaseIds, {
      enableSemanticResolution: analysisRun.semantic.enabled,
    })
  ),
};

function sameArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function integrityIssue(code: string, message: string): AnalysisQualityIssue {
  return { code, severity: 'error', message };
}

function resultSummary(context: ResearchAnalysisContext): AnalysisResultSummary {
  const metrics = context.quality.metrics;
  return {
    processedCaseCount: metrics.expectedInputCount,
    includedCaseCount: metrics.includedCaseCount,
    excludedCaseCount: metrics.excludedCaseCount,
    failedCaseCount: metrics.missingRecordCount,
    unknownOutcomeCount: metrics.unknownOutcomeCount,
  };
}

function scopeStatement(scope: StatisticalScope, samplingRun?: SamplingRun): string {
  if (scope === 'corpus') return '在当前 Snapshot 所定义的语料总体中';
  if (samplingRun?.method === 'stratified_seeded_random') return '在本次分层抽样样本中';
  return '在本次可复现随机样本中';
}

export class ResearchAnalysisService {
  public constructor(
    private readonly analysisRuns: ResearchAnalysisRunAccess = new AnalysisRunService(),
    private readonly snapshots: CandidatePoolSnapshotStore = new DexieCandidatePoolSnapshotStore(),
    private readonly samplingRuns: SamplingRunStore = new DexieSamplingRunStore(),
    private readonly recordLoader: ResearchRecordLoader = defaultRecordLoader,
  ) {}

  public listAnalysisRuns(): Promise<AnalysisRun[]> {
    return this.analysisRuns.listAnalysisRuns();
  }

  public async loadResearchAnalysisContext(analysisRunId: string): Promise<ResearchAnalysisContext> {
    const normalizedId = analysisRunId.trim();
    if (!normalizedId) throw new Error('AnalysisRun ID is required');
    const analysisRun = await this.analysisRuns.getAnalysisRun(normalizedId);
    if (!analysisRun) throw new Error(`AnalysisRun not found: ${normalizedId}`);
    const snapshot = await this.snapshots.get(analysisRun.snapshotId);
    if (!snapshot) throw new Error(`Candidate Pool Snapshot not found: ${analysisRun.snapshotId}`);

    const integrityIssues = await this.validateResearchDesign(analysisRun, snapshot);
    let samplingRun: SamplingRun | undefined;
    if (analysisRun.mode === 'sampled' && analysisRun.samplingRunId) {
      samplingRun = await this.samplingRuns.get(analysisRun.samplingRunId);
      if (!samplingRun) {
        integrityIssues.push(integrityIssue(
          'SAMPLING_RUN_NOT_FOUND',
          `SamplingRun not found: ${analysisRun.samplingRunId}`,
        ));
      } else {
        integrityIssues.push(...await this.validateSamplingRelation(analysisRun, snapshot, samplingRun));
      }
    }

    const hasBlockedIntegrity = integrityIssues.some((issue) => issue.severity === 'error');
    const recordsByInputId = hasBlockedIntegrity
      ? new Map<string, AnalysisCaseRecord>()
      : await this.recordLoader.loadByInputCaseIds([...analysisRun.inputCaseIds], analysisRun);
    const records: AnalysisCaseRecord[] = [];
    const availableInputIds = new Set<string>();
    for (const inputId of analysisRun.inputCaseIds) {
      const record = recordsByInputId.get(inputId);
      if (!record || availableInputIds.has(inputId)) continue;
      availableInputIds.add(inputId);
      records.push(record);
    }
    const missingCaseIds = analysisRun.inputCaseIds.filter((id) => !availableInputIds.has(id));
    const statisticalScope: StatisticalScope = analysisRun.mode === 'exhaustive' ? 'corpus' : 'sample';
    const quality = evaluateAnalysisQuality({
      analysisRun,
      snapshot,
      samplingRun,
      records,
      availableInputIds,
      missingCaseIds,
      integrityIssues,
    });
    return {
      analysisRun,
      snapshot,
      ...(samplingRun ? { samplingRun } : {}),
      inputCaseIds: [...analysisRun.inputCaseIds],
      records,
      missingCaseIds,
      statisticalScope,
      quality,
    };
  }

  public async executeResearchAnalysis<T>(
    analysisRunId: string,
    analyze: (records: AnalysisCaseRecord[]) => T,
  ): Promise<ResearchAnalysisExecution<T>> {
    const context = await this.loadResearchAnalysisContext(analysisRunId);
    let currentRun = context.analysisRun;
    if (context.quality.status === 'blocked') {
      if (currentRun.status === 'pending' || currentRun.status === 'running') {
        currentRun = await this.analysisRuns.markAnalysisRunFailed(currentRun.id, {
          code: 'ANALYSIS_INPUT_BLOCKED',
          message: context.quality.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message).join(' '),
        });
      }
      return { context, analysisRun: currentRun };
    }
    if (currentRun.status === 'failed') {
      throw new Error(`AnalysisRun ${currentRun.id} has failed and cannot be executed`);
    }
    if (currentRun.status === 'pending') {
      currentRun = await this.analysisRuns.markAnalysisRunRunning(currentRun.id);
    }

    try {
      const report = analyze(context.records);
      if (currentRun.status === 'running') {
        currentRun = await this.analysisRuns.markAnalysisRunCompleted(currentRun.id, resultSummary(context));
      }
      const metrics = context.quality.metrics;
      const sampling = context.samplingRun
        ? {
            method: context.samplingRun.method,
            seed: context.samplingRun.seed,
            sampleHash: context.samplingRun.sampleHash,
            actualSampleSize: context.samplingRun.actualSampleSize,
            ...(context.samplingRun.method === 'stratified_seeded_random'
              ? {
                  allocationStrategy: context.samplingRun.stratification.allocationStrategy,
                  dimensions: [...context.samplingRun.stratification.dimensions],
                }
              : {}),
          }
        : undefined;
      const metadata: ResearchAnalyticsMetadata = {
        analysisRunId: context.analysisRun.id,
        mode: context.analysisRun.mode,
        snapshotId: context.snapshot.id,
        ...(context.analysisRun.samplingRunId ? { samplingRunId: context.analysisRun.samplingRunId } : {}),
        inputCaseCount: context.analysisRun.inputCaseCount,
        availableRecordCount: metrics.availableRecordCount,
        usableCaseCount: metrics.includedCaseCount,
        provenanceHash: context.analysisRun.provenanceHash,
        statisticalScope: context.statisticalScope,
        scopeStatement: scopeStatement(context.statisticalScope, context.samplingRun),
        analyticsVersion: ANALYTICS_VERSION,
        denominatorContract: {
          outcomeRatePolicy: 'known_outcomes_only',
          knownOutcomeCount: metrics.knownOutcomeCount,
          unknownOutcomeExcludedCount: metrics.unknownOutcomeCount,
          includedCaseCount: metrics.includedCaseCount,
        },
        ...(sampling ? { sampling } : {}),
      };
      return {
        context,
        analysisRun: currentRun,
        result: { metadata, quality: context.quality, result: report },
      };
    } catch (error) {
      if (currentRun.status === 'running') {
        currentRun = await this.analysisRuns.markAnalysisRunFailed(currentRun.id, {
          code: 'ANALYTICS_EXECUTION_FAILED',
          message: error instanceof Error ? error.message : 'Analytics execution failed',
        });
      }
      throw error;
    }
  }

  private async validateResearchDesign(
    analysisRun: AnalysisRun,
    snapshot: CandidatePoolSnapshot,
  ): Promise<AnalysisQualityIssue[]> {
    const issues: AnalysisQualityIssue[] = [];
    if (analysisRun.inputCaseCount !== analysisRun.inputCaseIds.length) {
      issues.push(integrityIssue('INPUT_CASE_COUNT_MISMATCH', 'AnalysisRun inputCaseCount 与 inputCaseIds.length 不一致。'));
    }
    if (new Set(analysisRun.inputCaseIds).size !== analysisRun.inputCaseIds.length) {
      issues.push(integrityIssue('DUPLICATE_INPUT_CASE_IDS', 'AnalysisRun inputCaseIds 包含重复 ID。'));
    }
    if (snapshot.status !== 'complete') {
      issues.push(integrityIssue('SNAPSHOT_NOT_COMPLETE', 'AnalysisRun 引用的 CandidatePoolSnapshot 不是 complete。'));
    }
    if (analysisRun.snapshotFingerprint !== snapshot.snapshotFingerprint || analysisRun.candidateHash !== snapshot.candidateHash) {
      issues.push(integrityIssue('SNAPSHOT_PROVENANCE_MISMATCH', 'AnalysisRun 与 Snapshot provenance 不一致。'));
    }
    const snapshotIds = snapshot.candidates.map((candidate) => candidate.caseId);
    if (snapshot.candidateCount !== snapshotIds.length
      || await calculateCandidateHash(snapshotIds) !== snapshot.candidateHash) {
      issues.push(integrityIssue('SNAPSHOT_CANDIDATE_INTEGRITY_FAILED', 'Snapshot candidate count/hash 校验失败。'));
    }
    if (analysisRun.mode === 'exhaustive') {
      const expected = [...snapshotIds].sort();
      if (analysisRun.samplingRunId || !sameArray(analysisRun.inputCaseIds, expected)) {
        issues.push(integrityIssue('EXHAUSTIVE_INPUT_MISMATCH', 'Exhaustive AnalysisRun 输入不是 Snapshot 的完整固定候选集。'));
      }
      const expectedProvenanceHash = await calculateProvenanceHash({
        mode: analysisRun.mode,
        snapshotFingerprint: snapshot.snapshotFingerprint,
        candidateHash: snapshot.candidateHash,
        inputCaseIds: analysisRun.inputCaseIds,
        engineVersions: analysisRun.engineVersions,
        semantic: analysisRun.semantic,
      });
      if (expectedProvenanceHash !== analysisRun.provenanceHash) {
        issues.push(integrityIssue('ANALYSIS_PROVENANCE_HASH_MISMATCH', 'AnalysisRun provenanceHash 校验失败。'));
      }
    } else if (!analysisRun.samplingRunId) {
      issues.push(integrityIssue('SAMPLED_RUN_REFERENCE_MISSING', 'Sampled AnalysisRun 缺少 SamplingRun 引用。'));
    }
    return issues;
  }

  private async validateSamplingRelation(
    analysisRun: AnalysisRun,
    snapshot: CandidatePoolSnapshot,
    samplingRun: SamplingRun,
  ): Promise<AnalysisQualityIssue[]> {
    const issues: AnalysisQualityIssue[] = [];
    if (samplingRun.snapshotId !== snapshot.id
      || samplingRun.snapshotFingerprint !== snapshot.snapshotFingerprint
      || samplingRun.candidateHash !== snapshot.candidateHash) {
      issues.push(integrityIssue('SAMPLING_SNAPSHOT_MISMATCH', 'SamplingRun 与 Snapshot provenance 不一致。'));
    }
    if (samplingRun.actualSampleSize !== samplingRun.sampledCaseIds.length
      || new Set(samplingRun.sampledCaseIds).size !== samplingRun.sampledCaseIds.length
      || await calculateSampleHash(samplingRun.sampledCaseIds) !== samplingRun.sampleHash) {
      issues.push(integrityIssue('SAMPLING_INPUT_INTEGRITY_FAILED', 'SamplingRun sample size/IDs/hash 校验失败。'));
    }
    if (analysisRun.samplingRunSampleHash !== samplingRun.sampleHash
      || !sameArray(analysisRun.inputCaseIds, samplingRun.sampledCaseIds)) {
      issues.push(integrityIssue('ANALYSIS_SAMPLING_INPUT_MISMATCH', 'AnalysisRun 输入与 SamplingRun 固定样本不一致。'));
    }
    const population = new Set(snapshot.candidates.map((candidate) => candidate.caseId));
    if (samplingRun.sampledCaseIds.some((id) => !population.has(id))) {
      issues.push(integrityIssue('SAMPLE_OUTSIDE_SNAPSHOT', 'SamplingRun 包含 Snapshot 之外的 case ID。'));
    }
    const samplingRunProvenanceHash = await calculateSamplingRunProvenanceHash(samplingRun);
    if (analysisRun.samplingRunProvenanceHash !== samplingRunProvenanceHash) {
      issues.push(integrityIssue('SAMPLING_PROVENANCE_HASH_MISMATCH', 'AnalysisRun 保存的 SamplingRun provenance hash 校验失败。'));
    }
    const expectedProvenanceHash = await calculateProvenanceHash({
      mode: analysisRun.mode,
      snapshotFingerprint: snapshot.snapshotFingerprint,
      candidateHash: snapshot.candidateHash,
      samplingRunProvenanceHash,
      inputCaseIds: analysisRun.inputCaseIds,
      engineVersions: analysisRun.engineVersions,
      semantic: analysisRun.semantic,
    });
    if (expectedProvenanceHash !== analysisRun.provenanceHash) {
      issues.push(integrityIssue('ANALYSIS_PROVENANCE_HASH_MISMATCH', 'AnalysisRun provenanceHash 校验失败。'));
    }
    return issues;
  }
}

export { ANALYTICS_QUALITY_THRESHOLDS };
