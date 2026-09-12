import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  getOutcomePresentation,
  getPartyOutcomePresentations,
} from '../../src/services/outcome/OutcomePresentation';
import type { LegalOutcomeType } from '../../src/types';

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
