import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert, Sparkles, UserRoundCheck } from 'lucide-react';
import type { AnalysisCaseRecord, OutcomeReviewItem } from '../types';
import {
  getPipelineOverview,
  getPipelineProcessingStats,
  mapAnalysisRecordToProcessingStage,
  processingProvenanceLabel,
  processingStageDescription,
  processingStageLabel,
  processingStageReason,
} from '../services/presentation/PipelineStagePresentation';
import { CollapsibleText } from './CollapsibleText';
import { SemanticReviewWorkspace } from './SemanticReviewWorkspace';
import { DiagnosticClueWorkspace } from './DiagnosticClueWorkspace';
import { isLlmAvailable, useLlmRuntimeSettings } from '../services/semantic/LlmRuntimeSettings';
import type { SingleCaseSemanticRunResult } from '../services/semantic/LlmRuntimeService';
import { latestSemanticTechnicalFailure, readSemanticTechnicalFailures } from '../services/semantic/SemanticTechnicalFailureStorage';
import type { SemanticReviewItem } from '../services/semantic/SemanticReviewQueue';
import type { CompetitionValidationSnapshot } from '../services/validation/CompetitionValidationSnapshot';

interface PipelineWorkspaceProps {
  records: AnalysisCaseRecord[];
  reviewItems: OutcomeReviewItem[];
  onSelectCase: (item: OutcomeReviewItem) => void;
  hasAnalysisRun: boolean;
  onRunSingleCase?: (record: AnalysisCaseRecord) => Promise<SingleCaseSemanticRunResult>;
  onOpenManualReview?: (record: AnalysisCaseRecord) => Promise<void>;
  onSelectRecord?: (record: AnalysisCaseRecord) => void;
  semanticReviewItems?: SemanticReviewItem[];
  onSemanticReviewItemsChange?: (items: SemanticReviewItem[]) => void;
  onExportValidationSnapshot?: () => Promise<CompetitionValidationSnapshot>;
}

const stageCardStyles = {
  safe: 'border-emerald-200 bg-emerald-50/70 text-emerald-950',
  awaiting_llm: 'border-indigo-200 bg-indigo-50/70 text-indigo-950',
  review_pending: 'border-amber-200 bg-amber-50/70 text-amber-950',
  technical_failure: 'border-orange-200 bg-orange-50/70 text-orange-950',
  blocked: 'border-slate-200 bg-slate-50/80 text-slate-800',
} as const;

const technicalFailureLabel = (code: string): string => {
  if (code === 'timeout') return '请求超时';
  if (code === 'network_error') return '网络连接失败';
  if (code === 'invalid_json') return '无法读取 AI 结果';
  if (code === 'schema_invalid' || code === 'schema_validation_failed') return '结果格式校验失败';
  if (code === 'contract_validation_failed' || code === 'contract_mismatch') return '结果契约校验失败';
  if (/^http_/.test(code) || code === 'provider_http_failure') return 'AI 服务请求失败';
  return 'AI 处理失败';
};

const StageIcon: React.FC<{ stage: 'safe' | 'awaiting_llm' | 'review_pending' | 'technical_failure' | 'blocked' }> = ({ stage }) => {
  if (stage === 'safe') return <CheckCircle2 className="h-4 w-4" />;
  if (stage === 'awaiting_llm') return <Sparkles className="h-4 w-4" />;
  if (stage === 'technical_failure') return <AlertTriangle className="h-4 w-4" />;
  if (stage === 'blocked') return <ShieldAlert className="h-4 w-4" />;
  return <UserRoundCheck className="h-4 w-4" />;
};

const PipelineStat: React.FC<{ label: string; value: number; tone: string; detail?: string }> = ({ label, value, tone, detail }) => (
  <div className={`rounded-2xl border px-4 py-4 ${tone}`}>
    <div className="text-[11px] font-medium opacity-80">{label}</div>
    <div className="mt-1 text-2xl font-bold tracking-tight">{value}</div>
    {detail && <div className="mt-1 text-[10px] opacity-75">{detail}</div>}
  </div>
);

