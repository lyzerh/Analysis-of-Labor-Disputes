import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserXaiSemanticClient, testXaiConnection } from '../../src/services/semantic/BrowserXaiSemanticClient';

describe('browser xAI semantic client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses the official xAI endpoint and fixed competition model for semantic requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await createBrowserXaiSemanticClient('xai-test-key').models.generateContent({
      model: 'ignored',
      contents: 'hello',
      config: { maxOutputTokens: 8192, responseJsonSchema: { type: 'object' } },
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.x.ai/v1/chat/completions');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer xai-test-key',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body)).toMatchObject({
      model: 'grok-4.20-0309-reasoning',
      max_tokens: 8192,
      stream: false,
      response_format: { type: 'json_schema', json_schema: { strict: true } },
    });
  });

  it('uses json_object for the minimal connection test and works when AI is disabled', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: 'grok-4.20-0309-reasoning',
      choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { sessionStorage: { getItem: () => JSON.stringify({ enabled: false, apiKey: 'xai-test-key' }) } });

    await expect(testXaiConnection()).resolves.toBe('available');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.response_format).toEqual({ type: 'json_object' });
    expect(requestBody.max_tokens).toBe(1024);
  });

  it('maps xAI authentication failures to invalid_key without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'invalid api key' } }), { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(testXaiConnection('xai-invalid-test')).resolves.toBe('invalid_key');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps truncated provider output to output_truncated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: null }, finish_reason: 'length' }],
    }), { status: 200 })));

    await expect(createBrowserXaiSemanticClient('xai-test-key').models.generateContent({
      model: 'ignored', contents: 'hello',
    })).rejects.toMatchObject({ code: 'output_truncated' });
  });
});
