import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createBrowserOpenRouterSemanticClient,
  testOpenRouterConnection,
} from '../../src/services/semantic/BrowserOpenRouterSemanticClient';
import { GeminiSemanticResultResolver } from '../../src/services/semantic/GeminiSemanticResultResolver';
import {
  resolveUnresolvedSemanticTaskWithAudit,
  resolveUnresolvedSemanticTaskWithReview,
} from '../../src/services/semantic/SemanticResolutionOrchestrator';
import { readSemanticReviewItems } from '../../src/services/semantic/SemanticReviewStorage';
import type { UnresolvedSemanticTask } from '../../src/services/semantic/SemanticResult';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null { return this.values.get(key) || null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
  clear(): void { this.values.clear(); }
}

const task: UnresolvedSemanticTask = {
  status: 'unresolved',
  caseId: 'case-openrouter',
  reasonCodes: ['claim_judgment_match_unclear'],
  rawText: '原告：张某。原告请求支付工资1000元。被告支付原告工资1000元。',
  unresolvedTargets: [{ type: 'claim_resolution', id: 'claim-1', reasonCode: 'claim_judgment_match_unclear' }],
  knownClaims: [{
    id: 'claim-1', claimantPartyIds: ['employee-1'], claimantRole: 'employee', claimType: 'wage', claimText: '请求支付工资1000元',
  }],
  knownParties: [{
    id: 'employee-1', name: '张某', laborRole: 'employee', proceduralRoles: ['plaintiff'],
  }],
  knownJudgmentItems: [{ id: 'judgment-1', text: '被告支付原告工资1000元。' }],
};

const validSemanticResult = {
  status: 'resolved',
  resolver: 'llm',
  parties: [{
    id: 'employee-1',
    name: '张某',
    laborRole: 'employee',
    proceduralRoles: ['plaintiff'],
    sourceEvidence: { text: '原告：张某。' },
  }],
  claims: [{
    id: 'claim-1',
    claimantPartyIds: ['employee-1'],
    claimantRole: 'employee',
    claimType: 'wage',
    claimText: '请求支付工资1000元',
    requestedAmount: 1000,
    currency: 'CNY',
    sourceEvidence: { text: '原告请求支付工资1000元。' },
  }],
  judgmentItems: [{
    id: 'judgment-1',
    text: '被告支付原告工资1000元。',
    awardedAmount: 1000,
    currency: 'CNY',
    sourceEvidence: { text: '被告支付原告工资1000元。' },
  }],
  claimResolutions: [{
    claimId: 'claim-1',
    judgmentItemIds: ['judgment-1'],
    outcome: 'supported',
    awardedAmount: 1000,
    confidence: 0.98,
    sourceEvidence: { text: '被告支付原告工资1000元。' },
  }],
  applicantRole: 'employee',
  applicantOutcome: 'supported',
  employeeOutcome: 'supported',
  employerOutcome: 'not_supported',
  confidence: 0.9,
};

