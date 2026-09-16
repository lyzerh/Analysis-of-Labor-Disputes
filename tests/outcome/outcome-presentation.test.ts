import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  getCaseEntityOutcomeLabel,
  getClaimOwnershipPresentation,
  getOutcomePresentation,
  getPartyOutcomePresentations,
} from '../../src/services/outcome/OutcomePresentation';
import { createCaseSummaryPresentation } from '../../src/services/presentation/CaseMetadataPresentation';
import type { AnalysisCaseRecord, LaborInfoClaimItem, LegalOutcomeType } from '../../src/types';

function record(overrides: Partial<AnalysisCaseRecord> = {}): Pick<AnalysisCaseRecord, 'parties' | 'applicantRole'> {
  return {
    applicantRole: 'employer',
    parties: [
      { id: 'employer', name: '甲有限公司', laborRole: 'employer', proceduralRoles: ['plaintiff'] },
      { id: 'employee', name: '张某', laborRole: 'employee', proceduralRoles: ['defendant'] },
    ],
    ...overrides,
  };
}

function claim(overrides: Partial<LaborInfoClaimItem> = {}): LaborInfoClaimItem {
  return {
    claimName: '经济补偿金',
    claimant: 'unknown',
    supportStatus: 'unclear',
    ...overrides,
  };
}

describe('UI Outcome presentation contract', () => {
  it.each([
    ['supported', '支持', 'positive'],
    ['partially_supported', '部分支持', 'partial'],
    ['not_supported', '不支持', 'negative'],
    ['unclear', '无法确定', 'unclear'],
  ] as const)('presents %s explicitly', (outcome, label, category) => {
    expect(getOutcomePresentation(outcome)).toEqual(expect.objectContaining({
      outcome,
      label,
      category,
    }));
  });

  it.each(['employee', 'employer', 'applicant'] as const)('reads the %s perspective directly', (perspective) => {
    const outcomes: Record<typeof perspective, LegalOutcomeType> & {
      employee: LegalOutcomeType;
      employer: LegalOutcomeType;
      applicant: LegalOutcomeType;
    } = {
      employee: 'supported',
      employer: 'partially_supported',
      applicant: 'not_supported',
    };
    expect(getPartyOutcomePresentations({
      employeeOutcome: outcomes.employee,
      employerOutcome: outcomes.employer,
      applicantOutcome: outcomes.applicant,
    })[perspective].outcome).toBe(outcomes[perspective]);
  });

  it('keeps all three perspectives correct when the employer is the applicant and loses', () => {
    const presentations = getPartyOutcomePresentations({
      employeeOutcome: 'supported',
      employerOutcome: 'not_supported',
      applicantOutcome: 'not_supported',
    });
    expect({
      employee: presentations.employee.label,
      employer: presentations.employer.label,
      applicant: presentations.applicant.label,
    }).toEqual({ employee: '支持', employer: '不支持', applicant: '不支持' });
  });

  it('requires both formal views to use the shared contract without overallResult', () => {
    for (const file of ['LaborAnalysisCaseLibrary.tsx', 'CaseAnalysisView.tsx']) {
      const source = readFileSync(new URL(`../../src/components/${file}`, import.meta.url), 'utf8');
      expect(source).toContain('getPartyOutcomePresentations');
      expect(source).toContain('getOutcomePresentation');
      expect(source).not.toMatch(/\.overallResult\b/);
    }
  });
});

describe('Claim ownership presentation contract', () => {
  it('shows claimant and substantive beneficiary independently for an employee payment claim', () => {
    const presentation = getClaimOwnershipPresentation(claim({
      claimant: 'employee',
      claimantRole: 'employee',
      judgmentItems: [{ action: 'pay', targetPartyRole: 'plaintiff', sourceText: '被告支付原告经济补偿金' }],
    }), record({ applicantRole: 'employee', parties: [
      { id: 'employee', name: '张某', laborRole: 'employee', proceduralRoles: ['plaintiff'] },
      { id: 'employer', name: '甲有限公司', laborRole: 'employer', proceduralRoles: ['defendant'] },
    ] }));

    expect(presentation).toMatchObject({
      claimantRole: 'employee',
      claimantLabel: '劳动者',
      beneficiaryRole: 'employee',
      beneficiaryLabel: '劳动者',
    });
  });

  it('shows an employer negative-payment claim with employee associated rights', () => {
    const presentation = getClaimOwnershipPresentation(claim({
      claimName: '请求不支付经济补偿金',
      claimant: 'employer',
      claimantRole: 'employer',
      sourceText: '原告请求确认无需支付经济补偿金。',
      judgmentItems: [{ action: 'reject', targetPartyRole: 'plaintiff', sourceText: '驳回原告全部诉讼请求' }],
    }), record());

    expect(presentation).toMatchObject({
      claimantRole: 'employer',
      claimantLabel: '用人单位',
      relatedRole: 'employee',
      relatedLabel: '劳动者',
    });
    expect(presentation.beneficiaryRole).toBeUndefined();
  });

  it('does not guess unknown ownership', () => {
    const presentation = getClaimOwnershipPresentation(claim(), record({ applicantRole: 'unknown', parties: [] }));

    expect(presentation).toMatchObject({ claimantRole: 'unknown', claimantLabel: '未识别' });
    expect(presentation.beneficiaryRole).toBeUndefined();
    expect(presentation.relatedRole).toBeUndefined();
  });
});

describe('Case detail information hierarchy contract', () => {
  it('builds a compact summary from reliable case fields', () => {
    expect(createCaseSummaryPresentation({
      employeeParty: '张某',
      employerParty: '甲有限公司',
      caseLevel: '一审',
      disputeType: ['劳动合同解除'],
      claims: [{ claimName: '经济补偿金', claimant: 'employee', supportStatus: 'supported' }],
      outcomeDiagnostics: [{ target: 'employee', outcome: 'unclear', needsReview: true }],
      employerDefenses: [{ defenseType: '合法解除', matchedText: '员工手册', confidence: 1 }],
    })).toEqual({
      primary: '本案：劳动者 张某｜用人单位 甲有限公司｜一审/初裁｜劳动合同解除',
      secondary: '识别结果：1 项诉求｜1 项待复核｜已识别 1 项企业抗辩',
    });
  });

  it('omits unavailable summary fields instead of guessing', () => {
    expect(createCaseSummaryPresentation({
      employeeParty: null,
      employerParty: '未识别',
      caseLevel: 'unknown',
      disputeType: [],
      claims: [],
      outcomeDiagnostics: [],
      employerDefenses: [],
    })).toEqual({});
  });

  it('uses 待复核 only for unclear entity outcomes', () => {
    expect(getCaseEntityOutcomeLabel('unclear')).toBe('待复核');
    expect(getCaseEntityOutcomeLabel('supported')).toBe('支持');
  });
});
