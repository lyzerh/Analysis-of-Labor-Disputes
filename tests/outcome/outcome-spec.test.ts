import { describe, expect, it } from 'vitest';
import { aggregateClaimOutcomes as aggregateClaimStatuses, mapApplicantOutcome } from './helpers/outcome-spec';
import { aggregateClaimOutcomes } from '../../src/services/outcome/ClaimOutcomeResolver';
import { resolvePartyOutcomes } from '../../src/services/outcome/OutcomeResolver';
import type { LaborInfoClaimItem } from '../../src/types';

const claimWithStatus = (supportStatus: LaborInfoClaimItem['supportStatus']): LaborInfoClaimItem => ({
  claimName: '测试请求',
  claimant: 'employee',
  supportStatus,
});

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

  it('production resolver keeps both party outcomes unclear for unknown applicant role', () => {
    expect(resolvePartyOutcomes('unknown', 'supported')).toEqual({
      employeeOutcome: 'unclear',
      employerOutcome: 'unclear',
    });
  });

  it('production resolver keeps a partial applicant result partial for both parties', () => {
    expect(resolvePartyOutcomes('employer', 'partially_supported')).toEqual({
      employeeOutcome: 'partially_supported',
      employerOutcome: 'partially_supported',
    });
  });

  it.each([
    ['employee', 'supported', 'supported', 'not_supported'],
    ['employee', 'not_supported', 'not_supported', 'supported'],
    ['employer', 'supported', 'not_supported', 'supported'],
    ['employer', 'not_supported', 'supported', 'not_supported'],
  ] as const)(
    'production resolver maps %s applicant with %s applicant outcome without inversion',
    (role, applicantOutcome, employeeOutcome, employerOutcome) => {
      expect(resolvePartyOutcomes(role, applicantOutcome)).toEqual({ employeeOutcome, employerOutcome });
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
    expect(aggregateClaimStatuses(['partially_supported'])).toBe('partially_supported');
  });

  it('mixed claim facts make the case partial without overwriting claim facts', () => {
    const claims = ['supported', 'not_supported', 'partially_supported'] as const;
    expect(aggregateClaimStatuses([...claims])).toBe('partially_supported');
    expect(claims).toEqual(['supported', 'not_supported', 'partially_supported']);
  });

  it.each([
    [['supported', 'supported'], 'supported'],
    [['not_supported', 'not_supported'], 'not_supported'],
    [['supported', 'not_supported'], 'partially_supported'],
    [['supported', 'partially_supported'], 'partially_supported'],
    [['unclear', 'unclear'], 'unclear'],
  ] as const)('production claim aggregation is deterministic for %j', (statuses, expected) => {
    expect(aggregateClaimOutcomes(statuses.map(claimWithStatus), 'unclear')).toBe(expected);
  });
});
