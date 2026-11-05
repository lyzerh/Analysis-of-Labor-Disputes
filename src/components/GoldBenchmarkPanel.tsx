import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
const identityLabel = (value: string | undefined, t: (key: string) => string): string => ({
  verified: t('gold.verified'), legacy_unverified: t('gold.legacyUnverified'),
  identity_mismatch: t('gold.identityMismatch'), identity_missing: t('gold.identityMissing'),
}[value || ''] || t('gold.legacyRecord'));
const outcomeLabel = (value: string | undefined, t: (key: string) => string): string => ({
  supported: t('status.supported'), partially_supported: t('status.partiallySupported'),
  not_supported: t('status.notSupported'), unclear: t('status.unclear'),
}[value || ''] || value || '-');
const invocationLabel = (value: string | undefined, t: (key: string) => string): string => ({ success: t('benchmark.callSuccess'), technical_failure: t('benchmark.technicalFailure'), not_run: t('benchmark.notRun'), failed: t('benchmark.callFailed'), skipped: t('benchmark.notRun'), pending: t('benchmark.callPending') }[value || ''] || value || '-');
const candidateLabel = (value: string | undefined, t: (key: string) => string): string => ({ candidate: t('benchmark.candidate'), unresolved: t('status.unclear'), no_candidate: t('gold.noAiCandidate') }[value || ''] || value || '-');
const comparisonLabel = (value: string | undefined, t: (key: string) => string): string => ({ correct: t('benchmark.matched'), incorrect: t('benchmark.notMatched'), unresolved: t('benchmark.unresolved'), technical_failure: t('benchmark.technicalFailure'), identity_mismatch: t('gold.identityMismatch') }[value || ''] || value || '-');

