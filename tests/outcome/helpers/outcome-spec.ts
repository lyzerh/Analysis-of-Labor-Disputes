export type OutcomeStatus =
  | 'supported'
  | 'partially_supported'
  | 'not_supported'
  | 'unclear';

export type ApplicantRole = 'employee' | 'employer' | 'unknown';

export interface PartyOutcomes {
  applicantOutcome: OutcomeStatus;
  employeeOutcome: OutcomeStatus;
  employerOutcome: OutcomeStatus;
}

export function aggregateClaimOutcomes(outcomes: OutcomeStatus[]): OutcomeStatus {
  if (outcomes.length === 0 || outcomes.every((outcome) => outcome === 'unclear')) {
    return 'unclear';
  }

  const determinate = outcomes.filter((outcome) => outcome !== 'unclear');
  if (determinate.includes('partially_supported')) return 'partially_supported';
  if (determinate.includes('supported') && determinate.includes('not_supported')) {
    return 'partially_supported';
  }
  if (determinate.every((outcome) => outcome === 'supported')) return 'supported';
  if (determinate.every((outcome) => outcome === 'not_supported')) return 'not_supported';
  return 'unclear';
}

export function mapApplicantOutcome(
  applicantRole: ApplicantRole,
  applicantOutcome: OutcomeStatus,
): PartyOutcomes {
  if (applicantRole === 'unknown') {
    return {
      applicantOutcome: 'unclear',
      employeeOutcome: 'unclear',
      employerOutcome: 'unclear',
    };
  }

  if (applicantOutcome === 'partially_supported' || applicantOutcome === 'unclear') {
    return { applicantOutcome, employeeOutcome: applicantOutcome, employerOutcome: applicantOutcome };
  }

  const opposite: OutcomeStatus = applicantOutcome === 'supported'
    ? 'not_supported'
    : 'supported';

  return applicantRole === 'employee'
    ? { applicantOutcome, employeeOutcome: applicantOutcome, employerOutcome: opposite }
    : { applicantOutcome, employeeOutcome: opposite, employerOutcome: applicantOutcome };
}
