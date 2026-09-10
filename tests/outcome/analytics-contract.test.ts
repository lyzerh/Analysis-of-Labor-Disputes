import { describe, expect, it } from 'vitest';
import { DefenseStrategyAnalyzer } from '../../src/services/analytics/DefenseStrategyAnalyzer';
import { LaborDisputeAnalyticsEngine } from '../../src/services/analytics/LaborDisputeAnalyticsEngine';
import { analysisRecord } from './helpers/record-factories';

describe('Layer 3: Analytics outcome contracts', () => {
  it('uses record.employerOutcome=supported in city employer statistics', () => {
    const report = LaborDisputeAnalyticsEngine.generateReport([
      analysisRecord('city-employer-supported', 'supported'),
    ]);
    const shenzhen = report.targetCities.find((item) => item.city === '深圳');
    expect(shenzhen?.employerOutcome.supported).toBe(1);
    expect(shenzhen?.employerOutcome.not_supported).toBe(0);
  });

  it('does not override record.employerOutcome with an inverted employee claim', () => {
    const record = analysisRecord('analytics-no-reinterpret', 'not_supported', {
      disputeType: ['加班工资'],
      claims: [{ claimName: '加班工资', claimant: 'employee', supportStatus: 'not_supported' }],
    });
    const report = LaborDisputeAnalyticsEngine.generateReport([record]);
    const overtime = report.disputeTypes.find((item) => item.disputeType === '加班工资');
    expect(overtime?.employerOutcome.not_supported).toBe(1);
    expect(overtime?.employerOutcome.supported).toBe(0);
  });

  it('keeps unclear records out of supported, not-supported and failure buckets', () => {
    const record = analysisRecord('analytics-unclear', 'unclear', {
      employerDefenses: [{ defenseType: '严重违纪', matchedText: '企业提出严重违纪抗辩', confidence: 1 }],
    });
    const report = DefenseStrategyAnalyzer.analyze([record]);
    const defense = report.defenseRanking.find((item) => item.defenseName === '严重违纪');

    expect(report.employerSupportedCaseCount).toBe(0);
    expect(report.employerNonSupportedCaseCount).toBe(0);
    expect(report.failedDefenses).toHaveLength(0);
    expect(defense?.unclearCount).toBe(1);
    expect(defense?.supportedCount).toBe(0);
    expect(defense?.notSupportedCount).toBe(0);
  });

  it('uses claim.claimant before mapping a claim outcome to a party', () => {
    const record = analysisRecord('analytics-employer-claim', 'supported', {
      disputeType: ['加班工资'],
      claims: [{ claimName: '加班工资', claimant: 'employer', supportStatus: 'supported' }],
    });
    const report = LaborDisputeAnalyticsEngine.generateReport([record]);
    const overtime = report.disputeTypes.find((item) => item.disputeType === '加班工资');
    expect(overtime?.employerOutcome.supported).toBe(1);
    expect(overtime?.employerOutcome.not_supported).toBe(0);
  });
});
