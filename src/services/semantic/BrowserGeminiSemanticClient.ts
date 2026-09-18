import type { GeminiResultGenerateRequest, GeminiSemanticResultClient } from './GeminiSemanticResultResolver';
import { DEFAULT_SEMANTIC_MODEL } from './SemanticPrompt';

export type LlmConnectionStatus =
  | 'unknown'
  | 'testing'
  | 'available'
  | 'invalid_key'
  | 'model_unavailable'
  | 'quota_error'
  | 'network_error'
  | 'timeout';

const GEMINI_API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';

const providerError = (message: string, status?: number): Error & { status?: number } => {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
};

const responseText = (payload: any): string => payload?.candidates
  ?.flatMap((candidate: any) => candidate?.content?.parts || [])
  ?.map((part: any) => part?.text || '')
  ?.join('') || '';

const requestBody = (request: GeminiResultGenerateRequest): Record<string, unknown> => ({
  contents: [{ role: 'user', parts: [{ text: request.contents }] }],
  ...(request.config?.systemInstruction
    ? { systemInstruction: { parts: [{ text: request.config.systemInstruction }] } }
    : {}),
  generationConfig: {
    responseMimeType: request.config?.responseMimeType,
    responseJsonSchema: request.config?.responseJsonSchema,
    temperature: request.config?.temperature,
    maxOutputTokens: request.config?.maxOutputTokens,
  },
});

export const createBrowserGeminiSemanticClient = (apiKey: string): GeminiSemanticResultClient => ({
  models: {
    generateContent: async (request) => {
      const url = `${GEMINI_API_ROOT}/${DEFAULT_SEMANTIC_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody(request)),
        signal: request.config?.abortSignal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = typeof payload?.error?.message === 'string' ? payload.error.message : 'Gemini 请求失败';
        throw providerError(message, response.status);
      }
      return { text: responseText(payload) };
    },
  },
});

const classifyStatus = (status: number | undefined, message: string): Exclude<LlmConnectionStatus, 'unknown' | 'testing' | 'available'> => {
  const normalized = message.toLowerCase();
  if (status === 401 || status === 403 || normalized.includes('api key') || normalized.includes('authentication') || normalized.includes('permission')) return 'invalid_key';
  if (status === 404 || normalized.includes('model') && normalized.includes('not')) return 'model_unavailable';
  if (status === 429 || normalized.includes('quota') || normalized.includes('rate limit')) return 'quota_error';
  if (normalized.includes('timeout') || normalized.includes('deadline')) return 'timeout';
  return 'network_error';
};

export const testGeminiConnection = async (apiKey: string): Promise<LlmConnectionStatus> => {
  if (!apiKey.trim()) return 'invalid_key';
  try {
    const client = createBrowserGeminiSemanticClient(apiKey.trim());
    const response = await client.models.generateContent({
      model: DEFAULT_SEMANTIC_MODEL,
      contents: 'Return JSON only: {"ok":true}',
      config: { responseMimeType: 'application/json', temperature: 0, httpOptions: { timeout: 10_000 } },
    });
    return response.text ? 'available' : 'network_error';
  } catch (error) {
    const candidate = error as { status?: number; message?: string };
    return classifyStatus(candidate.status, candidate.message || 'Gemini connection failed');
  }
};

