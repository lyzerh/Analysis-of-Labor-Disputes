import { describe, expect, it } from 'vitest';
import {
  GeminiSemanticResolver,
  type GeminiGenerateClient,
} from '../../src/services/semantic/GeminiSemanticResolver';
import {
  MockSemanticResolver,
  SemanticResolverError,
  minimizeSemanticResolutionInput,
  parseSemanticResolutionResponse,
  resolveAndValidateSemanticReferences,
  type SemanticResolutionCandidate,
  type SemanticResolutionInput,
} from '../../src/services/semantic';
import { semanticInput } from './fixtures/semantic-resolution-fixtures';

const candidateFor = (
  input: SemanticResolutionInput,
  overrides: Partial<SemanticResolutionCandidate> = {},
): SemanticResolutionCandidate => {
  const sourceText = input.unresolvedFragments[0].sourceText;
  const confidence = overrides.confidence ?? 0.95;
  return {
    fragmentId: input.unresolvedFragments[0].id,
    referencedClaimIds: ['claim-1'],
    courtTreatment: 'rejected',
    confidence,
    sourceText,
    reasoningType: 'cross_sentence',
    resolutionMethod: 'llm',
    provenance: {
      provider: 'mock',
      modelName: 'mock-semantic-resolver',
      modelVersion: 'test-1',
      promptVersion: 'semantic-reference-v1',
      resolvedAt: '2026-09-09T00:00:00.000Z',
      confidence,
      sourceText,
    },
    ...overrides,
  };
};

const fakeClient = (text?: string, error?: unknown): GeminiGenerateClient => ({
  models: {
    generateContent: async () => {
      if (error) throw error;
      return { text };
    },
  },
});

const sequenceClient = (...steps: Array<{ text?: string; error?: unknown }>) => {
  let callCount = 0;
  const client: GeminiGenerateClient = {
    models: {
      generateContent: async () => {
        const step = steps[Math.min(callCount, steps.length - 1)];
        callCount += 1;
        if (step.error) throw step.error;
        return { text: step.text };
      },
    },
  };
  return { client, getCallCount: () => callCount };
};

describe('SemanticResolutionSchema', () => {
  it('accepts the strict relationship-only response', () => {
    const response = {
      candidates: [{
        fragmentId: 'fragment-1', referencedClaimIds: ['claim-1'],
        courtTreatment: 'rejected', confidence: 0.95,
        sourceText: '该项请求不予支持', reasoningType: 'anaphora', resolutionMethod: 'llm',
      }],
    };
    expect(parseSemanticResolutionResponse(response)).toEqual(response);
  });

  it.each(['employeeOutcome', 'employerOutcome', 'overallResult', 'claimOutcome', 'requestedAmount', 'awardedAmount'])(
    'rejects forbidden additional field %s',
    (field) => {
      expect(() => parseSemanticResolutionResponse({
        candidates: [{
          fragmentId: 'fragment-1', referencedClaimIds: ['claim-1'],
          courtTreatment: 'rejected', confidence: 0.95,
          sourceText: '该项请求不予支持', reasoningType: 'anaphora', resolutionMethod: 'llm',
          [field]: field.includes('Amount') ? 100 : 'supported',
        }],
      })).toThrow(/additional_properties/);
    },
  );

  it('rejects invalid enums and confidence', () => {
    expect(() => parseSemanticResolutionResponse({
      candidates: [{
        fragmentId: 'fragment-1', referencedClaimIds: [],
        courtTreatment: 'won', confidence: 2,
        sourceText: '', reasoningType: 'guess', resolutionMethod: 'rule',
      }],
    })).toThrow();
  });
});

