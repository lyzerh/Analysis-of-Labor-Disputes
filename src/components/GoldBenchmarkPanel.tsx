import React, { useEffect, useMemo, useState } from 'react';
import type { AnalysisCaseRecord } from '../types';
import {
  getEligibleGoldClaims,
  runGoldBenchmark,
  type GoldBenchmarkProgress,
} from '../services/gold/GoldBenchmarkRunner';
import {
  buildGoldBenchmarkCsv,
  buildGoldBenchmarkJson,
  readGoldBenchmarkRuns,
  type BenchmarkRun,
} from '../services/gold/GoldBenchmarkStorage';
import { type GoldCaseAnnotation, type GoldSetRecord } from '../services/gold/GoldAnnotationStorage';
import { readLlmRuntimeSettings } from '../services/semantic/LlmRuntimeSettings';
import { SEMANTIC_LLM_MODEL, SEMANTIC_LLM_PROVIDER } from '../services/semantic/SemanticPrompt';

interface GoldBenchmarkPanelProps {
  activeSet?: GoldSetRecord;
  records: AnalysisCaseRecord[];
  annotations: GoldCaseAnnotation[];
}

const percent = (value: number): string => `${Math.round(value * 100)}%`;
const identityLabel = (value?: string): string => ({
  verified: '已核验',
  legacy_unverified: '历史记录未核验',
  identity_mismatch: '身份不一致',
  identity_missing: '缺少身份信息',
}[value || ''] || '历史记录');
const outcomeLabel = (value?: string): string => ({
  supported: '获得支持',
  partially_supported: '部分支持',
  not_supported: '未获支持',
  unclear: '结果不明确',
}[value || ''] || value || '-');
const invocationLabel = (value?: string): string => ({ success: '调用成功', technical_failure: '技术失败', not_run: '未调用', failed: '调用失败', skipped: '未调用', pending: '待调用' }[value || ''] || value || '-');
const candidateLabel = (value?: string): string => ({ candidate: '已形成候选', unresolved: '结果不明确', no_candidate: '未生成候选' }[value || ''] || value || '-');
const comparisonLabel = (value?: string): string => ({ correct: '与 Gold 一致', incorrect: '与 Gold 不一致', unresolved: '未解决', technical_failure: '技术失败', identity_mismatch: '身份不一致' }[value || ''] || value || '-');

