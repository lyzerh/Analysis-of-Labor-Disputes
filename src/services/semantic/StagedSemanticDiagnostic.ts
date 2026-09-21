import {
  auditClaimOutcomeClassification,
  validateClaimOutcomeClassificationContract,
  type ClaimOutcomeClassificationResult,
  type ClaimOutcomeClassificationTask,
} from './ClaimOutcomeClassification';
import {
  auditJudgmentRelationshipSelection,
  validateJudgmentRelationshipSelectionContract,
  type JudgmentRelationshipSelectionResult,
  type JudgmentRelationshipSelectionTask,
} from './JudgmentRelationshipSelection';

export type StagedFailureAttribution =
  | 'STAGE1_RELATIONSHIP'
  | 'STAGE1_UNRESOLVED'
  | 'STAGE2_OUTCOME'
  | 'STAGE2_UNRESOLVED'
  | 'PROVIDER_TECHNICAL'
  | 'SCHEMA'
  | 'CONTRACT';

export interface StagedStageExecution<T> {
  result: T;
  httpStatus?: number;
  durationMs?: number;
  promptTokens?: number | null;
  completionTokens?: number | null;
  reasoningTokens?: number | null;
}

export interface StagedSemanticDiagnosticExpected {
  relationshipStatus: 'selected' | 'unresolved';
  selectedJudgmentItemIds: string[];
  outcome?: 'supported' | 'partially_supported' | 'not_supported';
}

export interface StagedSemanticDiagnosticInput {
  stage1Task: JudgmentRelationshipSelectionTask;
  expected: StagedSemanticDiagnosticExpected;
  runStage1: () => Promise<StagedStageExecution<JudgmentRelationshipSelectionResult>>;
  runStage2: (task: ClaimOutcomeClassificationTask) => Promise<StagedStageExecution<ClaimOutcomeClassificationResult>>;
  buildStage2Task: (selectedJudgmentItemIds: string[]) => ClaimOutcomeClassificationTask;
}

export interface StagedSemanticDiagnosticResult {
  stage1?: JudgmentRelationshipSelectionResult;
  stage1Audit?: ReturnType<typeof auditJudgmentRelationshipSelection>;
  stage2?: ClaimOutcomeClassificationResult;
  stage2Audit?: ReturnType<typeof auditClaimOutcomeClassification>;
  finalStatus: 'classified' | 'safe_unresolved' | 'wrong_relationship' | 'wrong_outcome' | 'technical_failure';
  finalOutcome?: 'supported' | 'partially_supported' | 'not_supported' | 'unclear';
  semanticCorrect: boolean;
  productionAdmissible: boolean;
  failureAttribution?: StagedFailureAttribution;
  technicalReason?: string;
}

const equalIds = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((id, index) => id === right[index]);

const isMechanicalAuditFailure = (reasonCodes: string[]): boolean =>
  reasonCodes.some((reason) => reason !== 'confidence_below_admission_threshold');

const technicalResult = (
  partial: Pick<StagedSemanticDiagnosticResult, 'stage1' | 'stage1Audit' | 'stage2' | 'stage2Audit'>,
  failureAttribution: StagedFailureAttribution,
  technicalReason: string,
): StagedSemanticDiagnosticResult => ({
  ...partial,
  finalStatus: 'technical_failure',
  semanticCorrect: false,
  productionAdmissible: false,
  failureAttribution,
  technicalReason,
});

