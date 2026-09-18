import React, { useMemo, useState } from 'react';
import { CheckCircle2, Clock3, FileSearch, ShieldAlert, Sparkles, UserRoundCheck } from 'lucide-react';
import type { AnalysisCaseRecord, OutcomeReviewItem } from '../types';
import { getOutcomePresentation } from '../services/outcome/OutcomePresentation';
import { outcomeReviewEvidenceFields, outcomeReviewReasonLabels } from '../services/outcome/OutcomeReviewQueue';
import {
  getPipelineOverview,
  getPipelineProcessingStats,
  cleanPipelineDiagnosticMessage,
  mapAnalysisRecordToProcessingStage,
  processingProvenanceLabel,
  processingStageDescription,
  processingStageLabel,
  processingStageReason,
} from '../services/presentation/PipelineStagePresentation';
import { CollapsibleText } from './CollapsibleText';
import { SemanticReviewWorkspace } from './SemanticReviewWorkspace';
import { isLlmAvailable, useLlmRuntimeSettings } from '../services/semantic/LlmRuntimeSettings';
import type { SingleCaseSemanticRunResult } from '../services/semantic/LlmRuntimeService';

interface PipelineWorkspaceProps {
  records: AnalysisCaseRecord[];
  reviewItems: OutcomeReviewItem[];
  onSelectCase: (item: OutcomeReviewItem) => void;
  hasAnalysisRun: boolean;
  onRunSingleCase?: (record: AnalysisCaseRecord) => Promise<SingleCaseSemanticRunResult>;
}

const stageCardStyles = {
  safe: 'border-emerald-200 bg-emerald-50/70 text-emerald-950',
  awaiting_llm: 'border-indigo-200 bg-indigo-50/70 text-indigo-950',
  review_pending: 'border-amber-200 bg-amber-50/70 text-amber-950',
  blocked: 'border-rose-200 bg-rose-50/70 text-rose-950',
} as const;

const StageIcon: React.FC<{ stage: 'safe' | 'awaiting_llm' | 'review_pending' | 'blocked' }> = ({ stage }) => {
  if (stage === 'safe') return <CheckCircle2 className="h-4 w-4" />;
  if (stage === 'awaiting_llm') return <Sparkles className="h-4 w-4" />;
  if (stage === 'blocked') return <ShieldAlert className="h-4 w-4" />;
  return <UserRoundCheck className="h-4 w-4" />;
};

const PipelineStat: React.FC<{ label: string; value: number; tone: string; detail?: string }> = ({ label, value, tone, detail }) => (
  <div className={`rounded-xl border px-3 py-3 ${tone}`}>
    <div className="text-[11px] font-medium opacity-80">{label}</div>
    <div className="mt-1 text-2xl font-bold tracking-tight">{value}</div>
    {detail && <div className="mt-1 text-[10px] opacity-75">{detail}</div>}
  </div>
);

const RecordStageList: React.FC<{
  records: AnalysisCaseRecord[];
  stage: 'safe' | 'awaiting_llm' | 'blocked';
  llmAvailable: boolean;
  runningCaseId: string | null;
  onRunSingleCase?: (record: AnalysisCaseRecord) => void;
}> = ({ records, stage, llmAvailable, runningCaseId, onRunSingleCase }) => {
  const visible = records.filter((record) => mapAnalysisRecordToProcessingStage(record) === stage);
  return (
    <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1" aria-label={`${processingStageLabel(stage)}案例列表`}>
      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white/70 px-3 py-4 text-center text-xs text-slate-500">当前没有案例。</div>
      ) : visible.map((record) => (
        <div key={record.caseId} className="rounded-lg border border-white/80 bg-white/80 px-3 py-2 text-xs shadow-sm">
          <div className="line-clamp-2 font-semibold text-slate-900">{record.title || record.caseNumber || record.caseId}</div>
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-slate-600">
            <span>{record.caseNumber || record.caseId}</span>
            <span>｜{processingProvenanceLabel(record)}</span>
            {stage === 'awaiting_llm' && onRunSingleCase && (
              <button
                type="button"
                disabled={!llmAvailable || runningCaseId === record.caseId}
                onClick={() => onRunSingleCase(record)}
                className="rounded border border-indigo-300 bg-white px-2 py-0.5 font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                title={llmAvailable ? '仅对当前案例执行语义解析' : '请先在系统设置中启用 AI 并配置 OpenRouter API Key'}
              >
                {runningCaseId === record.caseId ? '分析中…' : '分析此案例'}
              </button>
            )}
          </div>
          <div className="mt-1 text-[11px] text-slate-700">{processingStageReason(record)}</div>
          {stage === 'awaiting_llm' && record.unresolvedReferences?.[0]?.sourceText && (
            <div className="mt-1 rounded border border-indigo-100 bg-indigo-50/60 px-2 py-1 text-[10px] text-indigo-900"><span className="font-medium">待分析片段：</span><CollapsibleText text={record.unresolvedReferences[0].sourceText} collapsedLines={4} /></div>
          )}
        </div>
      ))}
    </div>
  );
};

