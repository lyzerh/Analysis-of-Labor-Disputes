import { describe, expect, it } from 'vitest';
import { LaborInfoParserAdapter } from '../../src/services/parser/LaborInfoParserAdapter';
import { buildOutcomeReviewQueue } from '../../src/services/outcome/OutcomeReviewQueue';
import type { LaborInfoClaimItem, PartyRecognitionResult } from '../../src/types';
import { rawDocument } from './fixtures/outcome-fixtures';
import { analysisRecord } from './helpers/record-factories';

const parties: PartyRecognitionResult = {
  employeeParty: '张某',
  employerParty: '甲有限公司',
  applicantRole: 'employee',
  confidence: 1,
  parties: [
    { id: 'party_employee', name: '张某', laborRole: 'employee', proceduralRoles: ['plaintiff'] },
    { id: 'party_employer', name: '甲有限公司', laborRole: 'employer', proceduralRoles: ['defendant'] },
  ],
};

const claim = (overrides: Partial<LaborInfoClaimItem> = {}): LaborInfoClaimItem => ({
  id: 'claim_1',
  claimName: '加班工资',
  claimType: 'overtime_pay',
  claimant: 'employee',
  claimantRole: 'employee',
  supportStatus: 'unclear',
  sourceText: '原告请求支付加班工资。',
  ...overrides,
});

const unclearOutcomes = { employeeOutcome: 'unclear' as const, employerOutcome: 'unclear' as const, overallResult: 'unclear' as const };

