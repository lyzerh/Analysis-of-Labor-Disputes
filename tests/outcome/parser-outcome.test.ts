import { describe, expect, it } from 'vitest';
import { LaborInfoParserAdapter } from '../../src/services/parser/LaborInfoParserAdapter';
import type { LaborInfoClaimItem, PartyRecognitionResult } from '../../src/types';
import {
  fourQuadrantFixtures,
  judgmentHeadingFixtures,
  rawDocument,
} from './fixtures/outcome-fixtures';

const employeeParties: PartyRecognitionResult = {
  employeeParty: '张某',
  employerParty: '甲有限公司',
  applicantRole: 'employee',
  confidence: 1,
};

const employerParties: PartyRecognitionResult = {
  employeeParty: '张某',
  employerParty: '甲有限公司',
  applicantRole: 'employer',
  confidence: 1,
};

const claim = (
  claimName: string,
  claimant: LaborInfoClaimItem['claimant'],
  supportStatus: LaborInfoClaimItem['supportStatus'],
): LaborInfoClaimItem => ({ claimName, claimant, supportStatus });

const claimantFor = (parties: PartyRecognitionResult): LaborInfoClaimItem['claimant'] =>
  parties.applicantRole === 'unknown' ? 'other' : parties.applicantRole;

describe('Layer 2: four-quadrant parser fixtures', () => {
  it.each(fourQuadrantFixtures)('$id follows party-perspective semantics', (fixture) => {
    const result = LaborInfoParserAdapter.parseDetailed(rawDocument(fixture.id, fixture.text));
    const parties = LaborInfoParserAdapter.recognizeParties(fixture.text);

    expect(parties.applicantRole).toBe(fixture.role);
    expect({
      employeeOutcome: result.employeeOutcome,
      employerOutcome: result.employerOutcome,
      overallResult: result.overallResult,
    }).toEqual(fixture.expected);
  });
});

describe('Layer 2: judgment heading segmentation', () => {
  it.each(judgmentHeadingFixtures)('recognizes the heading %s', (heading) => {
    const text = `原告：张某。被告：甲有限公司。原告请求支付加班工资。${heading}被告支付原告加班工资10000元。`;
    const result = LaborInfoParserAdapter.parseDetailed(rawDocument(`heading-${heading}`, text));
    expect(result.claims.find((item) => item.claimName === '加班工资')?.supportStatus).toBe('supported');
    expect(result.employeeOutcome).toBe('supported');
    expect(result.employerOutcome).toBe('not_supported');
  });
});

describe('Layer 2: unknown, partial and multi-claim outcomes', () => {
  it('does not coerce an unknown applicant role to employee or employer', () => {
    const unknownParties: PartyRecognitionResult = {
      employeeParty: null,
      employerParty: null,
      applicantRole: 'unknown',
      confidence: 0,
    };
    const result = LaborInfoParserAdapter.determineOutcomes(
      '被申请人支付申请人加班工资10000元',
      [claim('加班工资', 'other', 'supported')],
      unknownParties,
      [],
    );
    expect(result).toEqual({
      employeeOutcome: 'unclear',
      employerOutcome: 'unclear',
      overallResult: 'unclear',
    });
  });

  it('marks a single claim partial when only part of the requested amount is awarded', () => {
    const text = '原告：张某。被告：甲有限公司。原告请求加班工资30000元。判决如下：被告支付原告加班工资8421.35元。';
    const result = LaborInfoParserAdapter.parseDetailed(rawDocument('partial-amount', text));
    expect(result.claims.find((item) => item.claimName === '加班工资')?.supportStatus).toBe('partially_supported');
    expect(result.employeeOutcome).toBe('partially_supported');
    expect(result.employerOutcome).toBe('partially_supported');
  });

  it('preserves three claim-level facts and aggregates the case as partial', () => {
    const text = [
      '原告：张某。被告：甲有限公司。',
      '原告请求：违法解除劳动合同赔偿金、加班工资、未休年休假工资。',
      '判决如下：被告支付原告违法解除劳动合同赔偿金20000元；驳回加班工资请求；未休年休假工资请求3000元，支持1000元。',
    ].join('');
    const result = LaborInfoParserAdapter.parseDetailed(rawDocument('multi-claim', text));
    expect(result.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({ claimName: '违法解除劳动合同赔偿金', supportStatus: 'supported' }),
      expect.objectContaining({ claimName: '加班工资', supportStatus: 'not_supported' }),
      expect.objectContaining({ claimName: expect.stringContaining('年休假'), supportStatus: 'partially_supported' }),
    ]));
    expect(result.employeeOutcome).toBe('partially_supported');
    expect(result.employerOutcome).toBe('partially_supported');
  });
});