const LegacyDiagnosticList: React.FC<{
  items: OutcomeReviewItem[];
  onSelectCase: (item: OutcomeReviewItem) => void;
}> = ({ items, onSelectCase }) => (
  <div className="mt-3 grid gap-2 xl:grid-cols-2" aria-label="裁判结果诊断线索">
    {items.length === 0 ? (
      <div className="rounded-lg border border-dashed border-amber-200 bg-white/70 px-3 py-4 text-center text-xs text-amber-800 xl:col-span-2">当前没有待核对的裁判结果线索。</div>
    ) : items.map((item) => {
      const fields = outcomeReviewEvidenceFields(item);
      return (
        <div key={item.reviewItemId || `${item.caseId}-${item.claimId || item.target}`} role="button" tabIndex={0} onClick={() => onSelectCase(item)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectCase(item); } }} className="min-w-0 cursor-pointer rounded-lg border border-amber-200/70 bg-white/80 p-3 text-left shadow-sm transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
          <div className="line-clamp-2 text-sm font-semibold text-slate-900">{item.title || item.caseNumber || item.caseId}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-700">
            <span>{item.claimType || item.target || '结果'}</span>
            <span>｜当前结果：{getOutcomePresentation(item.outcome).label}</span>
          </div>
          <div className="mt-1 line-clamp-2 text-[11px] text-amber-800">{cleanPipelineDiagnosticMessage(item.reasonMessage, (item.reasonCode && outcomeReviewReasonLabels[item.reasonCode]) || '需要核对裁判结果')}</div>
          {fields.length > 0 && <div className="mt-2 grid gap-1 sm:grid-cols-2">
            {fields.slice(0, 4).map((field) => <div key={field.key} className="min-w-0 rounded border border-slate-200 bg-slate-50/70 px-2 py-1 text-[10px] text-slate-700"><span className="font-medium text-slate-600">{field.label}</span><CollapsibleText text={field.key === 'diagnosticText' ? cleanPipelineDiagnosticMessage(field.text, field.placeholder || '') : (field.text || field.placeholder)} collapsedLines={3} className="mt-0.5 leading-4" /></div>)}
          </div>}
        </div>
      );
    })}
  </div>
);

