import { afterEach, describe, expect, it, vi } from 'vitest';
import { testGeminiConnection } from '../../src/services/semantic/BrowserGeminiSemanticClient';

describe('browser Gemini client connection classification', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reports available without making a real network call in tests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(testGeminiConnection('test-key')).resolves.toBe('available');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('gemini-3.5-flash-lite');
  });

  it.each([
    [401, 'invalid_key'],
    [404, 'model_unavailable'],
    [429, 'quota_error'],
  ] as const)('classifies provider status %s', async (status, expected) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'provider error' } }), { status }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(testGeminiConnection('test-key')).resolves.toBe(expected);
  });
});
