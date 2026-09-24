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
  knownJudgmentItems: [{ id: 'judgment-1', text: '判决支付工资。' }],
};

const validResponse = (overrides: Partial<SemanticResolutionResult> = {}): SemanticResolutionResult => ({
  status: 'resolved',
  resolver: 'llm',
  parties: [],
  claims: [],
  judgmentItems: [],
  claimResolutions: [{
    claimId: 'claim-1',
    judgmentItemIds: ['judgment-1'],
    outcome: 'supported',
    confidence: 0.95,
  }],
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
    expect(result.resolverErrorDetails).toMatchObject({
      failureStage: 'schema',
      schemaFailureOrigin: 'semantic_result_schema',
      validatorName: 'parseSemanticResolutionResult',
      validatorPassed: false,
      providerRawParsed: true,
      semanticSchemaPassed: false,
      contractPassed: false,
    });
  });

  it('rejects schema-valid target contract violations before audit', async () => {
    const resolver: SemanticResultResolver = {
      resolve: vi.fn().mockResolvedValue(validResponse({
        claimResolutions: [
          validResponse().claimResolutions[0],
          validResponse().claimResolutions[0],
        ],
      })),
    };
    const result = await resolveUnresolvedSemanticTask(task, resolver);
    expect(result).toMatchObject({
      status: 'unresolved',
      resolver: 'llm',
      resolverErrorCode: 'validation_rejected',
    });
    expect(result.resolverErrorDetails).toMatchObject({
      failureStage: 'contract',
      schemaFailureOrigin: 'contract_bridge',
      semanticSchemaPassed: true,
      normalizationPassed: true,
      contractPassed: false,
      contractReasonCodes: expect.arrayContaining(['target_resolution_duplicate']),
    });
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

  it('propagates target claim IDs into the target-scoped audit', async () => {
    const targetScopedTask: UnresolvedSemanticTask = {
      ...task,
      knownParties: [{
        id: 'employee-1', name: '张某', laborRole: 'employee', proceduralRoles: ['plaintiff'],
      }],
      knownClaims: [
        {
          ...task.knownClaims![0],
          claimantPartyIds: ['employee-1'],
          claimantRole: 'employee',
        },
        {
          ...task.knownClaims![0],
          id: 'claim-2',
          claimType: 'bonus',
          claimText: '请求支付奖金1000元',
          claimantPartyIds: ['employee-1'],
          claimantRole: 'employee',
        },
      ],
    };
    const result = validResponse({
      parties: targetScopedTask.knownParties,
      claims: targetScopedTask.knownClaims,
      judgmentItems: [{ id: 'judgment-1', text: '判决支付工资。' }],
      claimResolutions: [{
        claimId: 'claim-1', judgmentItemIds: ['judgment-1'], outcome: 'supported', confidence: 0.95,
      }],
      applicantRole: 'employee',
      applicantOutcome: 'supported',
      employeeOutcome: 'supported',
      employerOutcome: 'not_supported',
      confidence: 0.95,
    });
    const audited = await resolveUnresolvedSemanticTaskWithAudit(
      targetScopedTask,
      { resolve: vi.fn().mockResolvedValue(result) },
    );

    expect(audited.audit.reasonCodes).not.toContain('required_relationship_missing');
    expect(audited.audit.decision).toBe('pass');
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
    expect(prompt).toContain('Supplied target count: 1');
    expect(prompt).toContain('exactly one claimResolution');
    const request = client.models.generateContent.mock.calls[0][0];
    expect(request.config.systemInstruction).toBe(SEMANTIC_RESULT_SYSTEM_INSTRUCTION);
    expect(request.config.systemInstruction).toContain('"claimResolutions"');
    expect(request.config.systemInstruction).toContain('"sourceEvidence"');
    expect(request.config.systemInstruction).toContain('"resolver"');
    expect(request.config.systemInstruction).toContain('"llm"');
    expect(request.config.systemInstruction).toContain('Do not create extra claim resolutions');
    expect(request.config.systemInstruction).toContain('Return status "resolved" only when every supplied target has exactly one clear resolution');
  });

  it('includes calibrated target-scoped mapping policy without relaxing uncertainty boundaries', async () => {
    const client = jsonClient(validResponse());
    const resolver = new GeminiSemanticResultResolver({ apiKey: '', client });
    await resolver.resolve(task);
    const instruction = client.models.generateContent.mock.calls[0][0].config.systemInstruction as string;

    expect(instruction).toContain('When a supplied judgment item clearly addresses a supplied target claim');
    expect(instruction).toContain('Global wording is not ambiguity by itself');
    expect(instruction).toContain('all claims are dismissed');
    expect(instruction).toContain('other claims are dismissed');
    expect(instruction).toContain('One judgment item may resolve multiple supplied claim targets');
    expect(instruction).toContain('confirming that the claim amount and judgment amount refer to the same target matter');
    expect(instruction).toContain('Amount mismatch alone is not enough to establish the mapping');
    expect(instruction).toContain('Use unresolved only when scope is unclear');
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
