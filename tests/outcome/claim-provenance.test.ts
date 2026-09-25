import { describe, expect, it } from 'vitest';
import { LaborInfoParserAdapter } from '../../src/services/parser/LaborInfoParserAdapter';
import { buildClaimIdentity } from '../../src/services/gold/ClaimIdentity';
import type { RawDocument } from '../../src/types';

const raw = (id: string, rawText: string, sourceMetadata: Record<string, unknown> = {}): RawDocument => ({
  id,
  title: id,
  source: 'laborinfo',
  rawText,
  publishedAt: '2024-01-01',
  sourceMetadata,
} as RawDocument);

describe('claim request provenance', () => {
  it('accepts an explicit litigation request section as claimText', () => {
    const parsed = LaborInfoParserAdapter.parseDetailed(raw(
      'litigation-request',
      '原告：张某。被告：甲公司。原告请求支付加班工资10000元。判决如下：驳回原告加班工资请求。',
    ));
    const claim = parsed.claims.find((item) => item.claimType === 'overtime_pay');
    expect(claim).toMatchObject({ claimSourceKind: 'litigation_request', claimSourceField: 'fbqw' });
    expect(claim?.sourceText).toContain('原告请求支付加班工资');
  });

  it('accepts an appeal request as claimText', () => {
    const parsed = LaborInfoParserAdapter.parseDetailed(raw(
      'appeal-request',
      '上诉人：甲公司。被上诉人：张某。上诉人请求撤销原判。二审判决如下：驳回上诉，维持原判。',
    ));
    const claim = parsed.claims.find((item) => item.proceduralBasis === 'appeal_request');
    expect(claim).toMatchObject({ claimSourceKind: 'appeal_request' });
    expect(claim?.sourceText).toContain('上诉人请求撤销原判');
  });

  it('accepts an arbitration request as claimText', () => {
    const parsed = LaborInfoParserAdapter.parseDetailed(raw(
      'arbitration-request',
      '申请人：张某。被申请人：甲公司。申请仲裁请求支付工资10000元。裁决如下：被申请人支付工资10000元。',
    ));
    const claim = parsed.claims.find((item) => item.claimType === 'unpaid_remuneration');
    expect(claim).toMatchObject({ claimSourceKind: 'arbitration_request' });
    expect(claim?.sourceText).toContain('申请仲裁请求支付工资');
  });

  it('uses structured ssjl request text when available', () => {
    const parsed = LaborInfoParserAdapter.parseDetailed(raw(
      'ssjl-request',
      '原告：张某。被告：甲公司。本院认为，张某的加班工资请求证据不足。判决如下：驳回原告请求。',
      { ssjl: '原告向法院提出诉讼请求：请求支付加班工资10000元。' },
    ));
    const claim = parsed.claims.find((item) => item.claimType === 'overtime_pay');
    expect(claim).toMatchObject({ claimSourceKind: 'litigation_request', claimSourceField: 'ssjl' });
    expect(claim?.sourceText).toContain('请求支付加班工资');
  });

  it.each([
    ['fxgc', '法院分析：本院认为，劳动者的年休假工资请求证据不足。'],
    ['cpjg', '裁判主文：驳回原告关于年休假工资的诉讼请求。'],
  ] as const)('does not use %s as claimText', (field, sectionText) => {
    const parsed = LaborInfoParserAdapter.parseDetailed(raw(
      `wrong-${field}`,
      `原告：林某。被告：甲公司。${sectionText}`,
      { [field]: sectionText },
    ));
    const claim = parsed.claims.find((item) => item.claimType === 'annual_leave_pay');
    expect(claim?.sourceText || '').not.toContain('本院认为');
    expect(claim?.sourceText || '').not.toContain('驳回原告');
    expect(claim?.claimSourceKind).toBe('unknown');
  });

  it.each([
    '本院认为，林某确认各年度休假情况，但未休年休假工资请求本院不予支持。',
    '关于争议焦点一，未休年休假工资请求本院认为该项主张不予采纳。',
  ])('rejects reasoning and issue-focus sentences as request text', (reasoning) => {
    const parsed = LaborInfoParserAdapter.parseDetailed(raw(
      'reasoning-only',
      `原告：劳动者甲。被告：某公司。${reasoning.replace('年休假工资请求', '未休年休假工资请求')}判决如下：驳回原告其他诉讼请求。`,
    ));
    const claim = parsed.claims.find((item) => item.claimType === 'annual_leave_pay');
    expect(claim?.sourceText || '').toBe('');
    expect(claim?.claimSourceKind).toBe('unknown');
  });

  it('keeps the claim label when no reliable request text exists', () => {
    const parsed = LaborInfoParserAdapter.parseDetailed(raw(
      'reasoning-only-label',
      '原告：劳动者甲。被告：某公司。本院认为，未休年休假工资请求不予支持。判决如下：驳回原告其他诉讼请求。',
    ));
    const claim = parsed.claims.find((item) => item.claimType === 'annual_leave_pay');
    expect(claim?.claimName).toBe('未休年休假工资');
    expect(claim?.sourceText).toBe('');
  });

  it('keeps rejected reasoning available as court reasoning evidence', () => {
    const parsed = LaborInfoParserAdapter.parseDetailed(raw(
      'reasoning-evidence',
      '原告：劳动者甲。被告：某公司。本院认为，未休年休假工资请求证据不足，本院不予支持。判决如下：驳回原告其他诉讼请求。',
    ));
    expect(parsed.courtReasoning).toContain('未休年休假工资请求');
    expect(parsed.claims.find((item) => item.claimType === 'annual_leave_pay')?.sourceText).toBe('');
  });

  it('rejects work-injury defence and argument text while preserving a clear request sentence', () => {
    const parsed = LaborInfoParserAdapter.parseDetailed(raw(
      'work-injury-defence-provenance',
      '工伤保险待遇纠纷。原告：劳动者甲。被告：某教育培训中心。'
        + '关于一次性伤残补助金，因为原告在交通事故中没有主张。'
        + '原告针对被告的诉讼请求辩称，仲裁关于一次性伤残补助金和劳动能力鉴定费的认定不应支持。'
        + '原告向本院提出诉讼请求，判令被告支付停工留薪期工资10000元。'
        + '判决如下：驳回其他诉讼请求。',
    ));

    const disability = parsed.claims.find((item) => item.claimType === 'disability_allowance');
    const assessment = parsed.claims.find((item) => item.claimType === 'labor_capacity_assessment_fee');
    const allowance = parsed.claims.find((item) => item.claimType === 'work_injury_allowance');
    expect(disability?.sourceText).toBe('');
    expect(assessment?.sourceText).toBe('');
    expect(disability?.claimSourceKind).toBe('unknown');
    expect(assessment?.claimSourceKind).toBe('unknown');
    expect(allowance?.sourceText).toContain('向本院提出诉讼请求');
    expect(allowance?.sourceText).toContain('判令被告支付停工留薪期工资');
    expect(allowance?.claimSourceKind).toBe('litigation_request');
  });

  it('allows a party statement only when it contains explicit request intent', () => {
    const parsed = LaborInfoParserAdapter.parseDetailed(raw(
      'party-statement-request',
      '原告：张某。被告：甲公司。被告答辩称，但被告反诉请求支付加班工资1000元。'
        + '本院认为，反诉请求依法审理。判决如下：驳回原告其他诉讼请求。',
    ));
    const claim = parsed.claims.find((item) => item.claimType === 'overtime_pay');
    expect(claim?.sourceText).toContain('反诉请求支付加班工资');
    expect(claim?.claimSourceKind).toBe('party_statement');
  });

  it('binds an explicit counterclaim request to the counterclaim plaintiff', () => {
    const parsed = LaborInfoParserAdapter.parseDetailed(raw(
      'counterclaim-request',
      '原告：甲公司。被告：劳动者乙。被告反诉请求支付经济补偿金144420元。判决如下：反诉被告支付反诉原告经济补偿金144420元。',
    ));
    const claim = parsed.claims.find((item) => item.claimType === 'economic_compensation');
    expect(claim).toMatchObject({ claimantRole: 'employee', proceduralBasis: 'counterclaim', claimSourceKind: 'litigation_request' });
    expect(parsed.parties?.find((party) => party.name === '劳动者乙')?.proceduralRoles).toContain('counterclaimPlaintiff');
  });

  it('keeps an employee arbitration request separate from an employer appeal applicant', () => {
    const parsed = LaborInfoParserAdapter.parseDetailed(raw(
      'appeal-underlying-request',
      '上诉人：甲公司。被上诉人：张某。仲裁请求：请求支付加班工资5250元。二审判决如下：驳回上诉，维持原判。',
    ));
    const claim = parsed.claims.find((item) => item.claimType === 'overtime_pay');
    expect(claim).toMatchObject({ claimantRole: 'employee', claimSourceKind: 'arbitration_request', proceduralBasis: 'original_claim' });
    expect(claim?.claimantPartyId).toBe(parsed.parties?.find((party) => party.laborRole === 'employee')?.id);
  });

  it('keeps named employee and employer appeal requests as separate identities', () => {
    const parsed = LaborInfoParserAdapter.parseDetailed(raw(
      'appeal-perspectives',
      '广东粤建工程项目管理有限公司云浮分公司、罗恒平劳动合同纠纷二审。'
        + '上诉人：广东粤建工程项目管理有限公司云浮分公司。上诉人：罗恒平。被上诉人：广东粤建工程项目管理有限公司云浮分公司。'
        + '罗恒平在仲裁时提出的请求是加班工资5250元。'
        + '上诉人罗恒平向本院提起上诉，请求补发加班工资5250元。'
        + '上诉人广东粤建工程项目管理有限公司云浮分公司向本院提起上诉，请求改判无需支付加班工资。'
        + '判决如下：驳回上诉，维持原判。',
    ));
    const overtimeClaims = parsed.claims.filter((item) => item.claimType === 'overtime_pay');
    expect(overtimeClaims.length).toBeGreaterThanOrEqual(2);
    const employeeClaim = overtimeClaims.find((item) => item.claimantRole === 'employee');
    const employerAppeal = overtimeClaims.find((item) => item.claimantRole === 'employer' && item.proceduralBasis === 'appeal_request');
    expect(employeeClaim).toMatchObject({ claimantRole: 'employee' });
    expect(employerAppeal).toMatchObject({ claimantRole: 'employer', proceduralBasis: 'appeal_request', claimSourceKind: 'appeal_request' });
    expect(employerAppeal?.sourceText).not.toBe(employeeClaim?.sourceText);
    expect(employerAppeal?.sourceText).toContain('无需支付加班工资');
    expect(buildClaimIdentity(parsed as any, employeeClaim!).claimIdentityHash).not.toBe(buildClaimIdentity(parsed as any, employerAppeal!).claimIdentityHash);
  });

  it('allows an employer appeal identity with unavailable source text without copying employee text', () => {
    const parsed = LaborInfoParserAdapter.parseDetailed(raw(
      'appeal-without-source',
      '上诉人：甲公司。被上诉人：张某。张某请求支付双倍工资84000元。上诉人甲公司认为原判认定双倍工资错误。二审判决如下：驳回上诉，维持原判。',
    ));
    const claims = parsed.claims.filter((item) => item.claimType === 'double_wage_difference');
    const employeeClaim = claims.find((item) => item.claimantRole === 'employee');
    const employerAppeal = claims.find((item) => item.claimantRole === 'employer' && item.proceduralBasis === 'appeal_request');
    expect(employeeClaim).toMatchObject({ claimSourceKind: 'litigation_request' });
    expect(employeeClaim?.sourceText).toContain('张某请求支付双倍工资');
    expect(employerAppeal).toMatchObject({ sourceText: '', claimantRole: 'employer', claimSourceKind: 'appeal_request' });
  });
});
