import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Building2,
  MapPin,
  Tag,
  ShieldAlert,
  FileCheck,
  Search,
  Filter,
  RefreshCw,
  Eye,
  X,
  Copy,
  Check,
  Scale,
  Sparkles,
  ArrowRight,
  Info,
  Calendar,
  User,
  ShieldCheck,
  HelpCircle,
  TrendingUp,
  AlertCircle,
  FolderOpen,
  ChevronRight,
  CheckCircle2,
  Percent,
} from 'lucide-react';
import {
  RawDocument,
  AnalysisCaseRecord,
  LaborDisputeReport,
  CityAnalyticsSummary,
  DisputeTypeAnalyticsItem,
  EmployerDefenseAnalyticsItem,
  EvidenceAnalyticsItem,
  AnalysisRun,
} from '../types';
import {
  LaborDisputeAnalyticsEngine,
  KEY_DISPUTE_TYPES,
  KEY_EMPLOYER_DEFENSES,
  KEY_EVIDENCE_TYPES,
} from '../services/analytics/LaborDisputeAnalyticsEngine';
import { getOutcomePresentation } from '../services/outcome/OutcomePresentation';
import { getDefenseTypeLabel, getDisputeTypeLabel, getEvidenceTypeLabel } from '../services/presentation/domainLabels';
import { formatCaseDate, formatPartyName } from '../services/presentation/CaseMetadataPresentation';
import {
  ResearchAnalysisService,
  type ResearchAnalysisContext,
  type ResearchAnalyticsMetadata,
} from '../services/analysis/ResearchAnalysisService';
import { filterAnalyticsEligibleRecords } from '../services/analytics/AnalyticsAdmission';
import { normalizeResearchGeographicScope, type ResearchGeographicScope } from '../services/research/ResearchGeographicScope';
import { formatRateWithDenominator } from '../services/presentation/MetricPresentation';
import { ResearchAnalysisHeader } from './ResearchAnalysisHeader';

const researchAnalysisService = new ResearchAnalysisService();

interface LaborAnalyticsTestProps {
  initialAnalysisRunId?: string;
  onAnalysisRunSelect: (analysisRunId: string) => void;
}

