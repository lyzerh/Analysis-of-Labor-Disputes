import type {
  AnalysisCaseRecord,
  AnalysisRun,
  CandidatePoolSnapshot,
  CandidatePoolSnapshotHeader,
  SamplingRun,
  StratificationDimension,
  AllocationStrategy,
} from '../../types';
import { LaborAnalysisPipeline } from '../data/LaborAnalysisPipeline';
import {
  AnalysisRunService,
  type CreateAnalysisRunInput,
} from './AnalysisRunService';
import {
  CandidatePoolSnapshotService,
  type BuildSnapshotOptions,
  type CandidateFilterInput,
} from '../dataset/CandidatePoolSnapshotService';
import {
  SamplingService,
  type CreateSamplingRunInput,
  type CreateStratifiedSamplingRunInput,
} from '../sampling/SamplingService';
import {
  getCurrentAnalysisEngineVersions,
  getSemanticAnalysisConfig,
} from './AnalysisEngineVersions';
import { ResearchCasePreparationService, type ResearchCasePreparationSummary } from './ResearchCasePreparationService';

export interface ResearchWorkspaceSnapshots {
  listSnapshots(): Promise<CandidatePoolSnapshotHeader[]>;
  getSnapshot(id: string): Promise<CandidatePoolSnapshot | undefined>;
  buildSnapshot(input: CandidateFilterInput, options?: BuildSnapshotOptions): Promise<CandidatePoolSnapshot>;
  buildLocalSnapshot(records: AnalysisCaseRecord[], input: CandidateFilterInput): Promise<CandidatePoolSnapshot>;
}

export interface ResearchWorkspaceLocalRecords {
  listLocalAnalysisRecords(): Promise<AnalysisCaseRecord[]>;
}

class PipelineLocalRecords implements ResearchWorkspaceLocalRecords {
  public listLocalAnalysisRecords(): Promise<AnalysisCaseRecord[]> {
    return LaborAnalysisPipeline.getAllAnalysisRecords();
  }
}

export interface ResearchWorkspaceCasePreparation {
  prepareSnapshot(snapshot: CandidatePoolSnapshot): Promise<ResearchCasePreparationSummary>;
}

export interface ResearchWorkspaceSampling {
  listSamplingRuns(snapshotId?: string): Promise<SamplingRun[]>;
  createSamplingRun(input: CreateSamplingRunInput): Promise<SamplingRun>;
  createStratifiedSamplingRun(input: CreateStratifiedSamplingRunInput): Promise<SamplingRun>;
}

export interface ResearchWorkspaceAnalysisRuns {
  listAnalysisRuns(): Promise<AnalysisRun[]>;
  createAnalysisRun(input: CreateAnalysisRunInput): Promise<AnalysisRun>;
}

export interface WorkspaceSnapshot extends CandidatePoolSnapshotHeader {
  isSelectable: boolean;
  unavailableReason?: string;
}

export interface ResearchWorkspaceState {
  snapshots: WorkspaceSnapshot[];
  samplingRuns: SamplingRun[];
  analysisRuns: AnalysisRun[];
}

export type CreateWorkspaceSamplingInput =
  | {
      method: 'seeded_random';
      snapshotId: string;
      seed: string | number;
      sampleSize: number;
    }
  | {
      method: 'stratified_seeded_random';
      snapshotId: string;
      seed: string | number;
      sampleSize: number;
      dimensions: StratificationDimension[];
      allocationStrategy: AllocationStrategy;
    };

export type CreateWorkspaceAnalysisInput =
  | { mode: 'exhaustive'; snapshotId: string; semanticEnabled: boolean }
  | { mode: 'sampled'; snapshotId: string; samplingRunId: string; semanticEnabled: boolean };

function selectableSnapshot(header: CandidatePoolSnapshotHeader): WorkspaceSnapshot {
  if (header.status !== 'complete') {
    return { ...header, isSelectable: false, unavailableReason: '该研究总体不完整，不能创建正式研究运行。' };
  }
  if (header.candidateCount === 0) {
    return { ...header, isSelectable: false, unavailableReason: '该研究总体为空，不能创建正式研究运行。' };
  }
  return { ...header, isSelectable: true };
}

export class ResearchWorkspaceService {
  public constructor(
    private readonly snapshots: ResearchWorkspaceSnapshots = new CandidatePoolSnapshotService(),
    private readonly sampling: ResearchWorkspaceSampling = new SamplingService(),
    private readonly analysisRuns: ResearchWorkspaceAnalysisRuns = new AnalysisRunService(),
    private readonly casePreparation: ResearchWorkspaceCasePreparation = new ResearchCasePreparationService(),
    private readonly localRecords: ResearchWorkspaceLocalRecords = new PipelineLocalRecords(),
  ) {}

