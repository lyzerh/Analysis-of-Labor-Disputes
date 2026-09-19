import type {
  SemanticResolutionResult,
  SemanticTarget,
  UnresolvedSemanticTask,
} from './SemanticResult';

/**
 * Mechanical checks for the boundary between one unresolved task and the
 * provider result. This deliberately does not inspect legal wording or
 * decide whether a judgment is substantively correct.
 */
export type SemanticTaskContractReasonCode =
  | 'target_id_missing'
  | 'target_resolution_missing'
  | 'target_resolution_duplicate'
  | 'extra_claim_resolution'
  | 'resolved_target_unclear'
  | 'resolved_target_missing_judgment'
  | 'unresolved_reason_missing';

export interface SemanticTaskContractResult {
  valid: boolean;
  reasonCodes: SemanticTaskContractReasonCode[];
  targetCount: number;
  resolutionCount: number;
  duplicateTargetCount: number;
  extraResolutionCount: number;
}

const claimResolutionTargets = (task: UnresolvedSemanticTask): SemanticTarget[] =>
  task.unresolvedTargets.filter((target) => target.type === 'claim_resolution');

/**
 * Enforces target coverage without turning the contract validator into a
 * second parser or legal-semantics engine.
 */
export const validateSemanticTaskContract = (
  task: UnresolvedSemanticTask,
  result: SemanticResolutionResult,
): SemanticTaskContractResult => {
  // Provider/schema failures are already technical results and must retain
  // their retryable routing instead of being reclassified as task failures.
  if (result.resolverErrorCode) {
    return {
      valid: true,
      reasonCodes: [],
      targetCount: claimResolutionTargets(task).filter((target) => Boolean(target.id)).length,
      resolutionCount: result.claimResolutions.length,
      duplicateTargetCount: 0,
      extraResolutionCount: 0,
    };
  }

  const targets = claimResolutionTargets(task);
  const targetIds = targets.map((target) => target.id).filter((id): id is string => Boolean(id));
  const uniqueTargetIds = [...new Set(targetIds)];
  const reasonCodes: SemanticTaskContractReasonCode[] = [];

  if (targets.some((target) => !target.id)) reasonCodes.push('target_id_missing');

  const counts = new Map<string, number>();
  for (const resolution of result.claimResolutions) {
    counts.set(resolution.claimId, (counts.get(resolution.claimId) || 0) + 1);
  }

  let duplicateTargetCount = 0;
  for (const targetId of uniqueTargetIds) {
    const count = counts.get(targetId) || 0;
    if (count === 0) reasonCodes.push('target_resolution_missing');
    if (count > 1) {
      duplicateTargetCount += count - 1;
      reasonCodes.push('target_resolution_duplicate');
    }

    if (count === 1) {
      const resolution = result.claimResolutions.find((item) => item.claimId === targetId)!;
      const target = targets.find((item) => item.id === targetId);
      if (result.status === 'resolved' && resolution.outcome === 'unclear') {
        reasonCodes.push('resolved_target_unclear');
      }
      if (result.status === 'resolved'
        && target?.reasonCode === 'claim_judgment_match_unclear'
        && resolution.judgmentItemIds.length === 0) {
        reasonCodes.push('resolved_target_missing_judgment');
      }
      if (result.status === 'unresolved'
        && resolution.outcome === 'unclear'
        && target?.reasonCode
        && !result.unresolvedReasonCodes?.includes(target.reasonCode)) {
        reasonCodes.push('unresolved_reason_missing');
      }
    }
  }

  const extraResolutionCount = result.claimResolutions.filter(
    (resolution) => !uniqueTargetIds.includes(resolution.claimId),
  ).length;
  if (extraResolutionCount > 0) reasonCodes.push('extra_claim_resolution');

  return {
    valid: reasonCodes.length === 0,
    reasonCodes: [...new Set(reasonCodes)],
    targetCount: uniqueTargetIds.length,
    resolutionCount: result.claimResolutions.length,
    duplicateTargetCount,
    extraResolutionCount,
  };
};
