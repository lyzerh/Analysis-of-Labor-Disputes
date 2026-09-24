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
  archiveSnapshot?(id: string): Promise<CandidatePoolSnapshot>;
  restoreSnapshot?(id: string): Promise<CandidatePoolSnapshot>;
  deleteSnapshot?(id: string): Promise<void>;
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

export interface ResearchPopulationReferenceInfo {
  referencedRunCount: number;
  samplingRunCount: number;
}

/** Reference checks use the persisted foreign-key relation, never labels or current UI selection. */
export function isResearchPopulationReferenced(snapshotId: string, analysisRuns: AnalysisRun[]): boolean {
  return analysisRuns.some((run) => run.snapshotId === snapshotId);
}

export function countResearchPopulationReferences(
  snapshotId: string,
  analysisRuns: AnalysisRun[],
  samplingRuns: SamplingRun[] = [],
): ResearchPopulationReferenceInfo {
  return {
    referencedRunCount: analysisRuns.filter((run) => run.snapshotId === snapshotId).length,
    samplingRunCount: samplingRuns.filter((run) => run.snapshotId === snapshotId).length,
  };
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
  if (header.lifecycleStatus === 'archived') {
    return { ...header, isSelectable: false, unavailableReason: '该研究总体已归档，请先恢复后再创建新的研究运行。' };
  }
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

  /** Read-only local population access for rendering research-scope options and counts. */
  public listLocalAnalysisRecords(): Promise<AnalysisCaseRecord[]> {
    return this.localRecords.listLocalAnalysisRecords();
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

  public async getResearchPopulationReferenceInfo(snapshotId: string): Promise<ResearchPopulationReferenceInfo> {
    const [analysisRuns, samplingRuns] = await Promise.all([
      this.analysisRuns.listAnalysisRuns(),
      this.sampling.listSamplingRuns(snapshotId),
    ]);
    return countResearchPopulationReferences(snapshotId, analysisRuns, samplingRuns);
  }

  public async archiveResearchPopulation(snapshotId: string): Promise<CandidatePoolSnapshot> {
    if (!this.snapshots.archiveSnapshot) throw new Error('当前存储不支持归档研究总体');
    return this.snapshots.archiveSnapshot(snapshotId);
  }

  public async restoreResearchPopulation(snapshotId: string): Promise<CandidatePoolSnapshot> {
    if (!this.snapshots.restoreSnapshot) throw new Error('当前存储不支持恢复研究总体');
    return this.snapshots.restoreSnapshot(snapshotId);
  }

  public async deleteResearchPopulation(snapshotId: string): Promise<void> {
    const [analysisRuns, samplingRuns] = await Promise.all([
      this.analysisRuns.listAnalysisRuns(),
      this.sampling.listSamplingRuns(snapshotId),
    ]);
    const referenceInfo = countResearchPopulationReferences(snapshotId, analysisRuns, samplingRuns);
    if (isResearchPopulationReferenced(snapshotId, analysisRuns)) {
      throw new Error(`该研究总体已被 ${referenceInfo.referencedRunCount} 个研究运行引用，为保留历史研究的可复现性，不能直接删除。`);
    }
    if (referenceInfo.samplingRunCount > 0) {
      throw new Error(`该研究总体已有 ${referenceInfo.samplingRunCount} 个抽样方案引用，不能直接删除。`);
    }
    if (!this.snapshots.deleteSnapshot) throw new Error('当前存储不支持删除研究总体');
    await this.snapshots.deleteSnapshot(snapshotId);
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
    if (snapshot.lifecycleStatus === 'archived') throw new Error('该研究总体已归档，请先恢复后再创建新的研究运行。');
    if (snapshot.status !== 'complete') throw new Error('该 Snapshot 不完整，不能创建正式研究运行');
    if (snapshot.candidateCount === 0 || snapshot.candidates.length === 0) {
      throw new Error('该 Snapshot 为空，不能创建正式研究运行');
    }
    return snapshot;
  }
}
