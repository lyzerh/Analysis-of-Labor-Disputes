import { describe, expect, it } from 'vitest';
import { AmountResolver } from '../../src/services/parser/AmountResolver';
import { LaborInfoParserAdapter } from '../../src/services/parser/LaborInfoParserAdapter';
import { hasReliableAmountCorrespondence, repairReliableAmountSupport } from '../../src/services/outcome/AmountSupportRepair';
import { rawDocument } from './fixtures/outcome-fixtures';

describe('Party and procedural-role contract', () => {
  it('recognizes a named employee and employer from a labor-dispute title', () => {
    const result = LaborInfoParserAdapter.recognizeParties('', '廖某与甲有限公司劳动争议二审民事判决书');
    expect(result.employeeParty).toBe('廖某');
    expect(result.employerParty).toBe('甲有限公司');
  });

  it('does not let nested original-trial labels overwrite the real appellant parties', () => {
    const text = [
      '上诉人（原审被告）：广州曰之昇科技有限公司，住所地广州市。',
      '被上诉人（原审原告）：廖春群，女，住湖南省。',
      '劳动关系是指用人单位招用劳动者为其成员。',
    ].join('\n');
    const result = LaborInfoParserAdapter.recognizeParties(text);
    expect(result.employeeParty).toBe('廖春群');
    expect(result.employerParty).toBe('广州曰之昇科技有限公司');
  });

  it('recognizes employee and employer when consolidated cases list both as appellants', () => {
    const text = [
      '上诉人［一案原告、另一案被告］:广州市雅莲酒店管理有限公司，住所地广州市。',
      '上诉人［一案被告、另一案原告］:张先甫，男，住湖北省。',
    ].join('\n');
    const result = LaborInfoParserAdapter.recognizeParties(text);
    expect(result.employeeParty).toBe('张先甫');
    expect(result.employerParty).toBe('广州市雅莲酒店管理有限公司');
  });

  it.each([
    '劳动者为其成员，依法参加工会活动。',
    '劳动者系依法享有劳动权利的主体。',
    '劳动者依法享有取得劳动报酬的权利。',
    '劳动者应当完成劳动任务。',
  ])('does not manufacture an employee name from generic legal text: %s', (text) => {
    const result = LaborInfoParserAdapter.recognizeParties(`原告：甲有限公司。被告：乙有限公司。${text}`);
    expect(result.employeeParty).toBeNull();
    expect(result.employeeParty).not.toBe('为其成员');
  });

  it('never treats an employer company as the employee', () => {
    const result = LaborInfoParserAdapter.recognizeParties('原告：甲有限公司。被告：乙有限公司。');
    expect(result.employeeParty).toBeNull();
    expect(result.employerParty).toBe('甲有限公司');
  });

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

  it('extracts only real party identities before the fact-finding section', () => {
    const text = [
      '上海广万东建筑设计咨询有限公司与吴利国劳动合同纠纷一审民事判决书',
      '原告：上海广万东建筑设计咨询有限公司',
      '被告：吴利国',
      '本院认为，被告：效益工资是根据公司的经济状况。',
      '被告：年终奖是年终的事情。',
    ].join('\n');
    const result = LaborInfoParserAdapter.recognizeParties(text);

    expect(result.parties).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '上海广万东建筑设计咨询有限公司', laborRole: 'employer', proceduralRoles: ['plaintiff'] }),
      expect.objectContaining({ name: '吴利国', laborRole: 'employee', proceduralRoles: ['defendant'] }),
    ]));
    expect(result.parties).toHaveLength(2);
  });

  it.each([
    '被告：效益工资是根据公司的经济状况',
    '被告：年终奖是年终的事情',
    '被告：对呀',
    '被告：反正我认为作为奖金就是一个可浮动的',
    '被告：……浮动的前提下我这个月工资还能确保跟去年持平吗？',
    '被告：那就是啊',
  ])('does not create a party from statement-like role text: %s', (statement) => {
    const result = LaborInfoParserAdapter.recognizeParties(`原告：上海广万东建筑设计咨询有限公司\n被告：吴利国\n庭审记录\n${statement}`);
    expect(result.parties?.map((party) => party.name)).toEqual([
      '上海广万东建筑设计咨询有限公司',
      '吴利国',
    ]);
  });

  it('preserves nested appellate and counterclaim procedural roles', () => {
    const result = LaborInfoParserAdapter.recognizeParties([
      '上诉人（原审被告）：甲有限公司。',
      '被上诉人（原审原告）：张某。',
      '反诉原告：张某。反诉被告：甲有限公司。',
    ].join(''));

    expect(result.parties).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '甲有限公司', proceduralRoles: expect.arrayContaining(['appellant', 'counterclaimDefendant']) }),
      expect.objectContaining({ name: '张某', proceduralRoles: expect.arrayContaining(['appellee', 'counterclaimPlaintiff']) }),
    ]));
  });

  it('keeps evidence provider attribution independent from party-role filtering', () => {
    const result = LaborInfoParserAdapter.parseDetailed(rawDocument(
      'party-role-evidence-regression',
      '原告：上海广万东建筑设计咨询有限公司。被告：吴利国。庭审记录：被告：对呀。被告上海广万东建筑设计咨询有限公司提交考勤记录作为证据。',
    ));
    expect(result.evidence.find((item) => item.name === '考勤记录/打卡数据')?.provider).toBe('employer');
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

  it('does not derive an amount outcome from missing, zero, or invalid requests', () => {
    expect(AmountResolver.resolveAmountOutcome(undefined, 100)).toBeUndefined();
    expect(AmountResolver.resolveAmountOutcome(0, 100)).toBeUndefined();
    expect(AmountResolver.resolveAmountOutcome(-1, 100)).toBeUndefined();
  });
});

