import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import type { OutcomeReviewItem } from '../types';
import { getOutcomePresentation } from '../services/outcome/OutcomePresentation';
import {
  matchesOutcomeDiagnosticFilter,
  outcomeDiagnosticFilterLabels,
  outcomeReviewEvidenceFields,
  outcomeReviewReasonLabels,
  outcomeReviewSearchText,
  type OutcomeDiagnosticFilter,
} from '../services/outcome/OutcomeReviewQueue';
import { CollapsibleText } from './CollapsibleText';
import { cleanPipelineDiagnosticMessage } from '../services/presentation/PipelineStagePresentation';
import { presentClaimType } from '../services/presentation/ClaimTypePresentation';

interface DiagnosticClueWorkspaceProps {
  items: OutcomeReviewItem[];
  onSelectCase: (item: OutcomeReviewItem) => void;
}

interface DiagnosticCaseGroup {
  caseId: string;
  title: string;
  caseNumber: string | null;
  items: OutcomeReviewItem[];
}

const filterValues: OutcomeDiagnosticFilter[] = [
  'all', 'needs_review', 'unclear', 'evidence', 'relationship', 'technical',
];

const clueKey = (item: OutcomeReviewItem): string => item.reviewItemId || `${item.caseId}-${item.claimId || item.target || 'outcome'}`;