export const GoldBenchmarkPanel: React.FC<GoldBenchmarkPanelProps> = ({ activeSet, records, annotations }) => {
  const { t } = useTranslation();
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
      setMessage(t('benchmark.configureAi'));
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
      setMessage(t('benchmark.completeMessage'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('benchmark.failedMessage'));
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
      <div><h3 className="text-lg font-semibold tracking-tight text-slate-900">{t('benchmark.title')}</h3><p className="text-sm text-slate-500 mt-2 max-w-2xl leading-6">{t('benchmark.description')}</p></div>
      <button type="button" data-testid="run-gold-benchmark" disabled={!activeSet || running} onClick={() => setConfirming(true)} className="lawlens-primary-button px-4 py-2.5 rounded-xl text-sm font-semibold">{running ? t('benchmark.running') : t('benchmark.run')}</button>
    </div>
    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">{t('benchmark.scope')}<span className="font-semibold text-slate-900">{t('benchmark.verifiedClaims', { count: eligible.length })}</span></div>
    {confirming && <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm" role="dialog" aria-label={t('benchmark.confirmRun')}><div className="font-medium">{t('benchmark.confirmRun')}</div><div className="mt-1 text-xs text-slate-600">{t('gold.currentSet')}：{activeSet?.name} · {t('benchmark.eligibleClaims', { count: eligible.length })}</div><div className="text-xs text-slate-600">{t('benchmark.provider')}：{SEMANTIC_LLM_PROVIDER} · {t('benchmark.model')}：{SEMANTIC_LLM_MODEL}</div><p className="mt-1 text-xs text-slate-600">{t('benchmark.freshCall')}</p><div className="mt-3 flex gap-2"><button type="button" onClick={() => { void start(); }} className="lawlens-primary-button px-3 py-1.5 rounded text-xs font-semibold">{t('benchmark.start')}</button><button type="button" onClick={() => setConfirming(false)} className="px-3 py-1.5 rounded border text-xs">{t('benchmark.cancel')}</button></div></div>}
    {running && progress && <div className="rounded bg-slate-50 p-3 text-xs text-slate-600" role="status"><div>{t('benchmark.progress', { current: progress.current, total: progress.total, caseName: progress.caseName, claimId: progress.claimId })}</div><div className="mt-1">{t('benchmark.callsSummary', { success: progress.invocationSuccess, explicit: progress.explicitCandidate, review: progress.unresolved, failed: progress.technicalFailure })}</div></div>}
    {message && <div className="text-sm text-slate-600" role="status">{message}</div>}
    {run && Object.keys(run.schemaFailureReasons || {}).length > 0 && <details className="rounded bg-amber-50 p-2 text-xs"><summary className="cursor-pointer text-amber-800">{t('benchmark.schemaFailures')}</summary><div className="mt-1">{Object.entries(run.schemaFailureReasons || {}).map(([reason, count]) => <div key={reason}>{reason}：{count}</div>)}</div></details>}
    {run && Object.keys(run.auditFailureReasons || {}).length > 0 && <details className="rounded bg-slate-50 p-2 text-xs"><summary className="cursor-pointer text-slate-700">{t('benchmark.auditReasons')}</summary><div className="mt-1">{Object.entries(run.auditFailureReasons || {}).map(([reason, count]) => <div key={reason}>{reason}：{count}</div>)}</div></details>}
    {run?.results.filter((item) => item.rawResponseAvailable || item.schemaValidationErrors?.length || item.failureStage === 'contract').map((item) => <details key={`${item.caseId}::${item.claimId}::diagnostic`} className="rounded border border-amber-200 p-2 text-xs"><summary className="cursor-pointer text-amber-800">{t('benchmark.viewErrors')} · {item.caseName} · {item.claimId}</summary><div className="mt-2 space-y-1"><div>failureStage：{item.failureStage || '-'} · failureCode：{item.failureCode || '-'}</div><div>schemaFailureOrigin：{item.schemaFailureOrigin || '-'} · validator：{item.validatorName || '-'} · validatorPassed：{item.validatorPassed === undefined ? '-' : String(item.validatorPassed)}</div><div>providerRawParsed：{item.providerRawParsed === undefined ? '-' : String(item.providerRawParsed)} · semanticSchemaPassed：{item.semanticSchemaPassed === undefined ? '-' : String(item.semanticSchemaPassed)} · normalizationPassed：{item.normalizationPassed === undefined ? '-' : String(item.normalizationPassed)} · contractPassed：{item.contractPassed === undefined ? '-' : String(item.contractPassed)} · auditRan：{item.auditRan === undefined ? '-' : String(item.auditRan)}</div>{(item.validatorErrors || []).length > 0 && <div>validatorErrors：{item.validatorErrors?.join(' | ')}</div>}{(item.schemaValidationErrors || []).map((error, index) => <div key={`${error.path}-${index}`}><span className="font-medium">{error.path}</span> · {error.errorCode} · expected {error.expected || '-'} · actual {error.actualType || '-'} · {error.actualValuePreview || '-'}</div>)}{item.failureStage === 'contract' && <div>reasonCodes：{(item.contractReasonCodes || []).join(', ') || '-'}</div>}{item.rawResponsePreview && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2">{item.rawResponsePreview}</pre>}{item.parsedJsonCandidate !== undefined && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2">{JSON.stringify(item.parsedJsonCandidate, null, 2)}</pre>}</div></details>)}
    {run && <div className="border-t pt-3 space-y-2" data-testid="gold-benchmark-results">
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
        <span>{t('benchmark.recentRun', { date: run.completedAt })}</span><span className="text-emerald-700">{t('benchmark.completed')}</span>
        <button type="button" onClick={() => download('json')} className="underline">{t('benchmark.exportJson')}</button><button type="button" onClick={() => download('csv')} className="underline">{t('benchmark.exportCsv')}</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm"><div className="text-xs font-medium text-slate-500">{t('benchmark.eligible')}</div><div className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{run.metrics.eligibleClaims}</div><div className="mt-1 text-xs text-slate-500">{t('benchmark.claims')}</div></div>
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5 shadow-sm"><div className="text-xs font-medium text-indigo-800">{t('benchmark.explicit')}</div><div className="mt-2 text-3xl font-semibold tracking-tight text-indigo-900">{run.metrics.explicitCandidate}/{run.metrics.eligibleClaims}</div><div className="mt-1 text-xs text-indigo-700">{percent(run.metrics.candidateCoverage)}</div></div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5 shadow-sm"><div className="text-xs font-medium text-emerald-800">{t('benchmark.matched')}</div><div className="mt-2 text-3xl font-semibold tracking-tight text-emerald-900">{run.metrics.correct}/{(run.metrics.correct + run.metrics.incorrect) || 0}</div><div className="mt-1 text-xs text-emerald-700">{percent(run.metrics.outcomeAccuracy)} · {t('benchmark.explicitOutcome')}</div></div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-5 shadow-sm"><div className="text-xs font-medium text-amber-800">{t('benchmark.sentToReview')}</div><div className="mt-2 text-3xl font-semibold tracking-tight text-amber-900">{run.metrics.technicalFailure + run.metrics.unresolved}/{run.metrics.eligibleClaims}</div><div className="mt-1 text-xs text-amber-700">{percent(run.metrics.potentialHumanInterventionRate)}</div></div>
      </div>
      <details className="rounded border border-slate-200 bg-slate-50 p-2 text-xs">
        <summary className="cursor-pointer text-slate-700">{t('benchmark.diagnostic')}</summary>
        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>{t('benchmark.identityRate')}：{run.metrics.identityVerifiedClaims}/{run.metrics.eligibleClaims}（{percent(run.metrics.identityVerificationRate)}）</div>
          <div>{t('benchmark.identityMismatch')}: {run.metrics.identityMismatchClaims} {t('benchmark.closure.unitClaim')}</div>
          <div>{t('benchmark.callSuccess')}：{run.metrics.invocationSuccess}/{run.metrics.eligibleClaims}</div>
          <div>{t('benchmark.technicalFailure')}：{run.metrics.technicalFailure}/{run.metrics.eligibleClaims}</div>
          <div>{t('benchmark.endToEnd')}：{run.metrics.correct}/{run.metrics.eligibleClaims}（{percent(run.metrics.endToEndCorrectCoverage)}）</div>
          <div>{t('benchmark.runId')}：{run.id}</div>
          <div>{t('benchmark.provider')}：{run.provider}</div>
          <div>{t('benchmark.model')}：{run.model}</div>
          <div>{t('benchmark.prompt')}：{run.promptVersion}</div>
          <div>{t('benchmark.schema')}：{run.schemaVersion}</div>
          <div>{t('benchmark.threshold')}: {typeof run.threshold === 'number' ? run.threshold : t('benchmark.closure.notRecorded')}</div>
          <div>{t('benchmark.closure.goldSetName')}: {run.goldSetName}</div>
          <div>{t('benchmark.started')}：{run.benchmarkStartedAt}</div>
          <div>{t('benchmark.skippedLegacy')}: {run.skippedLegacyUnverified || 0} {t('benchmark.closure.unitClaim')}</div>
          <div>{t('benchmark.closure.skippedMismatch')}: {run.skippedIdentityMismatch || 0} {t('benchmark.closure.unitClaim')}</div>
          <div>{t('benchmark.skippedMissing')}: {run.skippedIdentityMissing || 0} {t('benchmark.closure.unitClaim')}</div>
          <div className="col-span-2 md:col-span-4"><button type="button" onClick={() => start(run.goldSnapshot)} disabled={running} className="underline disabled:opacity-40">{t('benchmark.rerun')}</button></div>
        </div>
      </details>
      <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-slate-500"><th className="py-1 pr-2">{t('benchmark.columns.caseClaim')}</th><th className="py-1 pr-2">{t('benchmark.columns.identity')}</th><th className="py-1 pr-2">{t('benchmark.columns.gold')}</th><th className="py-1 pr-2">AI</th><th className="py-1 pr-2">{t('benchmark.columns.confidence')}</th><th className="py-1 pr-2">{t('benchmark.columns.call')}</th><th className="py-1 pr-2">{t('benchmark.columns.comparison')}</th><th className="py-1 pr-2">{t('benchmark.columns.failure')}</th><th className="py-1">{t('benchmark.columns.latency')}</th></tr></thead><tbody>{run.results.map((item) => <tr key={`${item.caseId}::${item.claimId}`} className="border-t"><td className="py-1 pr-2">{item.caseName} · {item.claimId}</td><td className="py-1 pr-2">{identityLabel(item.identityStatus, t)}</td><td className="py-1 pr-2">{outcomeLabel(item.goldOutcome, t)}</td><td className="py-1 pr-2">{item.aiOutcome ? outcomeLabel(item.aiOutcome, t) : candidateLabel(item.candidateStatus, t)}</td><td className="py-1 pr-2">{item.aiConfidence === undefined ? '-' : percent(item.aiConfidence)}</td><td className="py-1 pr-2">{invocationLabel(item.aiInvocationStatus, t)}</td><td className="py-1 pr-2">{comparisonLabel(item.comparison, t)}</td><td className="py-1 pr-2">{item.failureCode ? t('benchmark.technicalFailureRow') : '-'}</td><td className="py-1">{item.latencyMs} ms</td></tr>)}</tbody></table></div><p className="text-xs text-slate-500">{t('benchmark.resultNote')}</p>
    </div>}
  </section>;
};
