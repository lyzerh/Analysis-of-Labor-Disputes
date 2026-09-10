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
  SEMANTIC_LLM_ATTEMPT_TIMEOUT_MS,
  SEMANTIC_LLM_MAX_ATTEMPTS,
  SEMANTIC_LLM_TIMEOUT_MS,
  SEMANTIC_MAX_OUTPUT_TOKENS,
  SEMANTIC_PROMPT_VERSION,
  SEMANTIC_SYSTEM_INSTRUCTION,
  SEMANTIC_TEMPERATURE,
  SEMANTIC_RETRY_BASE_DELAY_MS,
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
  attemptTimeoutMs?: number;
  maxAttempts?: number;
  retryBaseDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
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
  if (message.includes('timeout')
    || message.includes('aborted')
    || message.includes('deadline exceeded')
    || message.includes('deadline_expired')
    || message.includes('deadline expired')
    || candidate?.name === 'AbortError') {
    return new SemanticResolverError('timeout', 'Gemini semantic resolution timed out', status);
  }
  if (status && status >= 500) return new SemanticResolverError('provider_error', 'Gemini service failed', status);
  if (candidate instanceof TypeError || message.includes('network') || message.includes('fetch')) {
    return new SemanticResolverError('network_error', 'Gemini network request failed', status);
  }
  return new SemanticResolverError('provider_error', 'Gemini semantic resolution failed', status);
};

const isRetryableProviderError = (error: SemanticResolverError): boolean =>
  error.code === 'rate_limited'
  || error.code === 'timeout'
  || error.code === 'network_error'
  || error.status === 503
  || error.status === 504;

const wait = (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

export class GeminiSemanticResolver implements SemanticResolver {
  private readonly client: GeminiGenerateClient;
  private readonly modelName: string;
  private readonly timeoutMs: number;
  private readonly attemptTimeoutMs: number;
  private readonly maxAttempts: number;
  private readonly retryBaseDelayMs: number;
  private readonly sleep: (delayMs: number) => Promise<void>;
  private readonly now: () => Date;
  private lastAttemptCount = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(options: GeminiSemanticResolverOptions) {
    if (!options.apiKey && !options.client) {
      throw new SemanticResolverError('provider_error', 'Gemini API credential is not configured');
    }
    this.client = options.client ?? new GoogleGenAI({ apiKey: options.apiKey });
    this.modelName = options.modelName ?? DEFAULT_SEMANTIC_MODEL;
    this.timeoutMs = options.timeoutMs ?? SEMANTIC_LLM_TIMEOUT_MS;
    this.attemptTimeoutMs = options.attemptTimeoutMs ?? SEMANTIC_LLM_ATTEMPT_TIMEOUT_MS;
    this.maxAttempts = options.maxAttempts ?? SEMANTIC_LLM_MAX_ATTEMPTS;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? SEMANTIC_RETRY_BASE_DELAY_MS;
    this.sleep = options.sleep ?? wait;
    this.now = options.now ?? (() => new Date());
  }

  public getAttemptCount(): number {
    return this.lastAttemptCount;
  }

  public resolve(input: SemanticResolutionInput): Promise<SemanticResolutionCandidate[]> {
    const pending = this.queue.then(() => this.resolveOnce(input));
    this.queue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  private async resolveOnce(input: SemanticResolutionInput): Promise<SemanticResolutionCandidate[]> {
    const operationStartedAt = Date.now();
    this.lastAttemptCount = 0;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      this.lastAttemptCount = attempt;
      const remainingMs = this.timeoutMs - (Date.now() - operationStartedAt);
      if (remainingMs <= 0) {
        throw new SemanticResolverError(
          'timeout', 'Gemini semantic resolution exhausted its overall timeout', undefined, attempt - 1,
        );
      }

      try {
        return await this.generateOnce(input, Math.min(this.attemptTimeoutMs, remainingMs), attempt);
      } catch (error) {
        const classified = classifyProviderError(error);
        const finalError = new SemanticResolverError(
          classified.code, classified.message, classified.status, attempt,
        );
        if (!isRetryableProviderError(classified) || attempt === this.maxAttempts) throw finalError;

        const backoffMs = this.retryBaseDelayMs * (2 ** (attempt - 1));
        const afterAttemptRemainingMs = this.timeoutMs - (Date.now() - operationStartedAt);
        if (afterAttemptRemainingMs <= backoffMs) {
          throw new SemanticResolverError(
            'timeout', 'Gemini semantic resolution exhausted its overall timeout', classified.status, attempt,
          );
        }
        await this.sleep(backoffMs);
      }
    }

    throw new SemanticResolverError(
      'provider_error', 'Gemini semantic resolution failed', undefined, this.lastAttemptCount,
    );
  }

  private async generateOnce(
    input: SemanticResolutionInput,
    attemptTimeoutMs: number,
    attempt: number,
  ): Promise<SemanticResolutionCandidate[]> {
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
          // Gemini rejects manually configured deadlines below 10 seconds.
          // Promise.race and abortSignal still enforce a shorter remaining overall budget locally.
          httpOptions: { timeout: Math.max(SEMANTIC_LLM_ATTEMPT_TIMEOUT_MS, attemptTimeoutMs) },
        },
      });
      const response = await Promise.race([
        request,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new SemanticResolverError(
              'timeout', 'Gemini semantic resolution timed out', undefined, attempt,
            ));
          }, attemptTimeoutMs);
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
