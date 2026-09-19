import {
  SEMANTIC_RESOLUTION_RESULT_JSON_SCHEMA,
  parseSemanticResolutionResult,
} from './SemanticResultSchema';
import type {
  SemanticResolutionResult,
  UnresolvedSemanticTask,
} from './SemanticResult';
import { createTechnicalUnresolvedResult } from './SemanticResultFallback';
import type { SemanticResultResolver } from './SemanticResultResolver';
import type { SemanticResolverErrorCode } from './types';
import {
  DEFAULT_SEMANTIC_MODEL,
  buildSemanticResultPrompt,
  SEMANTIC_LLM_TIMEOUT_MS,
  SEMANTIC_MAX_OUTPUT_TOKENS,
  SEMANTIC_RESULT_SYSTEM_INSTRUCTION,
  SEMANTIC_TEMPERATURE,
} from './SemanticPrompt';
import { traceSemantic } from './SemanticTracing';

export interface GeminiResultGenerateRequest {
  model: string;
  contents: string;
  config?: {
    systemInstruction?: string;
    responseMimeType?: string;
    responseJsonSchema?: unknown;
    temperature?: number;
    maxOutputTokens?: number;
    abortSignal?: AbortSignal;
    httpOptions?: { timeout?: number };
  };
}

export interface GeminiSemanticResultClient {
  models: {
    generateContent(request: GeminiResultGenerateRequest): Promise<{ text?: string }>;
  };
}

export interface GeminiSemanticResultResolverOptions {
  apiKey: string;
  modelName?: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  client?: GeminiSemanticResultClient;
}

const classifyError = (error: unknown): SemanticResolverErrorCode => {
  const candidate = error as { name?: string; message?: string; status?: number; code?: string };
  if (candidate?.code === 'output_truncated') return 'output_truncated';
  const message = `${candidate?.name ?? ''} ${candidate?.message ?? ''}`.toLowerCase();
  if (candidate?.name === 'AbortError'
    || candidate?.status === 408
    || candidate?.status === 504
    || message.includes('timeout')
    || message.includes('aborted')
    || message.includes('deadline')) return 'timeout';
  if (candidate?.status === 429) return 'rate_limited';
  if (message.includes('network') || message.includes('fetch')) return 'network_error';
  return 'provider_error';
};

/** Gemini adapter for the formal SemanticResolutionResult contract. */
export class GeminiSemanticResultResolver implements SemanticResultResolver {
  private readonly client: GeminiSemanticResultClient;
  private readonly modelName: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;

  constructor(options: GeminiSemanticResultResolverOptions) {
    if (!options.apiKey && !options.client) {
      throw new Error('Gemini API credential is not configured');
    }
    if (!options.client) {
      throw new Error('Gemini semantic client is not configured');
    }
    this.client = options.client;
    this.modelName = options.modelName ?? DEFAULT_SEMANTIC_MODEL;
    this.timeoutMs = options.timeoutMs ?? SEMANTIC_LLM_TIMEOUT_MS;
    this.maxOutputTokens = options.maxOutputTokens ?? SEMANTIC_MAX_OUTPUT_TOKENS;
  }

  public async resolve(task: UnresolvedSemanticTask): Promise<SemanticResolutionResult> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const request = this.client.models.generateContent({
        model: this.modelName,
        contents: buildSemanticResultPrompt(task),
        config: {
          systemInstruction: SEMANTIC_RESULT_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseJsonSchema: SEMANTIC_RESOLUTION_RESULT_JSON_SCHEMA,
          temperature: SEMANTIC_TEMPERATURE,
          maxOutputTokens: this.maxOutputTokens,
          abortSignal: controller.signal,
          httpOptions: { timeout: this.timeoutMs },
        },
      });
      const response = await Promise.race([
        request,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(Object.assign(new Error('semantic resolver timeout'), { code: 'timeout' }));
          }, this.timeoutMs);
        }),
      ]);
      const text = response.text?.trim();
      if (!text) {
        traceSemantic('semanticJsonParse', {
          caseId: task.caseId,
          success: false,
          errorCode: 'empty_response',
          contentPresent: false,
          contentLength: 0,
        });
        return createTechnicalUnresolvedResult(task, 'empty_response');
      }

      let raw: unknown;
      try {
        raw = JSON.parse(text);
        traceSemantic('semanticJsonParse', {
          caseId: task.caseId,
          success: true,
          contentPresent: true,
          contentLength: text.length,
        });
      } catch {
        traceSemantic('semanticJsonParse', {
          caseId: task.caseId,
          success: false,
          errorCode: 'invalid_json',
          contentPresent: true,
          contentLength: text.length,
        });
        return createTechnicalUnresolvedResult(task, 'invalid_json');
      }

      try {
        const result = parseSemanticResolutionResult(raw);
        traceSemantic('schemaValidation', {
          caseId: task.caseId,
          passed: true,
          status: result.status,
        });
        return result;
      } catch {
        traceSemantic('schemaValidation', {
          caseId: task.caseId,
          passed: false,
          errorCode: 'schema_invalid',
        });
        return createTechnicalUnresolvedResult(task, 'schema_invalid');
      }
    } catch (error) {
      const errorCode = classifyError(error);
      traceSemantic('resolverError', {
        caseId: task.caseId,
        errorCode,
      });
      return createTechnicalUnresolvedResult(task, errorCode);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
