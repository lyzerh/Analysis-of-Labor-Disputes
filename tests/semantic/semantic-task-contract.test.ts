import { describe, expect, it } from 'vitest';
import {
  validateSemanticTaskContract,
  type SemanticResolutionResult,
  type UnresolvedSemanticTask,
} from '../../src/services/semantic';

const task: UnresolvedSemanticTask = {
  status: 'unresolved',
  caseId: 'task-contract-case',
  reasonCodes: ['claim_judgment_match_unclear'],
  rawText: '原告请求支付工资。判决支付原告工资。',
  unresolvedTargets: [{
    type: 'claim_resolution',
    id: 'claim-1',
    reasonCode: 'claim_judgment_match_unclear',
  }],
  knownClaims: [{
    id: 'claim-1',
    claimantPartyIds: [],
    claimantRole: 'employee',
    claimType: 'wage',
    claimText: '请求支付工资',
  }],
  knownJudgmentItems: [{ id: 'judgment-1', text: '判决支付原告工资。' }],
};

const result = (overrides: Partial<SemanticResolutionResult> = {}): SemanticResolutionResult => ({
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
    sourceEvidence: { text: '判决支付原告工资。' },
  }],
  applicantRole: 'employee',
  applicantOutcome: 'supported',
  employeeOutcome: 'supported',
  employerOutcome: 'not_supported',
  confidence: 0.95,
  ...overrides,
});

describe('Semantic task target contract', () => {
  it('rejects duplicate resolutions for one supplied target', () => {
    const checked = validateSemanticTaskContract(task, result({
      claimResolutions: [
        result().claimResolutions[0],
        result().claimResolutions[0],
      ],
    }));
    expect(checked.valid).toBe(false);
    expect(checked.reasonCodes).toContain('target_resolution_duplicate');
    expect(checked.duplicateTargetCount).toBe(1);
  });

  it('rejects a resolved result whose supplied target remains unclear', () => {
    const checked = validateSemanticTaskContract(task, result({
      claimResolutions: [{ ...result().claimResolutions[0], outcome: 'unclear' }],
    }));
    expect(checked.valid).toBe(false);
    expect(checked.reasonCodes).toContain('resolved_target_unclear');
  });

  it('rejects a resolution for a claim that was not supplied as a target', () => {
    const checked = validateSemanticTaskContract(task, result({
      claimResolutions: [
        result().claimResolutions[0],
        { ...result().claimResolutions[0], claimId: 'claim-2' },
      ],
    }));
    expect(checked.valid).toBe(false);
    expect(checked.reasonCodes).toContain('extra_claim_resolution');
    expect(checked.extraResolutionCount).toBe(1);
  });

  it('accepts exactly one clear resolution for the supplied target', () => {
    expect(validateSemanticTaskContract(task, result())).toMatchObject({
      valid: true,
      targetCount: 1,
      resolutionCount: 1,
      duplicateTargetCount: 0,
      extraResolutionCount: 0,
      reasonCodes: [],
    });
  });

  it('accepts a legitimately unresolved target with its reason retained', () => {
    const checked = validateSemanticTaskContract(task, result({
      status: 'unresolved',
      unresolvedReasonCodes: ['claim_judgment_match_unclear'],
      claimResolutions: [{ ...result().claimResolutions[0], outcome: 'unclear', judgmentItemIds: [] }],
      confidence: 0.3,
      applicantRole: 'unknown',
      applicantOutcome: 'unclear',
      employeeOutcome: 'unclear',
      employerOutcome: 'unclear',
    }));
    expect(checked.valid).toBe(true);
  });
});
