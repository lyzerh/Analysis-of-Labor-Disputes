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

  it('keeps unclear records out of formal analytics entirely', () => {
    const record = analysisRecord('analytics-unclear', 'unclear', {
      employerDefenses: [{ defenseType: '严重违纪', matchedText: '企业提出严重违纪抗辩', confidence: 1 }],
    });
    const report = DefenseStrategyAnalyzer.analyze([record]);
    const defense = report.defenseRanking.find((item) => item.defenseName === '严重违纪');

    expect(report.employerSupportedCaseCount).toBe(0);
    expect(report.employerNonSupportedCaseCount).toBe(0);
    expect(report.failedDefenses).toHaveLength(0);
    expect(defense).toBeUndefined();
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

  it('does not use a procedural-only claim as a substantive outcome fallback', () => {
    const record = analysisRecord('analytics-procedural-only', 'supported', {
      disputeType: ['程序性上诉请求'],
      claims: [{ claimType: 'procedural_appeal', claimName: '请求撤销原判', claimant: 'employee', supportStatus: 'supported' }],
    });
    const report = LaborDisputeAnalyticsEngine.generateReport([record]);
    expect(report.disputeTypes.some((item) => item.disputeType === '程序性上诉请求')).toBe(false);
  });

  it('exposes every matrix outcome bucket so the displayed denominator is auditable', () => {
    const defense = [{ defenseType: '严重违纪', matchedText: '企业提出严重违纪抗辩', confidence: 1 }];
    const records = [
      analysisRecord('matrix-supported', 'supported', {
        employerDefenses: defense,
        claims: [{ claimName: '违法解除', claimant: 'employee', supportStatus: 'not_supported' }],
      }),
      analysisRecord('matrix-not-supported', 'not_supported', {
        employerDefenses: defense,
        claims: [{ claimName: '违法解除', claimant: 'employee', supportStatus: 'supported' }],
      }),
    ];
    const cell = DefenseStrategyAnalyzer.analyze(records).matrix.cells['加班工资']?.['严重违纪'];
    expect(cell).toMatchObject({
      employerSupportedCount: 1,
      employerPartiallySupportedCount: 0,
      employerNotSupportedCount: 1,
      employerUnclearCount: 0,
      knownOutcomeDenominator: 2,
      employerSupportRate: 50,
    });
  });
});
