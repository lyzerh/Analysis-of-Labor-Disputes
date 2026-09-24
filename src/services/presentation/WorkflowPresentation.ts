import type { SemanticAuditReasonCode } from '../semantic/SemanticResultAudit';

export type WorkflowDisplayState =
  | 'accepted'
  | 'needs_review'
  | 'awaiting_llm'
  | 'technical_failure'
  | 'blocked';

export interface WorkflowDisplayPresentation {
  label: string;
  description: string;
  badgeClassName: string;
}

const WORKFLOW_PRESENTATIONS: Record<WorkflowDisplayState, WorkflowDisplayPresentation> = {
  accepted: {
    label: '已确认',
    description: '结果已通过当前准入检查，可进入分析。',
    badgeClassName: 'bg-emerald-100 text-emerald-700',
  },
  needs_review: {
    label: '需要人工复核',
    description: 'AI 已生成候选结果，但尚未达到自动接受条件。',
    badgeClassName: 'bg-amber-100 text-amber-800',
  },
  awaiting_llm: {
    label: '待 AI 分析',
    description: '当前存在可执行的待分析语义任务。',
    badgeClassName: 'bg-indigo-100 text-indigo-700',
  },
  technical_failure: {
    label: '技术失败',
    description: '请求或结果处理发生技术异常，尚未生成可供人工判断的候选结果。',
    badgeClassName: 'bg-orange-100 text-orange-700',
  },
  blocked: {
    label: '暂不可分析',
    description: '当前案例缺少完成语义分析所需的原文或结构化信息。',
    badgeClassName: 'bg-slate-100 text-slate-600',
  },
};

export function getWorkflowDisplayPresentation(state: WorkflowDisplayState): WorkflowDisplayPresentation {
  return WORKFLOW_PRESENTATIONS[state];
}

export const SEMANTIC_AUDIT_REASON_PRESENTATIONS: Record<SemanticAuditReasonCode, string> = {
  schema_invalid: '候选结果结构未通过校验',
  source_evidence_not_found: '证据无法可靠定位',
  party_id_not_found: '当事人引用需要确认',
  claim_id_not_found: '诉求引用需要确认',
  judgment_item_id_not_found: '裁判项引用需要确认',
  claim_resolution_claim_id_not_found: '诉求结果引用不完整',
  claim_resolution_judgment_item_id_not_found: '诉求与裁判项关系需要确认',
  duplicate_party_id: '当事人标识重复',
  duplicate_claim_id: '诉求标识重复',
  duplicate_judgment_item_id: '裁判项标识重复',
  required_relationship_missing: '关键主体、诉求或裁判关系不完整',
  confidence_below_admission_threshold: '置信度不足',
  resolved_contains_unclear: '当前结果仍有关键字段未明确',
  unresolved_result: '当前结果尚未明确',
  technical_resolution_failure: '技术失败',
};

export function semanticAuditReasonLabel(code: SemanticAuditReasonCode): string {
  return SEMANTIC_AUDIT_REASON_PRESENTATIONS[code] || '需要人工复核';
}
