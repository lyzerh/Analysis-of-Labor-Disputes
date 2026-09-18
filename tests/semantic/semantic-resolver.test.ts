import { describe, expect, it, vi } from 'vitest';
import {
  GeminiSemanticResultResolver,
  resolveSemanticRuleResult,
  resolveUnresolvedSemanticTask,
  resolveUnresolvedSemanticTaskWithAudit,
  SEMANTIC_RESULT_SYSTEM_INSTRUCTION,
  type SemanticResolutionResult,
  type SemanticResultResolver,
  type SemanticRuleResult,
  type UnresolvedSemanticTask,
} from '../../src/services/semantic';

const task: UnresolvedSemanticTask = {
  status: 'unresolved',
  caseId: 'case-1',
  reasonCodes: ['claim_judgment_match_unclear'],
  rawText: '原告请求支付工资，判决主文未明确对应关系。',
  unresolvedTargets: [{ type: 'claim_resolution', id: 'claim-1', reasonCode: 'claim_judgment_match_unclear' }],
  knownClaims: [{
    id: 'claim-1', claimantPartyIds: [], claimantRole: 'unknown', claimType: 'wage', claimText: '请求支付工资',
  }],
};

const validResponse = (overrides: Partial<SemanticResolutionResult> = {}): SemanticResolutionResult => ({
  status: 'resolved',
  resolver: 'llm',
  parties: [],
  claims: [],
  judgmentItems: [],
  claimResolutions: [],
  applicantRole: 'unknown',
  applicantOutcome: 'unclear',
  employeeOutcome: 'unclear',
  employerOutcome: 'unclear',
  confidence: 0.8,
  ...overrides,
});

const jsonClient = (value: unknown) => ({
  models: {
    generateContent: vi.fn().mockResolvedValue({ text: JSON.stringify(value) }),
  },
});

