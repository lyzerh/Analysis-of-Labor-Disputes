import { describe, expect, it } from 'vitest';
import { AmountResolver } from '../../src/services/parser/AmountResolver';
import { LaborInfoParserAdapter } from '../../src/services/parser/LaborInfoParserAdapter';
import { rawDocument } from './fixtures/outcome-fixtures';

describe('Party and procedural-role contract', () => {
  it('allows one employer party to be both defendant and counterclaimant', () => {
    const text = '原告：张某。被告：甲有限公司。被告甲有限公司提出反诉，请求确认无需支付经济补偿金。';
    const result = LaborInfoParserAdapter.recognizeParties(text);
    const employer = result.parties?.find((party) => party.name === '甲有限公司');
    expect(employer?.laborRole).toBe('employer');
    expect(employer?.proceduralRoles).toEqual(expect.arrayContaining(['defendant', 'counterclaimant']));
  });

  it('keeps appellant and appellee roles separate from labor roles', () => {
    const result = LaborInfoParserAdapter.recognizeParties('上诉人：甲有限公司。被上诉人：张某。');
    expect(result.parties).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '甲有限公司', laborRole: 'employer', proceduralRoles: ['appellant'] }),
      expect.objectContaining({ name: '张某', laborRole: 'employee', proceduralRoles: ['appellee'] }),
    ]));
  });

  it('recognizes arbitration applicant and respondent roles', () => {
    const result = LaborInfoParserAdapter.recognizeParties('申请人：张某。被申请人：甲有限公司。');
    expect(result.parties).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '张某', laborRole: 'employee', proceduralRoles: ['applicant'] }),
      expect.objectContaining({ name: '甲有限公司', laborRole: 'employer', proceduralRoles: ['respondent'] }),
    ]));
  });

  it('does not force a third-party company into employee or employer', () => {
    const text = '原告：张某。被告：甲有限公司。第三人：乙劳务派遣有限公司。';
    const result = LaborInfoParserAdapter.recognizeParties(text);
    const thirdParty = result.parties?.find((party) => party.name === '乙劳务派遣有限公司');
    expect(thirdParty?.laborRole).toBe('other');
    expect(thirdParty?.proceduralRoles).toEqual(['third_party']);
  });
});

describe('Claim ownership and procedural basis', () => {
  it('marks an employer plaintiff request as an employer original claim', () => {
    const text = '原告：甲有限公司。被告：张某。原告请求确认无需支付经济补偿金。判决如下：支持原告诉讼请求。';
    const result = LaborInfoParserAdapter.parseDetailed(rawDocument('employer-original-claim', text));
    expect(result.claims.find((item) => item.claimType === 'economic_compensation')).toMatchObject({
      claimantRole: 'employer',
      proceduralBasis: 'original_claim',
    });
  });

  it('creates independently owned original and counterclaim claims', () => {
    const text = [
      '原告：张某。被告：甲有限公司。',
      '原告请求被告支付加班工资30000元。',
      '被告甲有限公司提出反诉，请求确认无需支付经济补偿金10000元。',
      '判决如下：被告支付原告加班工资30000元；驳回被告反诉请求。',
    ].join('');
    const result = LaborInfoParserAdapter.parseDetailed(rawDocument('claim-ownership', text));
    const overtime = result.claims.find((item) => item.claimType === 'overtime_pay');
    const compensation = result.claims.find((item) => item.claimType === 'economic_compensation');

    expect(overtime).toMatchObject({
      claimantRole: 'employee',
      proceduralBasis: 'original_claim',
      requestedAmount: 30000,
    });
    expect(compensation).toMatchObject({
      claimantRole: 'employer',
      proceduralBasis: 'counterclaim',
      requestedAmount: 10000,
    });
    expect(overtime?.claimantPartyId).not.toBe(compensation?.claimantPartyId);
  });

  it('represents an appeal request as procedural instead of an entity labor claim', () => {
    const text = '上诉人：甲有限公司。被上诉人：张某。上诉人请求撤销原判。判决如下：驳回上诉请求。';
    const result = LaborInfoParserAdapter.parseDetailed(rawDocument('procedural-appeal', text));
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]).toMatchObject({
      claimType: 'procedural_appeal',
      claimantRole: 'employer',
      proceduralBasis: 'appeal_request',
      supportStatus: 'not_supported',
    });
  });
});

describe('AmountResolver', () => {
  it.each([
    ['30000元', 30000],
    ['30,000元', 30000],
    ['30000.50元', 30000.5],
    ['人民币30000元', 30000],
    ['人民币30,000.50元', 30000.5],
  ])('extracts %s as %s', (source, expected) => {
    expect(AmountResolver.extractFirstAmount(source)).toBe(expected);
  });

  it.each([
    [30000, 8421.35, 'partially_supported'],
    [30000, 30000, 'supported'],
    [30000, 0, 'not_supported'],
  ] as const)('resolves requested %s and awarded %s as %s', (requested, awarded, expected) => {
    expect(AmountResolver.resolveAmountOutcome(requested, awarded)).toBe(expected);
  });
});

describe('Claim-level amount binding', () => {
  it('keeps requested, awarded and outcome facts independent for three claims', () => {
    const text = [
      '原告：张某。被告：甲有限公司。',
      '原告请求违法解除劳动合同赔偿金20000元、加班工资30000元、未休年休假工资3000元。',
      '判决如下：支付违法解除劳动合同赔偿金20000元；驳回加班工资请求；未休年休假工资请求3000元，支持1000元。',
    ].join('');
    const result = LaborInfoParserAdapter.parseDetailed(rawDocument('multi-claim-amounts', text));

    expect(result.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({
        claimType: 'unlawful_termination_compensation',
        requestedAmount: 20000,
        awardedAmount: 20000,
        supportStatus: 'supported',
      }),
      expect.objectContaining({
        claimType: 'overtime_pay',
        requestedAmount: 30000,
        awardedAmount: 0,
        supportStatus: 'not_supported',
      }),
      expect.objectContaining({
        claimType: 'annual_leave_pay',
        requestedAmount: 3000,
        awardedAmount: 1000,
        supportStatus: 'partially_supported',
      }),
    ]));
    expect(result.employeeOutcome).toBe('partially_supported');
    expect(result.employerOutcome).toBe('partially_supported');
  });
});

describe('ReferenceResolver boundary', () => {
  it('marks ordinal and previous-reference language unresolved instead of guessing a claim', () => {
    const text = [
      '原告：张某。被告：甲有限公司。原告请求加班工资和经济补偿金。',
      '判决如下：上述两项请求中，第一项予以支持，第二项驳回。',
    ].join('');
    const result = LaborInfoParserAdapter.parseDetailed(rawDocument('unresolved-reference', text));
    expect(result.unresolvedReferences.length).toBeGreaterThan(0);
    expect(result.unresolvedReferences.every((item) =>
      item.resolutionMethod === 'unresolved'
      && item.needsSemanticResolution
      && item.referencedClaimIds.length === 0
    )).toBe(true);
    expect(result.claims.every((item) => (item.judgmentItems || []).length === 0)).toBe(true);
  });
});
