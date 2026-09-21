import { describe, expect, it } from 'vitest';
import {
  auditClaimOutcomeClassification,
  buildClaimOutcomeClassificationPrompt,
  CLAIM_OUTCOME_CLASSIFICATION_JSON_SCHEMA,
  parseClaimOutcomeClassificationResult,
  validateClaimOutcomeClassificationContract,
  type ClaimOutcomeClassificationResult,
  type ClaimOutcomeClassificationTask,
} from '../../src/services/semantic/ClaimOutcomeClassification';

const task = (overrides: Partial<ClaimOutcomeClassificationTask> = {}): ClaimOutcomeClassificationTask => ({
  caseId: 'case-1',
  targetClaim: { id: 'claim-1', claimType: 'wage', claimLabel: '工资', claimText: '请求支付工资10000元' },
  selectedJudgmentItems: [{ id: 'judgment-1', text: '驳回原告其余诉讼请求。' }],
  judgmentDispositionText: '驳回原告其余诉讼请求。',
  ...overrides,
});

const result = (overrides: Partial<ClaimOutcomeClassificationResult> = {}): ClaimOutcomeClassificationResult => ({
  status: 'classified',
  claimId: 'claim-1',
  judgmentItemIds: ['judgment-1'],
  outcome: 'not_supported',
  confidence: 0.95,
  sourceEvidence: [{ text: '驳回原告其余诉讼请求。' }],
  unresolvedReasonCodes: [],
  ...overrides,
});

describe('ClaimOutcomeClassification Stage 2 contract', () => {
  it('accepts direct rejection as not_supported', () => {
    expect(validateClaimOutcomeClassificationContract(task(), result()).valid).toBe(true);
    expect(auditClaimOutcomeClassification(task(), result()).decision).toBe('pass');
  });

  it('accepts direct grant and partial outcomes', () => {
    const grant = result({ outcome: 'supported', sourceEvidence: [{ text: '支付工资10000元。' }] });
    const partial = result({ outcome: 'partially_supported', sourceEvidence: [{ text: '支付工资5000元。' }] });
    expect(validateClaimOutcomeClassificationContract(task({ judgmentDispositionText: '支付工资10000元。' }), grant).valid).toBe(true);
    expect(validateClaimOutcomeClassificationContract(task({ judgmentDispositionText: '支付工资5000元。' }), partial).valid).toBe(true);
  });

  it('rejects unknown/new judgment IDs', () => {
    const checked = validateClaimOutcomeClassificationContract(task(), result({ judgmentItemIds: ['judgment-999'] }));
    expect(checked.reasonCodes).toContain('unknown_judgment_item_id');
  });

  it('rejects duplicate judgment IDs', () => {
    expect(validateClaimOutcomeClassificationContract(task(), result({ judgmentItemIds: ['judgment-1', 'judgment-1'] })).reasonCodes)
      .toContain('duplicate_judgment_item_id');
  });

  it('rejects classified with unclear outcome', () => {
    expect(validateClaimOutcomeClassificationContract(task(), result({ outcome: 'unclear' })).reasonCodes)
      .toContain('classified_outcome_unclear');
  });

  it('rejects unresolved with a non-unclear outcome', () => {
    const unresolved = result({ status: 'unresolved', outcome: 'not_supported', unresolvedReasonCodes: ['disposition_semantics_unclear'] });
    expect(validateClaimOutcomeClassificationContract(task(), unresolved).reasonCodes).toContain('unresolved_outcome_not_unclear');
  });

  it('requires evidence for classified and a reason for unresolved', () => {
    expect(validateClaimOutcomeClassificationContract(task(), result({ sourceEvidence: [] })).reasonCodes)
      .toContain('classified_evidence_missing');
    const unresolved = result({ status: 'unresolved', outcome: 'unclear', judgmentItemIds: [], sourceEvidence: [], unresolvedReasonCodes: [] });
    expect(validateClaimOutcomeClassificationContract(task(), unresolved).reasonCodes).toContain('unresolved_reason_missing');
  });

  it('checks evidence exact matching', () => {
    expect(auditClaimOutcomeClassification(task(), result({ sourceEvidence: [{ text: '不存在的片段' }] })).reasonCodes)
      .toContain('source_evidence_not_found');
  });

  it('rejects outcome and relationship-expansion fields from strict schema', () => {
    expect(CLAIM_OUTCOME_CLASSIFICATION_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(() => parseClaimOutcomeClassificationResult({ ...result(), parties: [] })).toThrow();
    expect(() => parseClaimOutcomeClassificationResult({ ...result(), claimResolutions: [] })).toThrow();
  });

  it('prompt keeps relationship fixed and forbids other claims', () => {
    const prompt = buildClaimOutcomeClassificationPrompt(task());
    expect(prompt.system).toContain('relationship is already established');
    expect(prompt.system).toContain('Do not select new judgment items');
    expect(prompt.system).toContain('Do not analyze other claims');
  });
});