export const PipelineWorkspace: React.FC<PipelineWorkspaceProps> = ({ records, reviewItems, onSelectCase, hasAnalysisRun, onRunSingleCase }) => {
  const overview = useMemo(() => getPipelineOverview(records), [records]);
  const processing = useMemo(() => getPipelineProcessingStats(records), [records]);
  const { settings } = useLlmRuntimeSettings();
  const llmAvailable = isLlmAvailable(settings);
  const [runningCaseId, setRunningCaseId] = useState<string | null>(null);
  const [runMessage, setRunMessage] = useState<string>('');

  const handleRunSingleCase = async (record: AnalysisCaseRecord): Promise<void> => {
    if (!onRunSingleCase || !llmAvailable) return;
    setRunningCaseId(record.caseId);
    setRunMessage('');
    try {
      const result = await onRunSingleCase(record);
      setRunMessage(result.message);
    } catch {
      setRunMessage('单案例语义分析未完成，案例保持待 AI 语义分析。');
    } finally {
      setRunningCaseId(null);
    }
  };

  const runtimeMessage = !settings.enabled
    ? 'AI 语义分析未启用。在系统设置中启用并配置 OpenRouter API Key 后，可处理待分析案例。'
    : !settings.apiKey?.trim()
      ? 'OpenRouter API Key 未配置。当前案例仍保持待 AI 语义分析。'
      : 'AI 语义分析已启用。仅对单个待分析案例执行现有 Semantic Resolver → Schema → Audit 流程。';
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-3" data-testid="pipeline-workspace" aria-label="分析流水线工作台">
      <section aria-label="流水线总览" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><FileSearch className="h-4 w-4 text-indigo-600" />分析流水线</h2>
            <p className="mt-1 text-xs text-slate-500">{hasAnalysisRun ? '当前显示的是本次分析集中的案例，不代表本地案例库总数。' : '当前为本地案例浏览，显示本地案例库中的案例。'}阶段变化不会改写原始解析或研究统计。</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-600">当前分析集：{overview.total} 个案例</span>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <PipelineStat label="全部案例" value={overview.total} tone="border-slate-200 bg-slate-50 text-slate-900" />
          <PipelineStat label="可安全入库" value={overview.safe} tone={stageCardStyles.safe} detail={`安全入库率 ${overview.safeRate}%`} />
          <PipelineStat label="待 AI 语义分析" value={overview.awaitingAi} tone={stageCardStyles.awaiting_llm} />
          <PipelineStat label="人工复核" value={overview.reviewPending} tone={stageCardStyles.review_pending} />
          <PipelineStat label="无法生成语义任务" value={overview.blocked} tone={stageCardStyles.blocked} />
        </div>
      </section>

      <section aria-label="处理阶段" className="mt-3 grid gap-3 xl:grid-cols-2">
        <div className={`rounded-xl border p-4 ${stageCardStyles.safe}`}>
          <div className="flex items-center gap-2 text-sm font-bold"><StageIcon stage="safe" />可安全入库 <span className="text-xs font-normal opacity-75">{overview.safe} 个</span></div>
          <p className="mt-1 text-[11px] opacity-80">{processingStageDescription('safe')}</p>
          <RecordStageList records={records} stage="safe" llmAvailable={llmAvailable} runningCaseId={runningCaseId} />
        </div>
        <div className={`rounded-xl border p-4 ${stageCardStyles.awaiting_llm}`}>
          <div className="flex items-center gap-2 text-sm font-bold"><StageIcon stage="awaiting_llm" />待 AI 语义分析 <span className="text-xs font-normal opacity-75">{overview.awaitingAi} 个</span></div>
          <p className="mt-1 text-[11px] opacity-80">{processingStageDescription('awaiting_llm')}</p>
          <RecordStageList records={records} stage="awaiting_llm" llmAvailable={llmAvailable} runningCaseId={runningCaseId} onRunSingleCase={handleRunSingleCase} />
        </div>
        <div className={`rounded-xl border p-4 ${stageCardStyles.blocked}`}>
          <div className="flex items-center gap-2 text-sm font-bold"><StageIcon stage="blocked" />无法生成语义任务 <span className="text-xs font-normal opacity-75">{overview.blocked} 个</span></div>
          <p className="mt-1 text-[11px] opacity-80">{processingStageDescription('blocked')}</p>
          <RecordStageList records={records} stage="blocked" llmAvailable={llmAvailable} runningCaseId={runningCaseId} />
        </div>
      </section>

      <section aria-label="AI 语义分析工作台" className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-indigo-950"><Sparkles className="h-4 w-4" />AI 语义分析工作台</h3>
            <p className="mt-1 text-[11px] text-indigo-900/75">{runtimeMessage}</p>
          </div>
          <div className="flex gap-1.5 text-[10px] text-indigo-900">
            <span className="rounded bg-white/80 px-2 py-1">待处理 {processing.pending}</span>
            <span className="rounded bg-white/80 px-2 py-1">处理中 {processing.processing}</span>
            <span className="rounded bg-white/80 px-2 py-1">已完成 {processing.completed}</span>
            <span className="rounded bg-white/80 px-2 py-1">失败 {processing.failed}</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" disabled className="cursor-not-allowed rounded-lg bg-indigo-300 px-3 py-1.5 text-xs font-semibold text-white" title="当前分析记录由流水线自动调度">开始处理全部</button>
          <span className="text-[10px] text-indigo-900/70">仅可在上方待分析列表中逐案执行；不会批量处理或自动发起额外请求。</span>
          {runMessage && <span role="status" className="basis-full text-[10px] text-indigo-900">{runMessage}</span>}
        </div>
      </section>

      <section aria-label="人工复核工作台" className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
        <div className="flex items-start gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 text-amber-700" /><div><h3 className="text-sm font-bold text-amber-950">人工复核工作台</h3><p className="mt-1 text-[11px] text-amber-900/75">自动核验未通过的语义结果会进入这里；人工确认后才会进入安全结果。</p></div></div>
        <div className="mt-3 min-h-[320px] overflow-hidden rounded-lg border border-amber-200/80 bg-white/60"><SemanticReviewWorkspace /></div>
        <div className="mt-4 border-t border-amber-200/80 pt-3"><div className="flex items-center gap-2 text-xs font-semibold text-amber-950"><Clock3 className="h-3.5 w-3.5" />裁判结果诊断线索 <span className="font-normal text-amber-800/75">{reviewItems.length} 项</span></div><LegacyDiagnosticList items={reviewItems} onSelectCase={onSelectCase} /></div>
      </section>
    </div>
  );
};