describe('Reliable amount repair guardrails', () => {
  const parties = [
    { id: 'employee-party', name: '张某', laborRole: 'employee' as const, proceduralRoles: ['plaintiff' as const] },
    { id: 'employer-party', name: '甲有限公司', laborRole: 'employer' as const, proceduralRoles: ['defendant' as const] },
  ];

  it('repairs only a single monetary award addressed to the claimant', () => {
    const claim = {
      id: 'reliable-amount', claimName: '加班工资', claimType: 'overtime_pay', claimant: 'employee' as const, claimantRole: 'employee' as const, claimantPartyId: 'employee-party',
      supportStatus: 'supported' as const, requestedAmount: 3494.10, awardedAmount: 1341.38, sourceText: '原告请求加班工资3494.10元',
      judgmentItems: [{ action: 'pay' as const, targetPartyRole: 'plaintiff' as const, targetClaimType: 'overtime_pay', awardedAmount: 1341.38, sourceText: '被告支付原告加班工资1341.38元' }],
    };
    expect(hasReliableAmountCorrespondence(claim, parties)).toBe(true);
    expect(repairReliableAmountSupport(claim, parties).supportStatus).toBe('partially_supported');
  });

  it('excludes non-monetary confirmation and employer negative-payment requests', () => {
    const confirmation = {
      id: 'confirmation', claimName: '劳动关系解除确认', claimType: 'employment_termination_confirmation', claimant: 'employee' as const, supportStatus: 'supported' as const,
      requestedAmount: 3000, awardedAmount: 1000, sourceText: '请求确认劳动关系解除3000元', judgmentItems: [{ action: 'support' as const, targetPartyRole: 'plaintiff' as const, awardedAmount: 1000, sourceText: '确认劳动关系解除1000元' }],
    };
    const employerNegativePayment = {
      id: 'employer-negative', claimName: '经济补偿金', claimType: 'economic_compensation', claimant: 'employer' as const, claimantRole: 'employer' as const, claimantPartyId: 'employer-party',
      supportStatus: 'supported' as const, requestedAmount: 34970.12, awardedAmount: 1341.38, sourceText: '原告公司请求无需支付经济补偿金34970.12元',
      judgmentItems: [{ action: 'pay' as const, targetPartyRole: 'defendant' as const, awardedAmount: 1341.38, sourceText: '判令原告向被告支付经济补偿金1341.38元' }],
    };
    const employerPlaintiffParties = [
      { id: 'employee-party', name: '张某', laborRole: 'employee' as const, proceduralRoles: ['defendant' as const] },
      { id: 'employer-party', name: '甲有限公司', laborRole: 'employer' as const, proceduralRoles: ['plaintiff' as const] },
    ];
    expect(repairReliableAmountSupport(confirmation, parties).supportStatus).toBe('supported');
    expect(repairReliableAmountSupport(employerNegativePayment, employerPlaintiffParties).supportStatus).toBe('supported');
  });

  it('does not repair multiple amount actions with ambiguous correspondence', () => {
    const claim = {
      id: 'ambiguous-amount', claimName: '经济补偿金', claimType: 'economic_compensation', claimant: 'employee' as const, claimantRole: 'employee' as const, claimantPartyId: 'employee-party',
      supportStatus: 'supported' as const, requestedAmount: 3494.10, awardedAmount: 1341.38, sourceText: '原告请求经济补偿金3494.10元',
      judgmentItems: [
        { action: 'pay' as const, targetPartyRole: 'plaintiff' as const, awardedAmount: 1341.38, sourceText: '支付经济补偿金1341.38元' },
        { action: 'pay' as const, targetPartyRole: 'plaintiff' as const, awardedAmount: 900, sourceText: '另行支付经济补偿金900元' },
      ],
    };
    expect(hasReliableAmountCorrespondence(claim, parties)).toBe(false);
    expect(repairReliableAmountSupport(claim, parties).supportStatus).toBe('supported');
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
