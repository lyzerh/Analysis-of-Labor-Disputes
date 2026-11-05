import type { TFunction } from 'i18next';
import type { LegalOutcomeType, ReviewStatus } from '../../types';
import type { WorkflowDisplayState } from './WorkflowPresentation';
import { presentClaimType } from './ClaimTypePresentation';

/** Translate only known, complete business values at the render boundary. */
function exactLabel(value: string, keys: Readonly<Record<string, string>>, t: TFunction): string {
  const key = Object.prototype.hasOwnProperty.call(keys, value) ? keys[value] : undefined;
  return key ? t(key) : value;
}

const OUTCOME_KEYS: Record<LegalOutcomeType, string> = {
  supported: 'status.supported',
  partially_supported: 'status.partiallySupported',
  not_supported: 'status.notSupported',
  unclear: 'status.unclear',
};
const LEGACY_DECISION_OUTCOME_KEYS: Record<string, string> = {
  '用人单位胜诉': 'domain.decisionOutcome.employerFavorable',
  '用人单位败诉': 'domain.decisionOutcome.employerUnfavorable',
  '部分支持': 'domain.decisionOutcome.partial',
  '调解/其他': 'domain.decisionOutcome.mediationOther',
};
const REVIEW_KEYS: Record<ReviewStatus, string> = {
  pending: 'domain.review.pending',
  approved: 'domain.review.approved',
  modified: 'domain.review.modified',
};
const WORKFLOW_KEYS: Record<WorkflowDisplayState, string> = {
  accepted: 'domain.workflow.accepted',
  needs_review: 'domain.workflow.needsReview',
  awaiting_llm: 'domain.workflow.awaitingLlm',
  technical_failure: 'domain.workflow.technicalFailure',
  blocked: 'domain.workflow.blocked',
};
const CASE_LEVEL_KEYS: Record<string, string> = {
  '一审': 'domain.caseLevel.first', first: 'domain.caseLevel.first',
  '二审': 'domain.caseLevel.second', second: 'domain.caseLevel.second',
  '再审': 'domain.caseLevel.retrial', retrial: 'domain.caseLevel.retrial',
};

