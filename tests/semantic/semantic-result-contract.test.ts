import { describe, expect, it } from 'vitest';
import {
  SEMANTIC_RESOLUTION_RESULT_JSON_SCHEMA,
  SemanticSchemaError,
  parseSemanticResolutionResult,
  type SemanticResolutionResult,
} from '../../src/services/semantic';
import {
  isResolvedSemanticResult,
  isUnresolvedSemanticTask,
  auditSemanticResolutionResult,
  validateSemanticTaskContract,
  type SemanticRuleResult,
} from '../../src/services/semantic';

const evidence = { text: '判决如下：被告支付原告工资1000元。', start: 0, end: 22 };

const validResult = (overrides: Partial<SemanticResolutionResult> = {}): SemanticResolutionResult => ({
  status: 'resolved',
  resolver: 'llm',
  parties: [{
    id: 'employee-1',
    name: '张某',
    laborRole: 'employee',
    proceduralRoles: ['plaintiff'],
    sourceEvidence: { text: '原告：张某。' },
  }],
  claims: [{
    id: 'claim-1',
    claimantPartyIds: ['employee-1'],
    claimantRole: 'employee',
    claimType: 'wage',
    claimText: '请求支付工资1000元',
    requestedAmount: 1000,
    currency: 'CNY',
    sourceEvidence: { text: '原告请求支付工资1000元。' },
  }],
  judgmentItems: [{
    id: 'judgment-1',
    text: '被告支付原告工资1000元。',
    awardedAmount: 1000,
    currency: 'CNY',
    sourceEvidence: evidence,
  }],
  claimResolutions: [{
    claimId: 'claim-1',
    judgmentItemIds: ['judgment-1'],
    outcome: 'supported',
    awardedAmount: 1000,
    confidence: 0.98,
    sourceEvidence: evidence,
  }],
  applicantRole: 'employee',
  applicantOutcome: 'supported',
  employeeOutcome: 'supported',
  employerOutcome: 'not_supported',
  confidence: 0.98,
  ...overrides,
});

const expectSchemaError = (value: unknown): void => {
  expect(() => parseSemanticResolutionResult(value)).toThrow(SemanticSchemaError);
};

