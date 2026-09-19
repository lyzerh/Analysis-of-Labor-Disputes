import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getPipelineOverview,
  cleanPipelineDiagnosticMessage,
  mapAnalysisRecordToProcessingStage,
  processingStageLabel,
} from '../../src/services/presentation/PipelineStagePresentation';
import { hasExecutableSemanticTask } from '../../src/services/semantic/SemanticTaskEligibility';
import { analysisRecord } from '../outcome/helpers/record-factories';

function record(overrides: Record<string, unknown> = {}) {
  return analysisRecord('pipeline-case', 'supported', {
    semanticResolutionStatus: undefined,
    semanticResolutionErrorCode: undefined,
    humanReviewCandidates: [],
    unresolvedReferences: [],
    outcomeDiagnostics: [],
    ...overrides,
  });
}

describe('pipeline processing stage presentation', () => {
  it('maps deterministic and semantic states to the three product stages', () => {
    expect(mapAnalysisRecordToProcessingStage(record({ semanticResolutionStatus: 'not_needed' }))).toBe('safe');
    expect(mapAnalysisRecordToProcessingStage(record({ semanticResolutionStatus: 'resolved' }))).toBe('review_pending');
    expect(mapAnalysisRecordToProcessingStage(record({ semanticResolutionStatus: 'pending', unresolvedReferences: [{ sourceText: '待对应' }] }))).toBe('awaiting_llm');
    expect(mapAnalysisRecordToProcessingStage(record({ semanticResolutionStatus: 'partially_resolved', unresolvedReferences: [{ sourceText: '待对应' }] }))).toBe('awaiting_llm');
    expect(mapAnalysisRecordToProcessingStage(record({ semanticResolutionStatus: 'processing' }))).toBe('llm_processing');
    expect(mapAnalysisRecordToProcessingStage(record({ semanticResolutionStatus: 'needs_review' }))).toBe('review_pending');
    expect(mapAnalysisRecordToProcessingStage(record({ semanticResolutionStatus: 'provider_unavailable', unresolvedReferences: [{ sourceText: '待对应' }] }))).toBe('awaiting_llm');
    expect(mapAnalysisRecordToProcessingStage(record({ semanticResolutionErrorCode: 'output_truncated', unresolvedReferences: [{ sourceText: '待对应' }] }))).toBe('awaiting_llm');
    expect(mapAnalysisRecordToProcessingStage(record({ semanticResolutionStatus: 'pending', reviewStatus: 'approved' }))).toBe('blocked');
  });

  it('does not admit an unresolved or failed result as safe', () => {
    expect(mapAnalysisRecordToProcessingStage(record({ unresolvedReferences: [{ sourceText: '待对应' }] }))).toBe('awaiting_llm');
    expect(mapAnalysisRecordToProcessingStage(record({ semanticResolutionErrorCode: 'schema_invalid' }))).toBe('review_pending');
  });

  it('blocks a legacy-included record when critical outcomes or claims remain unclear', () => {
    expect(mapAnalysisRecordToProcessingStage(record({
      isIncludedInAnalysisSet: true,
      applicantOutcome: 'unclear',
      employeeOutcome: 'unclear',
      employerOutcome: 'unclear',
      claims: [{ claimName: '工资', claimant: 'employee', supportStatus: 'unclear' }],
      outcomeDiagnostics: [{ outcome: 'unclear', needsReview: true, reasonCode: 'disposition_not_matched' }],
    }))).toBe('blocked');
  });

  it('requires an executable task before using the awaiting-AI stage', () => {
    const taskable = record({ semanticResolutionStatus: 'pending', unresolvedReferences: [{ sourceText: '待处理语义关联' }] });
    const blocked = record({ semanticResolutionStatus: 'pending', unresolvedReferences: [] });
    expect(hasExecutableSemanticTask(taskable)).toBe(true);
    expect(mapAnalysisRecordToProcessingStage(taskable)).toBe('awaiting_llm');
    expect(hasExecutableSemanticTask(blocked)).toBe(false);
    expect(mapAnalysisRecordToProcessingStage(blocked)).toBe('blocked');
  });

  it('does not treat resolved or empty references as executable tasks', () => {
    const recordWithNonTaskReferences = record({
      semanticResolutionStatus: 'pending',
      unresolvedReferences: [
        { sourceText: '已处理', resolutionMethod: 'direct', needsSemanticResolution: false },
        { sourceText: '   ', resolutionMethod: 'unresolved', needsSemanticResolution: true },
      ],
    });
    expect(hasExecutableSemanticTask(recordWithNonTaskReferences)).toBe(false);
    expect(mapAnalysisRecordToProcessingStage(recordWithNonTaskReferences)).toBe('blocked');
  });

  it('keeps pending human review in review_pending even without an LLM task', () => {
    expect(mapAnalysisRecordToProcessingStage(record({
      semanticResolutionStatus: 'needs_review',
      humanReviewCandidates: [{ candidate: {} }],
      unresolvedReferences: [],
    }))).toBe('review_pending');
  });

  it('keeps pending human review ahead of a retryable provider failure', () => {
    expect(mapAnalysisRecordToProcessingStage(record({
      semanticResolutionStatus: 'provider_unavailable',
      semanticResolutionErrorCode: 'network_error',
      humanReviewCandidates: [{ candidate: {} }],
      unresolvedReferences: [{ sourceText: '待处理语义关联' }],
    }))).toBe('review_pending');
  });

  it('uses the Analytics Gate as the only safe criterion for complete rule records', () => {
    expect(mapAnalysisRecordToProcessingStage(record({
      semanticResolutionStatus: 'not_needed',
      applicantOutcome: 'supported',
      employeeOutcome: 'supported',
      employerOutcome: 'not_supported',
      claims: [{ claimName: '工资', claimant: 'employee', supportStatus: 'supported' }],
    }))).toBe('safe');
  });

  it('counts the current analysis set without mutating records', () => {
    const records = [
      record({ semanticResolutionStatus: 'not_needed' }),
      record({ semanticResolutionStatus: 'pending', unresolvedReferences: [{ sourceText: '待对应' }] }),
      record({ semanticResolutionStatus: 'needs_review' }),
    ];
    expect(getPipelineOverview(records)).toMatchObject({ total: 3, safe: 1, safeRate: 33, awaitingAi: 1, reviewPending: 1, llmProcessing: 0, blocked: 0 });
    expect(processingStageLabel('safe')).toBe('可安全入库');
    expect(processingStageLabel('awaiting_llm')).toBe('待 AI 语义分析');
    expect(processingStageLabel('review_pending')).toBe('人工复核');
    expect(processingStageLabel('blocked')).toBe('无法生成语义任务');
  });

  it('does not reintroduce retired routing instructions in diagnostic copy', () => {
    expect(cleanPipelineDiagnosticMessage('解析置信度较低，建议人工复核', '待核对')).toBe('解析置信度较低。');
    expect(cleanPipelineDiagnosticMessage(undefined, '待核对')).toBe('待核对');
  });
});

