import React, { useMemo, useState } from 'react';
import {
  getAuditReasonLabel,
  readSemanticReviewItems,
  saveReviewedSemanticReviewItem,
  type SemanticReviewAction,
  type SemanticReviewCorrection,
  type SemanticReviewItem,
} from '../services/semantic';
import type { OutcomeStatus, PartyRole } from '../services/semantic/SemanticResult';
import { CollapsibleText } from './CollapsibleText';

interface SemanticReviewWorkspaceProps {
  items?: SemanticReviewItem[];
  storage?: Storage;
  onItemsChange?: (items: SemanticReviewItem[]) => void;
}

type ReasonFilter = 'all' | 'low_confidence' | 'unresolved' | 'evidence';

const partyRoleLabels: Record<PartyRole, string> = {
  employee: '劳动者', employer: '用人单位', other: '其他主体', unknown: '未明确',
};

const outcomeLabels: Record<OutcomeStatus, string> = {
  supported: '支持', partially_supported: '部分支持', not_supported: '不支持', unclear: '未明确',
};

const actionLabels: Record<SemanticReviewAction, string> = {
  accept: '接受 AI 候选', edit: '人工编辑后保存', unresolved: '人工无法确定',
};

function evidenceTexts(item: SemanticReviewItem): string[] {
  const values = [
    ...item.semanticResult.parties.map((party) => party.sourceEvidence?.text),
    ...item.semanticResult.claims.map((claim) => claim.sourceEvidence?.text),
    ...item.semanticResult.judgmentItems.map((judgment) => judgment.sourceEvidence?.text),
    ...item.semanticResult.claimResolutions.map((resolution) => resolution.sourceEvidence?.text),
  ].filter((text): text is string => Boolean(text?.trim()));
  return [...new Set(values)];
}

function matchesReason(item: SemanticReviewItem, filter: ReasonFilter): boolean {
  if (filter === 'all') return true;
  const codes = item.audit.reasonCodes;
  if (filter === 'low_confidence') return codes.includes('confidence_below_admission_threshold');
  if (filter === 'evidence') return codes.some((code) => code.includes('evidence') || code.includes('judgment_item'));
  return item.semanticResult.status === 'unresolved'
    || Boolean(item.unresolvedTargets?.length)
    || codes.some((code) => code === 'unresolved_result' || code === 'resolved_contains_unclear' || code === 'required_relationship_missing');
}

const actionButtonClass = 'rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';