describe('Layer 2: claim ownership', () => {
  it('attributes an employee plaintiff claim to the employee', () => {
    const claims = LaborInfoParserAdapter.extractClaimsWithSupport(
      '原告请求加班工资。',
      { decision: '被告支付原告加班工资10000元。' },
      employeeParties,
    );
    expect(claims.find((item) => item.claimName === '加班工资')?.claimant).toBe('employee');
  });

  it('attributes an employer plaintiff claim to the employer', () => {
    const claims = LaborInfoParserAdapter.extractClaimsWithSupport(
      '原告请求确认无需支付经济补偿金。',
      { decision: '支持原告全部诉讼请求。' },
      employerParties,
    );
    expect(claims.find((item) => item.claimName.includes('经济补偿金'))?.claimant).toBe('employer');
  });

  it('attributes a defendant counterclaim to the defendant', () => {
    const claims = LaborInfoParserAdapter.extractClaimsWithSupport(
      '原告甲有限公司请求确认无需支付经济补偿金。被告张某反诉请求加班工资。',
      { decision: '驳回原告诉讼请求；被告反诉的加班工资予以支持。' },
      employerParties,
    );
    expect(claims.find((item) => item.claimName === '加班工资')?.claimant).toBe('employee');
  });

  it('keeps claims from both parties assigned to their actual claimant', () => {
    const claims = LaborInfoParserAdapter.extractClaimsWithSupport(
      '原告甲有限公司请求确认无需支付经济补偿金。被告张某请求加班工资。',
      { decision: '支持原告请求；驳回被告加班工资请求。' },
      employerParties,
    );
    expect(claims.find((item) => item.claimName.includes('经济补偿金'))?.claimant).toBe('employer');
    expect(claims.find((item) => item.claimName === '加班工资')?.claimant).toBe('employee');
  });
});

describe('Layer 2: rejection object and decision wording', () => {
  it.each([
    ['驳回原告全部诉讼请求', employeeParties, 'not_supported'],
    ['驳回被告反诉请求', employeeParties, 'unclear'],
    ['驳回上诉请求', employeeParties, 'not_supported'],
    ['支持原告一项请求，驳回其他诉讼请求', employeeParties, 'partially_supported'],
  ] as const)('%s applies only to its procedural object', (decision, parties, overallResult) => {
    const result = LaborInfoParserAdapter.determineOutcomes(
      decision,
      [claim('测试请求', claimantFor(parties), decision.startsWith('支持') ? 'supported' : 'unclear')],
      parties,
      [],
    );
    expect(result.overallResult).toBe(overallResult);
  });

  it('does not let one payment make a rejected claim supported', () => {
    const text = '原告请求加班工资和经济补偿金。';
    const claims = LaborInfoParserAdapter.extractClaimsWithSupport(
      text,
      { decision: '仅支持经济补偿金，由被告支付20000元。驳回加班工资请求。' },
      employeeParties,
    );
    expect(claims.find((item) => item.claimName === '加班工资')?.supportStatus).toBe('not_supported');
    expect(claims.find((item) => item.claimName.includes('经济补偿金'))?.supportStatus).toBe('supported');
  });

  it.each([
    ['企业原告', employerParties, '支持原告甲有限公司的全部诉讼请求。', 'not_supported', 'supported'],
    ['劳动者原告', employeeParties, '支持原告张某的诉讼请求。', 'supported', 'not_supported'],
  ] as const)('%s generic support maps to the correct party', (_label, parties, decision, employee, employer) => {
    const result = LaborInfoParserAdapter.determineOutcomes(
      decision,
      [claim('综合请求', claimantFor(parties), 'unclear')],
      parties,
      [],
    );
    expect(result.employeeOutcome).toBe(employee);
    expect(result.employerOutcome).toBe(employer);
    expect(result.overallResult).toBe('supported');
  });
});
