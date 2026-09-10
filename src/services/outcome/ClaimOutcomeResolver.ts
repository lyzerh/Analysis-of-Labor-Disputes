import type {
  ClaimSupportStatus,
  JudgmentActionItem,
  LaborInfoClaimItem,
  LegalOutcomeType,
} from '../../types';
import { AmountResolver } from '../parser/AmountResolver';

/** Derives claim truth only from deterministic judgment actions and amounts. */
export const resolveClaimOutcome = (
  claim: LaborInfoClaimItem,
  judgmentItems: JudgmentActionItem[],
): ClaimSupportStatus => {
  const hasSupport = judgmentItems.some((item) => item.action === 'support' || item.action === 'pay');
  const hasReject = judgmentItems.some((item) => item.action === 'reject');
  const awardedAmount = judgmentItems.find((item) => item.awardedAmount !== undefined)?.awardedAmount
    ?? claim.awardedAmount;
  const amountOutcome = AmountResolver.resolveAmountOutcome(claim.requestedAmount, awardedAmount);

  if (!hasSupport && hasReject) return 'not_supported';
  if (hasSupport && hasReject) return 'partially_supported';
  if (hasSupport && judgmentItems.some((item) => /全部|全额/.test(item.sourceText))) return 'supported';
  if (amountOutcome !== undefined) return amountOutcome;
  if (hasSupport) return 'supported';
  return claim.supportStatus;
};

/** Aggregates already-determined claim outcomes without interpreting source text. */
export const aggregateClaimOutcomes = (
  claims: LaborInfoClaimItem[],
  current: LegalOutcomeType,
): LegalOutcomeType => {
  if (claims.length === 0) return current;
  const statuses = claims.map((claim) => claim.supportStatus);
  const supported = statuses.filter((status) => status === 'supported').length;
  const partial = statuses.filter((status) => status === 'partially_supported').length;
  const rejected = statuses.filter((status) => status === 'not_supported').length;

  if (partial > 0 || (supported > 0 && rejected > 0)) return 'partially_supported';
  if (supported === claims.length) return 'supported';
  if (rejected === claims.length) return 'not_supported';
  return current;
};