export const GoldBenchmarkPanel: React.FC<GoldBenchmarkPanelProps> = ({ activeSet, records, annotations }) => {
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState<GoldBenchmarkProgress>();
  const [run, setRun] = useState<BenchmarkRun | undefined>(() => readGoldBenchmarkRuns()[0]);
  const eligible = useMemo(() => activeSet ? getEligibleGoldClaims(activeSet, records, annotations) : [], [activeSet, records, annotations]);
  useEffect(() => {
    setRun(activeSet ? readGoldBenchmarkRuns().find((item) => item.goldSetId === activeSet.id) : undefined);
  }, [activeSet?.id]);

  const start = async (snapshot?: BenchmarkRun['goldSnapshot']): Promise<void> => {
    if (!activeSet || running) return;
    const settings = readLlmRuntimeSettings();
    if (!settings.enabled || !settings.apiKey?.trim()) {
      setMessage('当前未配置可用 AI，请先在 AI 设置中完成连接测试。');
      setConfirming(false);
      return;
    }
    setRunning(true); setMessage(''); setProgress(undefined); setConfirming(false);
    try {
      const next = await runGoldBenchmark({
        goldSet: activeSet,
        records,
        annotations,
        settings,
        ...(snapshot ? { goldSnapshot: snapshot } : {}),
        onProgress: setProgress,
      });
      setRun(next);
      setMessage('Benchmark 已完成；Gold 标注、复核记录和分析集未被修改。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Benchmark 未能完成。');
    } finally { setRunning(false); }
  };

  const download = (kind: 'json' | 'csv'): void => {
    if (!run) return;
    const content = kind === 'json' ? buildGoldBenchmarkJson(run) : buildGoldBenchmarkCsv(run);
    const type = kind === 'json' ? 'application/json' : 'text/csv;charset=utf-8';
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a'); link.href = url; link.download = `lawlens-ai-benchmark-${run.id}.${kind}`; link.click(); URL.revokeObjectURL(url);
  };

  return <section className="bg-white/80 backdrop-blur-xl border border-white/80 rounded-[28px] p-6 lg:p-7 shadow-[0_12px_40px_rgba(15,23,42,0.06)] space-y-6" data-testid="gold-benchmark-panel">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-lg font-semibold tracking-tight text-slate-900">AI 解析基准测试</h3><p className="text-sm text-slate-500 mt-2 max-w-2xl leading-6">仅对当前 Gold Set 中已完成诉求识别、且有确定 Gold 结果的实体诉求执行新鲜 AI 调用。结果只读保存，不会改写 Gold、复核或分析数据。</p></div>
      <button type="button" data-testid="run-gold-benchmark" disabled={!activeSet || running} onClick={() => setConfirming(true)} className="lawlens-primary-button px-4 py-2.5 rounded-xl text-sm font-semibold">{running ? '基准测试运行中…' : '运行 AI 基准测试'}</button>
    </div>
    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">本次测试范围：<span className="font-semibold text-slate-900">{eligible.length} 条身份已核验诉求</span></div>
    {confirming && <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm" role="dialog" aria-label="确认运行 AI Benchmark"><div className="font-medium">确认运行 AI Benchmark？</div><div className="mt-1 text-xs text-slate-600">Gold Set：{activeSet?.name} · 合资格诉求：{eligible.length} 条</div><div className="text-xs text-slate-600">Provider：{SEMANTIC_LLM_PROVIDER} · Model：{SEMANTIC_LLM_MODEL}</div><p className="mt-1 text-xs text-slate-600">将对上述诉求进行新鲜 AI 调用。不会修改 Gold 标注、原有 AI 候选、人工复核、AnalysisRun 或案例数据。</p><div className="mt-3 flex gap-2"><button type="button" onClick={() => { void start(); }} className="lawlens-primary-button px-3 py-1.5 rounded text-xs font-semibold">开始 Benchmark</button><button type="button" onClick={() => setConfirming(false)} className="px-3 py-1.5 rounded border text-xs">取消</button></div></div>}
    {running && progress && <div className="rounded bg-slate-50 p-3 text-xs text-slate-600" role="status"><div>正在运行 {progress.current} / {progress.total}：{progress.caseName} · {progress.claimId}</div><div className="mt-1">调用成功 {progress.invocationSuccess} 条 · 形成明确结果 {progress.explicitCandidate} 条 · 转入人工复核 {progress.unresolved} 条 · 技术失败 {progress.technicalFailure} 条</div></div>}
    {message && <div className="text-sm text-slate-600" role="status">{message}</div>}
    {run && Object.keys(run.schemaFailureReasons || {}).length > 0 && <details className="rounded bg-amber-50 p-2 text-xs"><summary className="cursor-pointer text-amber-800">结构校验失败原因</summary><div className="mt-1">{Object.entries(run.schemaFailureReasons || {}).map(([reason, count]) => <div key={reason}>{reason}：{count}</div>)}</div></details>}
    {run && Object.keys(run.auditFailureReasons || {}).length > 0 && <details className="rounded bg-slate-50 p-2 text-xs"><summary className="cursor-pointer text-slate-700">审计与关系原因</summary><div className="mt-1">{Object.entries(run.auditFailureReasons || {}).map(([reason, count]) => <div key={reason}>{reason}：{count}</div>)}</div></details>}
    {run?.results.filter((item) => item.rawResponseAvailable || item.schemaValidationErrors?.length || item.failureStage === 'contract').map((item) => <details key={`${item.caseId}::${item.claimId}::diagnostic`} className="rounded border border-amber-200 p-2 text-xs"><summary className="cursor-pointer text-amber-800">查看结构校验/契约错误 · {item.caseName} · {item.claimId}</summary><div className="mt-2 space-y-1"><div>failureStage：{item.failureStage || '-'} · failureCode：{item.failureCode || '-'}</div><div>schemaFailureOrigin：{item.schemaFailureOrigin || '-'} · validator：{item.validatorName || '-'} · validatorPassed：{item.validatorPassed === undefined ? '-' : String(item.validatorPassed)}</div><div>providerRawParsed：{item.providerRawParsed === undefined ? '-' : String(item.providerRawParsed)} · semanticSchemaPassed：{item.semanticSchemaPassed === undefined ? '-' : String(item.semanticSchemaPassed)} · normalizationPassed：{item.normalizationPassed === undefined ? '-' : String(item.normalizationPassed)} · contractPassed：{item.contractPassed === undefined ? '-' : String(item.contractPassed)} · auditRan：{item.auditRan === undefined ? '-' : String(item.auditRan)}</div>{(item.validatorErrors || []).length > 0 && <div>validatorErrors：{item.validatorErrors?.join(' | ')}</div>}{(item.schemaValidationErrors || []).map((error, index) => <div key={`${error.path}-${index}`}><span className="font-medium">{error.path}</span> · {error.errorCode} · expected {error.expected || '-'} · actual {error.actualType || '-'} · {error.actualValuePreview || '-'}</div>)}{item.failureStage === 'contract' && <div>reasonCodes：{(item.contractReasonCodes || []).join(', ') || '-'}</div>}{item.rawResponsePreview && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2">{item.rawResponsePreview}</pre>}{item.parsedJsonCandidate !== undefined && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2">{JSON.stringify(item.parsedJsonCandidate, null, 2)}</pre>}</div></details>)}
    {run && <div className="border-t pt-3 space-y-2" data-testid="gold-benchmark-results">
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
        <span>最近测试：{run.completedAt}</span><span className="text-emerald-700">已完成</span>
        <button type="button" onClick={() => download('json')} className="underline">导出 JSON</button><button type="button" onClick={() => download('csv')} className="underline">导出 CSV</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm"><div className="text-xs font-medium text-slate-500">符合测试条件</div><div className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{run.metrics.eligibleClaims}</div><div className="mt-1 text-xs text-slate-500">条诉求</div></div>
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5 shadow-sm"><div className="text-xs font-medium text-indigo-800">形成明确结果</div><div className="mt-2 text-3xl font-semibold tracking-tight text-indigo-900">{run.metrics.explicitCandidate}/{run.metrics.eligibleClaims}</div><div className="mt-1 text-xs text-indigo-700">{percent(run.metrics.candidateCoverage)}</div></div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5 shadow-sm"><div className="text-xs font-medium text-emerald-800">与人工标注一致</div><div className="mt-2 text-3xl font-semibold tracking-tight text-emerald-900">{run.metrics.correct}/{(run.metrics.correct + run.metrics.incorrect) || 0}</div><div className="mt-1 text-xs text-emerald-700">{percent(run.metrics.outcomeAccuracy)} · 明确结果</div></div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-5 shadow-sm"><div className="text-xs font-medium text-amber-800">转入人工复核</div><div className="mt-2 text-3xl font-semibold tracking-tight text-amber-900">{run.metrics.technicalFailure + run.metrics.unresolved}/{run.metrics.eligibleClaims}</div><div className="mt-1 text-xs text-amber-700">{percent(run.metrics.potentialHumanInterventionRate)}</div></div>
      </div>
      <details className="rounded border border-slate-200 bg-slate-50 p-2 text-xs">
        <summary className="cursor-pointer text-slate-700">技术详情</summary>
        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>身份核验率：{run.metrics.identityVerifiedClaims}/{run.metrics.eligibleClaims}（{percent(run.metrics.identityVerificationRate)}）</div>
          <div>身份不一致：{run.metrics.identityMismatchClaims} 条</div>
          <div>AI 调用成功：{run.metrics.invocationSuccess}/{run.metrics.eligibleClaims}</div>
          <div>技术失败：{run.metrics.technicalFailure}/{run.metrics.eligibleClaims}</div>
          <div>端到端正确覆盖：{run.metrics.correct}/{run.metrics.eligibleClaims}（{percent(run.metrics.endToEndCorrectCoverage)}）</div>
          <div>运行编号：{run.id}</div>
          <div>服务提供商：{run.provider}</div>
          <div>模型：{run.model}</div>
          <div>提示版本：{run.promptVersion}</div>
          <div>结构版本：{run.schemaVersion}</div>
          <div>阈值：{typeof run.threshold === 'number' ? run.threshold : '未记录'}</div>
          <div>Gold Set：{run.goldSetName}</div>
          <div>开始时间：{run.benchmarkStartedAt}</div>
          <div>跳过历史未核验：{run.skippedLegacyUnverified || 0} 条</div>
          <div>跳过身份不一致：{run.skippedIdentityMismatch || 0} 条</div>
          <div>跳过身份缺失：{run.skippedIdentityMissing || 0} 条</div>
          <div className="col-span-2 md:col-span-4"><button type="button" onClick={() => start(run.goldSnapshot)} disabled={running} className="underline disabled:opacity-40">用同一冻结快照重跑诊断</button></div>
        </div>
      </details>
      <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-slate-500"><th className="py-1 pr-2">案例 / 诉求</th><th className="py-1 pr-2">身份</th><th className="py-1 pr-2">Gold</th><th className="py-1 pr-2">AI</th><th className="py-1 pr-2">置信度</th><th className="py-1 pr-2">调用</th><th className="py-1 pr-2">比较</th><th className="py-1 pr-2">失败</th><th className="py-1">耗时</th></tr></thead><tbody>{run.results.map((item) => <tr key={`${item.caseId}::${item.claimId}`} className="border-t"><td className="py-1 pr-2">{item.caseName} · {item.claimId}</td><td className="py-1 pr-2">{identityLabel(item.identityStatus)}</td><td className="py-1 pr-2">{outcomeLabel(item.goldOutcome)}</td><td className="py-1 pr-2">{item.aiOutcome ? outcomeLabel(item.aiOutcome) : candidateLabel(item.candidateStatus)}</td><td className="py-1 pr-2">{item.aiConfidence === undefined ? '-' : percent(item.aiConfidence)}</td><td className="py-1 pr-2">{invocationLabel(item.aiInvocationStatus)}</td><td className="py-1 pr-2">{comparisonLabel(item.comparison)}</td><td className="py-1 pr-2">{item.failureCode ? '技术处理失败' : '-'}</td><td className="py-1">{item.latencyMs} ms</td></tr>)}</tbody></table></div><p className="text-xs text-slate-500">以上分子/分母均来自本次运行的诉求结果；结果按 claimType 分组，小样本仅作参考。</p>
    </div>}
  </section>;
};
