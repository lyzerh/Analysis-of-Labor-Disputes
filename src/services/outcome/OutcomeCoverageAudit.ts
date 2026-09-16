import type {
  AnalysisCaseRecord,
  LaborInfoClaimItem,
  LegalOutcomeType,
  OutcomeReviewSuggestion,
} from '../../types';
import {
  buildOutcomeReviewQueue,
  outcomeReviewReasonLabels,
  outcomeReviewSuggestionForDisplay,
} from './OutcomeReviewQueue';
import { isMonetaryClaimType, isPotentialAmountConflict, repairReliableAmountSupports } from './AmountSupportRepair';

export interface OutcomeCoverageReasonBreakdown {
  reasonCode: string;
  label: string;
  count: number;
  percent: number;
}

export interface OutcomeCoverageClaimTypeBreakdown {
  claimType: string;
  total: number;
  needsReview: number;
  unclearRate: number;
}

export interface OutcomeCoverageSuggestionBreakdown {
  type: OutcomeReviewSuggestion;
  count: number;
}

export interface OutcomeCoverageAmountRiskItem {
  caseId: string;
  claimId?: string;
  claimType: string;
  claimName: string;
  requestedAmount: number;
  awardedAmount: number;
}

export interface OutcomeCoverageAudit {
  analysisRunId: string;
  totalCases: number;
  totalClaims: number;
  resolvedClaims: number;
  unresolvedClaims: number;
  needsReviewItems: number;
  needsReviewClaims: number;
  unclearRate: number;
  needsReviewRate: number;
  byOutcome: Record<LegalOutcomeType, number>;
  byReasonCode: OutcomeCoverageReasonBreakdown[];
  byClaimType: OutcomeCoverageClaimTypeBreakdown[];
  bySuggestedReviewType: OutcomeCoverageSuggestionBreakdown[];
  amountRiskEnabled: boolean;
  amountRiskItems: OutcomeCoverageAmountRiskItem[];
}

const EMPTY_OUTCOMES: Record<LegalOutcomeType, number> = {
  supported: 0,
  partially_supported: 0,
  not_supported: 0,
  unclear: 0,
};

function percent(value: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((value / denominator) * 1000) / 10;
}

function claimTypeOf(claim: LaborInfoClaimItem): string {
  return claim.claimType?.trim() || claim.claimName?.trim() || '未分类诉求';
}

function claimNeedsReview(record: AnalysisCaseRecord, claim: LaborInfoClaimItem): boolean {
  return (record.outcomeDiagnostics || []).some((diagnostic) => (
    diagnostic.needsReview
    && ((diagnostic.claimId && diagnostic.claimId === claim.id)
      || (!diagnostic.claimId && diagnostic.claimType && claim.claimType && diagnostic.claimType === claim.claimType))
  ));
}