export const runStagedSemanticDiagnostic = async (
  input: StagedSemanticDiagnosticInput,
): Promise<StagedSemanticDiagnosticResult> => {
  let stage1Execution: StagedStageExecution<JudgmentRelationshipSelectionResult>;
  try {
    stage1Execution = await input.runStage1();
  } catch (error) {
    return technicalResult({}, 'PROVIDER_TECHNICAL', error instanceof Error ? error.message : 'stage1_provider_failure');
  }

  const stage1 = stage1Execution.result;
  const stage1Contract = validateJudgmentRelationshipSelectionContract(input.stage1Task, stage1);
  const stage1Audit = auditJudgmentRelationshipSelection(input.stage1Task, stage1);
  if (!stage1Contract.valid) {
    return technicalResult({ stage1, stage1Audit }, 'CONTRACT', stage1Contract.reasonCodes.join(',') || 'stage1_contract_failure');
  }
  if (isMechanicalAuditFailure(stage1Audit.reasonCodes)) {
    return technicalResult({ stage1, stage1Audit }, 'SCHEMA', stage1Audit.reasonCodes.join(',') || 'stage1_audit_failure');
  }

  if (input.expected.relationshipStatus === 'unresolved') {
    const safeUnresolved = stage1.status === 'unresolved' && stage1.selectedJudgmentItemIds.length === 0;
    if (!safeUnresolved) {
      return {
        stage1,
        stage1Audit,
        finalStatus: 'wrong_relationship',
        finalOutcome: 'unclear',
        semanticCorrect: false,
        productionAdmissible: false,
        failureAttribution: 'STAGE1_RELATIONSHIP',
      };
    }
    return {
      stage1,
      stage1Audit,
      finalStatus: 'safe_unresolved',
      finalOutcome: 'unclear',
      semanticCorrect: true,
      productionAdmissible: stage1Audit.decision === 'pass',
    };
  }

  if (stage1.status === 'unresolved') {
    return {
      stage1,
      stage1Audit,
      finalStatus: 'safe_unresolved',
      finalOutcome: 'unclear',
      semanticCorrect: false,
      productionAdmissible: false,
      failureAttribution: 'STAGE1_UNRESOLVED',
    };
  }

  const relationshipCorrect = equalIds(stage1.selectedJudgmentItemIds, input.expected.selectedJudgmentItemIds);
  const stage2Task = input.buildStage2Task(stage1.selectedJudgmentItemIds);
  let stage2Execution: StagedStageExecution<ClaimOutcomeClassificationResult>;
  try {
    stage2Execution = await input.runStage2(stage2Task);
  } catch (error) {
    return technicalResult({ stage1, stage1Audit }, 'PROVIDER_TECHNICAL', error instanceof Error ? error.message : 'stage2_provider_failure');
  }

  const stage2 = stage2Execution.result;
  const stage2Contract = validateClaimOutcomeClassificationContract(stage2Task, stage2);
  const stage2Audit = auditClaimOutcomeClassification(stage2Task, stage2);
  if (!stage2Contract.valid) {
    return technicalResult({ stage1, stage1Audit, stage2, stage2Audit }, 'CONTRACT', stage2Contract.reasonCodes.join(',') || 'stage2_contract_failure');
  }
  if (isMechanicalAuditFailure(stage2Audit.reasonCodes)) {
    return technicalResult({ stage1, stage1Audit, stage2, stage2Audit }, 'SCHEMA', stage2Audit.reasonCodes.join(',') || 'stage2_audit_failure');
  }
  if (!relationshipCorrect) {
    return {
      stage1,
      stage1Audit,
      stage2,
      stage2Audit,
      finalStatus: 'wrong_relationship',
      finalOutcome: stage2.outcome,
      semanticCorrect: false,
      productionAdmissible: false,
      failureAttribution: 'STAGE1_RELATIONSHIP',
    };
  }
  if (stage2.status === 'unresolved' || stage2.outcome === 'unclear') {
    return {
      stage1,
      stage1Audit,
      stage2,
      stage2Audit,
      finalStatus: 'safe_unresolved',
      finalOutcome: 'unclear',
      semanticCorrect: false,
      productionAdmissible: false,
      failureAttribution: 'STAGE2_UNRESOLVED',
    };
  }
  const outcomeCorrect = stage2.outcome === input.expected.outcome;
  return {
    stage1,
    stage1Audit,
    stage2,
    stage2Audit,
    finalStatus: outcomeCorrect ? 'classified' : 'wrong_outcome',
    finalOutcome: stage2.outcome,
    semanticCorrect: outcomeCorrect,
    productionAdmissible: outcomeCorrect && stage1Audit.decision === 'pass' && stage2Audit.decision === 'pass',
    ...(outcomeCorrect ? {} : { failureAttribution: 'STAGE2_OUTCOME' as const }),
  };
};
