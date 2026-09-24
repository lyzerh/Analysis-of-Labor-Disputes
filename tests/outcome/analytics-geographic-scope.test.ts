import { describe, expect, it } from 'vitest';
import { LaborDisputeAnalyticsEngine } from '../../src/services/analytics/LaborDisputeAnalyticsEngine';
import { analysisRecord } from './helpers/record-factories';

describe('Analytics geographic scope alignment', () => {
  it('renders the complete Pearl River Delta boundary, including zero-sample cities', () => {
    const report = LaborDisputeAnalyticsEngine.generateReport(
      [analysisRecord('foshan-1', 'supported', { city: '佛山市' })],
      {},
      { mode: 'pearl_river_delta' },
    );

    expect(report.targetCities.map((item) => item.city)).toEqual([
      '广州', '深圳', '珠海', '佛山', '惠州', '东莞', '中山', '江门', '肇庆',
    ]);
    const emptyCity = report.targetCities.find((item) => item.city === '广州');
    expect(emptyCity).toMatchObject({ caseCount: 0, caseIds: [] });
    expect(emptyCity?.employerWinRate).toBeNull();
    expect(emptyCity?.employeeWinRate).toBeNull();
    expect(report.targetCities.find((item) => item.city === '佛山')?.caseCount).toBe(1);
  });

  it('shows only frozen custom cities and normalizes 市 suffixes', () => {
    const report = LaborDisputeAnalyticsEngine.generateReport(
      [
        analysisRecord('foshan-1', 'supported', { city: '佛山市' }),
        analysisRecord('guangzhou-1', 'not_supported', { city: '广州市' }),
      ],
      {},
      { mode: 'custom_cities', cities: ['佛山市', '深圳'] },
    );

    expect(report.targetCities.map((item) => item.city)).toEqual(['佛山', '深圳']);
    expect(report.targetCities.find((item) => item.city === '佛山')?.caseCount).toBe(1);
    expect(report.targetCities.find((item) => item.city === '深圳')?.caseCount).toBe(0);
  });

  it('uses actual AnalysisRun input cities for province and all scopes', () => {
    const records = [
      analysisRecord('meizhou-1', 'supported', { city: '梅州市' }),
      analysisRecord('guangzhou-1', 'not_supported', { city: '广州市' }),
    ];

    const provinceReport = LaborDisputeAnalyticsEngine.generateReport(
      records,
      {},
      { mode: 'province', provinces: ['广东省'] },
    );
    const allReport = LaborDisputeAnalyticsEngine.generateReport(records, {}, { mode: 'all' });

    expect(provinceReport.targetCities.map((item) => item.city)).toEqual(['广州', '梅州']);
    expect(allReport.targetCities.map((item) => item.city)).toEqual(['广州', '梅州']);
  });

  it('treats a legacy AnalysisRun without geographicScope as all actual input cities', () => {
    const report = LaborDisputeAnalyticsEngine.generateReport([
      analysisRecord('zhuhai-1', 'supported', { city: '珠海市' }),
    ]);

    expect(report.targetCities).toHaveLength(1);
    expect(report.targetCities[0].city).toBe('珠海');
  });

  it('never adds cases outside the current AnalysisRun input', () => {
    const report = LaborDisputeAnalyticsEngine.generateReport(
      [analysisRecord('current-foshan', 'supported', { city: '佛山' })],
      {},
      { mode: 'all' },
    );

    expect(report.targetCities).toEqual([
      expect.objectContaining({ city: '佛山', caseCount: 1, caseIds: ['current-foshan'] }),
    ]);
  });
});