describe('browser OpenRouter semantic client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses the fixed free route and extracts chat completion content', async () => {
    const response = new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const textSpy = vi.spyOn(response, 'text');
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);

    const result = await createBrowserOpenRouterSemanticClient(' test-key ').models.generateContent({
      model: 'ignored-by-fixed-provider-contract',
      contents: 'Return JSON only',
      config: { systemInstruction: 'System instruction', temperature: 0, maxOutputTokens: 128 },
    });

    expect(result).toEqual({ text: '{"ok":true}' });
    expect(textSpy).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer test-key',
      'Content-Type': 'application/json',
    });
    expect(init.headers).not.toHaveProperty('X-Title');
    expect(Object.values(init.headers).every((value) => /^[\x00-\x7F]*$/.test(String(value)))).toBe(true);
    expect(JSON.parse(init.body)).toMatchObject({
      model: 'openrouter/free',
      messages: [
        { role: 'system', content: 'System instruction' },
        { role: 'user', content: 'Return JSON only' },
      ],
    });
  });

  it('traces response metadata without logging the full response body', async () => {
    const body = JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { location: { hostname: 'localhost' } });

    await createBrowserOpenRouterSemanticClient('test-key').models.generateContent({
      model: 'ignored',
      contents: 'Return JSON only',
    });

    const trace = infoSpy.mock.calls
      .map((call) => call.join(' '))
      .find((message) => message.includes('provider response'));
    expect(trace).toContain('"status":200');
    expect(trace).toContain('"ok":true');
    expect(trace).toContain('"contentType":"application/json"');
    expect(trace).toContain(`"bodyLength":${body.length}`);
    expect(trace).toContain('"jsonParseSuccess":true');
    expect(trace).toContain(JSON.stringify(body.slice(0, 120).replace(/\s+/g, ' ')));
    expect(trace).not.toContain('Authorization');
  });

  it('passes a valid OpenRouter response through the existing local schema parser', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(validSemanticResult) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const resolver = new GeminiSemanticResultResolver({
      apiKey: 'test-key',
      modelName: 'openrouter/free',
      client: createBrowserOpenRouterSemanticClient('test-key'),
    });
    await expect(resolver.resolve(task)).resolves.toMatchObject({ status: 'resolved', resolver: 'llm' });
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.max_tokens).toBe(4096);
    expect(requestBody.messages[0].content).toContain('"claimResolutions"');
    expect(requestBody.messages[0].content).toContain('"sourceEvidence"');
    expect(requestBody.messages[1].content).toContain('SemanticResolutionResult');
  });

  it('routes a formal OpenRouter result through schema and local audit successfully', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        message: { content: JSON.stringify(validSemanticResult) },
        finish_reason: 'stop',
        native_finish_reason: 'stop',
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const resolver = new GeminiSemanticResultResolver({
      apiKey: 'test-key',
      modelName: 'openrouter/free',
      client: createBrowserOpenRouterSemanticClient('test-key'),
    });
    const audited = await resolveUnresolvedSemanticTaskWithAudit(task, resolver);
    expect(audited.result.resolverErrorCode).toBeUndefined();
    expect(audited.audit).toMatchObject({ decision: 'pass', reasonCodes: [] });
  });

  it.each([null, ''])('classifies a length-terminated response with content=%s as output_truncated and skips human review', async (content) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        message: { content },
        finish_reason: 'length',
        native_finish_reason: 'length',
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const resolver = new GeminiSemanticResultResolver({
      apiKey: 'test-key',
      modelName: 'openrouter/free',
      client: createBrowserOpenRouterSemanticClient('test-key'),
    });
    const storage = new MemoryStorage() as unknown as Storage;
    const result = await resolveUnresolvedSemanticTaskWithReview(task, resolver, {
      storage,
      createdAt: '2026-09-18T00:00:00.000Z',
    });

    expect(result.result).toMatchObject({ status: 'unresolved', resolverErrorCode: 'output_truncated' });
    expect(result.reviewItem).toBeUndefined();
    expect(readSemanticReviewItems(storage)).toHaveLength(0);
  });

  it('keeps an ad-hoc OpenRouter object on the schema-invalid path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        caseId: task.caseId,
        status: 'unresolved',
        reasonCodes: ['claim_judgment_match_unclear'],
        target: 'claim-1',
        resolution: 'unclear',
        sourceEvidence: '判决主文未明确对应关系。',
      }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const resolver = new GeminiSemanticResultResolver({
      apiKey: 'test-key',
      modelName: 'openrouter/free',
      client: createBrowserOpenRouterSemanticClient('test-key'),
    });
    await expect(resolver.resolve(task)).resolves.toMatchObject({
      status: 'unresolved',
      resolver: 'llm',
      resolverErrorCode: 'schema_invalid',
    });
  });

  it('classifies connection status without making a real network call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(testOpenRouterConnection('test-key')).resolves.toBe('available');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('max_tokens');
  });

  it('tests a valid key even when the global runtime switch is off', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    // Connection testing accepts only the key; the AI enabled switch is for case execution.
    await expect(testOpenRouterConnection('test-key')).resolves.toBe('available');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns a safe status without fetch when a runtime dependency is missing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('AbortController', undefined);
    await expect(testOpenRouterConnection('test-key')).resolves.toBe('network_error');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces client initialization failures without starting fetch', async () => {
    const fetchMock = vi.fn();
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { location: { hostname: 'localhost' } });
    vi.stubGlobal('AbortController', vi.fn(() => {
      throw new Error('abort controller init failed');
    }));

    await expect(testOpenRouterConnection('test-key')).resolves.toBe('unknown_error');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(infoSpy.mock.calls.flat().join(' ')).toContain('client_not_initialized');
  });

  it('returns invalid_key without fetch when no key is supplied', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(testOpenRouterConnection('  ')).resolves.toBe('invalid_key');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'invalid_key'],
    [403, 'invalid_key'],
    [404, 'model_unavailable'],
    [429, 'rate_limited'],
    [503, 'provider_unavailable'],
  ] as const)('maps HTTP %s to %s', async (status, expected) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'provider error' } }), { status }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(testOpenRouterConnection('test-key')).resolves.toBe(expected);
  });

  it('maps a rejected fetch to network_error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(testOpenRouterConnection('test-key')).resolves.toBe('network_error');
  });

  it('maps an aborted request to timeout and ends connection testing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    await expect(testOpenRouterConnection('test-key')).resolves.toBe('timeout');
  });
});
