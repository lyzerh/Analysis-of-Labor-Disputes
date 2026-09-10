import type { ApplicantRole, LegalOutcomeType } from '../../types';

export interface PartyOutcomeResolution {
  employeeOutcome: LegalOutcomeType;
  employerOutcome: LegalOutcomeType;
}

/**
 * 将明确的申请人视角结果转换为劳动者/用人单位视角。
 * 这里只做确定性角色映射，不解析或猜测裁判文书。
 */
export function resolvePartyOutcomes(
  applicantRole: ApplicantRole,
  applicantOutcome: LegalOutcomeType,
): PartyOutcomeResolution {
  if (applicantRole === 'unknown' || applicantOutcome === 'unclear') {
    return { employeeOutcome: 'unclear', employerOutcome: 'unclear' };
  }

  if (applicantOutcome === 'partially_supported') {
    return {
      employeeOutcome: 'partially_supported',
      employerOutcome: 'partially_supported',
    };
  }

  const opposingOutcome: LegalOutcomeType = applicantOutcome === 'supported'
    ? 'not_supported'
    : 'supported';

  return applicantRole === 'employee'
    ? { employeeOutcome: applicantOutcome, employerOutcome: opposingOutcome }
    : { employeeOutcome: opposingOutcome, employerOutcome: applicantOutcome };
}
