import type {
  GeminiResultGenerateRequest,
  GeminiSemanticResultClient,
} from './GeminiSemanticResultResolver';
import { readLlmRuntimeSettings } from './LlmRuntimeSettings';
import { SEMANTIC_LLM_MODEL, SEMANTIC_LLM_PROVIDER } from './SemanticPrompt';

export type OpenRouterConnectionStatus =
  | 'unknown'
  | 'testing'
  | 'available'
  | 'invalid_key'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'model_unavailable'
  | 'network_error'
  | 'timeout'
  | 'unknown_error';

const OPENROUTER_API_ROOT = 'https://openrouter.ai/api/v1/chat/completions';
const CONNECTION_TIMEOUT_MS = 10_000;

type ConnectionDiagnosticCode =
  | 'missing_api_key'
  | 'provider_not_configured'
  | 'client_not_initialized'
  | 'missing_runtime_dependency';

const traceConnection = (message: string, details?: Record<string, unknown>): void => {
  const hostname = typeof window !== 'undefined' ? window.location?.hostname : undefined;
  if (hostname && /^(localhost|127\.0\.0\.1)$/.test(hostname)) {
    console.info(`[testConnection] ${message}${details ? ` ${JSON.stringify(details)}` : ''}`);
  }
};

const providerError = (
  message: string,
  status?: number,
  code?: string,
): Error & { status?: number; code?: string } => {
  const error = new Error(message) as Error & { status?: number; code?: string };
  error.status = status;
  error.code = code;
  return error;
};

const responseText = (payload: any): string => {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part: any) => (typeof part === 'string' ? part : part?.text || ''))
      .join('');
  }
  return '';
};

const requestBody = (request: GeminiResultGenerateRequest): Record<string, unknown> => ({
  model: SEMANTIC_LLM_MODEL,
  messages: [
    ...(request.config?.systemInstruction
      ? [{ role: 'system', content: request.config.systemInstruction }]
      : []),
    { role: 'user', content: request.contents },
  ],
  ...(request.config?.temperature !== undefined ? { temperature: request.config.temperature } : {}),
  ...(request.config?.maxOutputTokens !== undefined ? { max_tokens: request.config.maxOutputTokens } : {}),
});

export const createBrowserOpenRouterSemanticClient = (apiKey: string): GeminiSemanticResultClient => ({
  models: {
    generateContent: async (request) => {
      traceConnection('before fetch');
      const response = await fetch(OPENROUTER_API_ROOT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody(request)),
        signal: request.config?.abortSignal,
      });
      // Consume the body exactly once so development tracing and parsing see
      // the same provider response without attempting to reuse a stream.
      const body = await response.text();
      let payload: any = {};
      let jsonParseSuccess = false;
      try {
        payload = body ? JSON.parse(body) : {};
        jsonParseSuccess = true;
      } catch {
        payload = {};
      }
      traceConnection('provider response', {
        status: response.status,
        ok: response.ok,
        contentType: response.headers.get('content-type'),
        bodyLength: body.length,
        preview: body.slice(0, 120).replace(/\s+/g, ' '),
        jsonParseSuccess,
      });
      if (!response.ok) {
        const message = typeof payload?.error?.message === 'string'
          ? payload.error.message
          : 'OpenRouter 请求失败';
        throw providerError(message, response.status);
      }
      const choice = payload?.choices?.[0];
      const text = responseText(payload).trim();
      const finishReason = choice?.finish_reason;
      const nativeFinishReason = choice?.native_finish_reason;
      if ((finishReason === 'length' || nativeFinishReason === 'length') && !text) {
        throw providerError(
          'OpenRouter semantic output was truncated before JSON content was generated',
          response.status,
          'output_truncated',
        );
      }
      return { text };
    },
  },
});

const classifyStatus = (
  status: number | undefined,
  message: string,
  name?: string,
): Exclude<OpenRouterConnectionStatus, 'unknown' | 'testing' | 'available'> => {
  const normalized = message.toLowerCase();
  if (name === 'AbortError'
    || status === 408
    || status === 504
    || normalized.includes('timeout')
    || normalized.includes('aborted')
    || normalized.includes('deadline')) return 'timeout';
  if (status === 401 || status === 403
    || normalized.includes('api key')
    || normalized.includes('authentication')
    || normalized.includes('permission')) return 'invalid_key';
  if (status === 404) return 'model_unavailable';
  if (status === 429 || normalized.includes('rate limit') || normalized.includes('quota')) return 'rate_limited';
  if (status !== undefined && status >= 500) return 'provider_unavailable';
  if (normalized.includes('network') || normalized.includes('fetch')) return 'network_error';
  return 'unknown_error';
};

export const testOpenRouterConnection = async (apiKeyOverride?: string): Promise<OpenRouterConnectionStatus> => {
  const runtimeSettings = readLlmRuntimeSettings();
  const apiKey = apiKeyOverride ?? runtimeSettings.apiKey ?? '';
  traceConnection('entered');
  traceConnection(`runtime enabled=${runtimeSettings.enabled}`);
  traceConnection(`apiKey present=${Boolean(apiKey.trim())}`);
  traceConnection(`apiKey prefix=${apiKey.trim().startsWith('sk-or-') ? 'sk-or-' : apiKey.trim() ? 'other' : 'none'}`);
  traceConnection(`provider=${SEMANTIC_LLM_PROVIDER}`);
  if (!apiKey.trim()) {
    traceConnection('early return', { errorCode: 'missing_api_key' satisfies ConnectionDiagnosticCode });
    return 'invalid_key';
  }
  if (SEMANTIC_LLM_PROVIDER !== 'openrouter') {
    traceConnection('provider mismatch', { errorCode: 'provider_not_configured' satisfies ConnectionDiagnosticCode });
    return 'unknown_error';
  }
  if (typeof fetch !== 'function' || typeof AbortController !== 'function') {
    traceConnection('runtime dependency unavailable', { errorCode: 'missing_runtime_dependency' satisfies ConnectionDiagnosticCode });
    return 'network_error';
  }

  let controller: AbortController;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let fetchStarted = false;
  try {
    controller = new AbortController();
    traceConnection('creating client');
    const client = createBrowserOpenRouterSemanticClient(apiKey.trim());
    traceConnection('client created');
    traceConnection('calling client.testConnection');
    fetchStarted = true;
    const request = client.models.generateContent({
      model: SEMANTIC_LLM_MODEL,
      contents: 'Return JSON only: {"ok":true}',
      config: {
        responseMimeType: 'application/json',
        temperature: 0,
        abortSignal: controller.signal,
        httpOptions: { timeout: CONNECTION_TIMEOUT_MS },
      },
    });
    const response = await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(Object.assign(new Error('OpenRouter connection timeout'), { name: 'AbortError' }));
        }, CONNECTION_TIMEOUT_MS);
      }),
    ]);
    return response.text ? 'available' : 'unknown_error';
  } catch (error) {
    const candidate = error as { status?: number; message?: string; name?: string; stack?: string };
    const status = classifyStatus(candidate.status, candidate.message || 'OpenRouter connection failed', candidate.name);
    traceConnection('request failed', {
      errorCode: fetchStarted ? status : 'client_not_initialized',
      status: candidate.status,
      name: candidate.name,
      message: candidate.message,
      stack: candidate.stack,
    });
    return status;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};