describe('pipeline workspace UI contract', () => {
  const caseAnalysisSource = readFileSync(resolve(process.cwd(), 'src/components/CaseAnalysisView.tsx'), 'utf8');
  const workspaceSource = readFileSync(resolve(process.cwd(), 'src/components/PipelineWorkspace.tsx'), 'utf8');

  it('routes Case Analysis to a pipeline workspace while preserving browse navigation', () => {
    expect(caseAnalysisSource).toMatch(/type CaseAnalysisSubview = 'browse' \| 'pipeline'/);
    expect(caseAnalysisSource).toMatch(/案例浏览/);
    expect(caseAnalysisSource).toMatch(/流水线工作台/);
    expect(caseAnalysisSource).toMatch(/<PipelineWorkspace records=\{records\}/);
    expect(caseAnalysisSource).toMatch(/setSelectedCaseId\(item\.caseId\)/);
  });

  it('exposes safe, awaiting-AI, and human-review sections with typed diagnostics', () => {
    expect(workspaceSource).toMatch(/可安全入库/);
    expect(workspaceSource).toMatch(/待 AI 语义分析/);
    expect(workspaceSource).toMatch(/无法生成语义任务/);
    expect(workspaceSource).toMatch(/人工复核工作台/);
    expect(workspaceSource).toMatch(/AI 语义分析工作台/);
    expect(workspaceSource).toMatch(/开始处理全部/);
    expect(workspaceSource).toMatch(/分析此案例/);
    expect(workspaceSource).toMatch(/onRunSingleCase/);
    expect(workspaceSource).toMatch(/AI 语义分析未启用/);
    expect(workspaceSource).toMatch(/DeepSeek API Key 未配置/);
    expect(workspaceSource).toMatch(/outcomeReviewEvidenceFields/);
    const evidenceSource = readFileSync(resolve(process.cwd(), 'src/services/outcome/OutcomeReviewQueue.ts'), 'utf8');
    expect(evidenceSource).toMatch(/诉求片段/);
    expect(evidenceSource).toMatch(/裁判主文片段/);
    expect(evidenceSource).toMatch(/诊断依据/);
    expect(workspaceSource).not.toMatch(/LLM候选|规则改进|建议人工复核|建议人工判断/);
  });

  it('does not expose the removed routing controls from the formal Case Analysis page', () => {
    expect(caseAnalysisSource).not.toMatch(/LLM候选|规则改进|加入 LLM 复核候选|标记人工复核|标记规则改进|处理建议筛选/);
    expect(caseAnalysisSource).toMatch(/<OutcomeEvidenceFields item=\{selectedReviewItem\}/);
  });
});
