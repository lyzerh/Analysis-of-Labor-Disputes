import { describe, expect, it } from 'vitest';
import { aggregateClaimOutcomes, mapApplicantOutcome } from './helpers/outcome-spec';

describe('Layer 1: normative outcome semantics', () => {
  it.each([
    ['employee', 'supported', 'supported', 'not_supported'],
    ['employee', 'not_supported', 'not_supported', 'supported'],
    ['employer', 'supported', 'not_supported', 'supported'],
    ['employer', 'not_supported', 'supported', 'not_supported'],
  ] as const)(
    '%s applicant with %s applicant outcome maps to party outcomes',
    (role, applicantOutcome, employeeOutcome, employerOutcome) => {
      expect(mapApplicantOutcome(role, applicantOutcome)).toEqual({
        applicantOutcome,
        employeeOutcome,
        employerOutcome,
      });
    },
  );

  it('unknown applicant role never defaults to either party', () => {
    expect(mapApplicantOutcome('unknown', 'supported')).toEqual({
      applicantOutcome: 'unclear',
      employeeOutcome: 'unclear',
      employerOutcome: 'unclear',
    });
  });

  it('a single claim with only a partial amount awarded is partial at case level', () => {
    expect(aggregateClaimOutcomes(['partially_supported'])).toBe('partially_supported');
  });

  it('mixed claim facts make the case partial without overwriting claim facts', () => {
    const claims = ['supported', 'not_supported', 'partially_supported'] as const;
    expect(aggregateClaimOutcomes([...claims])).toBe('partially_supported');
    expect(claims).toEqual(['supported', 'not_supported', 'partially_supported']);
  });
});