export function createOutcomeCoverageAudit(
  analysisRunId: string,
  records: AnalysisCaseRecord[],
): OutcomeCoverageAudit {
  const safeRecords = Array.isArray(records) ? records : [];
  const normalizedRecords = safeRecords.map((record) => {
    const repair = repairReliableAmountSupports(record.claims || [], record.parties || []);
    const repairedClaimIds = new Set(repair.repairedClaimIds);
    const preservedDiagnostics = (record.outcomeDiagnostics || []).filter((diagnostic) => (
      !(diagnostic.reasonCode === 'amount_conflict' && diagnostic.claimId && repairedClaimIds.has(diagnostic.claimId))
    ));
    const existingAmountConflictIds = new Set(
      preservedDiagnostics
        .filter((diagnostic) => diagnostic.reasonCode === 'amount_conflict' && diagnostic.claimId)
        .map((diagnostic) => diagnostic.claimId as string),
    );
    const amountConflictDiagnostics = repair.claims
      .filter((claim) => isPotentialAmountConflict(claim) && !!claim.id && !repairedClaimIds.has(claim.id) && !existingAmountConflictIds.has(claim.id))
      .map((claim) => ({
        target: 'claim' as const,
        claimId: claim.id,
        claimType: claim.claimType,
        outcome: claim.supportStatus,
        reasonCode: 'amount_conflict' as const,
        reasonMessage: '请求金额与判付金额冲突',
        evidence: {
          claimText: claim.sourceText,
          amountText: `请求金额：${claim.requestedAmount}；裁判金额：${claim.awardedAmount}`,
          diagnosticText: '金额对应关系不明，建议人工复核。',
        },
        needsReview: true,
        suggestedReviewType: 'manual_review' as const,
      }));
    return {
      ...record,
      claims: repair.claims,
      outcomeDiagnostics: [...preservedDiagnostics, ...amountConflictDiagnostics],
    };
  });
  const claims = normalizedRecords.flatMap((record) => Array.isArray(record.claims) ? record.claims : []);
  const reviewQueue = buildOutcomeReviewQueue(normalizedRecords);
  const byOutcome = { ...EMPTY_OUTCOMES };
  let needsReviewClaims = 0;

  for (const record of normalizedRecords) {
    for (const claim of (record.claims || [])) {
      if (claimNeedsReview(record, claim)) needsReviewClaims += 1;
      byOutcome[claim.supportStatus || 'unclear'] += 1;
    }
  }

  const reasonCounts = new Map<string, number>();
  for (const item of reviewQueue) {
    const reasonCode = item.reasonCode || 'unknown';
    reasonCounts.set(reasonCode, (reasonCounts.get(reasonCode) || 0) + 1);
  }
  const byReasonCode = [...reasonCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([reasonCode, count]) => ({
      reasonCode,
      label: outcomeReviewReasonLabels[reasonCode as keyof typeof outcomeReviewReasonLabels] || reasonCode,
      count,
      percent: percent(count, reviewQueue.length),
    }));

  const claimTypeMap = new Map<string, { total: number; needsReview: number; unresolved: number }>();
  for (const record of normalizedRecords) {
    for (const claim of (record.claims || [])) {
      const claimType = claimTypeOf(claim);
      const current = claimTypeMap.get(claimType) || { total: 0, needsReview: 0, unresolved: 0 };
      current.total += 1;
      if (claim.supportStatus === 'unclear') current.unresolved += 1;
      if (claimNeedsReview(record, claim)) current.needsReview += 1;
      claimTypeMap.set(claimType, current);
    }
  }
  const byClaimType = [...claimTypeMap.entries()]
    .map(([claimType, value]) => ({
      claimType,
      total: value.total,
      needsReview: value.needsReview,
      unclearRate: percent(value.unresolved, value.total),
    }))
    .sort((left, right) => right.needsReview - left.needsReview || right.total - left.total || left.claimType.localeCompare(right.claimType));

  const suggestionCounts = new Map<OutcomeReviewSuggestion, number>();
  for (const item of reviewQueue) {
    const suggestion = outcomeReviewSuggestionForDisplay(item);
    if (suggestion) suggestionCounts.set(suggestion, (suggestionCounts.get(suggestion) || 0) + 1);
  }
  const bySuggestedReviewType = [...suggestionCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([type, count]) => ({ type, count }));

  const amountRiskItems: OutcomeCoverageAmountRiskItem[] = [];
  let amountPairs = 0;
  for (const record of normalizedRecords) {
    for (const claim of (record.claims || [])) {
      if (!isMonetaryClaimType(claim.claimType) || claim.requestedAmount === undefined || claim.awardedAmount === undefined) continue;
      amountPairs += 1;
      if (claim.supportStatus === 'supported' && claim.awardedAmount > 0 && claim.awardedAmount < claim.requestedAmount) {
        amountRiskItems.push({
          caseId: record.caseId,
          claimId: claim.id,
          claimType: claimTypeOf(claim),
          claimName: claim.claimName,
          requestedAmount: claim.requestedAmount,
          awardedAmount: claim.awardedAmount,
        });
      }
    }
  }

  const unresolvedClaims = byOutcome.unclear;
  return {
    analysisRunId,
    totalCases: normalizedRecords.length,
    totalClaims: claims.length,
    resolvedClaims: claims.length - unresolvedClaims,
    unresolvedClaims,
    needsReviewItems: reviewQueue.length,
    needsReviewClaims,
    unclearRate: percent(unresolvedClaims, claims.length),
    needsReviewRate: percent(needsReviewClaims, claims.length),
    byOutcome,
    byReasonCode,
    byClaimType,
    bySuggestedReviewType,
    amountRiskEnabled: amountPairs > 0,
    amountRiskItems,
  };
}
