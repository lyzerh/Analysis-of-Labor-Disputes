import { describe, expect, it } from 'vitest';
import { LaborInfoParserAdapter } from '../../src/services/parser/LaborInfoParserAdapter';
import {
  buildOutcomeReviewQueue,
  filterOutcomeReviewQueue,
  outcomeReviewItemId,
  outcomeReviewEvidenceFields,
  outcomeReviewSourceSnippet,
  outcomeDiagnosticCategory,
  outcomeReviewSearchText,
  matchesOutcomeDiagnosticFilter,
  outcomeReviewSuggestionForDisplay,
  outcomeReviewUserStatus,
  shouldMarkOutcomeReviewItemViewed,
  readOutcomeReviewStatusMap,
  writeOutcomeReviewStatusMap,
} from '../../src/services/outcome/OutcomeReviewQueue';
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

  it('keeps payment request text separate from payment disposition evidence', () => {
    const [diagnostic] = LaborInfoParserAdapter.buildOutcomeDiagnostics(
      '支付工资1000元。',
      [claim({
        sourceText: '原告请求不支付二倍工资差额34970.12元。',
        judgmentItems: [{ action: 'pay', targetPartyRole: 'unknown', sourceText: '支付工资1000元。' }],
      })],
      parties,
      unclearOutcomes,
    ).filter((item) => item.reasonCode === 'payment_beneficiary_unclear');
    expect(diagnostic.evidence?.claimText).toContain('原告请求不支付');
    expect(diagnostic.evidence?.dispositionText).toContain('支付工资1000元');
    expect(diagnostic.evidence?.dispositionText).not.toBe(diagnostic.evidence?.claimText);
    expect(diagnostic.evidence?.diagnosticText).toContain('支付类争议');
  });

  it('shows a safe disposition placeholder when payment evidence is unavailable', () => {
    const item = buildOutcomeReviewQueue([analysisRecord('payment-placeholder', 'unclear', {
      outcomeDiagnostics: [{
        target: 'employee',
        outcome: 'unclear',
        reasonCode: 'payment_beneficiary_unclear',
        reasonMessage: '支付主文未能确定受益方',
        evidence: { claimText: '原告请求支付工资。' },
        needsReview: true,
      }],
    })])[0];
    expect(outcomeReviewEvidenceFields(item)).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: '诉求片段', text: '原告请求支付工资。' }),
      expect.objectContaining({ label: '裁判主文片段', placeholder: '暂无可定位裁判主文片段' }),
    ]));
  });

  it('shows a safe claim placeholder when payment evidence has no request text', () => {
    const item = buildOutcomeReviewQueue([analysisRecord('payment-claim-placeholder', 'unclear', {
      outcomeDiagnostics: [{
        target: 'employee', outcome: 'unclear', reasonCode: 'payment_beneficiary_unclear', needsReview: true,
      }],
    })])[0];
    expect(outcomeReviewEvidenceFields(item)).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: '诉求片段', placeholder: '暂无可定位诉求片段' }),
      expect.objectContaining({ label: '裁判主文片段', placeholder: '暂无可定位裁判主文片段' }),
    ]));
  });

  it('does not promote a legacy generic sourceText to payment disposition evidence', () => {
    const item = buildOutcomeReviewQueue([analysisRecord('legacy-payment', 'unclear', {
      outcomeDiagnostics: [{
        target: 'employee', outcome: 'unclear', reasonCode: 'payment_beneficiary_unclear', needsReview: true,
        sourceText: '承迹庭林公司向本院提出诉讼请求：不支付二倍工资差额34970.12元。',
      }],
    })])[0];
    const fields = outcomeReviewEvidenceFields(item);
    expect(fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: '诉求片段', text: expect.stringContaining('提出诉讼请求') }),
      expect.objectContaining({ label: '裁判主文片段', placeholder: '暂无可定位裁判主文片段' }),
    ]));
    expect(fields.find((field) => field.label === '裁判主文片段')?.text).toBeUndefined();
  });

  it('keeps rejection and amount evidence typed', () => {
    const rejection = buildOutcomeReviewQueue([analysisRecord('rejection-evidence', 'unclear', {
      outcomeDiagnostics: [{
        target: 'employee', outcome: 'unclear', reasonCode: 'rejection_owner_unclear', needsReview: true,
        sourceText: '原告请求加班工资。',
        evidence: { claimText: '原告请求加班工资。', dispositionText: '驳回原告其他诉讼请求。' },
      }],
    })])[0];
    expect(outcomeReviewEvidenceFields(rejection)).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: '诉求片段', text: '原告请求加班工资。' }),
      expect.objectContaining({ label: '裁判主文片段', text: '驳回原告其他诉讼请求。' }),
    ]));

    const amount = buildOutcomeReviewQueue([analysisRecord('amount-evidence', 'unclear', {
      outcomeDiagnostics: [{
        target: 'employee', outcome: 'unclear', reasonCode: 'amount_conflict', needsReview: true,
        evidence: {
          claimText: '请求支付工资10000元。',
          dispositionText: '判决支付工资5000元。',
          amountText: '请求金额：10000；裁判金额：5000',
        },
      }],
    })])[0];
    expect(outcomeReviewEvidenceFields(amount)).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: '诉求片段' }),
      expect.objectContaining({ label: '裁判主文片段' }),
      expect.objectContaining({ label: '金额片段', text: '请求金额：10000；裁判金额：5000' }),
    ]));
  });

  it('uses a dedicated placeholder when a disposition cannot be matched', () => {
    const item = buildOutcomeReviewQueue([analysisRecord('unmatched-disposition', 'unclear', {
      outcomeDiagnostics: [{
        target: 'employee', outcome: 'unclear', reasonCode: 'disposition_not_matched', needsReview: true,
        evidence: { claimText: '原告请求支付加班工资。' },
      }],
    })])[0];
    expect(outcomeReviewEvidenceFields(item)).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: '裁判主文片段', placeholder: '未定位到对应裁判主文' }),
    ]));
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

  it('filters the review queue without changing the underlying diagnostics', () => {
    const record = analysisRecord('review-filter-case', 'unclear', {
      outcomeDiagnostics: [
        { target: 'employee', outcome: 'unclear', reasonCode: 'missing_claim_owner', needsReview: true, suggestedReviewType: 'manual_review' },
        { target: 'employer', outcome: 'unclear', reasonCode: 'source_text_missing', needsReview: true, suggestedReviewType: 'rule_improvement' },
      ],
    });
    const queue = buildOutcomeReviewQueue([record]);
    expect(filterOutcomeReviewQueue(queue, 'needs_review', 'missing_claim_owner', 'manual_review')).toHaveLength(1);
    expect(filterOutcomeReviewQueue(queue, 'all', 'source_text_missing', '')).toHaveLength(1);
    expect(queue).toHaveLength(2);
  });

  it('classifies diagnostic clues and searches case, claim, reason, and typed evidence text', () => {
    const [item] = buildOutcomeReviewQueue([analysisRecord('diagnostic-search-case', 'unclear', {
      title: '甲公司与张某劳动争议',
      caseNumber: '（2023）粤01民初1号',
      outcomeDiagnostics: [{
        claimId: 'claim-wage', claimType: 'wage', outcome: 'unclear', needsReview: true,
        reasonCode: 'source_text_missing', reasonMessage: '证据片段无法定位',
        evidence: { claimText: '请求支付工资1000元', diagnosticText: '请核对原文。' },
      }],
    })]);
    expect(outcomeDiagnosticCategory(item)).toBe('evidence');
    expect(outcomeReviewSearchText(item)).toContain('diagnostic-search-case');
    expect(outcomeReviewSearchText(item)).toContain('请求支付工资1000元');
    expect(matchesOutcomeDiagnosticFilter(item, 'needs_review')).toBe(true);
    expect(matchesOutcomeDiagnosticFilter(item, 'evidence')).toBe(true);
    expect(matchesOutcomeDiagnosticFilter(item, 'relationship')).toBe(false);
  });

  it('keeps unresolved and relationship diagnostic categories distinct', () => {
    const [relationship, technical] = buildOutcomeReviewQueue([analysisRecord('diagnostic-categories', 'unclear', {
      outcomeDiagnostics: [
        { target: 'employee', outcome: 'unclear', needsReview: true, reasonCode: 'missing_claim_owner' },
        { target: 'employer', outcome: 'unclear', needsReview: true, reasonCode: 'low_confidence' },
      ],
    })]);
    expect(outcomeDiagnosticCategory(relationship)).toBe('relationship');
    expect(outcomeDiagnosticCategory(technical)).toBe('unclear');
    expect(matchesOutcomeDiagnosticFilter(technical, 'unclear')).toBe(true);
  });

  it('defaults UI review state to unseen and filters every local status', () => {
    const queue = buildOutcomeReviewQueue([analysisRecord('review-status-case', 'unclear', {
      outcomeDiagnostics: [
        { target: 'employee', outcome: 'unclear', reasonCode: 'missing_claim_owner', needsReview: true },
        { target: 'employer', outcome: 'unclear', reasonCode: 'amount_conflict', needsReview: true },
      ],
    })]);
    const statuses = { [outcomeReviewItemId(queue[0])]: 'llm_candidate' as const };
    expect(outcomeReviewUserStatus(queue[0], {})).toBe('unseen');
    expect(filterOutcomeReviewQueue(queue, 'unseen', '', '', statuses)).toHaveLength(1);
    expect(filterOutcomeReviewQueue(queue, 'llm_candidate', '', '', statuses)).toHaveLength(1);
    expect(filterOutcomeReviewQueue(queue, 'manual_review', '', '', statuses)).toHaveLength(0);
  });

  it('only acknowledges unseen review items when opening a case', () => {
    const [item] = buildOutcomeReviewQueue([analysisRecord('review-open-status-case', 'unclear', {
      outcomeDiagnostics: [{ target: 'employee', outcome: 'unclear', reasonCode: 'missing_claim_owner', needsReview: true }],
    })]);
    expect(shouldMarkOutcomeReviewItemViewed(item, {})).toBe(true);

    const statuses = (status: 'viewed' | 'llm_candidate' | 'manual_review' | 'rule_improvement' | 'deferred') => ({
      [outcomeReviewItemId(item)]: status,
    });
    const markWhenOpened = (storedStatuses: Record<string, 'viewed' | 'llm_candidate' | 'manual_review' | 'rule_improvement' | 'deferred'>) => (
      shouldMarkOutcomeReviewItemViewed(item, storedStatuses)
        ? { ...storedStatuses, [outcomeReviewItemId(item)]: 'viewed' as const }
        : storedStatuses
    );
    expect(outcomeReviewUserStatus(item, markWhenOpened({}))).toBe('viewed');
    for (const status of ['viewed', 'llm_candidate', 'manual_review', 'rule_improvement', 'deferred'] as const) {
      const storedStatuses = statuses(status);
      expect(shouldMarkOutcomeReviewItemViewed(item, storedStatuses)).toBe(false);
      expect(outcomeReviewUserStatus(item, markWhenOpened(storedStatuses))).toBe(status);
      expect(filterOutcomeReviewQueue([item], status, '', '', storedStatuses)).toHaveLength(1);
    }
  });

  it('persists UI-only review statuses and degrades safely when storage is unavailable', () => {
    let value: string | null = null;
    const storage = {
      getItem: () => value,
      setItem: (_key: string, next: string) => { value = next; },
    } as unknown as Storage;
    const statuses = { 'review-status-case::claim_1::overtime_pay::low_confidence::0': 'manual_review' as const };
    writeOutcomeReviewStatusMap(statuses, storage);
    expect(readOutcomeReviewStatusMap(storage)).toEqual(statuses);

    const unavailable = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    } as unknown as Storage;
    expect(readOutcomeReviewStatusMap(unavailable)).toEqual({});
    expect(() => writeOutcomeReviewStatusMap(statuses, unavailable)).not.toThrow();
  });

  it('keeps decision hints display-only and conservative when diagnostics omit a suggestion', () => {
    expect(outcomeReviewSuggestionForDisplay({ reasonCode: 'unsupported_claim_type' })).toBe('llm_semantic_normalization');
    expect(outcomeReviewSuggestionForDisplay({ reasonCode: 'amount_conflict' })).toBe('manual_review');
    expect(outcomeReviewSuggestionForDisplay({ reasonCode: 'missing_party_roles' })).toBe('manual_review');
  });

  it('does not mutate analysis provenance while deriving typed review evidence', () => {
    const record = analysisRecord('review-provenance-case', 'unclear', {
      outcomeDiagnostics: [{
        target: 'employee', outcome: 'unclear', reasonCode: 'payment_beneficiary_unclear', needsReview: true,
        evidence: { claimText: '原告请求支付工资。' },
      }],
    });
    const before = JSON.stringify(record);
    const queue = buildOutcomeReviewQueue([record]);
    outcomeReviewEvidenceFields(queue[0]);
    expect(JSON.stringify(record)).toBe(before);
  });

  it('provides a stable source snippet placeholder when diagnostics lack source text', () => {
    const [item] = buildOutcomeReviewQueue([analysisRecord('review-source-case', 'unclear', {
      outcomeDiagnostics: [{ target: 'employee', outcome: 'unclear', needsReview: true }],
    })]);
    expect(outcomeReviewSourceSnippet(item)).toBe('暂无可定位原文片段');
  });
});
