import { afterEach, describe, expect, it, vi } from 'vitest';
import { runSingleCaseSemanticAnalysis } from '../../src/services/semantic/LlmRuntimeService';
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

  it('keeps provider failures awaiting without creating a review item', async () => {
    const input = record();
    const before = JSON.stringify(input);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'unavailable' } }), { status: 503 })));
    await expect(runSingleCaseSemanticAnalysis(input, rawDocument, { enabled: true, apiKey: 'test-key' })).resolves.toMatchObject({
      status: 'awaiting_llm',
    });
    expect(JSON.stringify(input)).toBe(before);
  });

  it('keeps an output-truncated DeepSeek response awaiting and uses the 8192 token budget', async () => {
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
      status: 'awaiting_llm',
      message: expect.stringContaining('未创建人工复核项'),
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ max_tokens: 8192, model: 'deepseek-flash' });
  });

  it('keeps schema/JSON technical failures awaiting without creating human review', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{not-json' }] } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    await expect(runSingleCaseSemanticAnalysis(record(), rawDocument, { enabled: true, apiKey: 'test-key' })).resolves.toMatchObject({
      status: 'awaiting_llm',
    });
  });
});