export const LaborAnalyticsTest: React.FC<LaborAnalyticsTestProps> = ({ initialAnalysisRunId = '', onAnalysisRunSelect }) => {
  const { t } = useTranslation();
  const geographicScopeDescription = (scope?: ResearchGeographicScope) => {
    const normalized = normalizeResearchGeographicScope(scope);
    if (!normalized || normalized.mode === 'all') return t('research.ui.geographicAll');
    if (normalized.mode === 'province') return normalized.provinces?.join('、') || t('research.ui.geographicProvinceUnselected');
    if (normalized.mode === 'pearl_river_delta') return t('research.ui.geographicPearlRiverDelta');
    return normalized.cities?.join('、') || t('research.ui.geographicCustomUnselected');
  };
  const [allRecords, setAllRecords] = useState<AnalysisCaseRecord[]>([]);
  const [report, setReport] = useState<LaborDisputeReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [analysisRuns, setAnalysisRuns] = useState<AnalysisRun[]>([]);
  const [selectedAnalysisRunId, setSelectedAnalysisRunId] = useState('');
  const [researchContext, setResearchContext] = useState<ResearchAnalysisContext | null>(null);
  const [researchMetadata, setResearchMetadata] = useState<ResearchAnalyticsMetadata | null>(null);
  const [researchError, setResearchError] = useState<string | null>(null);

  // 钻取溯源面板状态
  const [drilldownTitle, setDrilldownTitle] = useState<string | null>(null);
  const [drilldownDescription, setDrilldownDescription] = useState<string | null>(null);
  const [drilldownCaseIds, setDrilldownCaseIds] = useState<string[] | null>(null);
  const [selectedCaseDetail, setSelectedCaseDetail] = useState<AnalysisCaseRecord | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 只加载 AnalysisRun 清单；禁止自动选择最新记录或回退到全库。
  useEffect(() => {
    researchAnalysisService.listAnalysisRuns()
      .then((runs) => {
        setAnalysisRuns(runs);
        if (initialAnalysisRunId && !runs.some((run) => run.id === initialAnalysisRunId)) {
          setSelectedAnalysisRunId('');
          onAnalysisRunSelect('');
          setResearchError(t('research.missingRun'));
        }
      })
      .catch((error) => setResearchError(error instanceof Error ? error.message : t('research.loadRunError')));
  }, [initialAnalysisRunId, onAnalysisRunSelect]);

  useEffect(() => {
    if (initialAnalysisRunId) setSelectedAnalysisRunId(initialAnalysisRunId);
  }, [initialAnalysisRunId]);

  // 从用户明确选择的 AnalysisRun 固定输入执行分析。
  const loadData = async () => {
    if (!selectedAnalysisRunId) {
      setResearchError(t('research.noSelectedRun'));
      return;
    }
    setIsLoading(true);
    setResearchError(null);
    try {
      const execution = await researchAnalysisService.executeResearchAnalysis(
        selectedAnalysisRunId,
        (records, admissionOptions, analysisRun) => LaborDisputeAnalyticsEngine.generateReport(
          records,
          admissionOptions,
          analysisRun?.geographicScope,
        ),
      );
      setResearchContext(execution.context);
      setAllRecords(execution.context.records);
      setReport(execution.result?.result ?? null);
      setResearchMetadata(execution.result?.metadata ?? null);
      if (!execution.result) setResearchError(t('research.gateBlocked'));
    } catch (err) {
      setResearchError(err instanceof Error ? err.message : t('research.executionError'));
    } finally {
      setIsLoading(false);
    }
  };

  // 根据 caseId 索引快速获取 AnalysisCaseRecord 实体
  const recordsMap = useMemo(() => {
    const map = new Map<string, AnalysisCaseRecord>();
    (Array.isArray(allRecords) ? allRecords : []).forEach((r) => map.set(r.caseId, r));
    return map;
  }, [allRecords]);

  // 钻取案例列表
  const drilldownCases = useMemo(() => {
    if (!drilldownCaseIds || drilldownCaseIds.length === 0) return [];
    return drilldownCaseIds
      .map((id) => recordsMap.get(id))
      .filter((r): r is AnalysisCaseRecord => !!r);
  }, [drilldownCaseIds, recordsMap]);

  // 触发钻取事件
  const handleOpenDrilldown = (title: string, desc: string, caseIds: string[]) => {
    setDrilldownTitle(title);
    setDrilldownDescription(desc);
    setDrilldownCaseIds(caseIds);
    if (caseIds.length > 0) {
      const firstRecord = recordsMap.get(caseIds[0]);
      if (firstRecord) setSelectedCaseDetail(firstRecord);
    } else {
      setSelectedCaseDetail(null);
    }
  };

  const handleCopyJson = (record: AnalysisCaseRecord) => {
    navigator.clipboard.writeText(JSON.stringify(record, null, 2));
    setCopiedId(record.caseId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-full bg-slate-50/80 p-6 lg:p-8 max-w-7xl mx-auto space-y-8" data-testid="labor-analytics-workspace">
      {/* 顶部标题与说明 */}
      <div className="bg-white/80 backdrop-blur-xl border border-white/80 rounded-[28px] p-7 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex flex-wrap items-center gap-3">
                {t('research.overview')}
                <span className="px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                  {t('research.officialSet')}
                </span>
              </h1>
              <p className="text-sm text-slate-500 mt-2 max-w-2xl leading-6">
                {t('research.description')}
              </p>
          </div>

        </div>

        <div className="mt-4">
          <ResearchAnalysisHeader
            runs={analysisRuns}
            selectedAnalysisRunId={selectedAnalysisRunId}
            onSelect={(id) => {
              setSelectedAnalysisRunId(id);
              onAnalysisRunSelect(id);
              setReport(null);
              setResearchContext(null);
              setResearchMetadata(null);
              setResearchError(null);
            }}
            onExecute={loadData}
            isLoading={isLoading}
            context={researchContext}
            metadata={researchMetadata}
            error={researchError}
          />
        </div>

        {/* 统计规范与原则说明条 */}
        <div className="mt-7 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl flex items-start gap-3 text-slate-700 leading-5">
            <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-900">{t('research.dataScope')}</span>
              {' '}{t('research.frozenInput')}
            </div>
          </div>

          <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl flex items-start gap-3 text-emerald-950 leading-5">
            <Percent className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">{t('research.rules')}</span>
              {' '}{t('research.denominatorRule')}
            </div>
          </div>
        </div>
      </div>

      {/* 一、基础总体统计 (Overall Statistics) */}
      {report && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="text-2xs text-slate-500 font-semibold uppercase flex items-center gap-1">
              <FolderOpen className="w-3.5 h-3.5 text-slate-400" />{t('research.totalCases')}</div>
            <div className="text-2xl font-bold font-mono text-slate-800 mt-1">
              {report.overall.totalCases}
            </div>
            <div className="text-2xs text-slate-400 mt-0.5">{t('research.selectedInput')}</div>
          </div>

          <div
            onClick={() =>
              handleOpenDrilldown(
                t('research.eligibleCases'),
                t('research.eligibilityDescription'),
                filterAnalyticsEligibleRecords(Array.isArray(allRecords) ? allRecords : []).eligibleRecords
                  .map((r) => r.caseId)
              )
            }
            className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4 shadow-sm hover:shadow transition-all cursor-pointer group"
          >
            <div className="text-2xs text-emerald-800 font-semibold uppercase flex items-center justify-between">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />{t('research.ui.includedCountLabel')}</span>
              <ChevronRight className="w-3 h-3 text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">
              {report.overall.includedCases}
            </div>
            <div className="text-2xs text-emerald-600 mt-0.5">{t('research.includedCases')}</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="text-2xs text-slate-500 font-semibold uppercase flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />{t('research.ui.avgScoreLabel')}</div>
            <div className="text-2xl font-bold font-mono text-indigo-600 mt-1">
              {report.overall.averageParserScore}{' '}
              <span className="text-xs font-normal text-slate-400">/ 100</span>
            </div>
            <div className="text-2xs text-slate-400 mt-0.5">{t('research.avgCompleteness')}</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="text-2xs text-slate-500 font-semibold uppercase flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-purple-500" />{t('research.ui.manualReviewStatus')}</div>
            <div className="text-sm font-bold text-slate-800 mt-2 flex items-center gap-2 font-mono">
              <span className="text-emerald-700">{report.overall.reviewApprovedCount} {t('research.ui.approvedCount')}</span>
              <span className="text-slate-300">|</span>
              <span className="text-blue-700">{report.overall.modifiedReviewCount} {t('research.ui.revisedCount')}</span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-500">{report.overall.pendingReviewCount} {t('research.ui.pendingCount')}</span>
            </div>
            <div className="text-2xs text-slate-400 mt-1">{t('research.reviewCoverage')}</div>
          </div>
        </div>
      )}

      {/* 二、研究地域裁判结果统计 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900">{t('research.cityOutcomes')}</h2>
          </div>
          <span className="text-2xs text-slate-400 font-mono">
            {t('research.ui.selectedScope', { scope: geographicScopeDescription(researchContext?.analysisRun.geographicScope) })}
          </span>
        </div>

        {report && report.targetCities.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {report.targetCities.map((citySummary) => {
              const hasCases = citySummary.caseCount > 0;

              return (
                <div
                  key={citySummary.city}
                  className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3"
                >
                  {/* 城市头部 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                      <h3 className="font-bold text-slate-900 text-sm">{citySummary.city}</h3>
                    </div>
                    <button
                      onClick={() =>
                        handleOpenDrilldown(
                          `${citySummary.city} - ${t('research.eligibleCases')}`,
                          t('research.ui.caseWithCount', { count: citySummary.caseCount }),
                          citySummary.caseIds
                        )
                      }
                      className="px-2 py-0.5 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-indigo-700 rounded-md text-2xs font-mono font-semibold transition-colors cursor-pointer"
                    >
                      {t('research.ui.caseWithCount', { count: citySummary.caseCount })} ↗
                    </button>
                  </div>

                  {hasCases ? (
                    <>
                      {/* 结果比例大卡片 */}
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div
                          onClick={() =>
                            handleOpenDrilldown(
                              `${citySummary.city} - ${t('research.employerFavorableRate')}`,
                              t('research.employerFavorableRate'),
                              citySummary.employerOutcome.caseIds.supported
                            )
                          }
                          className="bg-white p-2.5 rounded-lg border border-slate-200 hover:border-emerald-300 transition-all cursor-pointer group"
                        >
                          <div className="text-3xs text-slate-500 font-semibold uppercase">{t('research.employerFavorableRate')}</div>
                          <div className="text-lg font-bold font-mono text-emerald-600 group-hover:text-emerald-700">
                            {citySummary.employerWinRate === null ? t('research.sampleInsufficient') : `${citySummary.employerWinRate}%`}
                          </div>
                          <div className="text-3xs text-slate-400 font-mono">
                            {citySummary.employerOutcome.supported} /{' '}
                            {citySummary.employerOutcome.supported +
                              citySummary.employerOutcome.partially_supported +
                              citySummary.employerOutcome.not_supported}{' '}
                            {t('research.ui.caseWithCount', { count: citySummary.employerOutcome.supported + citySummary.employerOutcome.partially_supported + citySummary.employerOutcome.not_supported })}
                          </div>
                        </div>

                        <div
                          onClick={() =>
                            handleOpenDrilldown(
                              `${citySummary.city} - ${t('research.employeeFavorableRate')}`,
                              t('research.employeeFavorableRate'),
                              citySummary.employeeOutcome.caseIds.supported
                            )
                          }
                          className="bg-white p-2.5 rounded-lg border border-slate-200 hover:border-indigo-300 transition-all cursor-pointer group"
                        >
                          <div className="text-3xs text-slate-500 font-semibold uppercase">{t('research.employeeFavorableRate')}</div>
                          <div className="text-lg font-bold font-mono text-indigo-600 group-hover:text-indigo-700">
                            {citySummary.employeeWinRate === null ? t('research.sampleInsufficient') : `${citySummary.employeeWinRate}%`}
                          </div>
                          <div className="text-3xs text-slate-400 font-mono">
                            {citySummary.employeeOutcome.supported} /{' '}
                            {citySummary.employeeOutcome.supported +
                              citySummary.employeeOutcome.partially_supported +
                              citySummary.employeeOutcome.not_supported}{' '}
                            {t('research.ui.caseWithCount', { count: citySummary.employeeOutcome.supported + citySummary.employeeOutcome.partially_supported + citySummary.employeeOutcome.not_supported })}
                          </div>
                        </div>
                      </div>

                      {/* 裁判四分类细目分布 */}
                      <div className="space-y-1.5 text-2xs pt-1 border-t border-slate-200/60">
                        <div className="text-3xs text-slate-400 font-semibold uppercase">{t('research.ui.employerView')}</div>

                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">{t('research.ui.supportColon')}</span>
                          <button
                            onClick={() =>
                              handleOpenDrilldown(
                                `${citySummary.city} - ${t('research.ui.employerSupportedCases')}`,
                                t('research.supportedForEmployer'),
                                citySummary.employerOutcome.caseIds.supported
                              )
                            }
                            className="font-mono font-semibold text-emerald-700 hover:underline cursor-pointer"
                          >
                            {t('research.ui.caseWithCount', { count: citySummary.employerOutcome.supported })}
                          </button>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">{t('research.ui.partialColon')}</span>
                          <button
                            onClick={() =>
                              handleOpenDrilldown(
                                `${citySummary.city} - ${t('research.ui.employerPartialCases')}`,
                                t('research.partial'),
                                citySummary.employerOutcome.caseIds.partially_supported
                              )
                            }
                            className="font-mono font-semibold text-amber-700 hover:underline cursor-pointer"
                          >
                            {t('research.ui.caseWithCount', { count: citySummary.employerOutcome.partially_supported })}（
                              {citySummary.employerPartialRate === null ? t('research.sampleInsufficient') : `${citySummary.employerPartialRate}%`}
                            ）
                          </button>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">{t('research.ui.notSupportedColon')}</span>
                          <button
                            onClick={() =>
                              handleOpenDrilldown(
                                `${citySummary.city} - ${t('research.ui.employerNotSupportedCases')}`,
                                t('research.ui.doNotInferDefense'),
                                citySummary.employerOutcome.caseIds.not_supported
                              )
                            }
                            className="font-mono font-semibold text-rose-700 hover:underline cursor-pointer"
                          >
                            {t('research.ui.caseWithCount', { count: citySummary.employerOutcome.not_supported })}
                          </button>
                        </div>

                        {citySummary.employerOutcome.unclear > 0 && (
                          <div className="flex items-center justify-between text-slate-400">
                            <span>{t('research.ui.unclearColon')}</span>
                            <span className="font-mono">{t('research.ui.caseWithCount', { count: citySummary.employerOutcome.unclear })} ({t('research.ui.knownOutcomesOnly')})</span>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="py-8 text-center text-xs text-slate-400 bg-white rounded-lg border border-dashed border-slate-200">
                      {t('research.sampleInsufficient')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-400">{t('research.sampleInsufficient')}</div>
        )}
      </div>

      {/* 三、争议类型排行 (Dispute Types Ranking) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-purple-600" />
            <h2 className="text-sm font-bold text-slate-900">{t('research.disputeRanking')}</h2>
          </div>
          <span className="text-2xs text-slate-400 font-mono">
            {t('research.ui.drilldownHint')}
          </span>
        </div>

        {report && report.disputeTypes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-2xs text-slate-500 uppercase bg-slate-50">
                  <th className="py-2.5 px-3 font-semibold">{t('research.disputeType')}</th>
                  <th className="py-2.5 px-3 font-semibold text-center">{t('research.includedCaseCount')}</th>
                  <th className="py-2.5 px-3 font-semibold text-center">{t('research.employerRate')}</th>
                  <th className="py-2.5 px-3 font-semibold text-center">{t('research.employeeFavorableRate')}</th>
                  <th className="py-2.5 px-3 font-semibold text-center">{t('research.partialSupport')}</th>
                  <th className="py-2.5 px-3 font-semibold text-right">{t('research.traceAction')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.disputeTypes.map((dt) => {
                  const isKey = (KEY_DISPUTE_TYPES as readonly string[]).includes(dt.disputeType);
                  const employerKnownN = dt.employerOutcome.supported + dt.employerOutcome.partially_supported + dt.employerOutcome.not_supported;
                  const employeeKnownN = dt.employeeOutcome.supported + dt.employeeOutcome.partially_supported + dt.employeeOutcome.not_supported;

                  return (
                    <tr key={dt.disputeType} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-medium text-slate-800">
                        <div className="flex items-center gap-2">
                          <span>{getDisputeTypeLabel(dt.disputeType, t)}</span>
                          {isKey && (
                            <span className="px-1.5 py-0.2 bg-purple-50 border border-purple-200 text-purple-700 rounded text-3xs font-semibold">{t('research.ui.categoryKey')}</span>
                          )}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                        <button
                          onClick={() =>
                            handleOpenDrilldown(
                              t('research.ui.allDisputeCases', { type: getDisputeTypeLabel(dt.disputeType, t) }),
                              t('research.ui.caseWithCount', { count: dt.caseCount }),
                              dt.caseIds
                            )
                          }
                          className="hover:text-indigo-600 hover:underline cursor-pointer"
                        >
                          {t('research.ui.caseWithCount', { count: dt.caseCount })}
                        </button>
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() =>
                            handleOpenDrilldown(
                              `${t('research.disputeType')}: ${getDisputeTypeLabel(dt.disputeType, t)} - ${t('research.ui.employerSupportedCases')}`,
                              t('research.ui.supportedClaimCases'),
                              dt.employerOutcome.caseIds.supported
                            )
                          }
                          className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 hover:bg-emerald-100 cursor-pointer"
                        >
                          {formatRateWithDenominator(dt.employerWinRate, dt.employerOutcome.supported, employerKnownN)}
                        </button>
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono text-indigo-700">
                        <button
                          onClick={() =>
                            handleOpenDrilldown(
                              `${t('research.disputeType')}: ${getDisputeTypeLabel(dt.disputeType, t)} - ${t('research.ui.employeeSupportedCases')}`,
                              t('research.ui.supportedClaimCases'),
                              dt.employeeOutcome.caseIds.supported
                            )
                          }
                          className="hover:underline cursor-pointer"
                        >
                          {formatRateWithDenominator(dt.employeeWinRate, dt.employeeOutcome.supported, employeeKnownN)}
                        </button>
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono text-amber-700">
                        <button
                          onClick={() =>
                            handleOpenDrilldown(
                              `${t('research.disputeType')}: ${getDisputeTypeLabel(dt.disputeType, t)} - ${t('research.partial')}`,
                              t('research.partial'),
                              dt.employerOutcome.caseIds.partially_supported
                            )
                          }
                          className="hover:underline cursor-pointer"
                        >
                          {t('research.ui.caseWithCount', { count: dt.employerOutcome.partially_supported })}
                        </button>
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() =>
                            handleOpenDrilldown(
                              `${t('research.disputeType')}: ${getDisputeTypeLabel(dt.disputeType, t)}`,
                              t('research.ui.viewDisputeCases', { type: getDisputeTypeLabel(dt.disputeType, t), count: dt.caseCount }),
                              dt.caseIds
                            )
                          }
                          className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded text-2xs font-medium inline-flex items-center gap-1 cursor-pointer"
                        >{t('research.ui.caseAction')}<ChevronRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-400">{t('research.sampleInsufficient')}</div>
        )}
      </div>

      {/* 四、企业抗辩分析 (Employer Defenses Ranking) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600" />
            <h2 className="text-sm font-bold text-slate-900">{t('research.defenseRanking')}</h2>
          </div>
          <span className="text-2xs text-slate-400 font-mono">
             {t('research.ui.employerFavorableFormula')}
          </span>
        </div>

        {report && report.employerDefenses.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-2xs text-slate-500 uppercase bg-slate-50">
                  <th className="py-2.5 px-3 font-semibold">{t('research.defenseType')}</th>
                  <th className="py-2.5 px-3 font-semibold text-center">{t('research.frequency')}</th>
                  <th className="py-2.5 px-3 font-semibold text-center">{t('research.caseCount')}</th>
                  <th className="py-2.5 px-3 font-semibold text-center">{t('research.supportedForEmployer')}</th>
                  <th className="py-2.5 px-3 font-semibold text-center">{t('research.partialSupport')}</th>
                  <th className="py-2.5 px-3 font-semibold text-center">{t('research.notSupportedForEmployer')}</th>
                  <th className="py-2.5 px-3 font-semibold text-center">{t('research.favorableRate')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.employerDefenses.map((def) => {
                  const isKey = (KEY_EMPLOYER_DEFENSES as readonly string[]).includes(def.defenseType);
                  const knownOutcomeN = def.employerSupportedCount + def.employerPartialCount + def.employerNotSupportedCount;

                  return (
                    <tr key={def.defenseType} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-medium text-slate-800">
                        <div className="flex items-center gap-2">
                          <span>{getDefenseTypeLabel(def.defenseType, t)}</span>
                          {isKey && (
                            <span className="px-1.5 py-0.2 bg-rose-50 border border-rose-200 text-rose-700 rounded text-3xs font-semibold">{t('research.ui.defenseKey')}</span>
                          )}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono text-slate-600">
                        {t('research.ui.frequencyTimes', { count: def.frequency })}
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800">
                        <button
                          onClick={() =>
                            handleOpenDrilldown(
                              t('research.ui.defenseCases', { type: getDefenseTypeLabel(def.defenseType, t) }),
                              t('research.ui.defenseCount', { count: def.caseCount }),
                              def.caseIds
                            )
                          }
                          className="hover:text-indigo-600 hover:underline cursor-pointer"
                        >
                          {t('research.ui.caseWithCount', { count: def.caseCount })}
                        </button>
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() =>
                            handleOpenDrilldown(
                              t('research.ui.defenseFavorable', { type: getDefenseTypeLabel(def.defenseType, t) }),
                              t('research.ui.defenseAndSupported'),
                              def.employerSupportedCaseIds
                            )
                          }
                          className="font-mono font-bold text-emerald-700 hover:underline cursor-pointer"
                        >
                          {t('research.ui.caseWithCount', { count: def.employerSupportedCount })}
                        </button>
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() =>
                            handleOpenDrilldown(
                              t('research.ui.defensePartial', { type: getDefenseTypeLabel(def.defenseType, t) }),
                              t('research.ui.defenseAndPartial'),
                              def.employerPartialCaseIds
                            )
                          }
                          className="font-mono text-amber-700 hover:underline cursor-pointer"
                        >
                          {t('research.ui.caseWithCount', { count: def.employerPartialCount })}
                        </button>
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() =>
                            handleOpenDrilldown(
                              t('research.ui.defenseNotSupported', { type: getDefenseTypeLabel(def.defenseType, t) }),
                              t('research.ui.defenseNoInference'),
                              def.employerNotSupportedCaseIds
                            )
                          }
                          className="font-mono text-rose-700 hover:underline cursor-pointer"
                        >
                          {t('research.ui.caseWithCount', { count: def.employerNotSupportedCount })}
                        </button>
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`font-mono font-bold px-2 py-0.5 rounded text-2xs ${
                            def.supportRate >= 50
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : def.supportRate >= 25
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-rose-50 text-rose-800 border border-rose-200'
                          }`}
                        >
                          {formatRateWithDenominator(def.supportRate, def.employerSupportedCount, knownOutcomeN)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-400">{t('research.sampleInsufficient')}</div>
        )}
      </div>

      {/* 五、证据关联分析 (Evidence Ranking) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900">{t('research.evidenceRanking')}</h2>
          </div>
          <span className="text-2xs text-slate-500 font-medium">
            ⚠️ {t('research.ui.strictEvidenceRule')}
          </span>
        </div>

        {report && report.evidenceRanking.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {report.evidenceRanking.map((ev) => {
              const isKey = (KEY_EVIDENCE_TYPES as readonly string[]).includes(ev.evidenceName);

              return (
                <div
                  key={ev.evidenceName}
                  className="min-w-0 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5 hover:border-indigo-300 transition-all"
                >
                  <div className="min-w-0 text-xs font-semibold leading-5 text-slate-900 break-words">
                    {getEvidenceTypeLabel(ev.evidenceName, t)}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    {isKey && (
                      <span className="px-1.5 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded text-3xs font-semibold">
                        {t('research.keyEvidence')}
                      </span>
                    )}
                    <span className="ml-auto shrink-0 whitespace-nowrap text-sm text-slate-500 font-mono">
                      {t('research.ui.totalAppearance', { count: ev.frequency })}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 items-stretch gap-2 text-2xs pt-1 border-t border-slate-200/60">
                    <div className="min-w-0 bg-white p-2 rounded-lg border border-slate-200 flex flex-col">
                      <div className="text-3xs text-slate-400">{t('research.totalCasesInvolved')}</div>
                      <button
                        onClick={() =>
                          handleOpenDrilldown(
                            t('research.ui.evidenceCases', { type: getEvidenceTypeLabel(ev.evidenceName, t) }),
                            t('research.ui.submittedEvidenceList'),
                            ev.caseIds
                          )
                        }
                        className="mt-auto pt-1 font-bold font-mono text-left text-slate-800 hover:text-indigo-600 hover:underline cursor-pointer"
                      >
                        {t('research.ui.caseWithCount', { count: ev.caseCount })}
                      </button>
                    </div>

                    <div className="min-w-0 bg-white p-2 rounded-lg border border-slate-200 flex flex-col">
                      <div className="text-3xs text-slate-400">{t('research.ui.appearanceInSupported')}</div>
                      <button
                        onClick={() =>
                          handleOpenDrilldown(
                            t('research.ui.evidenceSupportedCases', { type: getEvidenceTypeLabel(ev.evidenceName, t) }),
                            t('research.ui.evidenceInSupported'),
                            ev.appearanceInEmployerSupportedCaseIds
                          )
                        }
                        className="mt-auto pt-1 font-bold font-mono text-left text-emerald-700 hover:underline cursor-pointer"
                      >
                        {t('research.ui.caseWithCount', { count: ev.appearanceInEmployerSupportedCount })}
                      </button>
                    </div>
                  </div>

                  <div className="text-3xs text-slate-500 bg-emerald-50/60 border border-emerald-100 p-2 rounded-lg flex items-center justify-between font-mono">
                    <span>{t('research.appearanceRate')}</span>
                    <strong className="text-emerald-800">{formatRateWithDenominator(ev.rateInEmployerSupported, ev.appearanceInEmployerSupportedCount, ev.employerSupportedDenominator)}</strong>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-400">{t('research.sampleInsufficient')}</div>
        )}
      </div>

      {/* 六、全量数据溯源钻取面板 (Drilldown Drawer / Modal) */}
      {drilldownCaseIds && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex justify-end animate-in fade-in">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col">
            {/* 抽屉头部 */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-indigo-600" />
                  {drilldownTitle}
                </h3>
                <p className="text-2xs text-slate-500 mt-0.5">
                  {t('research.ui.drilldownTitleCount', { title: drilldownDescription, count: drilldownCases.length })}
                </p>
              </div>

              <button
                onClick={() => {
                  setDrilldownCaseIds(null);
                  setSelectedCaseDetail(null);
                }}
                className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 抽屉主体：案件列表 + 选中详情 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {drilldownCases.length === 0 ? (
                <div className="py-16 text-center text-xs text-slate-400">{t('research.ui.noMatchingCases')}</div>
              ) : (
                <div className="space-y-3">
                  {drilldownCases.map((c) => {
                    const isSelected = selectedCaseDetail?.caseId === c.caseId;
                    const employerOutcomePresentation = getOutcomePresentation(c.employerOutcome);

                    return (
                      <div
                        key={c.caseId}
                        onClick={() => setSelectedCaseDetail(c)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer text-xs space-y-2 ${
                          isSelected
                            ? 'bg-indigo-50/70 border-indigo-500 shadow-xs'
                            : 'bg-white hover:bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-3xs font-mono font-semibold">
                              {c.city}
                            </span>
                            {c.year && (
                              <span className="text-3xs text-slate-400 font-mono">{t('research.ui.year', { year: c.year })}</span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-3xs font-bold font-mono ${employerOutcomePresentation.badgeClassName}`}>
                              {t('research.ui.employerOutcome')} {t(`status.${employerOutcomePresentation.outcome === 'partially_supported' ? 'partiallySupported' : employerOutcomePresentation.outcome === 'not_supported' ? 'notSupported' : employerOutcomePresentation.outcome}`)}
                            </span>
                          </div>
                        </div>

                        <h4 className="font-bold text-slate-900 text-xs line-clamp-1">{c.title}</h4>

                        <div className="grid grid-cols-2 gap-2 text-2xs text-slate-500">
                          <div className="truncate">{t('research.ui.courtLabel')} {c.court}</div>
                          <div className="truncate">{t('research.ui.dateLabel')} {formatCaseDate(c.date)}</div>
                        </div>

                        {isSelected && (
                          <div className="pt-2 border-t border-slate-200 space-y-2 text-2xs text-slate-700 bg-slate-50/50 p-2.5 rounded-lg mt-2">
                            <div>
                              <span className="text-slate-400">{t('research.parties')}</span> {t('section.employee')} [{formatPartyName(c.employeeParty)}] vs {t('section.employer')} [{formatPartyName(c.employerParty)}]
                            </div>
                            <div>
                              <span className="text-slate-400">{t('research.ui.claimsLabel', { count: (Array.isArray(c.claims) ? c.claims.length : 0) })}</span>{' '}
                              {Array.isArray(c.claims) ? c.claims.map((cl) => cl.claimName).join('、') : t('research.none')}
                            </div>
                            <div>
                              <span className="text-slate-400">{t('research.ui.defensesLabel', { count: (Array.isArray(c.employerDefenses) ? c.employerDefenses.length : 0) })}</span>{' '}
                              {Array.isArray(c.employerDefenses) ? c.employerDefenses.map((d) => getDefenseTypeLabel(d.defenseType, t)).join('、') : t('research.none')}
                            </div>
                            <div>
                              <span className="text-slate-400">{t('research.ui.evidenceLabel', { count: (Array.isArray(c.evidence) ? c.evidence.length : 0) })}</span>{' '}
                              {Array.isArray(c.evidence) ? c.evidence.map((e) => getEvidenceTypeLabel(e.name, t)).join('、') : t('research.none')}
                            </div>

                            <div className="flex justify-end pt-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopyJson(c);
                                }}
                                className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-100 rounded text-3xs font-semibold flex items-center gap-1 cursor-pointer"
                              >
                                {copiedId === c.caseId ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-600" />{t('research.ui.copied')}</>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />{t('research.ui.copyRecordJson')}</>
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 抽屉底部 */}
            <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-2xs text-slate-500">
              <span>{t('research.directDataMapping')}</span>
              <button
                onClick={() => {
                  setDrilldownCaseIds(null);
                  setSelectedCaseDetail(null);
                }}
                className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-md font-medium cursor-pointer"
              >{t('research.ui.closePanel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
