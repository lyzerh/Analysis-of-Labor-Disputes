import type {
  AnalysisCaseRecord,
  AnalysisRun,
  LaborInfoClaimItem,
} from '../../types';
import {
  SEMANTIC_LLM_MODEL,
  SEMANTIC_LLM_PROVIDER,
} from '../semantic/SemanticPrompt';
import {
  SEMANTIC_AUTO_ACCEPT_CONFIDENCE,
} from '../semantic/SemanticConfidenceConfig';
import {
  currentSemanticReviewResult,
  getCurrentSemanticReviewAudit,
  type SemanticReviewItem,
} from '../semantic/SemanticReviewQueue';
import {
  readSemanticReviewItems,
} from '../semantic/SemanticReviewStorage';
import {
  mapAnalysisRecordToProcessingStage,
  type ProcessingStage,
} from '../presentation/PipelineStagePresentation';
import { evaluateAnalyticsAdmission } from '../analytics/AnalyticsAdmission';
import type {
  SemanticResolutionResult,
  SourceEvidence,
} from '../semantic/SemanticResult';

export const COMPETITION_VALIDATION_SNAPSHOT_SCHEMA = 'competition-validation-snapshot-v1' as const;

export interface ValidationSnapshotAudit {
  decision: 'pass' | 'fail';
  reasonCodes: string[];
  threshold: number;
}

export interface ValidationSnapshotCaseSemantic {
  status: SemanticResolutionResult['status'] | 'not_available';
  confidence: number | null;
  applicantOutcome: string | null;
  employeeOutcome: string | null;
  employerOutcome: string | null;
  claimResolutions: SemanticResolutionResult['claimResolutions'];
  judgmentItemIds: string[];
  sourceEvidence: SourceEvidence[];
}

export interface CompetitionValidationSnapshotCase {
  caseId: string;
  rawDocumentId: string;
  caseName: string;
  caseNo: string | null;
  court: string;
  date: string;
  caseLevel: string;
  city?: string;
  province?: string;
  workflowState: ProcessingStage;
  claims: Array<{
    claimId: string;
    claimType: string;
    claimLabel: string;
    claimText: string;
    supportStatus: LaborInfoClaimItem['supportStatus'];
  }>;
  semantic: ValidationSnapshotCaseSemantic;
  audit: ValidationSnapshotAudit;
}

export interface CompetitionValidationSnapshotReviewItem {
  caseId: string;
  target: string;
  reviewStatus: SemanticReviewItem['status'];
  reviewAction?: string;
  reviewedAt?: string;
  originalCandidate: SemanticResolutionResult;
  finalValue?: SemanticResolutionResult;
  historicalAudit: ValidationSnapshotAudit;
  currentAudit: ValidationSnapshotAudit;
}

export interface CompetitionValidationSnapshotAnalysisRun {
  analysisRunId: string;
  snapshotId: string;
  createdAt: string;
  mode: AnalysisRun['mode'];
  selected: boolean;
  caseIds: string[];
  total: number;
  eligible: number;
  needs_review: number;
  awaiting_llm: number;
  technical_failure: number;
  blocked: number;
}

export interface CompetitionValidationSnapshot {
  schemaVersion: typeof COMPETITION_VALIDATION_SNAPSHOT_SCHEMA;
  exportedAt: string;
  appVersionOrGitHead: string;
  semanticAutoAcceptThreshold: number;
  provider: string;
  model: string;
  librarySummary: {
    totalCases: number;
    rawDocuments: number;
  };
  workflowSummary: {
    accepted: number;
    awaiting_llm: number;
    needs_review: number;
    technical_failure: number;
    blocked: number;
  };
  validationMeta: {
    currentThreshold: number;
    auditRecomputed: boolean;
    humanReviewAuthoritative: boolean;
    analyticsGateApplied: boolean;
  };
  cases: CompetitionValidationSnapshotCase[];
  reviewItems: CompetitionValidationSnapshotReviewItem[];
  analysisRuns: CompetitionValidationSnapshotAnalysisRun[];
}

