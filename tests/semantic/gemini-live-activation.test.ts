import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SEMANTIC_LLM_MODEL, SEMANTIC_LLM_PROVIDER } from '../../src/services/semantic/SemanticPrompt';

describe('OpenRouter activation contract', () => {
  it('pins the official provider and free model without a model fallback', () => {
    expect(SEMANTIC_LLM_PROVIDER).toBe('openrouter');
    expect(SEMANTIC_LLM_MODEL).toBe('openrouter/free');
    const runtimeSource = readFileSync(resolve(process.cwd(), 'src/services/semantic/LlmRuntimeService.ts'), 'utf8');
    expect(runtimeSource).toContain('createBrowserOpenRouterSemanticClient');
    expect(runtimeSource).toContain('modelName: SEMANTIC_LLM_MODEL');
    expect(runtimeSource).not.toContain('createBrowserGeminiSemanticClient');
  });

  it('keeps the manual smoke path server-side and single-case', () => {
    const smokeSource = readFileSync(resolve(process.cwd(), 'scripts/semantic-smoke.ts'), 'utf8');
    expect(smokeSource).toContain("process.env.GEMINI_API_KEY");
    expect(smokeSource).toContain('new GeminiSemanticResultResolver');
    expect(smokeSource).toContain('auditSemanticResolutionResult');
    expect(smokeSource).toContain("caseId: 'real-（2020）粤1972民初14860号'");
    expect(smokeSource).not.toContain('VITE_GEMINI_API_KEY');
    expect(smokeSource).not.toContain('Promise.all');
  });
});
