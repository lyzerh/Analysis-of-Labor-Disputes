import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getPipelineOverview,
  getPipelineProcessingStats,
  cleanPipelineDiagnosticMessage,
  mapAnalysisRecordToProcessingStage,
  processingStageLabel,
  processingStageReason,
} from '../../src/services/presentation/PipelineStagePresentation';
import { hasExecutableSemanticTask } from '../../src/services/semantic/SemanticTaskEligibility';
import { analysisRecord } from '../outcome/helpers/record-factories';
import { getWorkflowDisplayPresentation, semanticAuditReasonLabel } from '../../src/services/presentation/WorkflowPresentation';
import type { SemanticReviewItem } from '../../src/services/semantic/SemanticReviewQueue';

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
    expect(mapAnalysisRecordToProcessingStage(record({ semanticResolutionStatus: 'pending', unresolvedReferences: [{ sourceText: '待对应', referencedClaimIds: ['claim-1'] }] }))).toBe('awaiting_llm');
    expect(mapAnalysisRecordToProcessingStage(record({ semanticResolutionStatus: 'partially_resolved', unresolvedReferences: [{ sourceText: '待对应', referencedClaimIds: ['claim-1'] }] }))).toBe('awaiting_llm');
    expect(mapAnalysisRecordToProcessingStage(record({ semanticResolutionStatus: 'processing' }))).toBe('llm_processing');
    expect(mapAnalysisRecordToProcessingStage(record({ semanticResolutionStatus: 'needs_review' }))).toBe('review_pending');
    expect(mapAnalysisRecordToProcessingStage(record({ semanticResolutionStatus: 'provider_unavailable', unresolvedReferences: [{ sourceText: '待对应', referencedClaimIds: ['claim-1'] }] }))).toBe('technical_failure');
    expect(mapAnalysisRecordToProcessingStage(record({ semanticResolutionErrorCode: 'output_truncated', unresolvedReferences: [{ sourceText: '待对应', referencedClaimIds: ['claim-1'] }] }))).toBe('technical_failure');
    expect(mapAnalysisRecordToProcessingStage(record({ semanticResolutionStatus: 'pending', reviewStatus: 'approved' }))).toBe('blocked');
  });

  it('does not admit an unresolved or failed result as safe', () => {
    expect(mapAnalysisRecordToProcessingStage(record({ unresolvedReferences: [{ sourceText: '待对应', referencedClaimIds: ['claim-1'] }] }))).toBe('awaiting_llm');
    expect(mapAnalysisRecordToProcessingStage(record({ semanticResolutionErrorCode: 'schema_invalid' }))).toBe('technical_failure');
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
    const taskable = record({ semanticResolutionStatus: 'pending', unresolvedReferences: [{ sourceText: '待处理语义关联', referencedClaimIds: ['claim-1'] }] });
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
      unresolvedReferences: [{ sourceText: '待处理语义关联', referencedClaimIds: ['claim-1'] }],
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
      record({ semanticResolutionStatus: 'pending', unresolvedReferences: [{ sourceText: '待对应', referencedClaimIds: ['claim-1'] }] }),
      record({ semanticResolutionStatus: 'needs_review' }),
    ];
    expect(getPipelineOverview(records)).toMatchObject({ total: 3, safe: 1, safeRate: 33, awaitingAi: 1, reviewPending: 1, llmProcessing: 0, blocked: 0 });
    expect(processingStageLabel('safe')).toBe('可安全入库');
    expect(processingStageLabel('awaiting_llm')).toBe('待 AI 语义分析');
    expect(processingStageLabel('review_pending')).toBe('需要人工复核');
    expect(processingStageLabel('technical_failure')).toBe('技术失败');
    expect(processingStageLabel('blocked')).toBe('暂不可分析');
  });

  it('does not reintroduce retired routing instructions in diagnostic copy', () => {
    expect(cleanPipelineDiagnosticMessage('解析置信度较低，建议人工复核', '待核对')).toBe('解析置信度较低。');
    expect(cleanPipelineDiagnosticMessage(undefined, '待核对')).toBe('待核对');
    expect(processingStageReason(record({ semanticResolutionStatus: 'needs_review' }))).toContain('AI 已生成候选结果');
    expect(processingStageReason(record({ semanticResolutionErrorCode: 'schema_invalid' }))).toContain('技术失败');
  });

  it('centralizes workflow copy and keeps technical failure distinct from review', () => {
    expect(getWorkflowDisplayPresentation('needs_review')).toMatchObject({ label: '需要人工复核' });
    expect(getWorkflowDisplayPresentation('technical_failure')).toMatchObject({ label: '技术失败' });
    expect(getWorkflowDisplayPresentation('blocked')).toMatchObject({
      label: '暂不可分析',
      description: '当前案例缺少完成语义分析所需的原文或结构化信息。',
    });
    expect(semanticAuditReasonLabel('unresolved_result')).toBe('当前结果尚未明确');
    expect(semanticAuditReasonLabel('technical_resolution_failure')).toBe('技术失败');
  });

  it('counts technical failures separately from review-pending candidates', () => {
    const records = [
      record({ semanticResolutionStatus: 'needs_review' }),
      record({ semanticResolutionStatus: 'technical_failure', semanticResolutionErrorCode: 'schema_invalid' }),
      record({ semanticResolutionStatus: 'not_needed' }),
    ];
    expect(getPipelineProcessingStats(records)).toMatchObject({
      failed: 1,
      completed: 1,
      pending: 0,
    });
    expect(getPipelineOverview(records)).toMatchObject({ reviewPending: 1, technicalFailure: 1 });
  });

  it('treats a completed human result as current authority while retaining technical provenance', () => {
    const source = record({ semanticResolutionStatus: 'technical_failure', semanticResolutionErrorCode: 'schema_invalid' });
    const reviewed = {
      id: 'pipeline-case::manual',
      caseId: source.caseId,
      status: 'reviewed',
      semanticResult: {} as SemanticReviewItem['semanticResult'],
      audit: { decision: 'fail', reasonCodes: ['technical_resolution_failure'], admissionConfidenceThreshold: 0.8 },
      createdAt: '2026-09-17T00:00:00.000Z',
      reviewedAt: '2026-09-17T01:00:00.000Z',
      reviewedResult: {
        source: 'human_review' as const,
        reviewStatus: 'approved' as const,
        reviewedAt: '2026-09-17T01:00:00.000Z',
        reviewedResult: {} as SemanticReviewItem['semanticResult'],
      },
    } as SemanticReviewItem;
    expect(mapAnalysisRecordToProcessingStage(source, [reviewed])).toBe('review_pending');
    expect(getPipelineOverview([source], [reviewed])).toMatchObject({ technicalFailure: 0, reviewPending: 1 });
  });

  it('does not hardcode the retired confidence threshold in workflow presentation', () => {
    const presentationSource = readFileSync(
      resolve(process.cwd(), 'src/services/presentation/WorkflowPresentation.ts'),
      'utf8',
    );
    expect(presentationSource).not.toMatch(/0\.90|0\.9/);
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
    expect(workspaceSource).toMatch(/暂不可分析/);
    expect(workspaceSource).toMatch(/blocked-stage-panel/);
    expect(workspaceSource).toMatch(/aria-expanded=\{blockedOpen\}/);
    expect(workspaceSource).toMatch(/查看案例/);
    expect(workspaceSource).toMatch(/技术失败/);
    expect(workspaceSource).toMatch(/人工复核工作台/);
    expect(workspaceSource).toMatch(/重新尝试 AI/);
    expect(workspaceSource).toMatch(/直接人工复核/);
    expect(workspaceSource).toMatch(/技术失败详情/);
    expect(workspaceSource).toMatch(/最近技术失败/);
    expect(workspaceSource).toMatch(/technical-failure-summary/);
    expect(workspaceSource).toMatch(/AI 语义分析工作台/);
    expect(workspaceSource).toMatch(/开始处理全部/);
    expect(workspaceSource).toMatch(/分析此案例/);
    expect(workspaceSource).toMatch(/onRunSingleCase/);
    expect(workspaceSource).toMatch(/AI 语义分析未启用/);
    expect(workspaceSource).toMatch(/当前 xAI API Key 未配置/);
    expect(workspaceSource).toMatch(/DiagnosticClueWorkspace/);
    const evidenceSource = readFileSync(resolve(process.cwd(), 'src/services/outcome/OutcomeReviewQueue.ts'), 'utf8');
    expect(evidenceSource).toMatch(/诉求片段/);
    expect(evidenceSource).toMatch(/裁判主文片段/);
    expect(evidenceSource).toMatch(/诊断依据/);
    expect(workspaceSource).not.toMatch(/LLM候选|规则改进|建议人工复核|建议人工判断/);
  });

  it('exposes the low-profile validation snapshot export without changing the pipeline actions', () => {
    expect(workspaceSource).toMatch(/导出验证快照/);
    expect(workspaceSource).toMatch(/onExportValidationSnapshot/);
    expect(caseAnalysisSource).toMatch(/exportCompetitionValidationSnapshot/);
    expect(caseAnalysisSource).toMatch(/librarySummary/);
  });

  it('exposes a collapsed, searchable, grouped diagnostic clue workspace', () => {
    const clueSource = readFileSync(resolve(process.cwd(), 'src/components/DiagnosticClueWorkspace.tsx'), 'utf8');
    expect(clueSource).toMatch(/裁判结果诊断线索/);
    expect(clueSource).toMatch(/搜索诊断线索/);
    expect(clueSource).toMatch(/按案件分组/);
    expect(clueSource).toMatch(/展开详情/);
    expect(clueSource).toMatch(/收起详情/);
    expect(clueSource).toMatch(/收起全部/);
    expect(clueSource).toMatch(/useState\(false\)/);
    expect(clueSource).toMatch(/onSelectCase\(item\)/);
    const queueSource = readFileSync(resolve(process.cwd(), 'src/services/outcome/OutcomeReviewQueue.ts'), 'utf8');
    expect(queueSource).toMatch(/证据问题/);
    expect(queueSource).toMatch(/关系问题/);
    expect(queueSource).toMatch(/技术问题/);
  });

  it('uses human-review wording for semantic candidates instead of automatic-failure wording', () => {
    const reviewSource = readFileSync(resolve(process.cwd(), 'src/components/SemanticReviewWorkspace.tsx'), 'utf8');
    expect(reviewSource).toMatch(/需要人工复核/);
    expect(reviewSource).toMatch(/AI 未能可靠确定/);
    expect(reviewSource).toMatch(/未生成（技术失败）/);
    expect(reviewSource).toMatch(/纯人工复核/);
    expect(reviewSource).toMatch(/AI 技术失败记录已保留/);
    expect(reviewSource).not.toMatch(/系统未能可靠完成自动解析/);
  });

  it('does not expose the removed routing controls from the formal Case Analysis page', () => {
    expect(caseAnalysisSource).not.toMatch(/LLM候选|规则改进|加入 LLM 复核候选|标记人工复核|标记规则改进|处理建议筛选/);
    expect(caseAnalysisSource).toMatch(/<OutcomeEvidenceFields item=\{selectedReviewItem\}/);
  });
});