export const SemanticReviewWorkspace: React.FC<SemanticReviewWorkspaceProps> = ({
  items: initialItems,
  storage,
  onItemsChange,
}) => {
  const [items, setItems] = useState<SemanticReviewItem[]>(() => initialItems || readSemanticReviewItems(storage));
  const [selectedId, setSelectedId] = useState<string | null>(() => initialItems?.[0]?.id || null);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'reviewed'>('pending');
  const [reasonFilter, setReasonFilter] = useState<ReasonFilter>('all');
  const [correction, setCorrection] = useState<SemanticReviewCorrection>({});
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const pendingItems = items.filter((item) => item.status === 'pending');
  const reviewedItems = items.filter((item) => item.status === 'reviewed');
  const visibleItems = useMemo(
    () => items.filter((item) => item.status === statusFilter && (statusFilter === 'reviewed' || matchesReason(item, reasonFilter))),
    [items, statusFilter, reasonFilter],
  );
  const selected = visibleItems.find((item) => item.id === selectedId) || visibleItems[0];
  const selectedIndex = selected ? visibleItems.findIndex((item) => item.id === selected.id) : -1;
  const evidence = selected ? evidenceTexts(selected) : [];
  const targetClaimIds = new Set((selected?.unresolvedTargets || []).filter((target) => target.type === 'claim').map((target) => target.id).filter((id): id is string => Boolean(id)));
  const targetClaims = selected ? selected.semanticResult.claims.filter((claim) => targetClaimIds.size === 0 || targetClaimIds.has(claim.id)) : [];

  const updateItems = (next: SemanticReviewItem[]) => {
    setItems(next);
    onItemsChange?.(next);
  };

  const setPartyRole = (partyId: string, laborRole: PartyRole) => setCorrection((current) => ({
    ...current, partyRoles: { ...current.partyRoles, [partyId]: { ...current.partyRoles?.[partyId], laborRole } },
  }));

  const setClaimOwner = (claimId: string, claimantRole: PartyRole) => setCorrection((current) => ({
    ...current, claimOwners: { ...current.claimOwners, [claimId]: { ...current.claimOwners?.[claimId], claimantRole } },
  }));

  const setClaimOutcome = (claimId: string, outcome: OutcomeStatus) => setCorrection((current) => ({
    ...current, claimOutcomes: { ...current.claimOutcomes, [claimId]: { ...current.claimOutcomes?.[claimId], outcome } },
  }));

  const setClaimJudgmentItems = (claimId: string, judgmentItemIds: string[]) => setCorrection((current) => ({
    ...current, claimOutcomes: { ...current.claimOutcomes, [claimId]: { ...current.claimOutcomes?.[claimId], judgmentItemIds } },
  }));

  const saveReview = (reviewAction: SemanticReviewAction, nextCorrection: SemanticReviewCorrection = correction) => {
    if (!selected || selected.status !== 'pending') return;
    try {
      const reviewed = saveReviewedSemanticReviewItem(selected, nextCorrection, new Date().toISOString(), storage, { reviewAction });
      updateItems(items.map((item) => item.id === reviewed.id ? reviewed : item));
      setSelectedId(reviewed.id);
      setCorrection({});
      setEditing(false);
      setStatusFilter('reviewed');
      setReasonFilter('all');
      setMessage(reviewAction === 'unresolved' ? '已标记为人工无法确定，Analytics 仍保持阻断。' : '已保存人工复核结果');
    } catch {
      setMessage('保存失败，请检查复核内容后重试');
    }
  };

  const selectItem = (id: string) => {
    setSelectedId(id);
    setCorrection({});
    setEditing(false);
    setMessage(null);
  };

  const moveSelection = (offset: number) => {
    if (selectedIndex < 0) return;
    const next = visibleItems[selectedIndex + offset];
    if (next) selectItem(next.id);
  };

  return (
    <div className="flex h-full min-h-[320px] min-h-0 flex-col bg-slate-50 p-4 lg:p-6" data-testid="semantic-review-workspace">
      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-bold text-slate-900">语义人工复核</h2><p className="mt-1 text-xs text-slate-500">查看 AI 候选、核对证据后接受、编辑或标记为无法确定。技术失败不会进入法律复核队列。</p></div>
        <div className="flex flex-wrap items-center gap-2 text-xs"><button type="button" onClick={() => { setStatusFilter('pending'); setReasonFilter('all'); }} className={`${actionButtonClass} ${statusFilter === 'pending' ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-600'}`}>待复核（{pendingItems.length}）</button><button type="button" onClick={() => { setStatusFilter('reviewed'); setReasonFilter('all'); }} className={`${actionButtonClass} ${statusFilter === 'reviewed' ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'}`}>已处理（{reviewedItems.length}）</button></div>
      </div>

      {statusFilter === 'pending' && <div className="mb-3 flex flex-wrap items-center gap-1.5" aria-label="复核筛选"><span className="mr-1 text-[11px] font-medium text-slate-500">筛选：</span>{([['all', '全部待复核'], ['low_confidence', '低置信度'], ['unresolved', '未明确'], ['evidence', '证据问题']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setReasonFilter(value)} className={`rounded border px-2 py-1 text-[11px] ${reasonFilter === value ? 'border-indigo-400 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-600'}`}>{label}</button>)}<span className="ml-auto text-[11px] text-slate-500">当前显示 {visibleItems.length} 项</span></div>}
      {message && <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800" role="status">{message}</div>}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,2fr)]">
        <aside className="min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2" aria-label="语义复核队列">{visibleItems.length === 0 ? <div className="p-6 text-center text-xs text-slate-500">当前没有需要人工复核的案例</div> : visibleItems.map((item) => { const firstClaim = item.semanticResult.claims.find((claim) => item.unresolvedTargets?.some((target) => target.type === 'claim' && target.id === claim.id)) || item.semanticResult.claims[0]; const resolution = firstClaim && item.semanticResult.claimResolutions.find((candidate) => candidate.claimId === firstClaim.id); return <button key={item.id} type="button" onClick={() => selectItem(item.id)} className={`mb-2 w-full rounded-lg border p-3 text-left text-xs ${selected?.id === item.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}><div className="font-semibold text-slate-900">{item.caseTitle || item.caseId}</div><div className="mt-1 text-slate-500">{item.caseId}{firstClaim ? `｜${firstClaim.claimType || '诉求'}` : ''}</div><div className="mt-1 text-slate-600">AI 候选：{resolution ? outcomeLabels[resolution.outcome] : outcomeLabels[item.semanticResult.applicantOutcome]}</div><div className="mt-2 flex flex-wrap gap-1">{item.audit.reasonCodes.map((code) => <span key={code} className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">{getAuditReasonLabel(code)}</span>)}</div></button>; })}</aside>

        {!selected ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">当前没有需要人工复核的案例</div> : <section className="min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 lg:p-5" aria-label="语义人工复核详情">
          <div className="border-b border-slate-200 pb-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold text-slate-900">{selected.caseTitle || selected.caseId}</h3><div className="mt-1 text-xs text-slate-500">案件：{selected.caseId}{selected.court ? `｜法院：${selected.court}` : ''}{selected.date ? `｜日期：${selected.date}` : ''}</div></div><div className="flex items-center gap-1"><button type="button" disabled={selectedIndex <= 0} onClick={() => moveSelection(-1)} className={`${actionButtonClass} border-slate-200 bg-white text-slate-600`}>上一项</button><button type="button" disabled={selectedIndex < 0 || selectedIndex >= visibleItems.length - 1} onClick={() => moveSelection(1)} className={`${actionButtonClass} border-slate-200 bg-white text-slate-600`}>下一项</button></div></div><div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><div className="font-semibold">需要人工确认的原因</div><ul className="mt-1 list-disc space-y-0.5 pl-4">{selected.audit.reasonCodes.map((code) => <li key={code}>{getAuditReasonLabel(code)}</li>)}</ul><details className="mt-2 text-[10px] text-amber-700"><summary className="cursor-pointer">技术详情</summary><div className="mt-1">{selected.audit.reasonCodes.join('、')}</div></details></div></div>

          <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 text-xs"><div className="flex flex-wrap gap-x-4 gap-y-1 text-indigo-900"><span>AI 候选状态：{selected.semanticResult.status === 'resolved' ? '已解析' : '未明确'}</span><span>整体置信度：{Math.round(selected.semanticResult.confidence * 100)}%</span><span>复核状态：{selected.status === 'pending' ? '待复核' : `已处理${selected.reviewedResult?.reviewAction ? `｜${actionLabels[selected.reviewedResult.reviewAction]}` : ''}`}</span></div><div className="mt-2 text-indigo-900">{targetClaims.length > 0 ? '待确认诉求：' : '待确认目标：'}{targetClaims.length > 0 ? targetClaims.map((claim) => `${claim.claimType || claim.id}`).join('、') : (selected.unresolvedTargets || []).map((target) => target.id || target.type).join('、') || '当前案例整体语义结果'}</div></div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2"><div className="space-y-3"><div><h4 className="text-xs font-semibold text-slate-700">当前结构化结果</h4><div className="mt-2 grid grid-cols-2 gap-2 text-xs"><label className="rounded border border-slate-200 p-2">申请方身份<select disabled={!editing} value={correction.applicantRole || selected.semanticResult.applicantRole} onChange={(event) => setCorrection((current) => ({ ...current, applicantRole: event.target.value as PartyRole }))} className="mt-1 w-full rounded border border-slate-200 bg-white px-1.5 py-1">{Object.entries(partyRoleLabels).filter(([value]) => value !== 'other').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{(['applicantOutcome', 'employeeOutcome', 'employerOutcome'] as const).map((key) => <label key={key} className="rounded border border-slate-200 p-2">{key === 'applicantOutcome' ? '申请方结果' : key === 'employeeOutcome' ? '劳动者结果' : '用人单位结果'}<select disabled={!editing} value={(correction[key] || selected.semanticResult[key]) as string} onChange={(event) => setCorrection((current) => ({ ...current, [key]: event.target.value as OutcomeStatus }))} className="mt-1 w-full rounded border border-slate-200 bg-white px-1.5 py-1">{Object.entries(outcomeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}</div></div><div><h4 className="text-xs font-semibold text-slate-700">当事人身份</h4><div className="mt-2 space-y-1">{selected.semanticResult.parties.map((party) => <label key={party.id} className="flex items-center justify-between gap-2 rounded border border-slate-200 px-2 py-1.5 text-xs"><span className="min-w-0 truncate">{party.name}</span><select disabled={!editing} value={correction.partyRoles?.[party.id]?.laborRole || party.laborRole} onChange={(event) => setPartyRole(party.id, event.target.value as PartyRole)} className="rounded border border-slate-200 bg-white px-1.5 py-1">{Object.entries(partyRoleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}</div></div></div>

          <div><h4 className="text-xs font-semibold text-slate-700">诉求与裁判项对应</h4><div className="mt-2 space-y-2">{targetClaims.length === 0 && selected.semanticResult.claims.length === 0 && <div className="rounded border border-dashed border-slate-200 p-3 text-xs text-slate-500">暂无结构化诉求，请结合原文上下文判断。</div>}{selected.semanticResult.claims.map((claim) => { const resolution = selected.semanticResult.claimResolutions.find((item) => item.claimId === claim.id); const outcome = correction.claimOutcomes?.[claim.id]?.outcome || resolution?.outcome || 'unclear'; const selectedJudgmentIds = correction.claimOutcomes?.[claim.id]?.judgmentItemIds || resolution?.judgmentItemIds || []; return <div key={claim.id} className={`rounded border p-2 text-xs ${targetClaimIds.size > 0 && targetClaimIds.has(claim.id) ? 'border-indigo-300 bg-indigo-50/40' : 'border-slate-200'}`}><div className="font-medium text-slate-800">{claim.claimType || claim.id}{targetClaimIds.has(claim.id) ? '｜待确认目标' : ''}</div><CollapsibleText text={claim.claimText} collapsedLines={4} className="mt-1 text-slate-600" /><div className="mt-2 text-[11px] text-slate-500">AI 置信度：{resolution ? `${Math.round(resolution.confidence * 100)}%` : '暂无'}</div><div className="mt-2 grid gap-2 sm:grid-cols-2"><label>诉求主体<select disabled={!editing} value={correction.claimOwners?.[claim.id]?.claimantRole || claim.claimantRole} onChange={(event) => setClaimOwner(claim.id, event.target.value as PartyRole)} className="mt-1 w-full rounded border border-slate-200 bg-white px-1.5 py-1">{Object.entries(partyRoleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>裁判结果<select disabled={!editing} value={outcome} onChange={(event) => setClaimOutcome(claim.id, event.target.value as OutcomeStatus)} className="mt-1 w-full rounded border border-slate-200 bg-white px-1.5 py-1">{Object.entries(outcomeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><div className="mt-2 text-slate-600">对应裁判项：{selected.semanticResult.judgmentItems.length === 0 ? '暂无裁判项' : selected.semanticResult.judgmentItems.map((judgment) => <label key={judgment.id} className="mr-2 inline-flex items-center gap-1"><input disabled={!editing} type="checkbox" checked={selectedJudgmentIds.includes(judgment.id)} onChange={(event) => setClaimJudgmentItems(claim.id, event.target.checked ? [...selectedJudgmentIds, judgment.id] : selectedJudgmentIds.filter((id) => id !== judgment.id))} />{judgment.id}</label>)}</div></div>; })}</div></div></div>

          <div className="mt-4 grid gap-3 xl:grid-cols-2"><div className="rounded border border-indigo-100 bg-indigo-50/60 p-3 text-xs"><h4 className="font-semibold text-indigo-900">可核对的原文依据</h4>{evidence.length === 0 ? <p className="mt-1 text-indigo-800">暂无可定位依据，请直接查看案件原文。</p> : <ul className="mt-1 list-disc space-y-1 pl-4 text-indigo-900">{evidence.map((text) => <li key={text}><CollapsibleText text={text} collapsedLines={4} /></li>)}</ul>}</div><div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs"><h4 className="font-semibold text-slate-700">相关上下文</h4><CollapsibleText text={selected.context || '暂无附加上下文'} collapsedLines={4} className="mt-1 font-sans text-slate-600" /><details className="mt-2"><summary className="cursor-pointer text-[10px] text-slate-500">展开更多原文</summary><div className="mt-1 text-slate-600">{selected.context || '暂无附加上下文'}</div></details></div></div>

          {selected.status === 'pending' && <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-3"><button type="button" onClick={() => saveReview('unresolved', {})} className={`${actionButtonClass} border-amber-300 bg-amber-50 text-amber-800`}>标记无法确定</button>{editing ? <button type="button" onClick={() => saveReview('edit')} className={`${actionButtonClass} border-indigo-600 bg-indigo-600 text-white`}>保存编辑结果</button> : <button type="button" onClick={() => setEditing(true)} className={`${actionButtonClass} border-slate-300 bg-white text-slate-700`}>编辑</button>}<button type="button" onClick={() => saveReview('accept', {})} className={`${actionButtonClass} border-emerald-600 bg-emerald-600 text-white`}>接受 AI 候选</button><button type="button" onClick={() => saveReview('edit')} className="sr-only">保存人工复核结果</button></div>}
          {selected.status === 'reviewed' && <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">该项已保存人工复核结果：{selected.reviewedAt}{selected.reviewedResult?.reviewAction ? `｜${actionLabels[selected.reviewedResult.reviewAction]}` : ''}{selected.reviewedResult?.reviewAction === 'unresolved' ? '｜Analytics 保持阻断' : ''}</div>}
        </section>}
      </div>
    </div>
  );
};
