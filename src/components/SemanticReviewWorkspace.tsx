import React, { useMemo, useState } from 'react';
import {
  getAuditReasonLabel,
  readSemanticReviewItems,
  saveReviewedSemanticReviewItem,
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

const partyRoleLabels: Record<PartyRole, string> = {
  employee: '劳动者', employer: '用人单位', other: '其他主体', unknown: '未明确',
};

const outcomeLabels: Record<OutcomeStatus, string> = {
  supported: '支持', partially_supported: '部分支持', not_supported: '不支持', unclear: '未明确',
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

export const SemanticReviewWorkspace: React.FC<SemanticReviewWorkspaceProps> = ({
  items: initialItems,
  storage,
  onItemsChange,
}) => {
  const [items, setItems] = useState<SemanticReviewItem[]>(() => initialItems || readSemanticReviewItems(storage));
  const [selectedId, setSelectedId] = useState<string | null>(() => initialItems?.[0]?.id || null);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'reviewed'>('pending');
  const [correction, setCorrection] = useState<SemanticReviewCorrection>({});
  const [message, setMessage] = useState<string | null>(null);

  const visibleItems = useMemo(
    () => items.filter((item) => item.status === statusFilter),
    [items, statusFilter],
  );
  const selected = items.find((item) => item.id === selectedId) || visibleItems[0];
  const evidence = selected ? evidenceTexts(selected) : [];

  const updateItems = (next: SemanticReviewItem[]) => {
    setItems(next);
    onItemsChange?.(next);
  };

  const setPartyRole = (partyId: string, laborRole: PartyRole) => {
    setCorrection((current) => ({
      ...current,
      partyRoles: { ...current.partyRoles, [partyId]: { ...current.partyRoles?.[partyId], laborRole } },
    }));
  };

  const setClaimOwner = (claimId: string, claimantRole: PartyRole) => {
    setCorrection((current) => ({
      ...current,
      claimOwners: { ...current.claimOwners, [claimId]: { ...current.claimOwners?.[claimId], claimantRole } },
    }));
  };

  const setClaimOutcome = (claimId: string, outcome: OutcomeStatus) => {
    setCorrection((current) => ({
      ...current,
      claimOutcomes: { ...current.claimOutcomes, [claimId]: { ...current.claimOutcomes?.[claimId], outcome } },
    }));
  };

  const setClaimJudgmentItems = (claimId: string, judgmentItemIds: string[]) => {
    setCorrection((current) => ({
      ...current,
      claimOutcomes: { ...current.claimOutcomes, [claimId]: { ...current.claimOutcomes?.[claimId], judgmentItemIds } },
    }));
  };

  const saveReview = () => {
    if (!selected || selected.status !== 'pending') return;
    try {
      const reviewed = saveReviewedSemanticReviewItem(selected, correction, new Date().toISOString(), storage);
      updateItems(items.map((item) => item.id === reviewed.id ? reviewed : item));
      setSelectedId(reviewed.id);
      setCorrection({});
      setStatusFilter('reviewed');
      setMessage('已保存人工复核结果');
    } catch {
      setMessage('保存失败，请检查复核内容后重试');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50 p-4 lg:p-6" data-testid="semantic-review-workspace">
      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">语义人工复核</h2>
          <p className="mt-1 text-xs text-slate-500">自动解析未通过本地核验的案件，需要确认法律事实后保存。</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button type="button" onClick={() => setStatusFilter('pending')} className={`rounded border px-3 py-1.5 ${statusFilter === 'pending' ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-600'}`}>待复核（{items.filter((item) => item.status === 'pending').length}）</button>
          <button type="button" onClick={() => setStatusFilter('reviewed')} className={`rounded border px-3 py-1.5 ${statusFilter === 'reviewed' ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'}`}>已复核（{items.filter((item) => item.status === 'reviewed').length}）</button>
        </div>
      </div>

      {message && <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{message}</div>}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,2fr)]">
        <aside className="min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2" aria-label="语义复核队列">
          {visibleItems.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">当前没有{statusFilter === 'pending' ? '待复核' : '已复核'}语义结果。</div>
          ) : visibleItems.map((item) => (
            <button key={item.id} type="button" onClick={() => { setSelectedId(item.id); setCorrection({}); setMessage(null); }} className={`mb-2 w-full rounded-lg border p-3 text-left text-xs ${selected?.id === item.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
              <div className="font-semibold text-slate-900">{item.caseTitle || item.caseId}</div>
              <div className="mt-1 text-slate-500">{item.caseId}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {item.audit.reasonCodes.map((code) => <span key={code} className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">{getAuditReasonLabel(code)}</span>)}
              </div>
            </button>
          ))}
        </aside>

        {!selected ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">请选择一条复核记录。</div>
        ) : (
          <section className="min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 lg:p-5" aria-label="语义人工复核详情">
            <div className="border-b border-slate-200 pb-3">
              <h3 className="font-semibold text-slate-900">{selected.caseTitle || selected.caseId}</h3>
              <div className="mt-1 text-xs text-slate-500">案件：{selected.caseId}{selected.court ? `｜法院：${selected.court}` : ''}{selected.date ? `｜日期：${selected.date}` : ''}</div>
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <div className="font-semibold">需要人工确认的原因</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">{selected.audit.reasonCodes.map((code) => <li key={code}>{getAuditReasonLabel(code)} <span className="text-amber-700/70">（{code}）</span></li>)}</ul>
                {selected.semanticResult.resolverErrorCode && <div className="mt-2">系统未能可靠完成自动解析，请直接根据原文确认。</div>}
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <h4 className="text-xs font-semibold text-slate-700">当前结构化结果</h4>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <label className="rounded border border-slate-200 p-2">申请方身份
                      <select value={correction.applicantRole || selected.semanticResult.applicantRole} onChange={(event) => setCorrection((current) => ({ ...current, applicantRole: event.target.value as PartyRole }))} className="mt-1 w-full rounded border border-slate-200 bg-white px-1.5 py-1">
                        {Object.entries(partyRoleLabels).filter(([value]) => value !== 'other').map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    {(['applicantOutcome', 'employeeOutcome', 'employerOutcome'] as const).map((key) => (
                      <label key={key} className="rounded border border-slate-200 p-2">{key === 'applicantOutcome' ? '申请方结果' : key === 'employeeOutcome' ? '劳动者结果' : '用人单位结果'}
                        <select value={(correction[key] || selected.semanticResult[key]) as string} onChange={(event) => setCorrection((current) => ({ ...current, [key]: event.target.value as OutcomeStatus }))} className="mt-1 w-full rounded border border-slate-200 bg-white px-1.5 py-1">
                          {Object.entries(outcomeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-700">当事人身份</h4>
                  <div className="mt-2 space-y-1">{selected.semanticResult.parties.map((party) => (
                    <label key={party.id} className="flex items-center justify-between gap-2 rounded border border-slate-200 px-2 py-1.5 text-xs"><span className="min-w-0 truncate">{party.name}</span><select value={correction.partyRoles?.[party.id]?.laborRole || party.laborRole} onChange={(event) => setPartyRole(party.id, event.target.value as PartyRole)} className="rounded border border-slate-200 bg-white px-1.5 py-1">{Object.entries(partyRoleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  ))}</div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-700">诉求与裁判项对应</h4>
                <div className="mt-2 space-y-2">{selected.semanticResult.claims.map((claim) => {
                  const resolution = selected.semanticResult.claimResolutions.find((item) => item.claimId === claim.id);
                  const outcome = correction.claimOutcomes?.[claim.id]?.outcome || resolution?.outcome || 'unclear';
                  const selectedJudgmentIds = correction.claimOutcomes?.[claim.id]?.judgmentItemIds || resolution?.judgmentItemIds || [];
                  return <div key={claim.id} className="rounded border border-slate-200 p-2 text-xs"><div className="font-medium text-slate-800">{claim.claimType || claim.id}</div><CollapsibleText text={claim.claimText} collapsedLines={4} className="mt-1 text-slate-600" /><div className="mt-2 grid gap-2 sm:grid-cols-2"><label>诉求主体<select value={correction.claimOwners?.[claim.id]?.claimantRole || claim.claimantRole} onChange={(event) => setClaimOwner(claim.id, event.target.value as PartyRole)} className="mt-1 w-full rounded border border-slate-200 bg-white px-1.5 py-1">{Object.entries(partyRoleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>裁判结果<select value={outcome} onChange={(event) => setClaimOutcome(claim.id, event.target.value as OutcomeStatus)} className="mt-1 w-full rounded border border-slate-200 bg-white px-1.5 py-1">{Object.entries(outcomeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><div className="mt-2 text-slate-600">对应裁判项：{selected.semanticResult.judgmentItems.length === 0 ? '暂无裁判项' : selected.semanticResult.judgmentItems.map((judgment) => <label key={judgment.id} className="mr-2 inline-flex items-center gap-1"><input type="checkbox" checked={selectedJudgmentIds.includes(judgment.id)} onChange={(event) => setClaimJudgmentItems(claim.id, event.target.checked ? [...selectedJudgmentIds, judgment.id] : selectedJudgmentIds.filter((id) => id !== judgment.id))} />{judgment.id}</label>)}</div></div>;
                })}</div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              <div className="rounded border border-indigo-100 bg-indigo-50/60 p-3 text-xs"><h4 className="font-semibold text-indigo-900">可核对的原文依据</h4>{evidence.length === 0 ? <p className="mt-1 text-indigo-800">暂无可定位依据，请直接查看案件原文。</p> : <ul className="mt-1 list-disc space-y-1 pl-4 text-indigo-900">{evidence.map((text) => <li key={text}><CollapsibleText text={text} collapsedLines={4} /></li>)}</ul>}</div>
              <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs"><h4 className="font-semibold text-slate-700">相关上下文</h4><CollapsibleText text={selected.context || '暂无附加上下文'} collapsedLines={4} className="mt-1 font-sans text-slate-600" /></div>
            </div>

            {selected.status === 'pending' && <div className="mt-4 flex justify-end"><button type="button" onClick={saveReview} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700">保存人工复核结果</button></div>}
            {selected.status === 'reviewed' && <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">该项已保存人工复核结果：{selected.reviewedAt}</div>}
          </section>
        )}
      </div>
    </div>
  );
};
