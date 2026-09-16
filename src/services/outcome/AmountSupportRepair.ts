import type {
  CaseParty,
  LaborInfoClaimItem,
} from '../../types';

const MONETARY_CLAIM_TYPES = new Set([
  'wage_payment',
  'labor_remuneration',
  'unpaid_remuneration',
  'overtime_pay',
  'overtime_wage',
  'double_wage_difference',
  'double_wage_without_written_contract',
  'economic_compensation',
  'unlawful_termination_compensation',
  'annual_leave_pay',
  'annual_leave_wage',
  'notice_pay',
  'bonus',
  'commission',
  'performance_wage',
  'performance_bonus',
]);

const AMOUNT_PATTERN = /(?:人民币\s*)?[0-9][0-9,]*(?:\.\d+)?\s*元/g;

export function isMonetaryClaimType(claimType?: string): boolean {
  return !!claimType && MONETARY_CLAIM_TYPES.has(claimType.trim().toLowerCase());
}

function hasAtMostOneAmount(text?: string): boolean {
  if (!text) return true;
  return (text.match(AMOUNT_PATTERN) || []).length <= 1;
}

/**
 * A lower award is repairable only when the same claim has one unambiguous
 * monetary disposition addressed to the same identified party. This prevents
 * employer negative-payment requests and cross-claim amounts from being
 * converted by a loose numeric comparison.
 */
export function hasReliableAmountCorrespondence(
  claim: LaborInfoClaimItem,
  parties: CaseParty[] = [],
): boolean {
  const requestedAmount = claim.requestedAmount;
  const awardedAmount = claim.awardedAmount;
  if (!isMonetaryClaimType(claim.claimType)
    || !['employee', 'employer'].includes(claim.claimantRole ?? claim.claimant)
    || !Number.isFinite(requestedAmount)
    || !Number.isFinite(awardedAmount)
    || (requestedAmount ?? 0) <= 0
    || (awardedAmount ?? 0) <= 0
    || (requestedAmount ?? 0) <= (awardedAmount ?? 0)) {
    return false;
  }

  const amountActions = (claim.judgmentItems || []).filter((item) => Number.isFinite(item.awardedAmount));
  if (amountActions.length !== 1) return false;
  const action = amountActions[0];
  if (!['pay', 'support'].includes(action.action)
    || action.targetPartyRole === 'unknown'
    || action.awardedAmount !== awardedAmount
    || action.targetClaimType !== claim.claimType
    || !hasAtMostOneAmount(action.sourceText)) {
    return false;
  }

  const claimantParties = parties.filter((party) => (
    party.laborRole === (claim.claimantRole ?? claim.claimant)
      && (!claim.claimantPartyId || party.id === claim.claimantPartyId)
  ));
  const beneficiaryParties = parties.filter((party) => party.proceduralRoles.includes(action.targetPartyRole));
  return claimantParties.length === 1
    && beneficiaryParties.length === 1
    && claimantParties[0].id === beneficiaryParties[0].id;
}

export function isPotentialAmountConflict(claim: LaborInfoClaimItem): boolean {
  const requestedAmount = claim.requestedAmount;
  const awardedAmount = claim.awardedAmount;
  return claim.supportStatus === 'supported'
    && isMonetaryClaimType(claim.claimType)
    && Number.isFinite(requestedAmount)
    && Number.isFinite(awardedAmount)
    && (requestedAmount ?? 0) > (awardedAmount ?? 0)
    && (awardedAmount ?? 0) > 0;
}

export function repairReliableAmountSupport(
  claim: LaborInfoClaimItem,
  parties: CaseParty[] = [],
): LaborInfoClaimItem {
  if (!isPotentialAmountConflict(claim) || !hasReliableAmountCorrespondence(claim, parties)) return claim;
  return { ...claim, supportStatus: 'partially_supported' };
}

export function repairReliableAmountSupports(
  claims: LaborInfoClaimItem[],
  parties: CaseParty[] = [],
): { claims: LaborInfoClaimItem[]; repairedClaimIds: string[] } {
  const repairedClaimIds: string[] = [];
  const repairedClaims = claims.map((claim) => {
    const repaired = repairReliableAmountSupport(claim, parties);
    if (repaired !== claim && claim.id) repairedClaimIds.push(claim.id);
    return repaired;
  });
  return { claims: repairedClaims, repairedClaimIds };
}
