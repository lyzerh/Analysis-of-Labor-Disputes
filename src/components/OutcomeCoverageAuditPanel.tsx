import React from 'react';
import type { OutcomeCoverageAudit } from '../services/outcome/OutcomeCoverageAudit';
import { outcomeReviewSuggestionLabels } from '../services/outcome/OutcomeReviewQueue';

interface OutcomeCoverageAuditPanelProps {
  audit: OutcomeCoverageAudit;
}

export const OutcomeCoverageAuditPanel: React.FC<OutcomeCoverageAuditPanelProps> = ({ audit }) => {
  if (audit.totalClaims === 0) {
    return (
      <section aria-label="结果覆盖率审计" className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
        <div className="font-semibold text-slate-800">结果覆盖率审计</div>
        <div className="mt-1">当前分析集暂无可审计诉求。</div>
      </section>
    );
  }

  return (
    <section aria-label="结果覆盖率审计" className="mb-2 rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-[11px] text-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold text-slate-900">结果覆盖率审计</div>
        <div className="text-slate-500">仅定位识别盲点，不修改分析结果或统计口径</div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <span>总诉求：{audit.totalClaims}</span>
        <span>已确定：{audit.resolvedClaims}</span>
        <span>待复核：{audit.needsReviewItems} 项（涉及诉求 {audit.needsReviewClaims} 项）</span>
        <span>待复核率：{audit.needsReviewRate}%</span>
        <span>无法确定率：{audit.unclearRate}%</span>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
        <div>
          <div className="font-medium text-slate-800">主要原因</div>
          {audit.byReasonCode.length === 0 ? <div className="text-slate-400">暂无待复核原因</div> : audit.byReasonCode.slice(0, 3).map((item) => (
            <div key={item.reasonCode}>
              {item.label} <span className="text-slate-400">（{item.reasonCode}，{item.count} 项）</span>
            </div>
          ))}
        </div>
        <div>
          <div className="font-medium text-slate-800">待复核诉求类型</div>
          {audit.byClaimType.filter((item) => item.needsReview > 0).slice(0, 3).length === 0
            ? <div className="text-slate-400">暂无待复核诉求类型</div>
            : audit.byClaimType.filter((item) => item.needsReview > 0).slice(0, 3).map((item) => (
              <div key={item.claimType}>{item.claimType} <span className="text-slate-400">（{item.needsReview}/{item.total} 项，无法确定率 {item.unclearRate}%）</span></div>
            ))}
        </div>
        <div>
          <div className="font-medium text-slate-800">处理建议分布</div>
          {audit.bySuggestedReviewType.length === 0 ? <div className="text-slate-400">暂无建议</div> : audit.bySuggestedReviewType.map((item) => (
            <div key={item.type}>{outcomeReviewSuggestionLabels[item.type]} <span className="text-slate-400">（{item.count} 项）</span></div>
          ))}
        </div>
      </div>
      <div className="mt-2 text-slate-500">
        金额风险审计：{audit.amountRiskEnabled
          ? (audit.amountRiskItems.length > 0 ? `发现 ${audit.amountRiskItems.length} 项可能应为部分支持的金额类诉求。` : '未发现支持状态下的金额风险信号。')
          : '当前数据不足，暂未启用。'}
      </div>
    </section>
  );
};
