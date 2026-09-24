/**
 * User-facing labels for the machine claimType vocabulary.
 *
 * This mapper intentionally does not change the value stored in semantic
 * results, analytics keys, or review corrections. Unknown values retain their
 * raw value for technical traceability while using a safe legal label in the
 * primary UI.
 */
export interface ClaimTypePresentation {
  label: string;
  rawValue?: string;
  note?: string;
  known: boolean;
}

const CLAIM_TYPE_LABELS: Record<string, string> = {
  economic_compensation: '经济补偿金',
  termination_compensation: '经济补偿金',
  severance: '经济补偿金',
  unlawful_termination_compensation: '违法解除赔偿金',
  overtime_pay: '加班工资',
  overtime_wage: '加班工资',
  unpaid_remuneration: '未支付劳动报酬',
  wage_payment: '未支付劳动报酬',
  labor_remuneration: '未支付劳动报酬',
  wage: '未支付劳动报酬',
  工资: '未支付劳动报酬',
  social_insurance_contribution: '社会保险缴费',
  social_insurance: '社会保险缴费',
  social_insurance_compensation: '未依法缴纳社会保险经济补偿金',
  employment_termination_confirmation: '劳动关系解除确认',
  termination_confirmation: '劳动关系解除确认',
  procedural_appeal: '程序性上诉请求',
  double_wage_difference: '未签书面劳动合同二倍工资差额',
  double_wage_without_written_contract: '未签书面劳动合同二倍工资差额',
  double_wage: '未签书面劳动合同二倍工资差额',
  '未签劳动合同二倍工资': '未签书面劳动合同二倍工资差额',
  annual_leave_pay: '未休年休假工资',
  annual_leave_wage: '未休年休假工资',
  unused_leave_pay: '未休年休假工资',
  disability_allowance: '一次性伤残补助金',
  work_injury_medical_subsidy: '一次性工伤医疗补助金',
  disability_employment_subsidy: '一次性伤残就业补助金',
  labor_capacity_assessment_fee: '劳动能力鉴定费',
  work_injury_medical_expense: '工伤医疗费',
  work_injury_allowance: '停工留薪期待遇',
  nursing_fee: '护理费',
  hospital_food_subsidy: '住院伙食补助费',
  transportation_accommodation_fee: '交通食宿费',
  notice_pay: '代通知金',
  bonus: '奖金请求',
  commission: '业务提成/佣金',
  performance_wage: '绩效工资',
  performance_bonus: '绩效奖金',
  general_labor_claim: '其他劳动争议请求',
};

export function presentClaimType(value?: string): ClaimTypePresentation {
  const rawValue = value?.trim();
  if (!rawValue) {
    return { label: '其他劳动争议请求', known: false };
  }
  const label = CLAIM_TYPE_LABELS[rawValue];
  return {
    label: label || '其他劳动争议请求',
    rawValue,
    known: Boolean(label),
    ...(rawValue === 'procedural_appeal' ? { note: '与审级程序或上诉请求有关' } : {}),
  };
}

export function claimTypeLabel(value?: string): string {
  return presentClaimType(value).label;
}

export interface JudgmentItemPresentation {
  id: string;
  label: string;
  text?: string;
}

export function presentJudgmentItems<T extends { id: string; text?: string }>(items: readonly T[]): JudgmentItemPresentation[] {
  return items.map((item, index) => ({
    id: item.id,
    label: `裁判项 ${index + 1}`,
    text: item.text?.trim() || undefined,
  }));
}