describe('MockSemanticResolver orchestration', () => {
  const input = semanticInput('关于加班工资问题，劳动者未完成举证。故该项请求不予支持');

  it('auto-accepts a validated 0.95 candidate', async () => {
    const result = await resolveAndValidateSemanticReferences(
      new MockSemanticResolver({ candidates: [candidateFor(input)] }), input,
    );
    expect(result.accepted).toHaveLength(1);
    expect(result.unresolvedFragments).toHaveLength(0);
  });

  it('keeps a 0.80 candidate for human review and unresolved', async () => {
    const candidate = candidateFor(input, { confidence: 0.8 });
    candidate.provenance.confidence = 0.8;
    const result = await resolveAndValidateSemanticReferences(
      new MockSemanticResolver({ candidates: [candidate] }), input,
    );
    expect(result.humanReview).toHaveLength(1);
    expect(result.unresolvedFragments).toEqual(input.unresolvedFragments);
  });

  it('rejects a 0.50 candidate and keeps unresolved', async () => {
    const candidate = candidateFor(input, { confidence: 0.5 });
    candidate.provenance.confidence = 0.5;
    const result = await resolveAndValidateSemanticReferences(
      new MockSemanticResolver({ candidates: [candidate] }), input,
    );
    expect(result.rejected).toHaveLength(1);
    expect(result.unresolvedFragments).toEqual(input.unresolvedFragments);
  });

  it('rejects an invented claim id', async () => {
    const result = await resolveAndValidateSemanticReferences(
      new MockSemanticResolver({ candidates: [candidateFor(input, { referencedClaimIds: ['claim-999'] })] }), input,
    );
    expect(result.rejected[0].reasons).toContain('claim_id_not_found');
  });

  it('rejects conflicting treatment and keeps the fragment unresolved', async () => {
    const result = await resolveAndValidateSemanticReferences(new MockSemanticResolver({ candidates: [
      candidateFor(input, { courtTreatment: 'accepted' }),
      candidateFor(input, { courtTreatment: 'rejected' }),
    ] }), input);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected[0].reasons).toContain('conflicts_with_existing_candidate');
    expect(result.unresolvedFragments).toEqual(input.unresolvedFragments);
  });

  it.each(['timeout', 'provider_error', 'invalid_json', 'schema_invalid'] as const)(
    'fails safe on %s',
    async (errorCode) => {
      const result = await resolveAndValidateSemanticReferences(
        new MockSemanticResolver({ errorCode }), input,
      );
      expect(result.status).toBe('fallback_unresolved');
      expect(result.errorCode).toBe(errorCode);
      expect(result.unresolvedFragments).toEqual(input.unresolvedFragments);
    },
  );

  it('sends only bounded semantic context', () => {
    const minimized = minimizeSemanticResolutionInput({
      ...input,
      claims: input.claims.map((claim) => ({ ...claim, sourceText: '诉'.repeat(2_000), requestedAmount: 999 })),
      unresolvedFragments: input.unresolvedFragments.map((fragment) => ({
        ...fragment, sourceText: '片'.repeat(2_000), surroundingText: '文'.repeat(3_000),
      })),
    });
    expect(minimized.claims[0].sourceText).toHaveLength(400);
    expect(minimized.claims[0].requestedAmount).toBeUndefined();
    expect(minimized.unresolvedFragments[0].sourceText).toHaveLength(800);
    expect(minimized.unresolvedFragments[0].surroundingText).toHaveLength(1_200);
    expect(minimized).not.toHaveProperty('rawText');
  });
});

