import type { RawDocument } from '../../../src/types';

export function rawDocument(id: string, rawText: string): RawDocument {
  return {
    id,
    title: `${id}（测试夹具）`,
    source: 'laborinfo',
    rawText,
    publishedAt: '2024-01-01',
  } as RawDocument;
}

export const fourQuadrantFixtures = [
  {
    id: 'employee-plaintiff-supported',
    role: 'employee',
    text: '原告：张某。被告：甲有限公司。原告请求被告支付违法解除劳动合同赔偿金。判决：被告甲有限公司支付原告张某违法解除劳动合同赔偿金20000元。',
    expected: { employeeOutcome: 'supported', employerOutcome: 'not_supported', overallResult: 'supported' },
  },
  {
    id: 'employee-plaintiff-rejected',
    role: 'employee',
    text: '原告：张某。被告：甲有限公司。原告请求被告支付违法解除劳动合同赔偿金。判决：驳回原告张某全部诉讼请求。',
    expected: { employeeOutcome: 'not_supported', employerOutcome: 'supported', overallResult: 'not_supported' },
  },
  {
    id: 'employer-plaintiff-supported',
    role: 'employer',
    text: '原告：甲有限公司。被告：张某。原告请求确认无需支付违法解除劳动合同赔偿金。判决：支持原告甲有限公司的全部诉讼请求。',
    expected: { employeeOutcome: 'not_supported', employerOutcome: 'supported', overallResult: 'supported' },
  },
  {
    id: 'employer-plaintiff-rejected',
    role: 'employer',
    text: '原告：甲有限公司。被告：张某。原告请求确认无需支付违法解除劳动合同赔偿金。判决：驳回原告甲有限公司全部诉讼请求。',
    expected: { employeeOutcome: 'supported', employerOutcome: 'not_supported', overallResult: 'not_supported' },
  },
] as const;

export const judgmentHeadingFixtures = [
  '判决：',
  '判决如下：',
  '本院判决如下：',
  '裁定如下：',
  '综上，本院判决如下：',
] as const;
