import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyPersistedSemanticTechnicalFailure, applySingleCaseSemanticRunState, buildSemanticTask, runSingleCaseSemanticAnalysis } from '../../src/services/semantic/LlmRuntimeService';
import { createTechnicalUnresolvedResult } from '../../src/services/semantic/SemanticResultFallback';
import type { AnalysisCaseRecord, RawDocument } from '../../src/types';

const record = (): AnalysisCaseRecord => ({
  caseId: 'case-1',
  title: '测试案件',
  court: '测试法院',
  date: '2023-01-01',
  parties: [],
  claims: [{
    id: 'claim-1',
    claimName: '工资',
    claimant: 'employee',
    claimantRole: 'employee',
    supportStatus: 'unclear',
    judgmentItems: [],
    sourceText: '待分析片段',
  }],
  unresolvedReferences: [{
    referencedClaimIds: ['claim-1'],
    sourceText: '待分析片段',
    resolutionMethod: 'unresolved',
    needsSemanticResolution: true,
    confidence: 0,
  }],
  courtReasoning: '',
} as unknown as AnalysisCaseRecord);

const rawDocument = { rawText: '待分析片段' } as RawDocument;

describe('single-case browser semantic runtime', () => {
  afterEach(() => vi.restoreAllMocks());

  it('preserves canonical claim identity while exposing original text and all existing judgment candidates', () => {
    const input = {
      ...record(),
      claims: [
        { ...record().claims[0], claimName: '加班工资', claimType: 'overtime_pay', sourceText: '2019年度年终奖及工资事实', judgmentItems: [] },
        { ...record().claims[0], id: 'claim-2', claimName: '经济补偿金', claimType: 'termination_compensation', sourceText: '请求支付经济补偿金', judgmentItems: [{ id: 'judgment-2', action: 'pay' as const, targetPartyRole: 'plaintiff' as const, sourceText: '判决支付经济补偿金。' }] },
      ],
      judgmentItems: [{ id: 'judgment-case-1', action: 'reject' as const, targetPartyRole: 'plaintiff' as const, sourceText: '驳回原告的其他诉讼请求。' }],
    };
    const task = buildSemanticTask(input, { rawText: '原始裁判文书全文' } as RawDocument);
    expect(task.rawText).toBe('原始裁判文书全文');
    expect(task.knownClaims?.[0]).toMatchObject({
      claimType: 'overtime_pay',
      claimLabel: '加班工资',
      claimText: '2019年度年终奖及工资事实',
    });
    expect(task.knownJudgmentItems).toEqual([
      { id: 'judgment-case-1', text: '驳回原告的其他诉讼请求。' },
      { id: 'judgment-2', text: '判决支付经济补偿金。' },
    ]);
    expect(task.knownJudgmentItems?.some((item) => item.id === 'invented-judgment')).toBe(false);
  });

  it('does not leak task-only claim labels into technical fallback results', () => {
    const task = buildSemanticTask({
      ...record(),
      claims: [{ ...record().claims[0], claimName: '加班工资', claimType: 'overtime_pay', sourceText: '年终奖事实' }],
    }, rawDocument);
    const result = createTechnicalUnresolvedResult(task, 'provider_error');
    expect(result.claims[0]).not.toHaveProperty('claimLabel');
    expect(result.claims[0]).toMatchObject({ claimType: 'overtime_pay', claimText: '年终奖事实' });
  });

  it('keeps unresolved cases awaiting when AI is disabled or the key is missing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(runSingleCaseSemanticAnalysis(record(), rawDocument, { enabled: false, apiKey: null })).resolves.toMatchObject({ status: 'awaiting_llm' });
    await expect(runSingleCaseSemanticAnalysis(record(), rawDocument, { enabled: true, apiKey: null })).resolves.toMatchObject({ status: 'awaiting_llm' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not claim an executable run when the unresolved task is empty', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const noTask = { ...record(), unresolvedReferences: [] };
    await expect(runSingleCaseSemanticAnalysis(noTask, rawDocument, { enabled: true, apiKey: 'test-key' })).resolves.toMatchObject({
      status: 'blocked',
      message: '当前案例没有可执行的待分析语义任务。',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not call the provider for a targetless unresolved reference', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const targetless = {
      ...record(),
      unresolvedReferences: [{
        referencedClaimIds: [],
        sourceText: '待分析片段',
        resolutionMethod: 'unresolved' as const,
        needsSemanticResolution: true,
        confidence: 0,
      }],
    };
    await expect(runSingleCaseSemanticAnalysis(targetless, rawDocument, { enabled: true, apiKey: 'test-key' })).resolves.toMatchObject({
      status: 'blocked',
      message: '当前案例没有可执行的待分析语义任务。',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fans out one provider target per referenced claim id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        message: { content: null },
        finish_reason: 'length',
        native_finish_reason: 'length',
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const multiClaim = {
      ...record(),
      claims: [
        record().claims[0],
        { ...record().claims[0], id: 'claim-2', claimName: '补偿金' },
      ],
      unresolvedReferences: [{
        referencedClaimIds: ['claim-1', 'claim-2'],
        sourceText: '待分析片段',
        resolutionMethod: 'unresolved' as const,
        needsSemanticResolution: true,
        confidence: 0,
      }],
    };
    await runSingleCaseSemanticAnalysis(multiClaim, rawDocument, { enabled: true, apiKey: 'test-key' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const prompt = body.messages[1].content as string;
    expect(prompt).toContain('"id":"claim-1"');
    expect(prompt).toContain('"id":"claim-2"');
    expect(prompt).not.toContain('"id":""');
  });

  it('classifies provider failures as technical without creating a review item', async () => {
    const input = record();
    const before = JSON.stringify(input);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'unavailable' } }), { status: 503 })));
    await expect(runSingleCaseSemanticAnalysis(input, rawDocument, { enabled: true, apiKey: 'test-key' })).resolves.toMatchObject({
      status: 'technical_failure',
    });
    expect(JSON.stringify(input)).toBe(before);
  });

  it('classifies an output-truncated xAI response as technical and uses the 8192 token budget', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        message: { content: null },
        finish_reason: 'length',
        native_finish_reason: 'length',
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(runSingleCaseSemanticAnalysis(record(), rawDocument, {
      enabled: true,
      apiKey: 'test-key',
    })).resolves.toMatchObject({
      status: 'technical_failure',
      message: expect.stringContaining('可重试 AI 或直接人工复核'),
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ max_tokens: 8192, model: 'grok-4.20-0309-reasoning' });
  });

  it('classifies schema/JSON failures as technical without creating human review', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{not-json' }] } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    await expect(runSingleCaseSemanticAnalysis(record(), rawDocument, { enabled: true, apiKey: 'test-key' })).resolves.toMatchObject({
      status: 'technical_failure',
    });
  });

  it('keeps a retryable technical failure separate, then routes a later valid response to review', async () => {
    const validCandidate = {
      status: 'unresolved',
      resolver: 'llm',
      parties: [],
      claims: [{ id: 'claim-1', claimantPartyIds: [], claimantRole: 'employee', claimType: '工资', claimText: '待分析片段' }],
      judgmentItems: [],
      claimResolutions: [{ claimId: 'claim-1', judgmentItemIds: [], outcome: 'unclear', confidence: 0 }],
      applicantRole: 'unknown', applicantOutcome: 'unclear', employeeOutcome: 'unclear', employerOutcome: 'unclear',
      confidence: 0,
      unresolvedReasonCodes: ['claim_judgment_match_unclear'],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: null }, finish_reason: 'length' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(validCandidate) }, finish_reason: 'stop' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const first = await runSingleCaseSemanticAnalysis(record(), rawDocument, { enabled: true, apiKey: 'test-key' });
    expect(first.status).toBe('technical_failure');
    const second = await runSingleCaseSemanticAnalysis(record(), rawDocument, { enabled: true, apiKey: 'test-key' });
    expect(second.status).toBe('review');
    expect(second.reviewItem?.candidateStatus).toBe('ai_candidate');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('synchronizes a technical job failure into the case workflow state without changing parser facts', () => {
    const source = { ...record(), semanticResolutionStatus: 'pending' as const, semanticResolutionErrorCode: undefined };
    const updated = applySingleCaseSemanticRunState(source, {
      status: 'technical_failure',
      message: '技术失败',
      technicalFailure: {
        caseId: source.caseId,
        failureStage: 'response',
        failureCode: 'schema_invalid',
        errorSummary: 'schema failed',
        timestamp: '2026-09-17T06:00:00.000Z',
        attempt: 1,
      },
    });
    expect(updated).toMatchObject({ semanticResolutionStatus: 'technical_failure', semanticResolutionErrorCode: 'schema_invalid' });
    expect(updated.claims).toEqual(source.claims);
    expect(updated.unresolvedReferences).toEqual(source.unresolvedReferences);
  });

  it('moves a valid-but-uncertain retry into review_pending and clears stale technical code', () => {
    const source = { ...record(), semanticResolutionStatus: 'technical_failure' as const, semanticResolutionErrorCode: 'schema_invalid' };
    const updated = applySingleCaseSemanticRunState(source, { status: 'review', message: '已进入人工复核' });
    expect(updated).toMatchObject({ semanticResolutionStatus: 'needs_review' });
    expect(updated.semanticResolutionErrorCode).toBeUndefined();
  });

  it('rehydrates a stored technical failure without regressing a later semantic result', () => {
    const failure = {
      caseId: 'case-1',
      failureStage: 'validation' as const,
      failureCode: 'schema_invalid',
      errorSummary: 'schema failed',
      timestamp: '2026-09-17T06:00:00.000Z',
      attempt: 1,
    };
    expect(applyPersistedSemanticTechnicalFailure({ ...record(), semanticResolutionStatus: 'pending' }, failure)).toMatchObject({
      semanticResolutionStatus: 'technical_failure',
      semanticResolutionErrorCode: 'schema_invalid',
    });
    const later = { ...record(), semanticResolutionStatus: 'needs_review' as const };
    expect(applyPersistedSemanticTechnicalFailure(later, failure)).toBe(later);
  });
});
