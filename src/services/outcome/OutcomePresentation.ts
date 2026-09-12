import type { AnalysisCaseRecord, LegalOutcomeType } from '../../types';

export type OutcomePresentationCategory = 'positive' | 'partial' | 'negative' | 'unclear';

export interface OutcomePresentation {
  outcome: LegalOutcomeType;
  label: string;
  category: OutcomePresentationCategory;
  textClassName: string;
  badgeClassName: string;
}

const PRESENTATIONS: Record<LegalOutcomeType, OutcomePresentation> = {
  supported: {
    outcome: 'supported',
    label: '支持',
    category: 'positive',
    textClassName: 'text-emerald-700',
    badgeClassName: 'bg-emerald-100 text-emerald-700',
  },
  partially_supported: {
    outcome: 'partially_supported',
    label: '部分支持',
    category: 'partial',
    textClassName: 'text-amber-700',
    badgeClassName: 'bg-amber-100 text-amber-700',
  },
  not_supported: {
    outcome: 'not_supported',
    label: '不支持',
    category: 'negative',
    textClassName: 'text-rose-700',
    badgeClassName: 'bg-rose-100 text-rose-700',
  },
  unclear: {
    outcome: 'unclear',
    label: '无法确定',
    category: 'unclear',
    textClassName: 'text-slate-600',
    badgeClassName: 'bg-slate-100 text-slate-600',
  },
};

export function getOutcomePresentation(outcome: LegalOutcomeType): OutcomePresentation {
  return PRESENTATIONS[outcome];
}

export function getPartyOutcomePresentations(
  record: Pick<AnalysisCaseRecord, 'employeeOutcome' | 'employerOutcome' | 'applicantOutcome'>,
): {
  employee: OutcomePresentation;
  employer: OutcomePresentation;
  applicant: OutcomePresentation;
} {
  return {
    employee: getOutcomePresentation(record.employeeOutcome),
    employer: getOutcomePresentation(record.employerOutcome),
    applicant: getOutcomePresentation(record.applicantOutcome),
  };
}
