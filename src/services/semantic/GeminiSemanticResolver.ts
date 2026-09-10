import { GoogleGenAI } from '@google/genai';
import type { SemanticResolver } from './SemanticResolver';
import {
  SemanticSchemaError,
  parseSemanticResolutionResponse,
  SEMANTIC_RESPONSE_JSON_SCHEMA,
} from './SemanticResolutionSchema';
import {
  buildSemanticPrompt,
  DEFAULT_SEMANTIC_MODEL,
  SEMANTIC_LLM_TIMEOUT_MS,
  SEMANTIC_MAX_OUTPUT_TOKENS,
  SEMANTIC_PROMPT_VERSION,
  SEMANTIC_SYSTEM_INSTRUCTION,
  SEMANTIC_TEMPERATURE,
} from './SemanticPrompt';
import type {
  SemanticResolutionCandidate,
  SemanticResolutionInput,
} from './types';
import { SemanticResolverError } from './SemanticResolverError';

export interface GeminiSemanticResolverOptions {
  apiKey: string;
  modelName?: string;
  timeoutMs?: number;
  client?: GeminiGenerateClient;
  now?: () => Date;
}

type GeminiGenerateRequest = Parameters<GoogleGenAI['models']['generateContent']>[0];
export interface GeminiGenerateClient {
  models: {
    generateContent(request: GeminiGenerateRequest): Promise<{ text?: string }>;
  };
}

const classifyProviderError = (error: unknown): SemanticResolverError => {
  if (error instanceof SemanticResolverError) return error;
  if (error instanceof SemanticSchemaError) {
    return new SemanticResolverError('schema_invalid', 'Gemini response failed runtime schema validation');
  }
  const candidate = error as { name?: string; message?: string; status?: number; code?: number | string };
  const status = Number(candidate?.status || candidate?.code) || undefined;
  const message = `${candidate?.name || ''} ${candidate?.message || ''}`.toLowerCase();
  if (status === 429) return new SemanticResolverError('rate_limited', 'Gemini rate limit reached', status);
  if (message.includes('timeout') || message.includes('aborted') || candidate?.name === 'AbortError') {
    return new SemanticResolverError('timeout', 'Gemini semantic resolution timed out', status);
  }
  if (status && status >= 500) return new SemanticResolverError('provider_error', 'Gemini service failed', status);
  if (candidate instanceof TypeError || message.includes('network') || message.includes('fetch')) {
    return new SemanticResolverError('network_error', 'Gemini network request failed', status);
  }
  return new SemanticResolverError('provider_error', 'Gemini semantic resolution failed', status);
};

export class GeminiSemanticResolver implements SemanticResolver {
  private readonly client: GeminiGenerateClient;
  private readonly modelName: string;
  private readonly timeoutMs: number;
  private readonly now: () => Date;
  private queue: Promise<void> = Promise.resolve();

  constructor(options: GeminiSemanticResolverOptions) {
    if (!options.apiKey && !options.client) {
      throw new SemanticResolverError('provider_error', 'Gemini API credential is not configured');
    }
    this.client = options.client ?? new GoogleGenAI({ apiKey: options.apiKey });
    this.modelName = options.modelName ?? DEFAULT_SEMANTIC_MODEL;
    this.timeoutMs = options.timeoutMs ?? SEMANTIC_LLM_TIMEOUT_MS;
    this.now = options.now ?? (() => new Date());
  }

  public resolve(input: SemanticResolutionInput): Promise<SemanticResolutionCandidate[]> {
    const pending = this.queue.then(() => this.resolveOnce(input));
    this.queue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  private async resolveOnce(input: SemanticResolutionInput): Promise<SemanticResolutionCandidate[]> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const request = this.client.models.generateContent({
        model: this.modelName,
        contents: buildSemanticPrompt(input),
        config: {
          systemInstruction: SEMANTIC_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseJsonSchema: SEMANTIC_RESPONSE_JSON_SCHEMA,
          temperature: SEMANTIC_TEMPERATURE,
          maxOutputTokens: SEMANTIC_MAX_OUTPUT_TOKENS,
          abortSignal: controller.signal,
          httpOptions: { timeout: this.timeoutMs },
        },
      });
      const response = await Promise.race([
        request,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new SemanticResolverError('timeout', 'Gemini semantic resolution timed out'));
          }, this.timeoutMs);
        }),
      ]);
      const text = response.text?.trim();
      if (!text) throw new SemanticResolverError('empty_response', 'Gemini returned an empty response');

      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        throw new SemanticResolverError('invalid_json', 'Gemini returned invalid JSON');
      }
      const parsed = parseSemanticResolutionResponse(raw);
      const resolvedAt = this.now().toISOString();
      return parsed.candidates.map((candidate) => ({
        ...candidate,
        provenance: {
          provider: 'gemini',
          modelName: this.modelName,
          modelVersion: this.modelName,
          promptVersion: SEMANTIC_PROMPT_VERSION,
          resolvedAt,
          confidence: candidate.confidence,
          sourceText: candidate.sourceText,
        },
      }));
    } catch (error) {
      throw classifyProviderError(error);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