// Reuse the existing machine-value aliases and their Chinese presentation labels.
// Unknown claim types remain untouched instead of being guessed from substrings.
const CLAIM_LABEL_KEYS: Record<string, string> = {
  '解除劳动合同经济补偿金': 'domain.claim.terminationEconomicCompensation',
  '拖欠/未付劳动报酬': 'domain.claim.unpaidWages',
  '补缴社会保险费': 'domain.claim.socialInsuranceBackPayment',
  '劳动争议综合请求 (报酬/补偿)': 'domain.claim.generalCombinedRequest',
  '上诉请求（撤销原判）': 'domain.claim.appealToRevoke',
  '经济补偿金': 'domain.claim.economicCompensation',
  '违法解除赔偿金': 'domain.claim.unlawfulTerminationCompensation',
  '加班工资': 'domain.claim.overtimePay',
  '未支付劳动报酬': 'domain.claim.unpaidRemuneration',
  '社会保险缴费': 'domain.claim.socialInsuranceContribution',
  '未依法缴纳社会保险经济补偿金': 'domain.claim.socialInsuranceCompensation',
  '劳动关系解除确认': 'domain.claim.terminationConfirmation',
  '程序性上诉请求': 'domain.claim.proceduralAppeal',
  '未签书面劳动合同二倍工资差额': 'domain.claim.doubleWageDifference',
  '未休年休假工资': 'domain.claim.annualLeavePay',
  '一次性伤残补助金': 'domain.claim.disabilityAllowance',
  '一次性工伤医疗补助金': 'domain.claim.workInjuryMedicalSubsidy',
  '一次性伤残就业补助金': 'domain.claim.disabilityEmploymentSubsidy',
  '劳动能力鉴定费': 'domain.claim.laborCapacityAssessmentFee',
  '工伤医疗费': 'domain.claim.workInjuryMedicalExpense',
  '停工留薪期待遇': 'domain.claim.workInjuryAllowance',
  '护理费': 'domain.claim.nursingFee',
  '住院伙食补助费': 'domain.claim.hospitalFoodSubsidy',
  '交通食宿费': 'domain.claim.transportationAccommodationFee',
  '代通知金': 'domain.claim.noticePay',
  '奖金请求': 'domain.claim.bonus',
  '业务提成/佣金': 'domain.claim.commission',
  '绩效工资': 'domain.claim.performanceWage',
  '绩效奖金': 'domain.claim.performanceBonus',
  '其他劳动争议请求': 'domain.claim.generalLaborClaim',
};
const DISPUTE_KEYS: Record<string, string> = {
  '违法解除赔偿金': 'domain.dispute.unlawfulTerminationCompensation',
  '劳动合同解除': 'domain.dispute.contractTermination',
  '经济补偿金': 'domain.dispute.economicCompensation',
  '代通知金': 'domain.dispute.noticePay',
  '社会保险争议': 'domain.dispute.socialInsurance',
  '加班工资': 'domain.dispute.overtimePay',
  '未签劳动合同二倍工资': 'domain.dispute.doubleWage',
  '工伤与工伤待遇': 'domain.dispute.workInjury',
  '竞业限制': 'domain.dispute.nonCompete',
  '工资报酬与绩效奖金': 'domain.dispute.wagesAndBonus',
  '试用期争议': 'domain.dispute.probation',
  '劳动争议综合': 'domain.dispute.general',
  '违法解除': 'domain.dispute.unlawfulTermination',
  '调岗降薪': 'domain.dispute.reassignmentPayReduction',
};
const DEFENSE_KEYS: Record<string, string> = {
  '旷工 / 擅自离岗': 'domain.defense.absenceCombined',
  '严重违纪 / 违反规章制度': 'domain.defense.misconductCombined',
  '不能胜任工作 / 考核不达标': 'domain.defense.performanceCombined',
  '协商一致解除 / 自愿离职': 'domain.defense.mutualTerminationCombined',
  '试用期不符合录用条件': 'domain.defense.probationFailure',
  '劳动合同期满终止': 'domain.defense.contractExpiry',
  '已足额支付劳动报酬/已结清': 'domain.defense.wagesPaid',
  '客观情况发生重大变化': 'domain.defense.changedCircumstances',
  '不服从安排 / 拒绝调岗': 'domain.defense.refusedReassignment',
  '不存在劳动关系 / 未建立劳动关系': 'domain.defense.noEmploymentRelationship',
  '证据真实性/合法性/关联性异议': 'domain.defense.evidenceObjection',
  '严重违纪': 'domain.defense.seriousMisconduct',
  '旷工': 'domain.defense.absence',
  '不能胜任工作': 'domain.defense.poorPerformance',
  '规章制度': 'domain.defense.workplaceRules',
  '协商解除': 'domain.defense.mutualTermination',
  '自愿离职': 'domain.defense.voluntaryResignation',
  '业务调整': 'domain.defense.businessAdjustment',
  '合法调岗': 'domain.defense.lawfulReassignment',
  '擅自离岗': 'domain.defense.unauthorizedAbsence',
  '协商一致解除': 'domain.defense.mutualAgreementTermination',
  '已足额支付报酬': 'domain.defense.remunerationPaidFull',
  '不存在加班事实': 'domain.defense.noOvertimeOccurred',
  '劳动者单方辞职': 'domain.defense.employeeResignation',
  '未提供劳动': 'domain.defense.noLaborProvided',
};
const EVIDENCE_KEYS: Record<string, string> = {
  '劳动合同/协议': 'domain.evidence.contractCombined',
  '规章制度/员工手册': 'domain.evidence.rulesCombined',
  '考勤记录/打卡数据': 'domain.evidence.attendanceCombined',
  '工资支付/银行流水': 'domain.evidence.wageRecordsCombined',
  '电子沟通/通知记录': 'domain.evidence.communicationCombined',
  '离职/处分证明': 'domain.evidence.departureCombined',
  '社保/工伤记录': 'domain.evidence.socialInsuranceCombined',
  '劳动合同': 'domain.evidence.contract',
  '规章制度': 'domain.evidence.rules',
  '员工签收': 'domain.evidence.employeeReceipt',
  '考勤记录': 'domain.evidence.attendance',
  '工资流水': 'domain.evidence.wageRecords',
  '聊天记录': 'domain.evidence.chatRecords',
  '处分记录': 'domain.evidence.disciplinaryRecords',
  '送达回执': 'domain.evidence.deliveryReceipt',
  '民主程序记录': 'domain.evidence.consultationRecords',
  '协商一致协议': 'domain.evidence.mutualAgreement',
  '解除劳动关系通知书': 'domain.evidence.terminationNotice',
  '电子沟通记录': 'domain.evidence.communication',
  '送达与签收凭证': 'domain.evidence.deliveryAcknowledgment',
};

export const getOutcomeLabel = (value: string, t: TFunction): string => exactLabel(value, OUTCOME_KEYS, t);
export const getDecisionOutcomeLabel = (value: string, t: TFunction): string => exactLabel(value, LEGACY_DECISION_OUTCOME_KEYS, t);
export const getReviewStatusLabel = (value: string, t: TFunction): string => exactLabel(value, REVIEW_KEYS, t);
export const getWorkflowStatusLabel = (value: string, t: TFunction): string => exactLabel(value, WORKFLOW_KEYS, t);
export const getCaseLevelLabel = (value: string, t: TFunction): string => exactLabel(value, CASE_LEVEL_KEYS, t);
export function getClaimTypeLabel(value: string, t: TFunction): string {
  if (Object.prototype.hasOwnProperty.call(CLAIM_LABEL_KEYS, value)) return t(CLAIM_LABEL_KEYS[value]);
  const presentation = presentClaimType(value);
  if (!presentation.known) return value;
  return exactLabel(presentation.label, CLAIM_LABEL_KEYS, t);
}
export const getDisputeTypeLabel = (value: string, t: TFunction): string => exactLabel(value, DISPUTE_KEYS, t);
export const getDefenseTypeLabel = (value: string, t: TFunction): string => exactLabel(value, DEFENSE_KEYS, t);
export const getEvidenceTypeLabel = (value: string, t: TFunction): string => exactLabel(value, EVIDENCE_KEYS, t);