export interface BuildCompetitionValidationSnapshotInput {
  /** Cases in the currently displayed corpus or AnalysisRun scope. */
  records: readonly AnalysisCaseRecord[];
  /** All available records are used only for separate run counts. */
  allRecords?: readonly AnalysisCaseRecord[];
  reviewItems?: readonly SemanticReviewItem[];
  analysisRuns?: readonly AnalysisRun[];
  selectedAnalysisRunId?: string;
  librarySummary: CompetitionValidationSnapshot['librarySummary'];
  exportedAt?: string;
  appVersionOrGitHead?: string;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const reviewItemForCase = (
  caseId: string,
  reviewItems: readonly SemanticReviewItem[],
): SemanticReviewItem | undefined => reviewItems
  .filter((item) => item.caseId === caseId)
  .sort((left, right) => {
    const leftTime = left.reviewedAt || left.createdAt;
    const rightTime = right.reviewedAt || right.createdAt;
    return rightTime.localeCompare(leftTime);
  })[0];

const evidenceFromResult = (result: SemanticResolutionResult | undefined): SourceEvidence[] => {
  if (!result) return [];
  return [
    ...result.parties.map((item) => item.sourceEvidence),
    ...result.claims.map((item) => item.sourceEvidence),
    ...result.judgmentItems.map((item) => item.sourceEvidence),
    ...result.claimResolutions.map((item) => item.sourceEvidence),
  ].filter((item): item is SourceEvidence => Boolean(item));
};

const auditFor = (
  item: SemanticReviewItem | undefined,
  fallbackDecision: 'pass' | 'fail',
): ValidationSnapshotAudit => {
  const current = item ? getCurrentSemanticReviewAudit(item) : undefined;
  return {
    decision: current?.decision || fallbackDecision,
    reasonCodes: [...(current?.reasonCodes || [])],
    threshold: current?.admissionConfidenceThreshold ?? SEMANTIC_AUTO_ACCEPT_CONFIDENCE,
  };
};

const semanticFor = (
  item: SemanticReviewItem | undefined,
  record: AnalysisCaseRecord,
): ValidationSnapshotCaseSemantic => {
  const result = item ? currentSemanticReviewResult(item) : undefined;
  const normalizedRecordStatus = record.semanticResolutionStatus as string | undefined;
  const recordStatus = normalizedRecordStatus === 'resolved' || normalizedRecordStatus === 'unresolved'
    ? normalizedRecordStatus
    : undefined;
  return {
    status: result?.status || recordStatus || 'not_available',
    confidence: result?.confidence ?? null,
    applicantOutcome: result?.applicantOutcome ?? null,
    employeeOutcome: result?.employeeOutcome ?? null,
    employerOutcome: result?.employerOutcome ?? null,
    claimResolutions: result ? clone(result.claimResolutions) : [],
    judgmentItemIds: result?.judgmentItems.map((item) => item.id) || [],
    sourceEvidence: evidenceFromResult(result),
  };
};

const claimId = (claim: LaborInfoClaimItem, index: number): string => claim.id || `${claim.claimName || 'claim'}-${index + 1}`;

const stageCounts = (
  records: readonly AnalysisCaseRecord[],
  reviewItems: readonly SemanticReviewItem[],
): Omit<CompetitionValidationSnapshotAnalysisRun, 'analysisRunId' | 'snapshotId' | 'createdAt' | 'mode' | 'selected' | 'caseIds' | 'total'> => {
  const counts = {
    eligible: 0,
    needs_review: 0,
    awaiting_llm: 0,
    technical_failure: 0,
    blocked: 0,
  };
  records.forEach((record) => {
    const stage = mapAnalysisRecordToProcessingStage(record, reviewItems);
    if (stage === 'safe') counts.eligible += 1;
    else if (stage === 'review_pending') counts.needs_review += 1;
    else if (stage === 'awaiting_llm') counts.awaiting_llm += 1;
    else if (stage === 'technical_failure') counts.technical_failure += 1;
    else counts.blocked += 1;
  });
  return counts;
};

export function buildCompetitionValidationSnapshot(
  input: BuildCompetitionValidationSnapshotInput,
): CompetitionValidationSnapshot {
  const reviewItems = input.reviewItems ? [...input.reviewItems] : readSemanticReviewItems();
  const records = [...input.records];
  const allRecords = [...(input.allRecords || records)];
  const recordMap = new Map(allRecords.map((record) => [record.caseId, record]));
  const exportedCaseIds = new Set(records.map((record) => record.caseId));
  const workflow = stageCounts(records, reviewItems);
  const cases = records.map((record) => {
    const item = reviewItemForCase(record.caseId, reviewItems);
    const admission = evaluateAnalyticsAdmission({ record, reviewItems });
    const semantic = semanticFor(item, record);
    return {
      caseId: record.caseId,
      rawDocumentId: record.rawDocumentId,
      caseName: record.title,
      caseNo: record.caseNumber,
      court: record.court,
      date: record.date,
      caseLevel: record.caseLevel,
      ...(record.city ? { city: record.city } : {}),
      workflowState: mapAnalysisRecordToProcessingStage(record, reviewItems),
      claims: record.claims.map((claim, index) => ({
        claimId: claimId(claim, index),
        claimType: claim.claimType || claim.claimName,
        claimLabel: claim.claimName,
        claimText: claim.sourceText || '',
        supportStatus: claim.supportStatus,
      })),
      semantic,
      audit: auditFor(item, admission.status === 'eligible' ? 'pass' : 'fail'),
    } satisfies CompetitionValidationSnapshotCase;
  });
  const exportedReviewItems = reviewItems
    .filter((item) => exportedCaseIds.has(item.caseId))
    .map((item) => {
      const currentAudit = getCurrentSemanticReviewAudit(item);
      return {
        caseId: item.caseId,
        target: (item.unresolvedTargets || []).map((target) => target.id || target.type).join(',') || 'case',
        reviewStatus: item.status,
        ...(item.reviewedResult?.reviewAction ? { reviewAction: item.reviewedResult.reviewAction } : {}),
        ...(item.reviewedAt ? { reviewedAt: item.reviewedAt } : {}),
        originalCandidate: clone(item.reviewedResult?.originalCandidate || item.semanticResult),
        ...(item.reviewedResult?.finalValue || item.reviewedResult?.reviewedResult
          ? { finalValue: clone(item.reviewedResult.finalValue || item.reviewedResult.reviewedResult) }
          : {}),
        historicalAudit: {
          decision: item.audit.decision,
          reasonCodes: [...item.audit.reasonCodes],
          threshold: item.audit.admissionConfidenceThreshold,
        },
        currentAudit: {
          decision: currentAudit?.decision || 'fail',
          reasonCodes: [...(currentAudit?.reasonCodes || [])],
          threshold: currentAudit?.admissionConfidenceThreshold ?? SEMANTIC_AUTO_ACCEPT_CONFIDENCE,
        },
      } satisfies CompetitionValidationSnapshotReviewItem;
    });
  const analysisRuns = (input.analysisRuns || []).map((run) => {
    const runRecords = run.inputCaseIds
      .map((caseId) => recordMap.get(caseId))
      .filter((record): record is AnalysisCaseRecord => Boolean(record));
    const counts = stageCounts(runRecords, reviewItems);
    // A run input without a locally available record cannot be admitted; keep
    // it visible in the run denominator as a blocked input instead of silently
    // dropping it from the stage counts.
    counts.blocked += run.inputCaseIds.length - runRecords.length;
    return {
      analysisRunId: run.id,
      snapshotId: run.snapshotId,
      createdAt: run.createdAt,
      mode: run.mode,
      selected: run.id === input.selectedAnalysisRunId,
      caseIds: [...run.inputCaseIds],
      total: run.inputCaseIds.length,
      ...counts,
    };
  });
  return {
    schemaVersion: COMPETITION_VALIDATION_SNAPSHOT_SCHEMA,
    exportedAt: input.exportedAt || new Date().toISOString(),
    appVersionOrGitHead: input.appVersionOrGitHead || 'local-build',
    semanticAutoAcceptThreshold: SEMANTIC_AUTO_ACCEPT_CONFIDENCE,
    provider: SEMANTIC_LLM_PROVIDER,
    model: SEMANTIC_LLM_MODEL,
    librarySummary: { ...input.librarySummary },
    workflowSummary: {
      accepted: workflow.eligible,
      awaiting_llm: workflow.awaiting_llm,
      needs_review: workflow.needs_review,
      technical_failure: workflow.technical_failure,
      blocked: workflow.blocked,
    },
    validationMeta: {
      currentThreshold: SEMANTIC_AUTO_ACCEPT_CONFIDENCE,
      auditRecomputed: true,
      humanReviewAuthoritative: true,
      analyticsGateApplied: true,
    },
    cases,
    reviewItems: exportedReviewItems,
    analysisRuns,
  };
}

export function validationSnapshotFilename(exportedAt = new Date().toISOString()): string {
  return `lawlens-validation-snapshot-${exportedAt.slice(0, 10)}.json`;
}

export function downloadCompetitionValidationSnapshot(
  snapshot: CompetitionValidationSnapshot,
  filename = validationSnapshotFilename(snapshot.exportedAt),
): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    throw new Error('Validation snapshot download requires a browser');
  }
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function exportCompetitionValidationSnapshot(
  input: BuildCompetitionValidationSnapshotInput,
): Promise<CompetitionValidationSnapshot> {
  const snapshot = buildCompetitionValidationSnapshot(input);
  downloadCompetitionValidationSnapshot(snapshot);
  return snapshot;
}
