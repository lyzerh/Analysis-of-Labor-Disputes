import { describe, expect, it } from 'vitest';
import { createOutcomeCoverageAudit } from '../../src/services/outcome/OutcomeCoverageAudit';
import { outcomeReviewReasonLabels, outcomeReviewSuggestionLabels } from '../../src/services/outcome/OutcomeReviewQueue';
import { analysisRecord } from './helpers/record-factories';

describe('Outcome coverage audit contract', () => {
  it('counts claims, resolved outcomes, review items, reasons, claim types, and suggestions', () => {
    const records = [
      analysisRecord('case-a', 'supported', {
        claims: [
          { id: 'a1', claimName: '经济补偿金', claimType: 'economic_compensation', claimant: 'employee', supportStatus: 'supported' },
          { id: 'a2', claimName: '未签劳动合同二倍工资', claimType: 'double_wage', claimant: 'employee', supportStatus: 'unclear' },
        ],
        outcomeDiagnostics: [{
          claimId: 'a2', claimType: 'double_wage', outcome: 'unclear', reasonCode: 'payment_beneficiary_unclear', needsReview: true, suggestedReviewType: 'manual_review',
        }],
      }),
      analysisRecord('case-b', 'not_supported', {
        claims: [{ id: 'b1', claimName: '经济补偿金', claimType: 'economic_compensation', claimant: 'employer', supportStatus: 'partially_supported' }],
        outcomeDiagnostics: [{
          claimId: 'b1', claimType: 'economic_compensation', outcome: 'partially_supported', reasonCode: 'amount_conflict', needsReview: true,
        }],
      }),
    ];

    const audit = createOutcomeCoverageAudit('analysis-run-a', records);
    expect(audit).toMatchObject({
      analysisRunId: 'analysis-run-a',
      totalCases: 2,
      totalClaims: 3,
      resolvedClaims: 2,
      unresolvedClaims: 1,
      needsReviewItems: 2,
      needsReviewClaims: 2,
      unclearRate: 33.3,
      needsReviewRate: 66.7,
      byOutcome: { supported: 1, partially_supported: 1, not_supported: 0, unclear: 1 },
    });
    expect(audit.byReasonCode[0]).toMatchObject({ reasonCode: 'amount_conflict', label: outcomeReviewReasonLabels.amount_conflict, count: 1, percent: 50 });
    expect(audit.byClaimType).toEqual([
      { claimType: 'economic_compensation', total: 2, needsReview: 1, unclearRate: 0 },
      { claimType: 'double_wage', total: 1, needsReview: 1, unclearRate: 100 },
    ]);
    expect(audit.bySuggestedReviewType).toEqual([
      { type: 'manual_review', count: 2 },
    ]);
    expect(outcomeReviewSuggestionLabels.manual_review).toBe('建议人工复核');
  });

  it('detects supported claims with lower awarded amounts as amount risk without changing claims', () => {
    const records = [analysisRecord('case-amount', 'supported', {
      claims: [{
        id: 'amount-1', claimName: '经济补偿金', claimType: 'economic_compensation', claimant: 'employee', supportStatus: 'supported', requestedAmount: 10000, awardedAmount: 6000,
      }],
    })];
    const before = JSON.stringify(records);
    const audit = createOutcomeCoverageAudit('analysis-run-amount', records);
    expect(audit.amountRiskEnabled).toBe(true);
    expect(audit.amountRiskItems).toHaveLength(1);
    expect(JSON.stringify(records)).toBe(before);
  });

  it('returns a safe empty audit for an empty current AnalysisRun scope', () => {
    expect(createOutcomeCoverageAudit('analysis-run-empty', [])).toMatchObject({
      analysisRunId: 'analysis-run-empty',
      totalCases: 0,
      totalClaims: 0,
      resolvedClaims: 0,
      unresolvedClaims: 0,
      needsReviewItems: 0,
      needsReviewClaims: 0,
      unclearRate: 0,
      needsReviewRate: 0,
      byReasonCode: [],
      byClaimType: [],
      bySuggestedReviewType: [],
      amountRiskEnabled: false,
      amountRiskItems: [],
    });
  });
});
