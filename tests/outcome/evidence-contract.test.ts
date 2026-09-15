import { afterEach, describe, expect, it, vi } from 'vitest';
import { LaborInfoParserAdapter } from '../../src/services/parser/LaborInfoParserAdapter';
import { LaborCaseDatasetBuilder } from '../../src/services/dataset/LaborCaseDatasetBuilder';
import { ParserEvaluator } from '../../src/services/parser/ParserEvaluator';
import { LaborDisputeAnalyticsEngine } from '../../src/services/analytics/LaborDisputeAnalyticsEngine';
import { DefenseStrategyAnalyzer } from '../../src/services/analytics/DefenseStrategyAnalyzer';
import {
  evidenceProviderLabel,
  isEmployerProvidedEvidence,
  normalizeEvidenceProvider,
} from '../../src/services/evidence/EvidenceProvider';
import { rawDocument } from './fixtures/outcome-fixtures';
import { analysisRecord, parsedResult } from './helpers/record-factories';

describe('Evidence provider contract', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    {
      name: 'employee provides evidence as plaintiff',
      text: '原告：张某。被告：甲有限公司。原告张某提交劳动合同作为证据。',
      evidenceName: '劳动合同/协议',
      provider: 'employee',
    },
    {
      name: 'employer provides evidence as defendant',
      text: '原告：张某。被告：甲有限公司。被告甲有限公司提交考勤记录作为证据。',
      evidenceName: '考勤记录/打卡数据',
      provider: 'employer',
    },
    {
      name: 'court obtains evidence',
      text: '原告：张某。被告：甲有限公司。法院依法调取劳动合同作为证据。',
      evidenceName: '劳动合同/协议',
      provider: 'court',
    },
    {
      name: 'third party provides evidence',
      text: '原告：张某。被告：甲有限公司。第三方银行向法院提供银行流水材料。',
      evidenceName: '工资支付/银行流水',
      provider: 'third_party',
    },
    {
      name: 'ambiguous evidence remains unknown',
      text: '原告：张某。被告：甲有限公司。劳动合同、银行流水作为证据。',
      evidenceName: '劳动合同/协议',
      provider: 'unknown',
    },
  ])('$name', ({ text, evidenceName, provider }) => {
    const parsed = LaborInfoParserAdapter.parseDetailed(rawDocument(`provider-${provider}`, text));
    expect(parsed.evidence.find((item) => item.name === evidenceName)?.provider).toBe(provider);
  });

  it('does not mechanically equate plaintiff with employee', () => {
    const text = '原告：甲有限公司。被告：张某。原告甲有限公司提交工资表作为证据。';
    const parsed = LaborInfoParserAdapter.parseDetailed(rawDocument('employer-plaintiff-evidence', text));
    expect(parsed.evidence.find((item) => item.name === '工资支付/银行流水')?.provider).toBe('employer');
  });

  it('attributes an explicitly named natural-person party when generic prose confuses employee recognition', () => {
    const text = '为此，廖某提交了工作证、银行流水、在职证明等证据。';
    const evidence = LaborInfoParserAdapter.extractEvidence(text, { facts: text }, {
      employeeParty: '为其成员',
      employerParty: '甲有限公司',
      applicantRole: 'unknown',
      confidence: 0.5,
      parties: [
        { id: 'party_1', name: '廖某', laborRole: 'unknown', proceduralRoles: ['plaintiff'] },
        { id: 'party_2', name: '甲有限公司', laborRole: 'employer', proceduralRoles: ['defendant'] },
      ],
    });
    expect(evidence.find((item) => item.name === '工资支付/银行流水')?.provider).toBe('employee');
  });

  it('does not treat a negated non-evidence use of 提供 as evidence provenance', () => {
    const text = '原告：张某。被告：甲有限公司。原告称被告未提供劳动条件，双方曾签订劳动合同。';
    const parsed = LaborInfoParserAdapter.parseDetailed(rawDocument('negated-provider', text));
    expect(parsed.evidence.find((item) => item.name === '劳动合同/协议')?.provider).toBe('unknown');
  });

  it('preserves parser provider through the dataset builder', () => {
    const result = parsedResult({
      evidence: [{ name: '考勤记录/打卡数据', matchedText: '被告公司提交考勤记录', provider: 'employer', confidence: 1 }],
    });
    vi.spyOn(LaborInfoParserAdapter, 'parseDetailed').mockReturnValue(result);
    vi.spyOn(ParserEvaluator, 'evaluate').mockReturnValue({ completenessScore: 100 } as ReturnType<typeof ParserEvaluator.evaluate>);

    const record = LaborCaseDatasetBuilder.buildSingleRecord(rawDocument('builder-evidence-provider', '测试文本'), null);
    expect(record.evidence[0].provider).toBe('employer');
  });

  it('treats missing and non-canonical provider values as unknown, never court', () => {
    expect(normalizeEvidenceProvider(undefined)).toBe('unknown');
    expect(normalizeEvidenceProvider('legacy-provider')).toBe('unknown');
    expect(evidenceProviderLabel(undefined)).toBe('来源未识别');
    expect(isEmployerProvidedEvidence({ name: '证据', matchedText: '证据', confidence: 1 })).toBe(false);
  });

  it('defines prevalence as evidence among employer-supported cases', () => {
    const evidenceA = { name: '证据A', matchedText: '企业提交证据A', provider: 'employer' as const, confidence: 1 };
    const evidenceB = { name: '证据B', matchedText: '企业提交证据B', provider: 'employer' as const, confidence: 1 };
    const records = [
      analysisRecord('supported-a', 'supported', { evidence: [evidenceA] }),
      analysisRecord('not-supported-a', 'not_supported', { evidence: [evidenceA, evidenceB] }),
      analysisRecord('not-supported-a-2', 'not_supported', { evidence: [evidenceA, evidenceB] }),
      analysisRecord('partial-a', 'partially_supported', { evidence: [evidenceA] }),
    ];

    const report = LaborDisputeAnalyticsEngine.generateReport(records);
    const itemA = report.evidenceRanking.find((item) => item.evidenceName === '证据A');
    const itemB = report.evidenceRanking.find((item) => item.evidenceName === '证据B');

    expect(itemA).toMatchObject({
      appearanceInEmployerSupportedCount: 1,
      employerSupportedDenominator: 1,
      rateInEmployerSupported: 100,
    });
    expect(itemB).toMatchObject({
      appearanceInEmployerSupportedCount: 0,
      employerSupportedDenominator: 1,
      rateInEmployerSupported: 0,
    });
  });

  it('excludes employee, court, third-party, and unknown evidence from Labor analytics', () => {
    const report = LaborDisputeAnalyticsEngine.generateReport([
      analysisRecord('provider-scope', 'supported', {
        evidence: [
          { name: '企业证据', matchedText: '企业提交', provider: 'employer', confidence: 1 },
          { name: '员工证据', matchedText: '员工提交', provider: 'employee', confidence: 1 },
          { name: '法院证据', matchedText: '法院调取', provider: 'court', confidence: 1 },
          { name: '第三方证据', matchedText: '银行提供', provider: 'third_party', confidence: 1 },
          { name: '未知证据', matchedText: '来源不明', confidence: 1 },
        ],
      }),
    ]);

    expect(report.evidenceRanking.map((item) => item.evidenceName)).toEqual(['企业证据']);
    expect(report.evidenceRanking.map((item) => item.evidenceName)).not.toEqual(
      expect.arrayContaining(['员工证据', '法院证据', '第三方证据', '未知证据']),
    );
  });

  it('uses the same employer-only provider scope in Defense analytics', () => {
    const report = DefenseStrategyAnalyzer.analyze([
      analysisRecord('defense-supported', 'supported', {
        evidence: [
          { name: '企业证据', matchedText: '企业提交', provider: 'employer', confidence: 1 },
          { name: '员工证据', matchedText: '员工提交', provider: 'employee', confidence: 1 },
          { name: '法院证据', matchedText: '法院调取', provider: 'court', confidence: 1 },
          { name: '未知证据', matchedText: '来源不明', provider: 'unknown', confidence: 1 },
        ],
      }),
    ]);

    expect(report.evidenceSingleRanking.map((item) => item.evidenceName)).toEqual(['企业证据']);
    expect(report.evidenceSingleRanking[0]).toMatchObject({
      appearanceInEmployerSupportedCount: 1,
      employerSupportedDenominator: 1,
      rateInEmployerSupported: 100,
    });
  });
});
