import { describe, expect, it } from 'vitest';
import {
  auditJudgmentRelationshipSelection,
  buildJudgmentRelationshipSelectionPrompt,
  JUDGMENT_RELATIONSHIP_SELECTION_JSON_SCHEMA,
  parseJudgmentRelationshipSelectionResult,
  validateJudgmentRelationshipSelectionContract,
  type JudgmentRelationshipSelectionResult,
  type JudgmentRelationshipSelectionTask,
} from '../../src/services/semantic/JudgmentRelationshipSelection';

const task = (overrides: Partial<JudgmentRelationshipSelectionTask> = {}): JudgmentRelationshipSelectionTask => ({
  caseId: 'case-1',
  targetClaim: { id: 'claim-1', claimType: 'wage', claimLabel: '工资', claimText: '请求支付工资10000元' },
  candidateJudgmentItems: [
    { id: 'judgment-1', text: '驳回原告关于工资的诉讼请求。' },
    { id: 'judgment-2', text: '被告支付原告工资5000元。' },
  ],
  judgmentDispositionText: '驳回原告关于工资的诉讼请求。',
  focusedSourceText: '驳回原告关于工资的诉讼请求。',
  ...overrides,
});

const result = (overrides: Partial<JudgmentRelationshipSelectionResult> = {}): JudgmentRelationshipSelectionResult => ({
  status: 'selected',
  claimId: 'claim-1',
  selectedJudgmentItemIds: ['judgment-1'],
  confidence: 0.95,
  sourceEvidence: [{ text: '驳回原告关于工资的诉讼请求。' }],
  unresolvedReasonCodes: [],
  ...overrides,
});

describe('JudgmentRelationshipSelection Stage 1 contract', () => {
  it('accepts a direct relationship without an outcome field', () => {
    const parsed = parseJudgmentRelationshipSelectionResult(result());
    expect(parsed.status).toBe('selected');
    expect(parsed.selectedJudgmentItemIds).toEqual(['judgment-1']);
    expect(Object.keys(parsed)).not.toContain('outcome');
    expect(validateJudgmentRelationshipSelectionContract(task(), parsed).valid).toBe(true);
    expect(auditJudgmentRelationshipSelection(task(), parsed).decision).toBe('pass');
  });

  it('allows a global judgment item to be selected for a target', () => {
    const globalTask = task({ candidateJudgmentItems: [{ id: 'judgment-all', text: '驳回原告全部诉讼请求。' }] });
    const globalResult = result({ selectedJudgmentItemIds: ['judgment-all'], sourceEvidence: [{ text: '驳回原告全部诉讼请求。' }] });
    expect(validateJudgmentRelationshipSelectionContract(globalTask, globalResult).valid).toBe(true);
  });

  it('allows a residual judgment item to be selected for a target', () => {
    const residualTask = task({ candidateJudgmentItems: [{ id: 'judgment-other', text: '驳回原告其他诉讼请求。' }] });
    const residualResult = result({ selectedJudgmentItemIds: ['judgment-other'], sourceEvidence: [{ text: '驳回原告其他诉讼请求。' }] });
    expect(validateJudgmentRelationshipSelectionContract(residualTask, residualResult).valid).toBe(true);
  });

  it('rejects unknown judgment IDs', () => {
    const checked = validateJudgmentRelationshipSelectionContract(task(), result({ selectedJudgmentItemIds: ['judgment-999'] }));
    expect(checked.valid).toBe(false);
    expect(checked.reasonCodes).toContain('unknown_judgment_item_id');
  });

  it('rejects duplicate selected IDs', () => {
    const checked = validateJudgmentRelationshipSelectionContract(task(), result({ selectedJudgmentItemIds: ['judgment-1', 'judgment-1'] }));
    expect(checked.reasonCodes).toContain('duplicate_selected_judgment_item_id');
  });

  it('rejects selected status with empty IDs', () => {
    const checked = validateJudgmentRelationshipSelectionContract(task(), result({ selectedJudgmentItemIds: [] }));
    expect(checked.reasonCodes).toContain('selected_ids_empty');
  });

  it('accepts unresolved with an explicit mechanical reason', () => {
    const unresolved = result({
      status: 'unresolved',
      selectedJudgmentItemIds: [],
      confidence: 0.4,
      sourceEvidence: [],
      unresolvedReasonCodes: ['judgment_scope_unclear'],
    });
    expect(validateJudgmentRelationshipSelectionContract(task(), unresolved).valid).toBe(true);
    expect(auditJudgmentRelationshipSelection(task(), unresolved).reasonCodes).toContain('confidence_below_admission_threshold');
  });

  it('rejects claim ID mismatch', () => {
    const checked = validateJudgmentRelationshipSelectionContract(task(), result({ claimId: 'claim-2' }));
    expect(checked.reasonCodes).toContain('claim_id_mismatch');
  });

  it('strict schema rejects outcome and full-result fields', () => {
    expect(JUDGMENT_RELATIONSHIP_SELECTION_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(() => parseJudgmentRelationshipSelectionResult({
      ...result(),
      outcome: 'not_supported',
    })).toThrow();
    expect(() => parseJudgmentRelationshipSelectionResult({
      ...result(),
      claimResolutions: [],
    })).toThrow();
  });

  it('checks source evidence against supplied stage context', () => {
    const checked = auditJudgmentRelationshipSelection(task(), result({ sourceEvidence: [{ text: '不存在的原文' }] }));
    expect(checked.reasonCodes).toContain('source_evidence_not_found');
  });

  it('prompt explicitly forbids outcome classification and preserves global scope', () => {
    const prompt = buildJudgmentRelationshipSelectionPrompt(task());
    expect(prompt.system).toContain('not deciding whether the claim is supported');
    expect(prompt.system).toContain('global or residual judgment item');
    expect(prompt.system).toContain('no outcome');
    expect(prompt.user).toContain('candidateJudgmentItems');
  });
});
