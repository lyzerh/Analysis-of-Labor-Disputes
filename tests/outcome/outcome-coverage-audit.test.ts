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

  it('does not count a reliably repairable lower award as unresolved amount risk', () => {
    const records = [analysisRecord('case-repaired-amount', 'supported', {
      parties: [
        { id: 'employee-party', name: '张某', laborRole: 'employee', proceduralRoles: ['plaintiff'] },
        { id: 'employer-party', name: '甲有限公司', laborRole: 'employer', proceduralRoles: ['defendant'] },
      ],
      claims: [{
        id: 'repaired-amount', claimName: '加班工资', claimType: 'overtime_pay', claimant: 'employee', claimantRole: 'employee', claimantPartyId: 'employee-party',
        supportStatus: 'supported', requestedAmount: 3494.10, awardedAmount: 1341.38, sourceText: '原告请求支付加班工资3494.10元',
        judgmentItems: [{ action: 'pay', targetPartyRole: 'plaintiff', targetClaimType: 'overtime_pay', awardedAmount: 1341.38, sourceText: '被告支付原告加班工资1341.38元' }],
      }],
      outcomeDiagnostics: [{ claimId: 'repaired-amount', claimType: 'overtime_pay', outcome: 'supported', reasonCode: 'amount_conflict', needsReview: true }],
    })];
    const before = JSON.stringify(records);
    const audit = createOutcomeCoverageAudit('analysis-run-repaired-amount', records);

    expect(audit.byOutcome).toMatchObject({ supported: 0, partially_supported: 1 });
    expect(audit.amountRiskItems).toHaveLength(0);
    expect(audit.needsReviewItems).toBe(0);
    expect(JSON.stringify(records)).toBe(before);
  });

  it('keeps ambiguous and employer negative-payment amounts as review risks', () => {
    const parties = [
      { id: 'employee-party', name: '张某', laborRole: 'employee' as const, proceduralRoles: ['defendant' as const] },
      { id: 'employer-party', name: '甲有限公司', laborRole: 'employer' as const, proceduralRoles: ['plaintiff' as const] },
    ];
    const records = [analysisRecord('case-ambiguous-amount', 'supported', {
      parties,
      claims: [{
        id: 'ambiguous-amount', claimName: '经济补偿金', claimType: 'economic_compensation', claimant: 'employee', claimantRole: 'employee', claimantPartyId: 'employee-party',
        supportStatus: 'supported', requestedAmount: 3494.10, awardedAmount: 1341.38, sourceText: '原告请求经济补偿金3494.10元',
        judgmentItems: [
          { action: 'pay', targetPartyRole: 'defendant', awardedAmount: 1341.38, sourceText: '支付经济补偿金1341.38元' },
          { action: 'pay', targetPartyRole: 'defendant', awardedAmount: 900, sourceText: '另行支付经济补偿金900元' },
        ],
      }],
    }), analysisRecord('case-employer-negative-payment', 'supported', {
      parties,
      claims: [{
        id: 'employer-negative-payment', claimName: '经济补偿金', claimType: 'economic_compensation', claimant: 'employer', claimantRole: 'employer', claimantPartyId: 'employer-party',
        supportStatus: 'supported', requestedAmount: 34970.12, awardedAmount: 1341.38, sourceText: '原告公司请求无需支付经济补偿金34970.12元',
        judgmentItems: [{ action: 'pay', targetPartyRole: 'defendant', awardedAmount: 1341.38, sourceText: '判令原告向被告支付经济补偿金1341.38元' }],
      }],
    })];
    const audit = createOutcomeCoverageAudit('analysis-run-ambiguous-amount', records);

    expect(audit.amountRiskItems).toHaveLength(2);
    expect(audit.needsReviewItems).toBe(2);
    expect(audit.byReasonCode[0]).toMatchObject({ reasonCode: 'amount_conflict', count: 2 });
  });

  it('does not enable amount risk for non-monetary confirmation claims', () => {
    const records = [analysisRecord('case-confirmation-amount', 'supported', {
      claims: [{
        id: 'confirmation-amount', claimName: '劳动关系解除确认', claimType: 'employment_termination_confirmation', claimant: 'employee',
        supportStatus: 'supported', requestedAmount: 3000, awardedAmount: 1000,
      }],
    })];
    const audit = createOutcomeCoverageAudit('analysis-run-confirmation-amount', records);
    expect(audit.amountRiskEnabled).toBe(false);
    expect(audit.amountRiskItems).toHaveLength(0);
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
