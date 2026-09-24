import { describe, expect, it } from 'vitest';
import { parseSemanticResolutionResult } from '../../src/services/semantic/SemanticResultSchema';

const validClaim = { id: 'claim-1', claimantPartyIds: [], claimantRole: 'unknown', claimType: 'wage', claimText: '请求支付工资' };
const validResult = (claim = validClaim): Record<string, unknown> => ({
  status: 'resolved', resolver: 'llm', parties: [], claims: [claim], judgmentItems: [], claimResolutions: [],
  applicantRole: 'unknown', applicantOutcome: 'unclear', employeeOutcome: 'unclear', employerOutcome: 'unclear', confidence: 0.8,
});

describe('SemanticResult claims predicate diagnostic', () => {
  it('accepts an empty claimText as unavailable provenance, not as an invalid claim', () => {
    const candidate = validResult({ ...validClaim, claimText: '' });
    expect(parseSemanticResolutionResult(candidate).claims[0].claimText).toBe('');
    expect(candidate.claims).toEqual([expect.objectContaining({ claimText: '' })]);
  });

  it('accepts a claim once every claim predicate is satisfied', () => {
    expect(parseSemanticResolutionResult(validResult()).claims[0].claimText).toBe('请求支付工资');
  });

  it('still rejects a missing claimText field', () => {
    const candidate = validResult();
    delete (candidate.claims as Array<Record<string, unknown>>)[0].claimText;
    expect(() => parseSemanticResolutionResult(candidate)).toThrow('result_claims');
  });
});
