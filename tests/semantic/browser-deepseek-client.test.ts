import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createBrowserDeepSeekSemanticClient,
  testDeepSeekConnection,
} from '../../src/services/semantic/BrowserDeepSeekSemanticClient';
import { GeminiSemanticResultResolver } from '../../src/services/semantic/GeminiSemanticResultResolver';
import { resolveUnresolvedSemanticTaskWithReview } from '../../src/services/semantic/SemanticResolutionOrchestrator';
import { readSemanticReviewItems } from '../../src/services/semantic/SemanticReviewStorage';
import type { UnresolvedSemanticTask } from '../../src/services/semantic/SemanticResult';

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
  clear(): void { this.values.clear(); }
}

const task: UnresolvedSemanticTask = {
  status: 'unresolved',
  caseId: 'case-deepseek',
  reasonCodes: ['claim_judgment_match_unclear'],
  rawText: '原告请求支付工资1000元。被告支付原告工资1000元。',
  unresolvedTargets: [{ type: 'claim_resolution', id: 'claim-1', reasonCode: 'claim_judgment_match_unclear' }],
  knownClaims: [{
    id: 'claim-1', claimantPartyIds: ['employee-1'], claimantRole: 'employee', claimType: 'wage', claimText: '请求支付工资1000元',
  }],
  knownParties: [{ id: 'employee-1', name: '张某', laborRole: 'employee', proceduralRoles: ['plaintiff'] }],
  knownJudgmentItems: [{ id: 'judgment-1', text: '被告支付原告工资1000元。' }],
};

const validResult = {
  status: 'resolved', resolver: 'llm',
  parties: [{ id: 'employee-1', name: '张某', laborRole: 'employee', proceduralRoles: ['plaintiff'], sourceEvidence: { text: '原告请求支付工资1000元。' } }],
  claims: [{ id: 'claim-1', claimantPartyIds: ['employee-1'], claimantRole: 'employee', claimType: 'wage', claimText: '请求支付工资1000元', sourceEvidence: { text: '请求支付工资1000元' } }],
  judgmentItems: [{ id: 'judgment-1', text: '被告支付原告工资1000元。', sourceEvidence: { text: '被告支付原告工资1000元。' } }],
  claimResolutions: [{ claimId: 'claim-1', judgmentItemIds: ['judgment-1'], outcome: 'supported', confidence: 0.98, sourceEvidence: { text: '被告支付原告工资1000元。' } }],
  applicantRole: 'employee', applicantOutcome: 'supported', employeeOutcome: 'supported', employerOutcome: 'not_supported', confidence: 0.98,
};

describe('browser DeepSeek semantic client', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('uses the official endpoint, DeepSeek model, JSON mode, top-level disabled thinking, and 8192 semantic budget', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await createBrowserDeepSeekSemanticClient('test-key').models.generateContent({ model: 'ignored', contents: 'hello', config: { maxOutputTokens: 8192 } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer test-key', 'Content-Type': 'application/json' });
    const requestBody = JSON.parse(init.body);
    expect(requestBody).toMatchObject({ model: 'deepseek-flash', max_tokens: 8192, response_format: { type: 'json_object' }, thinking: { type: 'disabled' } });
    expect(requestBody).not.toHaveProperty('extra_body');
  });

  it('tests a valid key even when AI is disabled and does not fetch without a key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { sessionStorage: { getItem: () => JSON.stringify({ enabled: false, apiKey: 'test-key' }) } });
    await expect(testDeepSeekConnection()).resolves.toBe('available');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(testDeepSeekConnection('  ')).resolves.toBe('invalid_key');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([[401, 'invalid_key'], [403, 'permission'], [429, 'rate_limited'], [503, 'provider_unavailable']] as const)('maps HTTP %s to %s', async (status, expected) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'provider error' } }), { status })));
    await expect(testDeepSeekConnection('test-key')).resolves.toBe(expected);
  });

  it('maps length with empty content to output_truncated and keeps technical failure out of review', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: null }, finish_reason: 'length' }] }), { status: 200 })));
    const resolver = new GeminiSemanticResultResolver({ apiKey: 'test-key', modelName: 'deepseek-flash', maxOutputTokens: 8192, client: createBrowserDeepSeekSemanticClient('test-key') });
    const storage = new MemoryStorage() as unknown as Storage;
    const result = await resolveUnresolvedSemanticTaskWithReview(task, resolver, { storage, createdAt: '2026-09-19T00:00:00.000Z' });
    expect(result.result).toMatchObject({ status: 'unresolved', resolverErrorCode: 'output_truncated' });
    expect(result.reviewItem).toBeUndefined();
    expect(readSemanticReviewItems(storage)).toHaveLength(0);
  });

  it('passes valid JSON to local schema validation and rejects ad-hoc JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(validResult) }, finish_reason: 'stop' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const validResolver = new GeminiSemanticResultResolver({ apiKey: 'test-key', modelName: 'deepseek-flash', client: createBrowserDeepSeekSemanticClient('test-key') });
    await expect(validResolver.resolve(task)).resolves.toMatchObject({ status: 'resolved', resolver: 'llm' });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ target: 'claim-1', resolution: 'unclear', sourceEvidence: '片段' }) } }] }), { status: 200 }));
    await expect(validResolver.resolve(task)).resolves.toMatchObject({ status: 'unresolved', resolverErrorCode: 'schema_invalid' });
  });
});
