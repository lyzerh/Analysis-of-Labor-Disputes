import { SEMANTIC_LLM_MODEL, XAI_API_BASE_URL } from '../semantic/SemanticPrompt';
import { JUDGMENT_TRANSLATION_SYSTEM_PROMPT } from './JudgmentTranslationPrompt';

export const TRANSLATION_PROVIDER = 'xai' as const;
export const TRANSLATION_MODEL = SEMANTIC_LLM_MODEL;

export interface TranslationClient {
  translate(text: string, apiKey: string): Promise<string>;
}

export class TranslationRequestError extends Error {
  constructor(readonly code: 'http_401' | 'http_429' | 'provider_error' | 'invalid_response' | 'network_error' | 'timeout') {
    super(code);
  }
}

export const browserXaiTranslationClient: TranslationClient = {
  async translate(text, apiKey) {
    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      response = await fetch(`${XAI_API_BASE_URL}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
        body: JSON.stringify({
          model: TRANSLATION_MODEL,
          messages: [
            { role: 'system', content: JUDGMENT_TRANSLATION_SYSTEM_PROMPT },
            { role: 'user', content: text },
          ],
          // Per-chunk output budget; not a provider context-window limit.
          max_tokens: 8192,
        }),
      });
    } catch {
      throw new TranslationRequestError(controller.signal.aborted ? 'timeout' : 'network_error');
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      throw new TranslationRequestError(response.status === 401 ? 'http_401' : response.status === 429 ? 'http_429' : 'provider_error');
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new TranslationRequestError('invalid_response');
    }
    const choice = (payload as { choices?: { message?: { content?: unknown } }[] } | null)?.choices?.[0];
    const translated = choice?.message?.content;
    if (typeof translated !== 'string' || !translated.trim()) throw new TranslationRequestError('invalid_response');
    return translated;
  },
};