  public async createSnapshot(input: CandidateFilterInput): Promise<CandidatePoolSnapshot> {
    const records = await this.localRecords.listLocalAnalysisRecords();
    if (records.length === 0) {
      throw new Error('当前本地案例库为空，请先导入或准备案例');
    }
    return this.snapshots.buildLocalSnapshot(records, input);
  }

  public async createRemoteSnapshot(input: CandidateFilterInput, options: BuildSnapshotOptions = {}): Promise<CandidatePoolSnapshot> {
    if (input.startDate && input.endDate && input.startDate > input.endDate) {
      throw new Error('开始日期不能晚于结束日期');
    }
    return this.snapshots.buildSnapshot(input, options);
  }

  public async getLocalRecordCount(): Promise<number> {
    return (await this.localRecords.listLocalAnalysisRecords()).length;
  }

  public async prepareSnapshotRecords(snapshotId: string): Promise<ResearchCasePreparationSummary> {
    const snapshot = await this.requireSelectableSnapshot(snapshotId);
    return this.casePreparation.prepareSnapshot(snapshot);
  }

  public async loadWorkspace(): Promise<ResearchWorkspaceState> {
    const [snapshots, samplingRuns, analysisRuns] = await Promise.all([
      this.snapshots.listSnapshots(),
      this.sampling.listSamplingRuns(),
      this.analysisRuns.listAnalysisRuns(),
    ]);
    return {
      snapshots: snapshots.map(selectableSnapshot),
      samplingRuns,
      analysisRuns,
    };
  }

  public async listSamplingRuns(snapshotId: string): Promise<SamplingRun[]> {
    await this.requireSelectableSnapshot(snapshotId);
    const runs = await this.sampling.listSamplingRuns(snapshotId);
    return runs.filter((run) => run.snapshotId === snapshotId);
  }

  public async createSamplingRun(input: CreateWorkspaceSamplingInput): Promise<SamplingRun> {
    await this.requireSelectableSnapshot(input.snapshotId);
    if (input.method === 'seeded_random') {
      return this.sampling.createSamplingRun({
        snapshotId: input.snapshotId,
        seed: input.seed,
        sampleSize: input.sampleSize,
      });
    }
    return this.sampling.createStratifiedSamplingRun({
      snapshotId: input.snapshotId,
      seed: input.seed,
      sampleSize: input.sampleSize,
      dimensions: input.dimensions,
      allocationStrategy: input.allocationStrategy,
    });
  }

  public async createAnalysisRun(input: CreateWorkspaceAnalysisInput): Promise<AnalysisRun> {
    await this.requireSelectableSnapshot(input.snapshotId);
    if (input.mode === 'sampled') {
      if (!input.samplingRunId?.trim()) throw new Error('Sampled research requires a SamplingRun');
      const eligibleRuns = await this.listSamplingRuns(input.snapshotId);
      if (!eligibleRuns.some((run) => run.id === input.samplingRunId)) {
        throw new Error('SamplingRun does not belong to the selected Snapshot');
      }
    }
    const common = {
      snapshotId: input.snapshotId,
      engineVersions: getCurrentAnalysisEngineVersions(),
      semantic: getSemanticAnalysisConfig(input.semanticEnabled),
    };
    return input.mode === 'exhaustive'
      ? this.analysisRuns.createAnalysisRun({ mode: 'exhaustive', ...common })
      : this.analysisRuns.createAnalysisRun({
          mode: 'sampled',
          samplingRunId: input.samplingRunId,
          ...common,
        });
  }

  private async requireSelectableSnapshot(snapshotId: string): Promise<CandidatePoolSnapshot> {
    const normalized = snapshotId.trim();
    if (!normalized) throw new Error('请明确选择一个研究总体 Snapshot');
    const snapshot = await this.snapshots.getSnapshot(normalized);
    if (!snapshot) throw new Error(`Candidate Pool Snapshot not found: ${normalized}`);
    if (snapshot.status !== 'complete') throw new Error('该 Snapshot 不完整，不能创建正式研究运行');
    if (snapshot.candidateCount === 0 || snapshot.candidates.length === 0) {
      throw new Error('该 Snapshot 为空，不能创建正式研究运行');
    }
    return snapshot;
  }
}