const DiagnosticClueRow: React.FC<{
  item: OutcomeReviewItem;
  expanded: boolean;
  onToggle: () => void;
  onSelectCase: (item: OutcomeReviewItem) => void;
}> = ({ item, expanded, onToggle, onSelectCase }) => {
  const outcome = getOutcomePresentation(item.outcome);
  const reasonLabel = item.reasonCode ? (outcomeReviewReasonLabels[item.reasonCode] || '需要人工复核') : '需要人工复核';
  const fields = outcomeReviewEvidenceFields(item);
  const claimPresentation = presentClaimType(item.claimType);
  const selectCase = () => onSelectCase(item);
  return (
    <div
      className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
      data-testid="diagnostic-clue-row"
      role="button"
      tabIndex={0}
      onClick={selectCase}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectCase();
        }
      }}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-900">
            <span>{claimPresentation.label}</span>
            {claimPresentation.note && <span className="text-[10px] font-normal text-slate-500">（{claimPresentation.note}）</span>}
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${outcome.badgeClassName}`}>当前：{outcome.label}</span>
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">{item.needsReview ? '需要人工复核' : '未明确'}</span>
          </div>
          <div className="mt-1 line-clamp-2 text-[11px] text-amber-800">{cleanPipelineDiagnosticMessage(item.reasonMessage, reasonLabel)}</div>
        </div>
        <button
          type="button"
          className="shrink-0 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-100"
          aria-expanded={expanded}
          onClick={(event) => { event.stopPropagation(); onToggle(); }}
        >
          {expanded ? '收起详情' : '展开详情'}
        </button>
      </div>
      {expanded && (
        <div className="mt-2 grid gap-2 border-t border-slate-100 pt-2 text-[11px] text-slate-700 sm:grid-cols-2" onClick={(event) => event.stopPropagation()}>
          <div><span className="font-medium text-slate-600">AI 候选：</span>{outcome.label}</div>
          <div><span className="font-medium text-slate-600">原因：</span>{reasonLabel}</div>
          <div className="sm:col-span-2"><span className="font-medium text-slate-600">诊断说明：</span><CollapsibleText text={cleanPipelineDiagnosticMessage(item.reasonMessage, reasonLabel)} collapsedLines={3} className="mt-0.5" /></div>
          {fields.map((field) => (
            <div key={field.key} className="min-w-0 rounded border border-slate-200 bg-slate-50/70 px-2 py-1 sm:col-span-2">
              <span className="block font-medium text-slate-600">{field.label}</span>
              <CollapsibleText text={field.text || field.placeholder} collapsedLines={3} className="mt-0.5" />
            </div>
          ))}
          {claimPresentation.rawValue && <details className="sm:col-span-2 text-[10px] text-slate-500"><summary className="cursor-pointer">技术详情</summary><div className="mt-1">诉求类型：{claimPresentation.rawValue}{item.claimId ? `｜诉求 ID：${item.claimId}` : ''}</div></details>}
          <div className="sm:col-span-2 text-[10px] text-slate-400">点击本条线索可定位到对应案例。</div>
        </div>
      )}
    </div>
  );
};

export const DiagnosticClueWorkspace: React.FC<DiagnosticClueWorkspaceProps> = ({ items, onSelectCase }) => {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = useState<OutcomeDiagnosticFilter>('all');
  const [expandedCases, setExpandedCases] = useState<Set<string>>(() => new Set());
  const [expandedClues, setExpandedClues] = useState<Set<string>>(() => new Set());

  const filteredItems = useMemo(() => {
    const normalized = keyword.trim().toLocaleLowerCase();
    return items.filter((item) => (
      matchesOutcomeDiagnosticFilter(item, filter)
      && (!normalized || outcomeReviewSearchText(item).includes(normalized))
    ));
  }, [items, filter, keyword]);

  const groups = useMemo<DiagnosticCaseGroup[]>(() => {
    const grouped = new Map<string, DiagnosticCaseGroup>();
    filteredItems.forEach((item) => {
      const current = grouped.get(item.caseId);
      if (current) {
        current.items.push(item);
        return;
      }
      grouped.set(item.caseId, {
        caseId: item.caseId,
        title: item.title || item.caseId,
        caseNumber: item.caseNumber,
        items: [item],
      });
    });
    return [...grouped.values()];
  }, [filteredItems]);

  const countLabel = keyword.trim()
    ? `${items.length} 项中匹配 ${filteredItems.length} 项`
    : filter === 'all'
      ? `${items.length} 项`
      : `${outcomeDiagnosticFilterLabels[filter]} ${filteredItems.length} 项`;

  const toggleCase = (caseId: string) => setExpandedCases((current) => {
    const next = new Set(current);
    if (next.has(caseId)) next.delete(caseId); else next.add(caseId);
    return next;
  });

  const toggleClue = (item: OutcomeReviewItem) => setExpandedClues((current) => {
    const next = new Set(current);
    const key = clueKey(item);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const collapseAll = () => {
    setExpandedCases(new Set());
    setExpandedClues(new Set());
  };

  return (
    <section className="mt-5 border-t border-slate-200 pt-4" aria-label="裁判结果诊断线索" data-testid="diagnostic-clue-workspace">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-900">
            裁判结果诊断线索 <span className="font-normal text-amber-800/75">{items.length} 项</span>
          </h3>
          {open && <div className="mt-0.5 text-[10px] text-amber-800/75">{countLabel}｜按案件分组，默认折叠详情</div>}
        </div>
          <button
          type="button"
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? '收起' : '展开'}
        </button>
      </div>

      {open && (
        <div className="mt-3" data-testid="diagnostic-clue-content">
          <div className="flex flex-col gap-2 rounded-lg border border-amber-200/70 bg-white/70 p-2.5 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索诊断线索、案件、案号、诉求或证据"
                aria-label="搜索诊断线索"
                className="w-full rounded border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-[11px] text-slate-700 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
              />
            </div>
            <button type="button" onClick={collapseAll} className="shrink-0 rounded border border-slate-200 bg-white px-2 py-1.5 text-[10px] text-slate-600 hover:bg-slate-50">收起全部</button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="诊断线索筛选">
            {filterValues.map((value) => (
              <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded border px-2 py-1 text-[10px] ${filter === value ? 'border-indigo-400 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-600'}`}>
                {outcomeDiagnosticFilterLabels[value]}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-slate-500">{countLabel}</span>
          </div>

          <div className="mt-2 space-y-2" data-testid="diagnostic-case-groups">
            {groups.length === 0 ? (
              <div className="rounded-lg border border-dashed border-amber-200 bg-white/70 px-3 py-4 text-center text-xs text-amber-800">当前筛选没有匹配的诊断线索。</div>
            ) : groups.map((group) => {
              const caseExpanded = expandedCases.has(group.caseId);
              return (
                <div key={group.caseId} className="rounded-lg border border-slate-200 bg-slate-50/60" data-testid="diagnostic-case-group">
                  <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left" aria-expanded={caseExpanded} onClick={() => toggleCase(group.caseId)}>
                    {caseExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
                    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-900">{group.title}</span><span className="block truncate text-[10px] text-slate-500">{group.caseNumber || group.caseId}</span></span>
                    <span className="shrink-0 text-[10px] text-slate-500">{group.items.length} 项线索</span>
                  </button>
                  {caseExpanded && <div className="space-y-2 border-t border-slate-200 p-2">{group.items.map((item) => { const key = clueKey(item); return <DiagnosticClueRow key={key} item={item} expanded={expandedClues.has(key)} onToggle={() => toggleClue(item)} onSelectCase={onSelectCase} />; })}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