const RecordStageList: React.FC<{
  records: AnalysisCaseRecord[];
  stage: 'safe' | 'awaiting_llm' | 'technical_failure' | 'blocked';
  llmAvailable: boolean;
  runningCaseId: string | null;
  semanticReviewItems?: readonly SemanticReviewItem[];
  onRunSingleCase?: (record: AnalysisCaseRecord) => void;
  onOpenManualReview?: (record: AnalysisCaseRecord) => void;
  onSelectRecord?: (record: AnalysisCaseRecord) => void;
}> = ({ records, stage, llmAvailable, runningCaseId, semanticReviewItems, onRunSingleCase, onOpenManualReview, onSelectRecord }) => {
  const visible = records.filter((record) => mapAnalysisRecordToProcessingStage(record, semanticReviewItems) === stage);
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
            {stage === 'blocked' && onSelectRecord && (
              <button
                type="button"
                onClick={() => onSelectRecord(record)}
                className="rounded border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-700 hover:bg-slate-50"
              >
                查看案例
              </button>
            )}
            {(stage === 'awaiting_llm' || stage === 'technical_failure') && onRunSingleCase && (
              <button
                type="button"
                disabled={!llmAvailable || runningCaseId === record.caseId}
                onClick={() => onRunSingleCase(record)}
                className="rounded border border-indigo-300 bg-white px-2 py-0.5 font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                title={llmAvailable ? '仅对当前案例执行语义解析' : '请先在系统设置中启用 AI 并配置 xAI API Key'}
              >
                {runningCaseId === record.caseId ? '分析中…' : stage === 'technical_failure' ? '重新尝试 AI' : '分析此案例'}
              </button>
            )}
            {stage === 'technical_failure' && onOpenManualReview && (
              <button
                type="button"
                onClick={() => onOpenManualReview(record)}
                className="rounded border border-amber-300 bg-white px-2 py-0.5 font-semibold text-amber-800 hover:bg-amber-50"
              >
                直接人工复核
              </button>
            )}
          </div>
          <div className="mt-1 text-[11px] text-slate-700">{processingStageReason(record, semanticReviewItems)}</div>
          {stage === 'technical_failure' && (() => {
            const failure = latestSemanticTechnicalFailure(record.caseId);
            return failure ? (
              <details className="mt-2 rounded border border-orange-200 bg-orange-50/70 px-2 py-1 text-[10px] text-orange-950">
                <summary className="cursor-pointer font-semibold">技术失败详情</summary>
                <div className="mt-1 space-y-0.5">
                  <div>阶段：{failure.failureStage}</div>
                  <div>失败码：{failure.failureCode}{failure.httpStatus ? `｜HTTP ${failure.httpStatus}` : ''}</div>
                  <div>摘要：{failure.errorSummary}</div>
                  <div>时间：{failure.timestamp}｜第 {failure.attempt} 次</div>
                </div>
              </details>
            ) : null;
          })()}
          {stage === 'awaiting_llm' && record.unresolvedReferences?.[0]?.sourceText && (
            <div className="mt-1 rounded border border-indigo-100 bg-indigo-50/60 px-2 py-1 text-[10px] text-indigo-900"><span className="font-medium">待分析片段：</span><CollapsibleText text={record.unresolvedReferences[0].sourceText} collapsedLines={4} /></div>
          )}
        </div>
      ))}
    </div>
  );
};