describe('Semantic Result strict contract', () => {
  it('accepts a complete resolved LLM result with source evidence', () => {
    const parsed = parseSemanticResolutionResult(validResult());
    expect(parsed.status).toBe('resolved');
    expect(parsed.claimResolutions[0].sourceEvidence?.text).toContain('支付');
  });

  it('accepts an empty claimText as unavailable request provenance', () => {
    const parsed = parseSemanticResolutionResult(validResult({
      claims: [{ ...validResult().claims[0], claimText: '' }],
    }));
    expect(parsed.claims[0].claimText).toBe('');
  });

  it('keeps missing, null, and non-string claimText invalid', () => {
    const missing = { ...validResult(), claims: [{ ...validResult().claims[0] }] } as Record<string, unknown>;
    delete (missing.claims as Array<Record<string, unknown>>)[0].claimText;
    expectSchemaError(missing);
    expectSchemaError({ ...validResult(), claims: [{ ...validResult().claims[0], claimText: null }] });
    expectSchemaError({ ...validResult(), claims: [{ ...validResult().claims[0], claimText: 123 }] });
    expectSchemaError({ ...validResult(), claims: [{ ...validResult().claims[0], claimText: {} }] });
    expectSchemaError({ ...validResult(), claims: [{ ...validResult().claims[0], claimText: [] }] });
  });

  it('does not relax other claim predicates when claimText is empty', () => {
    const claim = { ...validResult().claims[0], claimText: '' };
    expectSchemaError({ ...validResult(), claims: [{ ...claim, sourceEvidence: { text: '' } }] });
    expectSchemaError({ ...validResult(), claims: [{ ...claim, claimantRole: 'invalid' as never }] });
    expectSchemaError({ ...validResult(), claims: [{ ...claim, extra: true } as never] });
  });

  it('allows a missing-provenance benchmark candidate to continue through contract and audit layers', () => {
    const parsed = parseSemanticResolutionResult(validResult({
      claims: [{ ...validResult().claims[0], claimText: '' }],
    }));
    const task = {
      status: 'unresolved' as const,
      caseId: 'henan-chengxin-li-jianfa',
      reasonCodes: ['claim_judgment_match_unclear' as const],
      rawText: [
        ...parsed.parties.map((item) => item.sourceEvidence?.text || ''),
        ...parsed.claims.map((item) => item.sourceEvidence?.text || ''),
        ...parsed.judgmentItems.map((item) => item.sourceEvidence?.text || ''),
      ].join(''),
      knownParties: parsed.parties,
      knownClaims: parsed.claims,
      knownJudgmentItems: parsed.judgmentItems,
      unresolvedTargets: [{ type: 'claim_resolution' as const, id: 'claim-1', reasonCode: 'claim_judgment_match_unclear' as const }],
    };
    expect(validateSemanticTaskContract(task, parsed).valid).toBe(true);
    expect(auditSemanticResolutionResult(parsed, {
      rawText: task.rawText,
      knownParties: task.knownParties,
      knownClaims: task.knownClaims,
      knownJudgmentItems: task.knownJudgmentItems,
      requiredClaimResolutionIds: ['claim-1'],
    }).decision).toBe('pass');
    expect((parsed as unknown as Record<string, unknown>).accepted).toBeUndefined();
  });

  it('rejects unsupported outcome and role enum values', () => {
    expectSchemaError(validResult({ applicantOutcome: 'mostly_supported' as SemanticResolutionResult['applicantOutcome'] }));
    expectSchemaError(validResult({ employeeOutcome: 'employee_won' as SemanticResolutionResult['employeeOutcome'] }));
    expectSchemaError(validResult({ parties: [{ ...validResult().parties[0], laborRole: 'company' as never }] }));
  });

  it.each([-0.1, 1.2, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid top-level confidence %s',
    (confidence) => expectSchemaError(validResult({ confidence })),
  );

  it('rejects missing required semantic arrays and confidence', () => {
    const invalid = validResult() as unknown as Record<string, unknown>;
    delete invalid.claims;
    delete invalid.claimResolutions;
    delete invalid.confidence;
    expectSchemaError(invalid);
  });

  it('rejects non-array claim resolutions and additional properties', () => {
    expectSchemaError({ ...validResult(), claimResolutions: {} });
    expectSchemaError({ ...validResult(), unexpected: true });
  });

  it('accepts an unresolved result while keeping outcomes unclear', () => {
    const parsed = parseSemanticResolutionResult(validResult({
      status: 'unresolved',
      applicantRole: 'unknown',
      applicantOutcome: 'unclear',
      employeeOutcome: 'unclear',
      employerOutcome: 'unclear',
      unresolvedReasonCodes: ['claim_judgment_match_unclear'],
    }));
    expect(parsed.status).toBe('unresolved');
    expect(parsed.unresolvedReasonCodes).toEqual(['claim_judgment_match_unclear']);
  });

  it('rejects invalid resolver and reason codes', () => {
    expectSchemaError(validResult({ resolver: 'gemini' as 'llm' }));
    expectSchemaError(validResult({ unresolvedReasonCodes: ['not_a_reason'] as never }));
  });

  it('exposes a strict JSON schema with required fields and closed enums', () => {
    expect(SEMANTIC_RESOLUTION_RESULT_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(SEMANTIC_RESOLUTION_RESULT_JSON_SCHEMA.required).toContain('claimResolutions');
    expect(SEMANTIC_RESOLUTION_RESULT_JSON_SCHEMA.properties.resolver).toEqual({ type: 'string', enum: ['llm'] });
    expect(SEMANTIC_RESOLUTION_RESULT_JSON_SCHEMA.properties.confidence).toMatchObject({ minimum: 0, maximum: 1 });
  });
});

describe('Rule resolved/unresolved routing contract', () => {
  it('distinguishes resolved and unresolved results through one union', () => {
    const resolved: SemanticRuleResult = {
      status: 'resolved',
      parties: [], claims: [], judgmentItems: [], claimResolutions: [],
      applicantRole: 'unknown', applicantOutcome: 'unclear',
      employeeOutcome: 'unclear', employerOutcome: 'unclear', confidence: 0.9,
    };
    const unresolved: SemanticRuleResult = {
      status: 'unresolved',
      caseId: 'case-1',
      reasonCodes: ['outcome_unclear'],
      rawText: '原文',
      unresolvedTargets: [{ type: 'case_outcome', reasonCode: 'outcome_unclear' }],
    };

    expect(isResolvedSemanticResult(resolved)).toBe(true);
    expect(isUnresolvedSemanticTask(resolved)).toBe(false);
    expect(isResolvedSemanticResult(unresolved)).toBe(false);
    expect(isUnresolvedSemanticTask(unresolved)).toBe(true);
  });
});
