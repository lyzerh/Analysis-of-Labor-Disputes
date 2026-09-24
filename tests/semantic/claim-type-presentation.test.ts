import { describe, expect, it } from 'vitest';
import { claimTypeLabel, presentClaimType, presentJudgmentItems } from '../../src/services/presentation/ClaimTypePresentation';

describe('legal presentation labels', () => {
  it.each([
    ['economic_compensation', '经济补偿金'],
    ['overtime_pay', '加班工资'],
    ['wage', '未支付劳动报酬'],
    ['procedural_appeal', '程序性上诉请求'],
  ])('maps %s without changing the machine value', (raw, label) => {
    expect(claimTypeLabel(raw)).toBe(label);
    expect(presentClaimType(raw).rawValue).toBe(raw);
  });

  it('uses a safe Chinese fallback while retaining an unknown raw enum for technical details', () => {
    expect(presentClaimType('new_claim_type')).toMatchObject({
      label: '其他劳动争议请求',
      rawValue: 'new_claim_type',
      known: false,
    });
  });
});

describe('judgment item presentation', () => {
  it('uses stable array order and preserves the original IDs', () => {
    expect(presentJudgmentItems([
      { id: 'judgment-claim-1-11', text: '支付经济补偿金。' },
      { id: 'judgment-claim-1-2', text: '驳回其他诉讼请求。' },
    ])).toEqual([
      { id: 'judgment-claim-1-11', label: '裁判项 1', text: '支付经济补偿金。' },
      { id: 'judgment-claim-1-2', label: '裁判项 2', text: '驳回其他诉讼请求。' },
    ]);
  });

  it('does not expose a missing raw ID as the primary label', () => {
    expect(presentJudgmentItems([{ id: 'judgment-claim-1-3', text: '   ' }])[0]).toEqual({
      id: 'judgment-claim-1-3',
      label: '裁判项 1',
      text: undefined,
    });
  });
});