describe('Semantic Result resolver routing', () => {
  it('returns a resolved Rule result without invoking the LLM', async () => {
    const resolver: SemanticResultResolver = { resolve: vi.fn() };
    const resolved: SemanticRuleResult = {
      status: 'resolved', parties: [], claims: [], judgmentItems: [], claimResolutions: [],
      applicantRole: 'unknown', applicantOutcome: 'unclear', employeeOutcome: 'unclear',
      employerOutcome: 'unclear', confidence: 0.9,
    };

    await expect(resolveSemanticRuleResult(resolved, resolver)).resolves.toBe(resolved);
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it('automatically sends an unresolved task to the resolver once', async () => {
    const resolver: SemanticResultResolver = { resolve: vi.fn().mockResolvedValue(validResponse()) };
    const result = await resolveSemanticRuleResult(task, resolver);

    expect(resolver.resolve).toHaveBeenCalledTimes(1);
    expect(resolver.resolve).toHaveBeenCalledWith(task);
    expect(result.status).toBe('resolved');
  });

  it('preserves a valid semantic unresolved response', async () => {
    const resolver: SemanticResultResolver = {
      resolve: vi.fn().mockResolvedValue(validResponse({
        status: 'unresolved',
        unresolvedReasonCodes: ['outcome_unclear'],
      })),
    };
    const result = await resolveUnresolvedSemanticTask(task, resolver);
    expect(result.status).toBe('unresolved');
    expect(result.applicantOutcome).toBe('unclear');
    expect(result.unresolvedReasonCodes).toEqual(['outcome_unclear']);
  });

  it('schema-validates results returned by an injected resolver at the orchestration boundary', async () => {
    const resolver: SemanticResultResolver = {
      resolve: vi.fn().mockResolvedValue({ ...validResponse(), applicantOutcome: 'mostly_supported' }),
    };
    const result = await resolveUnresolvedSemanticTask(task, resolver);
    expect(result).toMatchObject({ status: 'unresolved', resolverErrorCode: 'schema_invalid' });
    expect(result.employeeOutcome).toBe('unclear');
  });

  it('converts provider throws to safe unresolved without default outcomes', async () => {
    const resolver: SemanticResultResolver = { resolve: vi.fn().mockRejectedValue(new Error('provider down')) };
    const result = await resolveUnresolvedSemanticTask(task, resolver);
    expect(result).toMatchObject({
      status: 'unresolved', resolver: 'llm', resolverErrorCode: 'provider_error',
      applicantOutcome: 'unclear', employeeOutcome: 'unclear', employerOutcome: 'unclear',
    });
  });

  it('preserves a typed timeout error in the safe unresolved result', async () => {
    const resolver: SemanticResultResolver = {
      resolve: vi.fn().mockRejectedValue(Object.assign(new Error('timeout'), { code: 'timeout' })),
    };
    const result = await resolveUnresolvedSemanticTask(task, resolver);
    expect(result.resolverErrorCode).toBe('timeout');
    expect(result.employeeOutcome).toBe('unclear');
  });

  it('runs the local audit after schema validation without changing the result contract', async () => {
    const resolver: SemanticResultResolver = {
      resolve: vi.fn().mockResolvedValue(validResponse({
        status: 'unresolved',
        applicantRole: 'unknown',
        applicantOutcome: 'unclear',
        employeeOutcome: 'unclear',
        employerOutcome: 'unclear',
        confidence: 0,
      })),
    };
    const audited = await resolveUnresolvedSemanticTaskWithAudit(task, resolver);
    expect(audited.result.status).toBe('unresolved');
    expect(audited.audit.decision).toBe('fail');
    expect(audited.audit.reasonCodes).toContain('unresolved_result');
  });
});

describe('Gemini Semantic Result adapter', () => {
  it('uses the UnresolvedSemanticTask and accepts a schema-valid resolved response', async () => {
    const client = jsonClient(validResponse());
    const resolver = new GeminiSemanticResultResolver({ apiKey: '', client });
    const result = await resolver.resolve(task);
    expect(result.status).toBe('resolved');
    expect(client.models.generateContent).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({
        responseMimeType: 'application/json',
        responseJsonSchema: expect.objectContaining({ additionalProperties: false }),
      }),
    }));
    const prompt = client.models.generateContent.mock.calls[0][0].contents as string;
    expect(prompt).toContain(task.caseId);
    expect(prompt).toContain(task.rawText);
    expect(prompt).toContain('claim_judgment_match_unclear');
    const request = client.models.generateContent.mock.calls[0][0];
    expect(request.config.systemInstruction).toBe(SEMANTIC_RESULT_SYSTEM_INSTRUCTION);
    expect(request.config.systemInstruction).toContain('"claimResolutions"');
    expect(request.config.systemInstruction).toContain('"sourceEvidence"');
    expect(request.config.systemInstruction).toContain('"resolver"');
    expect(request.config.systemInstruction).toContain('"llm"');
  });

  it('rejects an ad-hoc provider object instead of adapting it into the formal result contract', async () => {
    const client = jsonClient({
      caseId: task.caseId,
      status: 'unresolved',
      reasonCodes: ['claim_judgment_match_unclear'],
      target: 'claim-1',
      resolution: 'unclear',
      sourceEvidence: '判决主文未明确对应关系。',
    });
    const result = await new GeminiSemanticResultResolver({ apiKey: '', client }).resolve(task);
    expect(result).toMatchObject({ status: 'unresolved', resolver: 'llm', resolverErrorCode: 'schema_invalid' });
    expect(result.claimResolutions).toEqual([]);

    const audited = await resolveUnresolvedSemanticTaskWithAudit(
      task,
      new GeminiSemanticResultResolver({ apiKey: '', client: jsonClient({
        caseId: task.caseId,
        status: 'unresolved',
        reasonCodes: ['claim_judgment_match_unclear'],
        target: 'claim-1',
        resolution: 'unclear',
        sourceEvidence: '判决主文未明确对应关系。',
      }) }),
    );
    expect(audited.audit.decision).toBe('fail');
    expect(audited.audit.reasonCodes).toContain('technical_resolution_failure');
  });

  it('preserves a provider-returned unresolved response', async () => {
    const client = jsonClient(validResponse({ status: 'unresolved', unresolvedReasonCodes: ['insufficient_context'] }));
    const result = await new GeminiSemanticResultResolver({ apiKey: '', client }).resolve(task);
    expect(result.status).toBe('unresolved');
    expect(result.resolverErrorCode).toBeUndefined();
  });

  it.each([
    ['invalid enum', JSON.stringify({ ...validResponse(), applicantOutcome: 'mostly_supported' })],
    ['invalid JSON', '{not-json'],
    ['missing required field', JSON.stringify({ ...validResponse(), claims: undefined })],
  ])('safely rejects %s', async (_label, text) => {
    const client = { models: { generateContent: vi.fn().mockResolvedValue({ text }) } };
    const result = await new GeminiSemanticResultResolver({ apiKey: '', client }).resolve(task);
    expect(result.status).toBe('unresolved');
    expect(result.applicantOutcome).toBe('unclear');
    expect(result.employeeOutcome).toBe('unclear');
    expect(result.employerOutcome).toBe('unclear');
    expect(result.resolverErrorCode).toBe(_label === 'invalid JSON' ? 'invalid_json' : _label === 'invalid enum' ? 'schema_invalid' : 'schema_invalid');
  });

  it('returns safe unresolved on provider error', async () => {
    const client = { models: { generateContent: vi.fn().mockRejectedValue(new Error('network failure')) } };
    const result = await new GeminiSemanticResultResolver({ apiKey: '', client }).resolve(task);
    expect(result).toMatchObject({ status: 'unresolved', resolverErrorCode: 'network_error' });
  });

  it('returns safe unresolved on timeout', async () => {
    const client = { models: { generateContent: vi.fn().mockImplementation(() => new Promise(() => undefined)) } };
    const result = await new GeminiSemanticResultResolver({ apiKey: '', client, timeoutMs: 5 }).resolve(task);
    expect(result).toMatchObject({ status: 'unresolved', resolverErrorCode: 'timeout' });
  });
});
