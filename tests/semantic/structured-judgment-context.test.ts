import { describe, expect, it } from 'vitest';
import { buildSemanticTask } from '../../src/services/semantic/LlmRuntimeService';
import { LaborInfoParserAdapter } from '../../src/services/parser/LaborInfoParserAdapter';
import type { AnalysisCaseRecord, RawDocument } from '../../src/types';

const raw = (sourceMetadata: Record<string, unknown> = {}): RawDocument => ({
  id: 'raw-structured-context',
  source: 'laborinfo',
  sourceId: 'structured-context',
  title: '结构化段落测试',
  contentType: 'json',
  rawText: '原告：张某。被告：甲有限公司。判决如下：驳回原告诉讼请求。',
  sourceMetadata,
  contentHash: 'structured-context',
  importedAt: '2026-09-20T00:00:00.000Z',
});

const record = (extra: Partial<AnalysisCaseRecord> = {}): AnalysisCaseRecord => ({
  caseId: 'case_raw_structured-context',
  rawDocumentId: 'raw-structured-context',
  title: '结构化段落测试',
  source: 'laborinfo',
  city: '上海',
  isPRD: false,
  court: '测试法院',
  caseNumber: '（2023）沪01民终1号',
  date: '2023-01-01',
  year: 2023,
  caseLevel: '二审',
  disputeType: ['劳动合同解除'],
  employeeParty: '张某',
  employerParty: '甲有限公司',
  applicantRole: 'employee',
  parties: [],
  courtReasoning: '法院说理原文',
  keyLegalPoints: [],
  employerDefenses: [],
  evidence: [],
  claims: [{
    id: 'claim-1',
    claimName: '经济补偿金',
    claimant: 'employee',
    claimantRole: 'employee',
    supportStatus: 'unclear',
    sourceText: '请求支付经济补偿金',
    judgmentItems: [],
  }],
  unresolvedReferences: [{
    referencedClaimIds: ['claim-1'],
    sourceText: '请求支付经济补偿金',
    resolutionMethod: 'unresolved',
    needsSemanticResolution: true,
    confidence: 0,
  }],
  applicantOutcome: 'unclear',
  employeeOutcome: 'unclear',
  employerOutcome: 'unclear',
  overallResult: 'unclear',
  parserScore: 80,
  reviewStatus: 'pending',
  confidence: 0.8,
  isIncludedInAnalysisSet: true,
  filterReason: '',
  hasReviewerChanges: false,
  ...extra,
});

describe('structured judgment source plumbing', () => {
  it('preserves cpjg verbatim from LaborInfo source metadata through the parser', () => {
    const cpjg = '  裁判主文原始换行\n驳回原告诉讼请求。  ';
    const parsed = LaborInfoParserAdapter.parseDetailed(raw({ cpjg }));
    expect(parsed.judgmentDispositionText).toBe(cpjg);
  });

  it('preserves fxgc verbatim from LaborInfo source metadata through the parser', () => {
    const fxgc = '法院分析原文\n不含语义改写。';
    const parsed = LaborInfoParserAdapter.parseDetailed(raw({ fxgc }));
    expect(parsed.judgmentReasoningText).toBe(fxgc);
  });

  it('exposes disposition and reasoning to buildSemanticTask without generating outcomes', () => {
    const disposition = '判决主文原文';
    const reasoning = '裁判说理原文';
    const task = buildSemanticTask(record({ judgmentDispositionText: disposition, judgmentReasoningText: reasoning }), raw());
    expect(task.judgmentDispositionText).toBe(disposition);
    expect(task.judgmentReasoningText).toBe(reasoning);
    expect(task.proceduralMetadata).toEqual({ caseLevel: '二审', court: '测试法院', date: '2023-01-01' });
    expect(task.status).toBe('unresolved');
    expect(task.unresolvedTargets).toEqual([{ type: 'claim_resolution', id: 'claim-1', reasonCode: 'claim_judgment_match_unclear' }]);
  });

  it('falls back to sourceMetadata for existing records without top-level fields', () => {
    const task = buildSemanticTask(record(), raw({ cpjg: '主文', fxgc: '说理' }));
    expect(task.judgmentDispositionText).toBe('主文');
    expect(task.judgmentReasoningText).toBe('说理');
  });

  it('does not throw or invent outcome fields when structured sections are absent', () => {
    const task = buildSemanticTask(record(), raw());
    expect(task).not.toHaveProperty('judgmentDispositionText');
    expect(task).not.toHaveProperty('judgmentReasoningText');
    expect(task).not.toHaveProperty('applicantOutcome');
    expect(task).not.toHaveProperty('employeeOutcome');
    expect(task).not.toHaveProperty('employerOutcome');
  });

  it('keeps exact source strings rather than normalizing or rewriting them', () => {
    const disposition = '【原始主文】\r\n驳回其他请求。';
    const reasoning = '【原始说理】\r\n理由文本。';
    const task = buildSemanticTask(record({ judgmentDispositionText: disposition, judgmentReasoningText: reasoning }), raw());
    expect(task.judgmentDispositionText).toBe(disposition);
    expect(task.judgmentReasoningText).toBe(reasoning);
  });
});