describe('Outcome diagnostics and review queue contract', () => {
  it('adds a reason code to an unclear detected claim with no matching disposition', () => {
    const parsed = LaborInfoParserAdapter.parseDetailed(rawDocument(
      'diagnostic-no-disposition',
      '原告：张某。被告：甲有限公司。原告请求支付加班工资。判决如下：本案另行处理。',
    ));
    const diagnostic = parsed.outcomeDiagnostics?.find((item) => item.claimId);
    expect(diagnostic).toMatchObject({ reasonCode: 'disposition_not_matched', needsReview: true });
  });

  it('explains missing labor-role mapping separately from missing party roles', () => {
    const parsed = LaborInfoParserAdapter.parseDetailed(rawDocument(
      'diagnostic-missing-labor-role',
      '原告：甲有限公司。被告：乙有限公司。原告请求支付加班工资。判决如下：本案另行处理。',
    ));
    expect(parsed.outcomeDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: 'employee', reasonCode: 'missing_labor_role' }),
    ]));

    const noParty = LaborInfoParserAdapter.parseDetailed(rawDocument('diagnostic-missing-party-role', '判决如下：本案另行处理。'));
    expect(noParty.outcomeDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: 'applicant', reasonCode: 'missing_party_roles' }),
    ]));
  });

  it('classifies an unresolved payment beneficiary', () => {
    const diagnostics = LaborInfoParserAdapter.buildOutcomeDiagnostics(
      '支付工资1000元。',
      [claim({ judgmentItems: [{ action: 'pay', targetPartyRole: 'unknown', sourceText: '支付工资1000元。' }] })],
      parties,
      unclearOutcomes,
    );
    expect(diagnostics).toContainEqual(expect.objectContaining({ reasonCode: 'payment_beneficiary_unclear' }));
  });

  it('classifies an unresolved rejection owner', () => {
    const diagnostics = LaborInfoParserAdapter.buildOutcomeDiagnostics(
      '驳回诉讼请求。',
      [claim({ judgmentItems: [{ action: 'reject', targetPartyRole: 'unknown', sourceText: '驳回诉讼请求。' }] })],
      parties,
      unclearOutcomes,
    );
    expect(diagnostics).toContainEqual(expect.objectContaining({ reasonCode: 'rejection_owner_unclear' }));
  });

  it('classifies missing appeal inheritance', () => {
    const diagnostics = LaborInfoParserAdapter.buildOutcomeDiagnostics(
      '驳回上诉，维持原判。',
      [claim({ id: 'appeal_1', claimType: 'procedural_appeal', claimName: '上诉请求', proceduralBasis: 'appeal_request' })],
      parties,
      unclearOutcomes,
    );
    expect(diagnostics).toContainEqual(expect.objectContaining({ reasonCode: 'appeal_inheritance_unclear' }));
  });

  it('routes unsupported long-tail claims to rule improvement', () => {
    const diagnostics = LaborInfoParserAdapter.buildOutcomeDiagnostics(
      '判决如下：本案另行处理。',
      [claim({ claimType: 'general_labor_claim', claimName: '劳动争议综合请求 (其他)' })],
      parties,
      unclearOutcomes,
    );
    expect(diagnostics).toContainEqual(expect.objectContaining({
      reasonCode: 'unsupported_claim_type',
      suggestedReviewType: 'rule_improvement',
    }));
  });

  it('classifies ambiguous multiple claims and preserves high-confidence outcomes', () => {
    const diagnostics = LaborInfoParserAdapter.buildOutcomeDiagnostics(
      '判决如下：本案另行处理。',
      [claim({ sourceText: '原告请求加班工资及经济补偿金。' }), claim({ id: 'claim_2', sourceText: '原告请求经济补偿金。' })],
      parties,
      unclearOutcomes,
    );
    expect(diagnostics).toContainEqual(expect.objectContaining({ reasonCode: 'ambiguous_multiple_claims' }));

    const highConfidence = LaborInfoParserAdapter.parseDetailed(rawDocument(
      'diagnostic-supported',
      '原告：张某。被告：甲有限公司。原告请求支付加班工资。判决如下：被告支付原告加班工资10000元。',
    ));
    expect(highConfidence.employeeOutcome).toBe('supported');
    expect(highConfidence.outcomeDiagnostics || []).toHaveLength(0);
  });

  it('keeps Batch 4 outcomes and Shanghai party-noise regression deterministic', () => {
    const realCases = [
      ['real-li', '上诉人：甲有限公司。被上诉人：李仙浓。上诉人请求撤销原判。原审判决如下：确认双方劳动合同关系已经解除；甲有限公司支付李仙浓经济补偿金52584元。二审判决如下：驳回上诉，维持原判。', 'supported'],
      ['real-he', '上诉人：甲有限公司。被上诉人：何明贵。上诉人请求撤销原判。原审判决如下：确认双方劳动合同关系已经解除；甲有限公司支付何明贵经济补偿金69000元。二审判决如下：驳回上诉，维持原判。', 'supported'],
      ['real-hou', '原告：侯小军。被告：东莞市汇成模具科技有限公司。原告请求支付业务提成费57060元。判决如下：被告支付原告业务费用57060元。', 'supported'],
      ['real-huang', '原告：黄玉东。被告：甲有限公司。原告请求确认劳动关系解除、停工工资7798元及未签订书面劳动合同二倍工资差额50000元。判决如下：确认双方劳动关系于2022年4月29日解除；被告支付原告停工工资7798元；被告支付原告未签订书面劳动合同二倍工资差额33040元；驳回原告其他诉讼请求。', 'partially_supported'],
    ] as const;
    for (const [id, text, expectedEmployeeOutcome] of realCases) {
      const parsed = LaborInfoParserAdapter.parseDetailed(rawDocument(id, text));
      expect(parsed.employeeOutcome).toBe(expectedEmployeeOutcome);
      expect(parsed.outcomeDiagnostics || []).toHaveLength(0);
    }

    const roles = LaborInfoParserAdapter.recognizeParties([
      '原告：上海广万东建筑设计咨询有限公司。',
      '被告：吴利国。',
      '庭审记录：被告：效益工资是根据公司的经济状况。被告：对呀。',
    ].join(''));
    expect(roles.parties).toHaveLength(2);
    expect(roles.parties?.map((party) => party.name)).toEqual([
      '上海广万东建筑设计咨询有限公司',
      '吴利国',
    ]);
  });

  it('does not introduce network or LLM calls', () => {
    const source = LaborInfoParserAdapter.toString();
    expect(source).not.toMatch(/fetch\(|Gemini|@google\/genai|Math\.random/);
  });

  it('derives a non-persistent review queue from analysis records', () => {
    const record = analysisRecord('review-queue-case', 'unclear', {
      outcomeDiagnostics: [{
        target: 'employee',
        outcome: 'unclear',
        reasonCode: 'disposition_not_matched',
        reasonMessage: '未匹配到该诉求对应的裁判动作',
        needsReview: true,
        suggestedReviewType: 'rule_improvement',
      }],
    });
    expect(buildOutcomeReviewQueue([record])).toEqual([
      expect.objectContaining({ caseId: 'review-queue-case', title: 'review-queue-case（测试）', reasonCode: 'disposition_not_matched' }),
    ]);
  });
});
