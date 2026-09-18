import { describe, expect, it } from 'vitest';
import {
  auditSemanticResolutionResult,
  DEFAULT_SEMANTIC_RESULT_ADMISSION_THRESHOLD,
  type SemanticResolutionResult,
} from '../../src/services/semantic';

const rawText = '原告：甲公司。被告：乙某。甲公司请求支付工资1000元。判决：甲公司支付乙某工资1000元。';

const validResult = (overrides: Partial<SemanticResolutionResult> = {}): SemanticResolutionResult => ({
  status: 'resolved',
  resolver: 'llm',
  parties: [
    { id: 'party-employer', name: '甲公司', laborRole: 'employer', proceduralRoles: ['plaintiff'] },
    { id: 'party-employee', name: '乙某', laborRole: 'employee', proceduralRoles: ['defendant'] },
  ],
  claims: [{
    id: 'claim-1', claimantPartyIds: ['party-employer'], claimantRole: 'employer',
    claimType: '工资', claimText: '甲公司请求支付工资1000元。',
  }],
  judgmentItems: [{ id: 'judgment-1', text: '判决：甲公司支付乙某工资1000元。' }],
  claimResolutions: [{
    claimId: 'claim-1', judgmentItemIds: ['judgment-1'], outcome: 'supported', confidence: 0.95,
  }],
  applicantRole: 'employer',
  applicantOutcome: 'supported',
  employeeOutcome: 'supported',
  employerOutcome: 'supported',
  confidence: 0.95,
  ...overrides,
});

const context = {
  rawText,
  knownParties: validResult().parties,
  knownClaims: validResult().claims,
  knownJudgmentItems: validResult().judgmentItems,
};

describe('SemanticResult minimal local audit', () => {
  it('passes a schema-valid result with evidence and known relationships', () => {
    expect(auditSemanticResolutionResult(validResult(), context)).toEqual({
      decision: 'pass', reasonCodes: [],
      admissionConfidenceThreshold: DEFAULT_SEMANTIC_RESULT_ADMISSION_THRESHOLD,
    });
  });

  it('rejects evidence text that is absent from rawText', () => {
    const result = validResult({
      parties: [{ ...validResult().parties[0], sourceEvidence: { text: '原文不存在的主体' } }, validResult().parties[1]],
    });
    expect(auditSemanticResolutionResult(result, context).reasonCodes)
      .toContain('source_evidence_not_found');
  });

  it('rejects output party, claim, and judgment IDs not present in known facts', () => {
    const result = validResult({
      parties: [{ ...validResult().parties[0], id: 'hallucinated-party' }, validResult().parties[1]],
      claims: [{ ...validResult().claims[0], id: 'hallucinated-claim', claimantPartyIds: ['hallucinated-party'] }],
      claimResolutions: [{ claimId: 'hallucinated-claim', judgmentItemIds: ['hallucinated-judgment'], outcome: 'supported', confidence: 0.95 }],
      judgmentItems: [{ id: 'hallucinated-judgment', text: '判决：甲公司支付乙某工资1000元。' }],
    });
    const audit = auditSemanticResolutionResult(result, context);
    expect(audit.reasonCodes).toEqual(expect.arrayContaining([
      'party_id_not_found', 'claim_id_not_found', 'judgment_item_id_not_found',
      'claim_resolution_claim_id_not_found', 'claim_resolution_judgment_item_id_not_found',
    ]));
  });

  it('rejects dangling claim resolution references', () => {
    const result = validResult({
      claimResolutions: [{ claimId: 'missing-claim', judgmentItemIds: ['missing-judgment'], outcome: 'supported', confidence: 0.95 }],
    });
    expect(auditSemanticResolutionResult(result, context).reasonCodes).toEqual(expect.arrayContaining([
      'claim_resolution_claim_id_not_found', 'claim_resolution_judgment_item_id_not_found',
    ]));
  });

  it('rejects broken claimant relationships', () => {
    const result = validResult({
      claims: [{ ...validResult().claims[0], claimantPartyIds: [], claimantRole: 'employer' }],
    });
    expect(auditSemanticResolutionResult(result, context).reasonCodes)
      .toContain('required_relationship_missing');
  });

  it('rejects confidence below the admission threshold', () => {
    const result = validResult({ confidence: 0.89 });
    expect(auditSemanticResolutionResult(result, context).reasonCodes)
      .toContain('confidence_below_admission_threshold');
  });

  it('rejects resolved results that still contain key unclear values', () => {
    const result = validResult({ employerOutcome: 'unclear' });
    expect(auditSemanticResolutionResult(result, context).reasonCodes)
      .toContain('resolved_contains_unclear');
  });

  it('rejects unresolved and technical-failure results without inventing an outcome', () => {
    const result = validResult({
      status: 'unresolved',
      applicantRole: 'unknown',
      applicantOutcome: 'unclear',
      employeeOutcome: 'unclear',
      employerOutcome: 'unclear',
      confidence: 0,
      resolverErrorCode: 'timeout',
    });
    const audit = auditSemanticResolutionResult(result, context);
    expect(audit.reasonCodes).toEqual(expect.arrayContaining([
      'unresolved_result', 'technical_resolution_failure', 'confidence_below_admission_threshold',
    ]));
    expect(audit.decision).toBe('fail');
  });

  it('uses a caller-provided admission threshold', () => {
    const result = validResult({ confidence: 0.8, claimResolutions: [{
      claimId: 'claim-1', judgmentItemIds: ['judgment-1'], outcome: 'supported', confidence: 0.8,
    }] });
    const audit = auditSemanticResolutionResult(result, { ...context, admissionConfidenceThreshold: 0.8 });
    expect(audit.decision).toBe('pass');
  });
});