describe('GeminiSemanticResolver provider boundary without network', () => {
  const input = semanticInput('该项请求不予支持');
  const validWire = JSON.stringify({
    candidates: [{
      fragmentId: 'fragment-1', referencedClaimIds: ['claim-1'],
      courtTreatment: 'rejected', confidence: 0.95,
      sourceText: '该项请求不予支持', reasoningType: 'anaphora', resolutionMethod: 'llm',
    }],
  });

  it('adds server-controlled Gemini provenance to schema-valid JSON', async () => {
    const wire = {
      candidates: [{
        fragmentId: 'fragment-1', referencedClaimIds: ['claim-1'],
        courtTreatment: 'rejected', confidence: 0.95,
        sourceText: '该项请求不予支持', reasoningType: 'anaphora', resolutionMethod: 'llm',
      }],
    };
    const resolver = new GeminiSemanticResolver({
      apiKey: 'test-only', client: fakeClient(JSON.stringify(wire)), modelName: 'test-model',
      now: () => new Date('2026-09-09T00:00:00.000Z'),
    });
    const [candidate] = await resolver.resolve(input);
    expect(candidate.provenance).toMatchObject({ provider: 'gemini', modelName: 'test-model' });
  });

  it.each([
    ['invalid_json', '{not json'],
    ['schema_invalid', JSON.stringify({ candidates: [{ employeeOutcome: 'supported' }] })],
    ['empty_response', ''],
  ] as const)('classifies %s safely', async (code, text) => {
    const resolver = new GeminiSemanticResolver({ apiKey: 'test-only', client: fakeClient(text) });
    await expect(resolver.resolve(input)).rejects.toMatchObject({ code });
  });

  it('classifies a provider 429 without exposing its message', async () => {
    const resolver = new GeminiSemanticResolver({
      apiKey: 'test-only',
      client: fakeClient(undefined, { status: 429, message: 'secret upstream detail' }),
      maxAttempts: 1,
    });
    await expect(resolver.resolve(input)).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('classifies a provider deadline as timeout', async () => {
    const resolver = new GeminiSemanticResolver({
      apiKey: 'test-only',
      client: fakeClient(undefined, { status: 504, message: 'DEADLINE_EXCEEDED: deadline expired' }),
      maxAttempts: 1,
    });
    await expect(resolver.resolve(input)).rejects.toMatchObject({ code: 'timeout' });
  });

  it.each([
    ['503', { status: 503, message: 'temporarily unavailable' }],
    ['504', { status: 504, message: 'DEADLINE_EXCEEDED: deadline expired' }],
  ])('retries a transient %s once and then succeeds', async (_label, transientError) => {
    const sequence = sequenceClient({ error: transientError }, { text: validWire });
    const delays: number[] = [];
    const resolver = new GeminiSemanticResolver({
      apiKey: 'test-only',
      client: sequence.client,
      sleep: async (delayMs) => { delays.push(delayMs); },
    });

    await expect(resolver.resolve(input)).resolves.toHaveLength(1);
    expect(sequence.getCallCount()).toBe(2);
    expect(resolver.getAttemptCount()).toBe(2);
    expect(delays).toEqual([500]);
  });

  it('stops after three repeated 503 responses and falls back unresolved', async () => {
    const sequence = sequenceClient({ error: { status: 503, message: 'temporarily unavailable' } });
    const delays: number[] = [];
    const resolver = new GeminiSemanticResolver({
      apiKey: 'test-only',
      client: sequence.client,
      sleep: async (delayMs) => { delays.push(delayMs); },
    });

    const result = await resolveAndValidateSemanticReferences(resolver, input);
    expect(result).toMatchObject({
      status: 'fallback_unresolved',
      errorCode: 'provider_error',
      attemptCount: 3,
      unresolvedFragments: input.unresolvedFragments,
    });
    expect(sequence.getCallCount()).toBe(3);
    expect(delays).toEqual([500, 1_000]);
  });

  it('does not retry a 404 model-unavailable response', async () => {
    const sequence = sequenceClient({ error: { status: 404, message: 'model unavailable' } });
    const resolver = new GeminiSemanticResolver({
      apiKey: 'test-only', client: sequence.client, sleep: async () => undefined,
    });

    const result = await resolveAndValidateSemanticReferences(resolver, input);
    expect(result).toMatchObject({
      status: 'fallback_unresolved', errorCode: 'provider_error', attemptCount: 1,
    });
    expect(sequence.getCallCount()).toBe(1);
  });

  it('does not retry a schema-invalid provider response', async () => {
    const sequence = sequenceClient({ text: JSON.stringify({ candidates: [{ outcome: 'rejected' }] }) });
    const resolver = new GeminiSemanticResolver({
      apiKey: 'test-only', client: sequence.client, sleep: async () => undefined,
    });

    await expect(resolver.resolve(input)).rejects.toMatchObject({ code: 'schema_invalid', attemptCount: 1 });
    expect(sequence.getCallCount()).toBe(1);
  });

  it('does not retry a validator-rejected semantic candidate', async () => {
    const lowConfidenceWire = JSON.stringify({
      candidates: [{
        fragmentId: 'fragment-1', referencedClaimIds: ['claim-1'],
        courtTreatment: 'rejected', confidence: 0.5,
        sourceText: '该项请求不予支持', reasoningType: 'anaphora', resolutionMethod: 'llm',
      }],
    });
    const sequence = sequenceClient({ text: lowConfidenceWire });
    const resolver = new GeminiSemanticResolver({
      apiKey: 'test-only', client: sequence.client, sleep: async () => undefined,
    });

    const result = await resolveAndValidateSemanticReferences(resolver, input);
    expect(result.rejected[0].reasons).toContain('confidence_below_rejection_threshold');
    expect(sequence.getCallCount()).toBe(1);
    expect(result.attemptCount).toBe(1);
  });

  it('enforces timeout even if a provider promise never settles', async () => {
    const client: GeminiGenerateClient = { models: { generateContent: () => new Promise(() => undefined) } };
    const resolver = new GeminiSemanticResolver({
      apiKey: 'test-only', client, timeoutMs: 5, attemptTimeoutMs: 5, maxAttempts: 1,
    });
    await expect(resolver.resolve(input)).rejects.toMatchObject({ code: 'timeout' });
  });

  it('uses a provider-neutral error type', () => {
    expect(new SemanticResolverError('network_error', 'safe')).toMatchObject({ code: 'network_error' });
  });
});
