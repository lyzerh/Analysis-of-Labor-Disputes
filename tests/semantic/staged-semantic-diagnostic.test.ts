import { describe, expect, it, vi } from 'vitest';
import {
  runStagedSemanticDiagnostic,
  type StagedSemanticDiagnosticInput,
} from '../../src/services/semantic/StagedSemanticDiagnostic';
import type { ClaimOutcomeClassificationResult } from '../../src/services/semantic/ClaimOutcomeClassification';
import type { JudgmentRelationshipSelectionResult, JudgmentRelationshipSelectionTask } from '../../src/services/semantic/JudgmentRelationshipSelection';

const stage1Task: JudgmentRelationshipSelectionTask = {
  caseId: 'case-1',
  targetClaim: { id: 'claim-1', claimType: 'wage', claimText: '请求支付工资' },
  candidateJudgmentItems: [
    { id: 'judgment-1', text: '驳回原告其余诉讼请求。' },
    { id: 'judgment-2', text: '支付原告工资。' },
  ],
  judgmentDispositionText: '驳回原告其余诉讼请求。',
};

const stage1 = (overrides: Partial<JudgmentRelationshipSelectionResult> = {}): JudgmentRelationshipSelectionResult => ({
  status: 'selected',
  claimId: 'claim-1',
  selectedJudgmentItemIds: ['judgment-1'],
  confidence: 0.65,
  sourceEvidence: [{ text: '驳回原告其余诉讼请求。' }],
  unresolvedReasonCodes: [],
  ...overrides,
});

const stage2 = (overrides: Partial<ClaimOutcomeClassificationResult> = {}): ClaimOutcomeClassificationResult => ({
  status: 'classified',
  claimId: 'claim-1',
  judgmentItemIds: ['judgment-1'],
  outcome: 'not_supported',
  confidence: 0.65,
  sourceEvidence: [{ text: '驳回原告其余诉讼请求。' }],
  unresolvedReasonCodes: [],
  ...overrides,
});

const input = (
  stage1Result: JudgmentRelationshipSelectionResult,
  stage2Result: ClaimOutcomeClassificationResult = stage2(),
  expected: StagedSemanticDiagnosticInput['expected'] = {
    relationshipStatus: 'selected',
    selectedJudgmentItemIds: ['judgment-1'],
    outcome: 'not_supported',
  },
): StagedSemanticDiagnosticInput => ({
  stage1Task,
  expected,
  runStage1: vi.fn(async () => ({ result: stage1Result })),
  runStage2: vi.fn(async () => ({ result: stage2Result })),
  buildStage2Task: (ids) => ({
    caseId: 'case-1',
    targetClaim: stage1Task.targetClaim,
    selectedJudgmentItems: ids.map((id) => ({ id, text: stage1Task.candidateJudgmentItems.find((item) => item.id === id)?.text ?? '' })),
    judgmentDispositionText: stage1Task.judgmentDispositionText,
  }),
});

describe('isolated Stage 1 → Stage 2 diagnostic orchestrator', () => {
  it('calls Stage 2 for a selected Stage 1 relationship', async () => {
    const run = input(stage1());
    const result = await runStagedSemanticDiagnostic(run);
    expect(run.runStage2).toHaveBeenCalledOnce();
    expect(result.finalStatus).toBe('classified');
    expect(result.semanticCorrect).toBe(true);
  });

  it('does not call Stage 2 for safe unresolved Stage 1 output', async () => {
    const run = input(stage1({ status: 'unresolved', selectedJudgmentItemIds: [], sourceEvidence: [], unresolvedReasonCodes: ['appellate_dependency'] }), stage2(), {
      relationshipStatus: 'unresolved', selectedJudgmentItemIds: [],
    });
    const result = await runStagedSemanticDiagnostic(run);
    expect(run.runStage2).not.toHaveBeenCalled();
    expect(result.finalStatus).toBe('safe_unresolved');
    expect(result.semanticCorrect).toBe(true);
  });

  it('does not silently replace a wrong Stage 1 ID', async () => {
    const run = input(stage1({ selectedJudgmentItemIds: ['judgment-2'] }), stage2({ judgmentItemIds: ['judgment-2'] }));
    const result = await runStagedSemanticDiagnostic(run);
    expect(run.runStage2).toHaveBeenCalledOnce();
    expect(result.finalStatus).toBe('wrong_relationship');
    expect(result.failureAttribution).toBe('STAGE1_RELATIONSHIP');
  });

  it('passes exactly the actual selected IDs into Stage 2', async () => {
    const run = input(stage1({ selectedJudgmentItemIds: ['judgment-2'] }), stage2({ judgmentItemIds: ['judgment-2'] }));
    await runStagedSemanticDiagnostic(run);
    const stage2Runner = run.runStage2 as ReturnType<typeof vi.fn>;
    expect(stage2Runner.mock.calls[0][0].selectedJudgmentItems.map((item: { id: string }) => item.id)).toEqual(['judgment-2']);
  });

  it('rejects Stage 2 output that introduces an ID through the contract', async () => {
    const run = input(stage1(), stage2({ judgmentItemIds: ['judgment-999'] }));
    const result = await runStagedSemanticDiagnostic(run);
    expect(result.finalStatus).toBe('technical_failure');
    expect(result.failureAttribution).toBe('CONTRACT');
  });

  it('stops on Stage 1 provider failure', async () => {
    const run = input(stage1());
    run.runStage1 = vi.fn(async () => { throw new Error('timeout'); });
    const result = await runStagedSemanticDiagnostic(run);
    expect(result.finalStatus).toBe('technical_failure');
    expect(result.failureAttribution).toBe('PROVIDER_TECHNICAL');
    expect(run.runStage2).not.toHaveBeenCalled();
  });

  it('attributes Stage 2 provider failure separately', async () => {
    const run = input(stage1());
    run.runStage2 = vi.fn(async () => { throw new Error('network'); });
    const result = await runStagedSemanticDiagnostic(run);
    expect(result.failureAttribution).toBe('PROVIDER_TECHNICAL');
  });

  it('does not block diagnostic correctness on confidence below 0.90', async () => {
    const result = await runStagedSemanticDiagnostic(input(stage1(), stage2()));
    expect(result.semanticCorrect).toBe(true);
    expect(result.productionAdmissible).toBe(false);
    expect(result.stage1Audit?.reasonCodes).toContain('confidence_below_admission_threshold');
    expect(result.stage2Audit?.reasonCodes).toContain('confidence_below_admission_threshold');
  });

  it('attributes a valid but unresolved Stage 2 result', async () => {
    const unresolved = stage2({
      status: 'unresolved',
      outcome: 'unclear',
      judgmentItemIds: [],
      sourceEvidence: [],
      unresolvedReasonCodes: ['disposition_semantics_unclear'],
    });
    const result = await runStagedSemanticDiagnostic(input(stage1(), unresolved));
    expect(result.finalStatus).toBe('safe_unresolved');
    expect(result.failureAttribution).toBe('STAGE2_UNRESOLVED');
  });
});