export const PipelineWorkspace: React.FC<PipelineWorkspaceProps> = ({ records, reviewItems, onSelectCase, hasAnalysisRun, onRunSingleCase, onOpenManualReview, onSelectRecord, semanticReviewItems, onSemanticReviewItemsChange, onExportValidationSnapshot }) => {
  const overview = useMemo(() => getPipelineOverview(records, semanticReviewItems), [records, semanticReviewItems]);
  const processing = useMemo(() => getPipelineProcessingStats(records, semanticReviewItems), [records, semanticReviewItems]);
  const technicalFailureSummary = useMemo(() => {
    const counts = new Map<string, number>();
    const currentCaseIds = new Set(records.map((record) => record.caseId));
    readSemanticTechnicalFailures()
      .filter((failure) => currentCaseIds.has(failure.caseId))
      .forEach((failure) => counts.set(failure.failureCode, (counts.get(failure.failureCode) || 0) + 1));
    return [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 4);
  }, [records, overview.technicalFailure]);
  const { settings } = useLlmRuntimeSettings();
  const llmAvailable = isLlmAvailable(settings);
  const [runningCaseId, setRunningCaseId] = useState<string | null>(null);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [runMessage, setRunMessage] = useState<string>('');
  const [exportingSnapshot, setExportingSnapshot] = useState(false);
  const [exportMessage, setExportMessage] = useState<string>('');

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

  const handleExportValidationSnapshot = async (): Promise<void> => {
    if (!onExportValidationSnapshot) return;
    setExportingSnapshot(true);
    setExportMessage('');
    try {
      const snapshot = await onExportValidationSnapshot();
      setExportMessage(`验证快照已导出：${snapshot.cases.length} 个当前案例。`);
    } catch (error) {
      setExportMessage(error instanceof Error ? `导出失败：${error.message}` : '验证快照导出失败。');
    } finally {
      setExportingSnapshot(false);
    }
  };

  const runtimeMessage = !settings.enabled
    ? 'AI 语义分析未启用。在系统设置中启用并配置 xAI API Key 后，可处理待分析案例。'
    : !settings.apiKey?.trim()
      ? '当前 xAI API Key 未配置。当前案例仍保持待 AI 语义分析。'
      : 'AI 语义分析已启用。可对待分析案例逐一执行语义解析，并在必要时进入人工复核。';
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/80 px-6 pb-8 pt-5 lg:px-8" data-testid="pipeline-workspace" aria-label="分析流水线工作台">
      <section aria-label="流水线总览" className="mx-auto max-w-7xl rounded-[28px] border border-white/80 bg-white/80 p-6 shadow-[0_12px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">分析流水线</h2>
            <p className="mt-1 text-xs text-slate-500">{hasAnalysisRun ? '当前显示的是本次分析集中的案例，不代表本地案例库总数。' : '当前为本地案例浏览，显示本地案例库中的案例。'}阶段变化不会改写原始解析或研究统计。</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {onExportValidationSnapshot && (
              <button
                type="button"
                onClick={handleExportValidationSnapshot}
                disabled={exportingSnapshot}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                title="导出当前案例、复核与分析运行的只读验证快照"
              >
                {exportingSnapshot ? '导出中…' : '导出验证快照'}
              </button>
            )}
          </div>
        </div>
        {exportMessage && <div role="status" className="mt-2 text-[11px] text-slate-600">{exportMessage}</div>}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="分析集状态">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4"><div className="text-xs text-slate-500">当前分析集</div><div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{overview.total}</div><div className="mt-1 text-xs text-slate-500">个案例</div></div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4"><div className="text-xs text-slate-500">状态</div><div className="mt-2 text-lg font-semibold text-slate-900">{hasAnalysisRun ? '已完成' : '本地浏览'}</div><div className="mt-1 text-xs text-slate-500">当前工作范围</div></div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4"><div className="text-xs text-amber-800">待复核</div><div className="mt-2 text-2xl font-semibold tracking-tight text-amber-950">{overview.reviewPending}</div><div className="mt-1 text-xs text-amber-800">项</div></div>
          <div className={`rounded-2xl border p-4 ${overview.blocked > 0 ? 'border-amber-100 bg-amber-50/70' : 'border-emerald-100 bg-emerald-50/70'}`}><div className={`text-xs ${overview.blocked > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>质量状态</div><div className={`mt-2 text-lg font-semibold ${overview.blocked > 0 ? 'text-amber-950' : 'text-emerald-950'}`}>{overview.blocked > 0 ? '存在警告' : '正常'}</div><div className={`mt-1 text-xs ${overview.blocked > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>{overview.blocked} 项阻断</div></div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <PipelineStat label="全部案例" value={overview.total} tone="border-slate-200 bg-slate-50 text-slate-900" />
          <PipelineStat label="可安全入库" value={overview.safe} tone={stageCardStyles.safe} detail={`安全入库率 ${overview.safeRate}%`} />
          <PipelineStat label="待 AI 语义分析" value={overview.awaitingAi} tone={stageCardStyles.awaiting_llm} />
          <PipelineStat label="需要人工复核" value={overview.reviewPending} tone={stageCardStyles.review_pending} />
          <PipelineStat label="技术失败" value={overview.technicalFailure} tone={stageCardStyles.technical_failure} />
          <PipelineStat label="暂不可分析" value={overview.blocked} tone={stageCardStyles.blocked} />
        </div>
      </section>

      <section aria-label="处理阶段" className="mx-auto mt-5 grid max-w-7xl gap-4 xl:grid-cols-2">
        <div className={`rounded-[24px] border p-5 shadow-sm ${stageCardStyles.safe}`}>
          <div className="flex items-center gap-2 text-sm font-bold"><StageIcon stage="safe" />可安全入库 <span className="text-xs font-normal opacity-75">{overview.safe} 个</span></div>
          <p className="mt-1 text-[11px] opacity-80">{processingStageDescription('safe')}</p>
          <RecordStageList records={records} stage="safe" llmAvailable={llmAvailable} runningCaseId={runningCaseId} semanticReviewItems={semanticReviewItems} />
        </div>
        <div className={`rounded-[24px] border p-5 shadow-sm ${stageCardStyles.awaiting_llm}`}>
          <div className="flex items-center gap-2 text-sm font-bold"><StageIcon stage="awaiting_llm" />待 AI 语义分析 <span className="text-xs font-normal opacity-75">{overview.awaitingAi} 个</span></div>
          <p className="mt-1 text-[11px] opacity-80">{processingStageDescription('awaiting_llm')}</p>
          <RecordStageList records={records} stage="awaiting_llm" llmAvailable={llmAvailable} runningCaseId={runningCaseId} semanticReviewItems={semanticReviewItems} onRunSingleCase={handleRunSingleCase} />
        </div>
        <div className={`rounded-[24px] border p-5 shadow-sm ${stageCardStyles.blocked}`} data-testid="blocked-stage-panel">
          <button type="button" className="flex w-full items-center gap-2 text-left text-sm font-bold" aria-expanded={blockedOpen} onClick={() => setBlockedOpen((current) => !current)}>
            <StageIcon stage="blocked" />暂不可分析 <span className="text-xs font-normal opacity-75">（{overview.blocked}）</span><span className="ml-auto text-xs font-medium text-slate-600">{blockedOpen ? '收起' : '展开'}</span>
          </button>
          <p className="mt-1 text-[11px] opacity-80">{processingStageDescription('blocked')}</p>
          {blockedOpen && <RecordStageList records={records} stage="blocked" llmAvailable={llmAvailable} runningCaseId={runningCaseId} semanticReviewItems={semanticReviewItems} onSelectRecord={onSelectRecord} />}
        </div>
        <div className={`rounded-[24px] border p-5 shadow-sm ${stageCardStyles.technical_failure}`}>
          <div className="flex items-center gap-2 text-sm font-bold"><StageIcon stage="technical_failure" />技术失败 <span className="text-xs font-normal opacity-75">{overview.technicalFailure} 个</span></div>
          <p className="mt-1 text-[11px] opacity-80">{processingStageDescription('technical_failure')}</p>
          {technicalFailureSummary.length > 0 && <div className="mt-2 rounded border border-orange-200 bg-white/60 px-2 py-1 text-[10px] text-orange-900" data-testid="technical-failure-summary">最近技术失败：{technicalFailureSummary.map(([code, count]) => `${technicalFailureLabel(code)} × ${count}`).join('、')}</div>}
          <RecordStageList records={records} stage="technical_failure" llmAvailable={llmAvailable} runningCaseId={runningCaseId} semanticReviewItems={semanticReviewItems} onRunSingleCase={handleRunSingleCase} onOpenManualReview={onOpenManualReview ? async (record) => onOpenManualReview(record) : undefined} />
        </div>
      </section>

      <section aria-label="AI 语义分析工作台" className="mx-auto mt-5 max-w-7xl rounded-[24px] border border-indigo-100 bg-indigo-50/60 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-indigo-950">AI 语义分析工作台</h3>
            <p className="mt-1 text-[11px] text-indigo-900/75">{runtimeMessage}</p>
          </div>
          <div className="flex gap-1.5 text-[10px] text-indigo-900">
            <span className="rounded bg-white/80 px-2 py-1">待处理 {processing.pending}</span>
            <span className="rounded bg-white/80 px-2 py-1">处理中 {processing.processing}</span>
            <span className="rounded bg-white/80 px-2 py-1">已完成 {processing.completed}</span>
            <span className="rounded bg-white/80 px-2 py-1">技术失败 {processing.failed}</span>
            <span className="rounded bg-white/80 px-2 py-1">待人工复核 {overview.reviewPending}</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" disabled className="cursor-not-allowed rounded-lg bg-indigo-300 px-3 py-1.5 text-xs font-semibold text-white" title="当前分析记录由流水线自动调度">开始处理全部</button>
          <span className="text-[10px] text-indigo-900/70">仅可在上方待分析列表中逐案执行；不会批量处理或自动发起额外请求。</span>
          {runMessage && <span role="status" className="basis-full text-[10px] text-indigo-900">{runMessage}</span>}
        </div>
      </section>

      <section aria-label="人工复核工作台" className="mx-auto mt-5 max-w-7xl rounded-[24px] border border-amber-100 bg-amber-50/60 p-5 shadow-sm">
        <div className="flex items-start gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 text-amber-700" /><div><h3 className="text-sm font-bold text-amber-950">人工复核工作台</h3><p className="mt-1 text-[11px] text-amber-900/75">自动核验未通过的语义候选，以及技术失败后主动转入人工的案例，都可以在这里完成 claim 结果确认。</p></div></div>
        <div className="mt-3 h-[min(75vh,720px)] min-h-[520px] overflow-hidden rounded-lg border border-amber-200/80 bg-white/60"><SemanticReviewWorkspace items={semanticReviewItems} onItemsChange={onSemanticReviewItemsChange} /></div>
        <DiagnosticClueWorkspace items={reviewItems} onSelectCase={onSelectCase} />
      </section>
    </div>
  );
};
