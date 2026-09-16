import type { AnalysisCaseRecord, LaborInfoClaimItem, LaborRole, LegalOutcomeType, ProceduralRole } from '../../types';

export type OutcomePresentationCategory = 'positive' | 'partial' | 'negative' | 'unclear';

export interface OutcomePresentation {
  outcome: LegalOutcomeType;
  label: string;
  category: OutcomePresentationCategory;
  textClassName: string;
  badgeClassName: string;
}

export interface ClaimOwnershipPresentation {
  claimantRole: LaborRole;
  claimantLabel: string;
  beneficiaryRole?: LaborRole;
  beneficiaryLabel?: string;
  relatedRole?: LaborRole;
  relatedLabel?: string;
}

const LABOR_ROLE_LABELS: Record<LaborRole, string> = {
  employee: '劳动者',
  employer: '用人单位',
  other: '其他主体',
  unknown: '未识别',
};

function knownLaborRole(role: LaborRole | undefined): LaborRole {
  return role === 'employee' || role === 'employer' || role === 'other' ? role : 'unknown';
}

function uniqueKnownLaborRole(roles: LaborRole[]): LaborRole | undefined {
  const known = [...new Set(roles.filter((role) => role === 'employee' || role === 'employer'))];
  return known.length === 1 ? known[0] : undefined;
}

function roleForProceduralTarget(
  targetPartyRole: string,
  record: Pick<AnalysisCaseRecord, 'parties' | 'applicantRole'>,
): LaborRole | undefined {
  if (targetPartyRole === 'unknown') return undefined;
  const matchedRoles = (record.parties || [])
    .filter((party) => party.proceduralRoles.includes(targetPartyRole as ProceduralRole))
    .map((party) => party.laborRole);
  const mappedRole = uniqueKnownLaborRole(matchedRoles);
  if (mappedRole) return mappedRole;
  if (['plaintiff', 'appellant', 'applicant'].includes(targetPartyRole)
    && (record.applicantRole === 'employee' || record.applicantRole === 'employer')) {
    return record.applicantRole;
  }
  return undefined;
}

export function getClaimOwnershipPresentation(
  claim: Pick<LaborInfoClaimItem, 'claimant' | 'claimantRole' | 'claimName' | 'sourceText' | 'judgmentItems'>,
  record: Pick<AnalysisCaseRecord, 'parties' | 'applicantRole'>,
): ClaimOwnershipPresentation {
  const claimantRole = knownLaborRole(claim.claimantRole ?? claim.claimant);
  const paymentActions = (claim.judgmentItems || [])
    .filter((item) => (item.action === 'pay' || item.action === 'support')
      && /支付|补发|补缴|赔偿|补偿|工资|二倍工资/.test(item.sourceText))
    .map((item) => roleForProceduralTarget(item.targetPartyRole, record))
    .filter((role): role is LaborRole => role !== undefined);
  const beneficiaryRole = uniqueKnownLaborRole(paymentActions);
  if (beneficiaryRole) {
    return {
      claimantRole,
      claimantLabel: LABOR_ROLE_LABELS[claimantRole],
      beneficiaryRole,
      beneficiaryLabel: LABOR_ROLE_LABELS[beneficiaryRole],
    };
  }

  const claimText = `${claim.claimName || ''}${claim.sourceText || ''}`;
  if (claimantRole === 'employer'
    && /不支付|无需支付|无需承担|不承担|不予支付/.test(claimText)
    && (record.parties || []).some((party) => party.laborRole === 'employee')) {
    return {
      claimantRole,
      claimantLabel: LABOR_ROLE_LABELS[claimantRole],
      relatedRole: 'employee',
      relatedLabel: LABOR_ROLE_LABELS.employee,
    };
  }

  return {
    claimantRole,
    claimantLabel: LABOR_ROLE_LABELS[claimantRole],
  };
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
