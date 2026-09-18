import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LaborInfoParserAdapter } from '../../src/services/parser/LaborInfoParserAdapter';
import { calculateProvenanceHash } from '../../src/services/analysis/AnalysisRunService';
import { rawDocument } from './fixtures/outcome-fixtures';

describe('Batch 4 procedural-role and claim-disposition contract', () => {
  it('resolves termination confirmation as supported', () => {
    const result = LaborInfoParserAdapter.parseDetailed(rawDocument('termination-confirmation', '原告：张某。被告：甲有限公司。原告请求确认劳动关系。判决如下：确认双方劳动关系已经解除。'));
    expect(result.claims).toContainEqual(expect.objectContaining({ claimName: '劳动关系解除确认', supportStatus: 'supported' }));
  });

  it('recognizes the labor-contract relationship terminated alias', () => {
    const result = LaborInfoParserAdapter.parseDetailed(rawDocument('contract-terminated', '原告：张某。被告：甲有限公司。原告请求确认劳动合同关系。判决如下：确认双方劳动合同关系已经解除。'));
    expect(result.claims).toContainEqual(expect.objectContaining({ claimName: '劳动关系解除确认', supportStatus: 'supported' }));
  });

  it('does not let rejection of company claims reject employee payment claims', () => {
    const result = LaborInfoParserAdapter.parseDetailed(rawDocument('company-claims-rejected', '原告：甲有限公司。被告：张某。原告请求确认无需支付经济补偿金，被告请求支付经济补偿金。判决如下：驳回公司的全部诉讼请求；支付张某经济补偿金52584元。'));
    expect(result.claims.find((claim) => claim.claimName.includes('经济补偿金'))?.supportStatus).toBe('supported');
    expect(result.employeeOutcome).toBe('supported');
    expect(result.employerOutcome).toBe('not_supported');
  });

  it('inherits original judgment when an employer appeal is dismissed and original judgment maintained', () => {
    const result = LaborInfoParserAdapter.parseDetailed(rawDocument('appeal-maintained', '上诉人：甲有限公司。被上诉人：张某。上诉人请求撤销原判。原审判决如下：确认双方劳动合同关系已经解除；甲有限公司支付张某经济补偿金52584元。二审判决如下：驳回上诉，维持原判。'));
    expect(result.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({ claimName: '劳动关系解除确认', supportStatus: 'supported' }),
      expect.objectContaining({ claimName: '解除劳动合同经济补偿金', supportStatus: 'supported' }),
    ]));
    expect(result.employeeOutcome).toBe('supported');
    expect(result.employerOutcome).toBe('not_supported');
  });

  it('maps employee plaintiff and employer defendant', () => {
    const parties = LaborInfoParserAdapter.recognizeParties('原告：侯小军。被告：东莞市汇成模具科技有限公司。');
    expect(parties.applicantRole).toBe('employee');
    expect(parties.parties).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '侯小军', laborRole: 'employee', proceduralRoles: expect.arrayContaining(['plaintiff']) }),
      expect.objectContaining({ name: '东莞市汇成模具科技有限公司', laborRole: 'employer', proceduralRoles: expect.arrayContaining(['defendant']) }),
    ]));
  });

  it('maps employer appellant and employee appellee', () => {
    const parties = LaborInfoParserAdapter.recognizeParties('上诉人：甲有限公司。被上诉人：张某。');
    expect(parties.applicantRole).toBe('employer');
    expect(parties.parties).toEqual(expect.arrayContaining([
      expect.objectContaining({ laborRole: 'employer', proceduralRoles: expect.arrayContaining(['appellant']) }),
      expect.objectContaining({ laborRole: 'employee', proceduralRoles: expect.arrayContaining(['appellee']) }),
    ]));
  });

  it('keeps counterclaim plaintiff and defendant distinct when the document names them', () => {
    const parties = LaborInfoParserAdapter.recognizeParties('原告：甲有限公司。被告：张某。反诉原告：张某。反诉被告：甲有限公司。');
    expect(parties.parties).toEqual(expect.arrayContaining([
      expect.objectContaining({ laborRole: 'employee', proceduralRoles: expect.arrayContaining(['counterclaimPlaintiff']) }),
      expect.objectContaining({ laborRole: 'employer', proceduralRoles: expect.arrayContaining(['counterclaimDefendant']) }),
    ]));
  });

  it('resolves explicit wage and payment dispositive text', () => {
    const result = LaborInfoParserAdapter.parseDetailed(rawDocument('wage-payment', '原告：侯小军。被告：甲有限公司。原告请求支付劳动报酬。判决如下：被告支付原告劳动报酬57060元。'));
    expect(result.claims).toContainEqual(expect.objectContaining({ claimName: '拖欠/未付劳动报酬', supportStatus: 'supported', awardedAmount: 57060 }));
  });

  it('resolves double-wage difference as partial when awarded below requested', () => {
    const result = LaborInfoParserAdapter.parseDetailed(rawDocument('double-wage-partial', '原告：黄玉东。被告：甲有限公司。原告请求支付未签订书面劳动合同二倍工资差额50000元。判决如下：被告支付原告未签订书面劳动合同二倍工资差额33040元。'));
    expect(result.claims).toContainEqual(expect.objectContaining({ claimName: '未签书面劳动合同二倍工资差额', supportStatus: 'partially_supported', requestedAmount: 50000, awardedAmount: 33040 }));
  });

  it('does not let reject-other-claims erase an explicitly paid claim', () => {
    const result = LaborInfoParserAdapter.parseDetailed(rawDocument('reject-other', '原告：黄玉东。被告：甲有限公司。原告请求支付停工工资、二倍工资差额及其他请求。判决如下：被告支付原告停工工资7798元；驳回原告其他诉讼请求。'));
    expect(result.claims.find((claim) => claim.claimName === '拖欠/未付劳动报酬')?.supportStatus).toBe('supported');
  });

  it.each([
    ['（2021）粤19民终3199号 李仙浓', '上诉人：甲有限公司。被上诉人：李仙浓。上诉人请求撤销原判。原审判决如下：确认双方劳动合同关系已经解除；甲有限公司支付李仙浓经济补偿金52584元。二审判决如下：驳回上诉，维持原判。', '李仙浓', 52584],
    ['（2021）粤19民终3310号 何明贵', '上诉人：甲有限公司。被上诉人：何明贵。上诉人请求撤销原判。原审判决如下：确认双方劳动合同关系已经解除；甲有限公司支付何明贵经济补偿金69000元。二审判决如下：驳回上诉，维持原判。', '何明贵', 69000],
  ] as const)('%s resolves maintained appeal and employee result', (_label, text, employee, amount) => {
    const result = LaborInfoParserAdapter.parseDetailed(rawDocument(`real-${employee}`, text));
    expect(result.employeeParty).toBe(employee);
    expect(result.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({ claimName: '劳动关系解除确认', supportStatus: 'supported' }),
      expect.objectContaining({ claimName: '解除劳动合同经济补偿金', supportStatus: 'supported', awardedAmount: amount }),
      expect.objectContaining({ claimName: '上诉请求（撤销原判）', claimant: 'employer', supportStatus: 'not_supported' }),
    ]));
    expect(result.employeeOutcome).toBe('supported');
    expect(result.employerOutcome).toBe('not_supported');
  });

  it.each([
    ['李仙浓', '（2021）粤19民终3199号', 52584],
    ['何明贵', '（2021）粤19民终3310号', 69000],
  ] as const)('%s recognizes a real LaborInfo heading without a line break before 上诉人', (employee, caseNumber, amount) => {
    const text = `广东省东莞市中级人民法院民事判决书${caseNumber}上诉人（原审原告）：星星精密科技（东莞）有限公司，被上诉人（原审被告）：${employee}。星星精密科技（东莞）有限公司向原审法院提出诉讼请求：无需向${employee}支付经济补偿金${amount}元。原审法院判决如下：确认星星精密科技（东莞）有限公司与${employee}的劳动合同关系已经解除；限星星精密科技（东莞）有限公司向${employee}支付经济补偿金${amount}元。二审判决如下：驳回上诉，维持原判。`;
    const result = LaborInfoParserAdapter.parseDetailed(rawDocument(`real-heading-${employee}`, text));

    expect(result.applicantRole).toBe('employer');
    expect(result.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({ claimName: '劳动关系解除确认', supportStatus: 'supported' }),
      expect.objectContaining({ claimName: '上诉请求（撤销原判）', claimant: 'employer', supportStatus: 'not_supported' }),
    ]));
    expect(result.employeeOutcome).not.toBe('unclear');
    expect(result.employerOutcome).not.toBe('unclear');
  });

  it('does not misclassify an employee wage claim as a defendant counterclaim', () => {
    const result = LaborInfoParserAdapter.parseDetailed(rawDocument(
      'real-wage-14860-heading',
      '广东省东莞市第二人民法院民事判决书（2020）粤1972民初14860号原告：侯小军，男。被告：东莞市汇成模具科技有限公司。原告因被告拖欠劳动报酬未付，向法院提起诉讼，请求判令：被告向原告支付业务提成费57060元。本院认为被告应向原告支付业务费57060元。判决如下：被告向原告支付业务费用57060元。',
    ));
    expect(result.applicantRole).toBe('employee');
    expect(result.claims).toContainEqual(expect.objectContaining({
      claimName: '拖欠/未付劳动报酬',
      claimantRole: 'employee',
      proceduralBasis: 'original_claim',
      supportStatus: 'supported',
    }));
    expect(result.employeeOutcome).toBe('supported');
  });

  it('resolves 侯小军 14860 payment as an employee claim', () => {
    const result = LaborInfoParserAdapter.parseDetailed(rawDocument('real-（2020）粤1972民初14860号', '原告：侯小军。被告：东莞市汇成模具科技有限公司。原告请求支付业务提成/劳动报酬57060元。判决如下：被告支付原告业务提成/劳动报酬57060元。'));
    expect(result.claims).toContainEqual(expect.objectContaining({ claimName: '拖欠/未付劳动报酬', claimant: 'employee', supportStatus: 'supported', awardedAmount: 57060 }));
    expect(result.employeeOutcome).toBe('supported');
  });

  it('resolves 黄玉东 4065 mixed payment items independently', () => {
    const result = LaborInfoParserAdapter.parseDetailed(rawDocument('real-（2023）粤1972民初4065号', '原告：黄玉东。被告：甲有限公司。原告请求确认劳动关系解除、停工工资7798元及未签订书面劳动合同二倍工资差额50000元。判决如下：确认双方劳动关系于2022年4月29日解除；被告支付原告停工工资7798元；被告支付原告未签订书面劳动合同二倍工资差额33040元；驳回原告其他诉讼请求。'));
    expect(result.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({ claimName: '劳动关系解除确认', supportStatus: 'supported' }),
      expect.objectContaining({ claimName: '拖欠/未付劳动报酬', claimantRole: 'employee', supportStatus: 'supported', awardedAmount: 7798 }),
      expect.objectContaining({ claimName: '未签书面劳动合同二倍工资差额', supportStatus: 'partially_supported', requestedAmount: 50000, awardedAmount: 33040 }),
    ]));
    expect(result.employeeOutcome).toBe('partially_supported');
  });

  it('uses deterministic parsing without LLM/network dependencies', () => {
    const source = readFileSync(new URL('../../src/services/parser/LaborInfoParserAdapter.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/fetch\(|Gemini|@google\/genai|Math\.random/);
  });

  it('does not mutate provenance inputs while resolving outcomes', async () => {
    const inputs = {
      mode: 'exhaustive' as const,
      snapshotFingerprint: 'snapshot-fp',
      candidateHash: 'candidate-hash',
      inputCaseIds: ['case-1', 'case-2'],
      engineVersions: { parserVersion: 'parser-v1', rulesetVersion: 'rules-v1' },
      semantic: { enabled: false },
    };
    const before = await calculateProvenanceHash(inputs);
    LaborInfoParserAdapter.parseDetailed(rawDocument('provenance-stable', '原告：张某。被告：甲有限公司。原告请求支付工资。判决如下：被告支付原告工资1000元。'));
    expect(await calculateProvenanceHash(inputs)).toBe(before);
  });

  it('exposes procedural identity mapping in the case analysis UI', () => {
    const source = readFileSync(new URL('../../src/components/CaseAnalysisView.tsx', import.meta.url), 'utf8');
    expect(source).toMatch(/程序身份映射/);
    expect(source).toMatch(/未识别/);
    expect(source).toMatch(/proceduralRoles/);
    expect(source).toMatch(/PipelineWorkspace/);
    expect(source).toMatch(/无法确定：/);
  });
});
