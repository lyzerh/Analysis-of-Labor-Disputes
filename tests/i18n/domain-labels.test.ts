import { describe, expect, it } from 'vitest';
import i18next from 'i18next';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resources } from '../../src/i18n/locales';
import {
  getCaseLevelLabel,
  getClaimTypeLabel,
  getDefenseTypeLabel,
  getDisputeTypeLabel,
  getEvidenceTypeLabel,
  getOutcomeLabel,
  getReviewStatusLabel,
  getWorkflowStatusLabel,
} from '../../src/services/presentation/domainLabels';
import { filterAnalysisCaseRecords } from '../../src/services/case/CaseLibraryFilter';
import { LaborDisputeAnalyticsEngine } from '../../src/services/analytics/LaborDisputeAnalyticsEngine';
import { analysisRecord } from '../outcome/helpers/record-factories';
import { createCaseSummaryPresentation } from '../../src/services/presentation/CaseMetadataPresentation';

const zhInstance = i18next.createInstance();
const enInstance = i18next.createInstance();
const tZh = zhInstance.init({ resources, lng: 'zh-CN' }).then(() => zhInstance.getFixedT('zh-CN'));
const tEn = enInstance.init({ resources, lng: 'en' }).then(() => enInstance.getFixedT('en'));

describe('display-only domain taxonomy', () => {
  it('localizes exact employer-defense matrix headers without changing their business values', async () => {
    const zh = await tZh;
    const en = await tEn;
    const labels: Record<string, string> = {
      '擅自离岗': 'Unauthorized Absence from Work',
      '协商一致解除': 'Mutual Agreement to Terminate Employment',
      '已足额支付报酬': 'Remuneration Paid in Full',
      '不存在加班事实': 'No Overtime Work Occurred',
      '劳动者单方辞职': 'Employee Resignation',
      '未提供劳动': 'No Labor Provided',
    };
    for (const [rawValue, english] of Object.entries(labels)) {
      expect(getDefenseTypeLabel(rawValue, zh)).toBe(rawValue);
      expect(getDefenseTypeLabel(rawValue, en)).toBe(english);
    }
    expect(getDefenseTypeLabel('未知抗辩值', en)).toBe('未知抗辩值');
    const matrixSource = readFileSync(resolve(process.cwd(), 'src/components/DefenseStrategyAnalysis.tsx'), 'utf8');
    expect(matrixSource).toContain('const label = getDefenseTypeLabel(def, t)');
    expect(matrixSource).toContain('title={label}>{label}');
    expect(matrixSource).toContain('title={getDisputeTypeLabel(dt, t)}');
    expect(matrixSource).toContain('report.matrix.cells[dt]?.[def]');
    expect(matrixSource).toContain('overflow-x-auto');
  });

  it('keeps evidence ranking counts and drilldown IDs unchanged by the card layout', () => {
    const evidenceSource = readFileSync(resolve(process.cwd(), 'src/components/LaborAnalyticsTest.tsx'), 'utf8');
    expect(evidenceSource).toContain("t('research.ui.totalAppearance', { count: ev.frequency })");
    expect(evidenceSource).toContain("t('research.ui.caseWithCount', { count: ev.caseCount })");
    expect(evidenceSource).toContain("t('research.ui.caseWithCount', { count: ev.appearanceInEmployerSupportedCount })");
    expect(evidenceSource).toContain('ev.caseIds');
    expect(evidenceSource).toContain('ev.appearanceInEmployerSupportedCaseIds');
  });

  it('localizes known machine values and exact Chinese business values', async () => {
    const zh = await tZh;
    const en = await tEn;
    expect(getClaimTypeLabel('overtime_pay', zh)).toBe('加班工资');
    expect(getClaimTypeLabel('overtime_pay', en)).toBe('Overtime Pay');
    expect(getOutcomeLabel('partially_supported', zh)).toBe('部分支持');
    expect(getOutcomeLabel('partially_supported', en)).toBe('Partially Supported');
    expect(getReviewStatusLabel('approved', en)).toBe('Approved');
    expect(getWorkflowStatusLabel('technical_failure', en)).toBe('Technical Failure');
    expect(getDefenseTypeLabel('严重违纪 / 违反规章制度', zh)).toBe('严重违纪 / 违反规章制度');
    expect(getDefenseTypeLabel('严重违纪 / 违反规章制度', en)).toBe('Serious Misconduct / Breach of Workplace Rules');
    expect(getEvidenceTypeLabel('考勤记录/打卡数据', zh)).toBe('考勤记录/打卡数据');
    expect(getEvidenceTypeLabel('考勤记录/打卡数据', en)).toBe('Attendance Records / Clock-in Data');
    expect(getDisputeTypeLabel('加班工资', en)).toBe('Overtime Pay');
    expect(getCaseLevelLabel('一审', zh)).toBe('一审');
    expect(getCaseLevelLabel('一审', en)).toBe('First Instance');
    expect(getCaseLevelLabel('first', zh)).toBe('一审');
    expect(getCaseLevelLabel('first', en)).toBe('First Instance');
  });

  it('does not guess, shorten source language, or reinterpret arbitration as first instance', async () => {
    const en = await tEn;
    expect(getDisputeTypeLabel('2021年3月至8月延时加班工资', en)).toBe('2021年3月至8月延时加班工资');
    expect(getClaimTypeLabel('new_claim_type', en)).toBe('new_claim_type');
    expect(getDefenseTypeLabel('未收录抗辩', en)).toBe('未收录抗辩');
    expect(getEvidenceTypeLabel('某一具体证据原文', en)).toBe('某一具体证据原文');
    expect(getCaseLevelLabel('仲裁', en)).toBe('仲裁');
  });

  it('keeps filter values, records, and analytics inputs and numbers unchanged across languages', async () => {
    const zh = await tZh;
    const en = await tEn;
    const record = analysisRecord('domain-label-test', 'supported', {
      caseLevel: '一审',
      disputeType: ['加班工资'],
      employerDefenses: [{ defenseType: '严重违纪', matchedText: '原文', confidence: 1 }],
      evidence: [{ name: '考勤记录', matchedText: '原文', confidence: 1 }],
      claims: [{ claimName: '加班工资', claimant: 'employee', supportStatus: 'supported' }],
    });
    const before = structuredClone(record);
    const selectedFilterValue = record.disputeType[0];
    const baseline = LaborDisputeAnalyticsEngine.generateReport([record]);
    expect(getDisputeTypeLabel(selectedFilterValue, zh)).toBe('加班工资');
    expect(getDisputeTypeLabel(selectedFilterValue, en)).toBe('Overtime Pay');
    expect(filterAnalysisCaseRecords([record], { dispute: selectedFilterValue })).toHaveLength(1);
    expect(createCaseSummaryPresentation(record, en).primary).toContain('Overtime Pay');
    expect(selectedFilterValue).toBe('加班工资');
    expect(record).toEqual(before);
    const after = LaborDisputeAnalyticsEngine.generateReport([record]);
    expect(after.overall).toEqual(baseline.overall);
    expect(after.disputeTypes.map(({ disputeType, caseCount, employeeOutcome, employerOutcome }) => ({ disputeType, caseCount, employeeOutcome, employerOutcome })))
      .toEqual(baseline.disputeTypes.map(({ disputeType, caseCount, employeeOutcome, employerOutcome }) => ({ disputeType, caseCount, employeeOutcome, employerOutcome })));
  });
});
