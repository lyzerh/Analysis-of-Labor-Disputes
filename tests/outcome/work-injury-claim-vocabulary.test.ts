import { describe, expect, it } from 'vitest';
import { LaborInfoParserAdapter } from '../../src/services/parser/LaborInfoParserAdapter';
import { claimTypeLabel } from '../../src/services/presentation/ClaimTypePresentation';
import type { RawDocument } from '../../src/types';

const parse = (id: string, body: string, ssjl?: string, title = `${id}工伤保险待遇纠纷`) => LaborInfoParserAdapter.parseDetailed({
  id,
  title,
  source: 'laborinfo',
  rawText: body,
  publishedAt: '2024-01-01',
  sourceMetadata: ssjl ? { ssjl } : {},
} as RawDocument);

describe('work-injury claim vocabulary', () => {
  it('covers the 李成云与上海浦东新区关兴教育培训中心工伤待遇 case shape', () => {
    const result = parse(
      'raw_laborinfo_lcy_work_injury',
      '本案系工伤保险待遇纠纷。原告：李某。被告：甲公司。原告请求支付一次性伤残补助金41825元、劳动能力鉴定费350元、停工留薪期工资、工伤医疗费、护理费、住院伙食补助费、交通费及食宿费。判决如下：被告支付一次性伤残补助金41825元及劳动能力鉴定费350元，驳回其他诉讼请求。',
      undefined,
      '李成云与上海浦东新区关兴教育培训中心工伤保险待遇纠纷一案',
    );

    expect(result.claims.map((claim) => claim.claimType)).toEqual(expect.arrayContaining([
      'disability_allowance',
      'labor_capacity_assessment_fee',
      'work_injury_allowance',
      'work_injury_medical_expense',
      'nursing_fee',
      'hospital_food_subsidy',
      'transportation_accommodation_fee',
    ]));
    expect(result.claims.length).toBeGreaterThanOrEqual(7);
    expect(result.claims.find((claim) => claim.claimType === 'disability_allowance')).toMatchObject({
      claimName: '一次性伤残补助金',
      claimSourceKind: 'litigation_request',
    });
  });

  it('recognizes both one-time medical/employment subsidies', () => {
    const result = parse(
      'work-injury-subsidies',
      '工伤保险待遇争议。原告请求支付一次性工伤医疗补助金、一次性伤残就业补助金。判决如下：驳回原告其他诉讼请求。',
    );
    expect(result.claims.map((claim) => claim.claimType)).toEqual(expect.arrayContaining([
      'work_injury_medical_subsidy',
      'disability_employment_subsidy',
    ]));
  });

  it('requires work-injury context for generic 鉴定费', () => {
    const workInjury = parse(
      'contextual-assessment-fee',
      '劳动能力鉴定后发生工伤待遇争议。原告请求支付鉴定费350元。判决如下：支付鉴定费350元。',
    );
    expect(workInjury.claims.some((claim) => claim.claimType === 'labor_capacity_assessment_fee')).toBe(true);

    const ordinary = parse(
      'ordinary-assessment-fee',
      '原告请求支付普通鉴定费350元。判决如下：驳回原告其他诉讼请求。',
    );
    expect(ordinary.claims.some((claim) => claim.claimType === 'labor_capacity_assessment_fee')).toBe(false);
  });

  it('does not create a new claim from a disposition-only benefit mention', () => {
    const result = parse(
      'disposition-only-benefit',
      '原告：李某。被告：甲公司。判决如下：被告支付一次性伤残补助金41825元及劳动能力鉴定费350元。',
    );
    expect(result.claims.some((claim) => claim.claimType === 'disability_allowance')).toBe(false);
    expect(result.claims.some((claim) => claim.claimType === 'labor_capacity_assessment_fee')).toBe(false);
  });

  it('does not classify generic medical, nursing, or transport fees without injury context', () => {
    const ordinary = parse(
      'ordinary-fees',
      '原告请求支付医疗费、护理费、交通费及食宿费。判决如下：驳回原告其他诉讼请求。',
    );
    expect(ordinary.claims.map((claim) => claim.claimType)).not.toEqual(expect.arrayContaining([
      'work_injury_medical_expense',
      'nursing_fee',
      'transportation_accommodation_fee',
    ]));
  });

  it('keeps machine types and presents the new types in Chinese', () => {
    expect(claimTypeLabel('disability_allowance')).toBe('一次性伤残补助金');
    expect(claimTypeLabel('work_injury_medical_subsidy')).toBe('一次性工伤医疗补助金');
    expect(claimTypeLabel('disability_employment_subsidy')).toBe('一次性伤残就业补助金');
    expect(claimTypeLabel('labor_capacity_assessment_fee')).toBe('劳动能力鉴定费');
    expect(claimTypeLabel('work_injury_medical_expense')).toBe('工伤医疗费');
    expect(claimTypeLabel('work_injury_allowance')).toBe('停工留薪期待遇');
    expect(claimTypeLabel('nursing_fee')).toBe('护理费');
    expect(claimTypeLabel('hospital_food_subsidy')).toBe('住院伙食补助费');
    expect(claimTypeLabel('transportation_accommodation_fee')).toBe('交通食宿费');
  });
});
