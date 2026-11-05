import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ShieldCheck,
  FileCheck,
  Scale,
  Sparkles,
  Layers,
  Grid,
  RefreshCw,
  X,
  Copy,
  Check,
  ChevronRight,
  TrendingUp,
  AlertTriangle,
  FolderOpen,
  Info,
  Building2,
  Calendar,
  User,
  Filter,
  CheckCircle2,
  FileX,
  MessageSquareWarning,
} from 'lucide-react';
import {
  AnalysisCaseRecord,
  DefenseAnalysisReport,
  DefenseStrategyEnhancedItem,
  FailedDefenseAnalysisItem,
  EvidenceCombinationItem,
  EvidenceAnalyticsItem,
  DisputeDefenseMatrixCell,
  AnalysisRun,
} from '../types';
import { DefenseStrategyAnalyzer } from '../services/analytics/DefenseStrategyAnalyzer';
import { getOutcomePresentation } from '../services/outcome/OutcomePresentation';
import { getDefenseTypeLabel, getDisputeTypeLabel, getEvidenceTypeLabel } from '../services/presentation/domainLabels';
import { formatCaseDate, formatPartyName } from '../services/presentation/CaseMetadataPresentation';
import { formatRateWithDenominator } from '../services/presentation/MetricPresentation';
import {
  ResearchAnalysisService,
  type ResearchAnalysisContext,
  type ResearchAnalyticsMetadata,
} from '../services/analysis/ResearchAnalysisService';
import { filterAnalyticsEligibleRecords } from '../services/analytics/AnalyticsAdmission';
import { ResearchAnalysisHeader } from './ResearchAnalysisHeader';

const researchAnalysisService = new ResearchAnalysisService();

interface DefenseStrategyAnalysisProps {
  initialAnalysisRunId?: string;
  onAnalysisRunSelect: (analysisRunId: string) => void;
}

export const DefenseStrategyAnalysis: React.FC<DefenseStrategyAnalysisProps> = ({ initialAnalysisRunId = '', onAnalysisRunSelect }) => {
  const { t } = useTranslation();
  const [allRecords, setAllRecords] = useState<AnalysisCaseRecord[]>([]);
  const [report, setReport] = useState<DefenseAnalysisReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [analysisRuns, setAnalysisRuns] = useState<AnalysisRun[]>([]);
  const [selectedAnalysisRunId, setSelectedAnalysisRunId] = useState('');
  const [researchContext, setResearchContext] = useState<ResearchAnalysisContext | null>(null);
  const [researchMetadata, setResearchMetadata] = useState<ResearchAnalyticsMetadata | null>(null);
  const [researchError, setResearchError] = useState<string | null>(null);

  // 选中的失败抗辩归因选项
  const [selectedDefenseKey, setSelectedDefenseKey] = useState<string>('严重违纪');

  // 钻取抽屉状态
  const [drilldownTitle, setDrilldownTitle] = useState<string | null>(null);
  const [drilldownDescription, setDrilldownDescription] = useState<string | null>(null);
  const [drilldownCaseIds, setDrilldownCaseIds] = useState<string[] | null>(null);
  const [selectedCaseDetail, setSelectedCaseDetail] = useState<AnalysisCaseRecord | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 只加载 AnalysisRun 清单；不自动选择，也不回退到本地全库。
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

  // 从用户明确选择的 AnalysisRun 固定输入执行关联分析。
  const loadAndAnalyze = async () => {
    if (!selectedAnalysisRunId) {
      setResearchError(t('research.noSelectedRun'));
      return;
    }
    setIsLoading(true);
    setResearchError(null);
    try {
      const execution = await researchAnalysisService.executeResearchAnalysis(
        selectedAnalysisRunId,
        (records, admissionOptions) => DefenseStrategyAnalyzer.analyze(records, admissionOptions),
      );
      setResearchContext(execution.context);
      setAllRecords(execution.context.records);
      const generatedReport = execution.result?.result ?? null;
      setReport(generatedReport);
      setResearchMetadata(execution.result?.metadata ?? null);
      if (!execution.result) setResearchError(t('research.gateBlocked'));

      if (generatedReport && generatedReport.failedDefenses.length > 0) {
        setSelectedDefenseKey(generatedReport.failedDefenses[0].defense);
      }
    } catch (err) {
      setResearchError(err instanceof Error ? err.message : t('defense.executionError'));
    } finally {
      setIsLoading(false);
    }
  };

  // 快速映射 caseId -> AnalysisCaseRecord
  const recordsMap = useMemo(() => {
    const map = new Map<string, AnalysisCaseRecord>();
    allRecords.forEach((r) => map.set(r.caseId, r));
    return map;
  }, [allRecords]);

  // 钻取列表
  const drilldownCases = useMemo(() => {
    if (!drilldownCaseIds || drilldownCaseIds.length === 0) return [];
    return drilldownCaseIds
      .map((id) => recordsMap.get(id))
      .filter((r): r is AnalysisCaseRecord => !!r);
  }, [drilldownCaseIds, recordsMap]);

  // 选中的失败抗辩归因详情
  const currentFailedDefense = useMemo(() => {
    if (!report) return null;
    return report.failedDefenses.find((d) => d.defense === selectedDefenseKey) || report.failedDefenses[0] || null;
  }, [report, selectedDefenseKey]);

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
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* 顶部标题与原则 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              {t('defense.title')}
              <span className="px-2.5 py-0.5 text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 rounded-full">
                {t('defense.associationBadge')}
              </span>
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {t('defense.description')}
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
            onExecute={loadAndAnalyze}
            isLoading={isLoading}
            context={researchContext}
            metadata={researchMetadata}
            error={researchError}
          />
        </div>

        {/* 原则声明 */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2.5 text-slate-700">
            <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-900">{t('defense.noInferenceTitle')}</span>{' '}
              {t('defense.noInference')}
            </div>
          </div>

          <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl flex items-start gap-2.5 text-amber-950">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">{t('defense.unfavorableTitle')}</span>{' '}
              {t('defense.unfavorableDescription')}
            </div>
          </div>
        </div>
      </div>

      {/* 基础概览卡片 */}
      {report && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="text-2xs text-slate-500 font-semibold uppercase flex items-center gap-1">
              <FolderOpen className="w-3.5 h-3.5 text-slate-400" />{t('defense.ui.scopeCount')}</div>
            <div className="text-2xl font-bold font-mono text-slate-800 mt-1">
              {report.analyzedCaseCount}
            </div>
            <div className="text-2xs text-slate-400 mt-0.5">{t('defense.validCases')}</div>
          </div>

          <div
            onClick={() =>
              handleOpenDrilldown(
                t('defense.ui.employerSupportedCard'),
                t('defense.employerSupportedDescription'),
                filterAnalyticsEligibleRecords(allRecords).eligibleRecords
                  .filter((r) => r.employerOutcome === 'supported').map((r) => r.caseId)
              )
            }
            className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4 shadow-sm hover:shadow transition-all cursor-pointer group"
          >
            <div className="text-2xs text-emerald-800 font-semibold uppercase flex items-center justify-between">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                {t('defense.ui.employerSupportedCard')}
              </span>
              <ChevronRight className="w-3 h-3 text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">
              {report.employerSupportedCaseCount}
            </div>
            <div className="text-2xs text-emerald-600 mt-0.5">{t('defense.employerFavorableRate')} {formatRateWithDenominator(
              report.analyzedCaseCount > 0
                ? Number(((report.employerSupportedCaseCount / report.analyzedCaseCount) * 100).toFixed(1))
                : null,
              report.employerSupportedCaseCount,
              report.analyzedCaseCount,
            )}</div>
          </div>

          <div
            onClick={() =>
              handleOpenDrilldown(
                t('defense.ui.employerNotFullyCard'),
                t('defense.ui.analysisScope'),
                filterAnalyticsEligibleRecords(allRecords).eligibleRecords.filter((r) => (
                  r.employerOutcome === 'partially_supported' || r.employerOutcome === 'not_supported'
                )).map((r) => r.caseId)
              )
            }
            className="bg-rose-50/60 border border-rose-200 rounded-2xl p-4 shadow-sm hover:shadow transition-all cursor-pointer group"
          >
            <div className="text-2xs text-rose-800 font-semibold uppercase flex items-center justify-between">
              <span className="flex items-center gap-1">
                <FileX className="w-3.5 h-3.5 text-rose-600" />
                {t('defense.ui.employerNotFullyCard')}
              </span>
              <ChevronRight className="w-3 h-3 text-rose-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
            <div className="text-2xl font-bold font-mono text-rose-700 mt-1">
              {report.employerNonSupportedCaseCount}
            </div>
            <div className="text-2xs text-rose-600 mt-0.5">{t('defense.priorityForAttribution')}</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="text-2xs text-slate-500 font-semibold uppercase flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-indigo-500" />{t('defense.ui.defenseCount')}</div>
            <div className="text-2xl font-bold font-mono text-indigo-600 mt-1">
              {report.defenseRanking.length}
            </div>
            <div className="text-2xs text-slate-400 mt-0.5">{t('defense.defenseTypesDescription')}</div>
          </div>
        </div>
      )}

      {/* 一、企业抗辩与案件结果共现分布 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center">
            <h2 className="text-sm font-bold text-slate-900">{t('defense.coOccurrence')}</h2>
          </div>
          <span className="text-2xs text-slate-400 font-mono">
             {' '}{t('defense.ui.favorableRateFormula')}
          </span>
        </div>

        {report && report.defenseRanking.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-2xs text-slate-500 uppercase bg-slate-50">
                  <th className="py-2.5 px-3 font-semibold">{t('defense.defenseType')}</th>
                  <th className="py-2.5 px-3 font-semibold text-center">{t('defense.caseCount')}</th>
                   <th className="py-2.5 px-3 font-semibold text-center">{t('defense.supportedCases')}</th>
                   <th className="py-2.5 px-3 font-semibold text-center">{t('defense.partialCases')}</th>
                   <th className="py-2.5 px-3 font-semibold text-center">{t('defense.notSupportedCases')}</th>
                  <th className="py-2.5 px-3 font-semibold text-center">{t('defense.employerFavorableRate')}</th>
                  <th className="py-2.5 px-3 font-semibold text-right">{t('defense.sourceTraceback')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.defenseRanking.map((item) => (
                  <tr key={item.defenseName} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{getDefenseTypeLabel(item.defenseName, t)}</span>
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                      <button
                        onClick={() =>
                          handleOpenDrilldown(
                            t('defense.ui.allDefenseCases', { type: getDefenseTypeLabel(item.defenseName, t) }),
                            t('defense.ui.allDefenseCasesDescription'),
                            item.caseIds
                          )
                        }
                        className="hover:text-indigo-600 hover:underline cursor-pointer"
                      >
                        {t('defense.ui.countLabel', { count: item.caseCount })}
                      </button>
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() =>
                          handleOpenDrilldown(
                            t('defense.ui.supportedDefenseCases', { type: getDefenseTypeLabel(item.defenseName, t) }),
                            t('defense.ui.supportedDefenseDescription'),
                            item.supportedCaseIds
                          )
                        }
                        className="font-mono font-bold text-emerald-700 hover:underline cursor-pointer"
                      >
                        {t('defense.ui.countLabel', { count: item.supportedCount })}
                      </button>
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() =>
                          handleOpenDrilldown(
                            t('defense.ui.partialDefenseCases', { type: getDefenseTypeLabel(item.defenseName, t) }),
                            t('defense.ui.partialDefenseDescription'),
                            item.partiallySupportedCaseIds
                          )
                        }
                        className="font-mono text-amber-700 hover:underline cursor-pointer"
                      >
                        {t('defense.ui.countLabel', { count: item.partiallySupportedCount })}
                      </button>
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() =>
                          handleOpenDrilldown(
                            t('defense.ui.unsupportedDefenseCases', { type: getDefenseTypeLabel(item.defenseName, t) }),
                            t('defense.ui.unsupportedDefenseDescription'),
                            item.notSupportedCaseIds
                          )
                        }
                        className="font-mono text-rose-700 hover:underline cursor-pointer"
                      >
                        {t('defense.ui.countLabel', { count: item.notSupportedCount })}
                      </button>
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`font-mono font-bold px-2 py-0.5 rounded text-2xs ${
                          item.employerSupportRate >= 50
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : item.employerSupportRate >= 25
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-rose-50 text-rose-800 border border-rose-200'
                        }`}
                      >
                        {formatRateWithDenominator(item.employerSupportRate, item.supportedCount, item.supportedCount + item.partiallySupportedCount + item.notSupportedCount)}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() =>
                          handleOpenDrilldown(
                            t('defense.ui.defenseRelatedCases', { type: getDefenseTypeLabel(item.defenseName, t), count: item.caseCount }),
                            t('defense.ui.defenseRelatedCases', { type: getDefenseTypeLabel(item.defenseName, t), count: item.caseCount }),
                            item.caseIds
                          )
                        }
                        className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded text-2xs font-medium inline-flex items-center gap-1 cursor-pointer"
                      >
                        {t('defense.drilldown')}
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-400">{t('defense.noData')}</div>
        )}
      </div>

      {/* 二、企业结果不利案件共现对照（仅部分支持与不支持，排除 unclear） */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <FileX className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-bold text-slate-900">{t('defense.unfavorableCases')}</h2>
          </div>
          <span className="text-2xs text-slate-400 font-mono">{t('defense.ui.analysisScope')}</span>
        </div>

        {report && report.failedDefenses.length > 0 ? (
          <div className="space-y-4">
            {/* 抗辩事由切换 Tabs */}
            <div className="flex flex-wrap gap-2">
              {report.failedDefenses.map((d) => (
                <button
                  key={d.defense}
                  onClick={() => setSelectedDefenseKey(d.defense)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    selectedDefenseKey === d.defense
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  <span>{d.defense}</span>
                  <span className="px-1.5 py-0.2 rounded-full text-3xs font-mono bg-black/15">
                    {t('defense.ui.failedCount', { count: d.failedCaseCount })}
                  </span>
                </button>
              ))}
            </div>

            {/* 当前抗辩归因细目 */}
            {currentFailedDefense ? (
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">
                      【{getDefenseTypeLabel(currentFailedDefense.defense, t)}】{t('defense.ui.caseHeading')}
                    </span>
                    <span className="text-2xs text-slate-500">
                       {t('defense.ui.failedCount', { count: currentFailedDefense.failedCaseCount })}
                    </span>
                  </div>

                  <button
                    onClick={() =>
                      handleOpenDrilldown(
                        `${getDefenseTypeLabel(currentFailedDefense.defense, t)} - ${t('defense.ui.caseHeading')}`,
                         t('defense.ui.failedCasesDescription'),
                        currentFailedDefense.failedCaseIds
                      )
                    }
                    className="px-2.5 py-1 bg-white hover:bg-amber-50 border border-slate-200 hover:border-amber-300 text-amber-700 rounded-lg text-2xs font-semibold transition-colors cursor-pointer"
                  >
                    {t('defense.ui.viewComparisons', { count: currentFailedDefense.failedCaseCount })} ↗
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* 1. 高频缺失证据 */}
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                    <div className="text-2xs font-bold text-slate-800 uppercase flex items-center gap-1.5 text-rose-700">
                      <FileX className="w-3.5 h-3.5" />{t('defense.ui.missingEvidence')}</div>
                    {currentFailedDefense.commonEvidenceMissing.length > 0 ? (
                      <div className="space-y-2">
                        {currentFailedDefense.commonEvidenceMissing.map((ev) => (
                          <div
                            key={ev.evidenceName}
                            onClick={() =>
                              handleOpenDrilldown(
                                t('defense.ui.missingEvidenceCases'),
                                t('defense.ui.missingEvidenceCases'),
                                ev.caseIds
                              )
                            }
                            className="p-2 rounded-lg bg-slate-50 hover:bg-rose-50 border border-slate-100 hover:border-rose-200 transition-colors cursor-pointer text-2xs flex items-center justify-between"
                          >
                            <span className="font-medium text-slate-800">{getEvidenceTypeLabel(ev.evidenceName, t)}</span>
                            <div className="flex items-center gap-1.5 font-mono">
                              <span className="text-slate-500">{t('defense.ui.missingCount', { count: ev.missingCount })}</span>
                              <span className="font-bold text-rose-600">{formatRateWithDenominator(ev.missingRate, ev.missingCount, currentFailedDefense.failedCaseCount)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-4 text-center text-3xs text-slate-400">{t('defense.noSignificantMissing')}</div>
                    )}
                  </div>

                  {/* 2. 法院否定裁判理由关键词 */}
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                    <div className="text-2xs font-bold text-slate-800 uppercase flex items-center gap-1.5 text-amber-700">
                      <MessageSquareWarning className="w-3.5 h-3.5" />{t('defense.ui.rejectionTerms')}</div>
                    {currentFailedDefense.commonCourtReasoning.length > 0 ? (
                      <div className="space-y-2">
                        {currentFailedDefense.commonCourtReasoning.map((kw) => (
                          <div
                            key={kw.keyword}
                            onClick={() =>
                              handleOpenDrilldown(
                                t('defense.ui.judgmentKeywordCases'),
                                t('defense.ui.judgmentKeywordDescription'),
                                kw.caseIds
                              )
                            }
                            className="p-2 rounded-lg bg-slate-50 hover:bg-amber-50 border border-slate-100 hover:border-amber-200 transition-colors cursor-pointer text-2xs flex items-center justify-between"
                          >
                            <span className="font-medium text-slate-800">{kw.keyword}</span>
                            <span className="font-mono font-bold text-amber-700">
                              {t('defense.ui.hitCount', { count: kw.count })}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-4 text-center text-3xs text-slate-400">{t('defense.noData')}</div>
                    )}
                  </div>

                  {/* 3. 关联高频争议类型 */}
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                    <div className="text-2xs font-bold text-slate-800 uppercase flex items-center gap-1.5 text-indigo-700">
                      <Scale className="w-3.5 h-3.5" />{t('defense.ui.disputeMix')}</div>
                    {currentFailedDefense.commonDisputeTypes.length > 0 ? (
                      <div className="space-y-2">
                        {currentFailedDefense.commonDisputeTypes.map((dt) => (
                          <div
                            key={dt.disputeType}
                            onClick={() =>
                              handleOpenDrilldown(
                                t('defense.ui.disputeDefenseCases', { type: getDisputeTypeLabel(dt.disputeType, t), defense: getDefenseTypeLabel(currentFailedDefense.defense, t) }),
                                t('defense.ui.disputeDefenseDescription'),
                                dt.caseIds
                              )
                            }
                            className="p-2 rounded-lg bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 transition-colors cursor-pointer text-2xs flex items-center justify-between"
                          >
                            <span className="font-medium text-slate-800">{getDisputeTypeLabel(dt.disputeType, t)}</span>
                            <span className="font-mono font-bold text-indigo-700">
                              {t('defense.ui.countLabel', { count: dt.count })}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-4 text-center text-3xs text-slate-400">{t('defense.noData')}</div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-400">{t('defense.noData')}</div>
        )}
      </div>

      {/* 三、证据组合与高频证据关联分析 (企业获支持案件) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-900">{t('defense.evidenceCombinations')}</h2>
          </div>
          <span className="text-2xs text-slate-500 font-medium">
            ⚠️ {t('defense.ui.strictEvidence')}
          </span>
        </div>

        {report ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 左侧：多证据组合出现频次 */}
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-900 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-600" />
                  {t('defense.ui.combinationCount')}
                </span>
                <span className="text-3xs text-slate-400 font-normal">
                  {t('defense.ui.supportedCasesTotal', { count: report.employerSupportedCaseCount })}
                </span>
              </div>

              {report.evidenceCombinations.length > 0 ? (
                <div className="space-y-2">
                  {report.evidenceCombinations.map((combo) => (
                    <div
                      key={combo.combinationKey}
                      onClick={() =>
                        handleOpenDrilldown(
                          t('defense.ui.combinationCases', { items: combo.evidenceCombination.map((item) => getEvidenceTypeLabel(item, t)).join(' + ') }),
                          t('defense.ui.combinationDescription'),
                          combo.caseIds
                        )
                      }
                      className="bg-slate-50 hover:bg-emerald-50/70 border border-slate-200 hover:border-emerald-300 p-3 rounded-xl transition-all cursor-pointer text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex flex-wrap gap-1">
                          {combo.evidenceCombination.map((e) => (
                            <span
                              key={e}
                              className="px-2 py-0.5 bg-white border border-slate-200 text-slate-700 rounded text-3xs font-medium"
                            >
                              {getEvidenceTypeLabel(e, t)}
                            </span>
                          ))}
                        </div>
                        <span className="font-mono font-bold text-emerald-700 text-xs">
                          {t('defense.ui.combinationCount', { count: combo.appearanceCount, rate: formatRateWithDenominator(combo.appearanceRate, combo.appearanceCount, report.employerSupportedCaseCount) })}
                        </span>
                      </div>
                      <div className="text-3xs text-slate-400">
                        {t('defense.ui.comboAppears', { rate: formatRateWithDenominator(combo.appearanceRate, combo.appearanceCount, report.employerSupportedCaseCount) })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">{t('defense.noData')}</div>
              )}
            </div>

            {/* 右侧：单项证据出现率 */}
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-900 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <FileCheck className="w-3.5 h-3.5 text-indigo-600" />
                  {t('defense.ui.singleEvidence')}
                </span>
              </div>

              {report.evidenceSingleRanking.length > 0 ? (
                <div className="space-y-2">
                  {report.evidenceSingleRanking.slice(0, 7).map((ev) => (
                    <div
                      key={ev.evidenceName}
                      onClick={() =>
                        handleOpenDrilldown(
                          t('defense.ui.singleEvidenceCases', { type: getEvidenceTypeLabel(ev.evidenceName, t) }),
                          t('defense.ui.singleEvidenceDescription'),
                          ev.appearanceInEmployerSupportedCaseIds
                        )
                      }
                      className="bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-300 p-2.5 rounded-xl transition-all cursor-pointer text-xs flex items-center justify-between"
                    >
                      <span className="font-semibold text-slate-800">{getEvidenceTypeLabel(ev.evidenceName, t)}</span>
                      <div className="flex items-center gap-3 font-mono text-2xs">
                        <span className="text-slate-500">
                          {t('defense.ui.supportedAppearance', { count: ev.appearanceInEmployerSupportedCount })}
                        </span>
                        <span className="font-bold text-indigo-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                          {t('defense.ui.rate', { rate: formatRateWithDenominator(ev.rateInEmployerSupported, ev.appearanceInEmployerSupportedCount, ev.employerSupportedDenominator) })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">{t('defense.noData')}</div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* 四、争议类型 × 抗辩二维矩阵 (Dispute Type × Defense Matrix) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Grid className="w-4 h-4 text-purple-600" />
            <h2 className="text-sm font-bold text-slate-900">{t('defense.matrix')}</h2>
          </div>
          <span className="text-2xs text-slate-400 font-mono">{t('defense.ui.matrixCell')}</span>
        </div>

        {report && report.matrix.disputeTypes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-max min-w-full table-fixed text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-2xs text-slate-600">
                  <th className="w-[190px] min-w-[190px] max-w-[190px] py-2.5 px-3 text-left font-semibold border border-slate-200 sticky left-0 bg-slate-50 z-10">{t('defense.ui.matrixRow')}</th>
                  {report.matrix.defenseTypes.map((def) => {
                    const label = getDefenseTypeLabel(def, t);
                    return (
                      <th key={def} className="w-[140px] min-w-[140px] max-w-[140px] py-2.5 px-3 text-center align-middle font-semibold border border-slate-200">
                        <span className="block min-w-0 truncate" title={label}>{label}</span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {report.matrix.disputeTypes.map((dt) => (
                  <tr key={dt} className="hover:bg-slate-50/50 transition-colors">
                    <td className="w-[190px] min-w-[190px] max-w-[190px] py-2.5 px-3 font-semibold text-slate-800 border border-slate-200 sticky left-0 bg-white z-10 text-2xs">
                      <span className="block min-w-0 truncate" title={getDisputeTypeLabel(dt, t)}>{getDisputeTypeLabel(dt, t)}</span>
                    </td>

                    {report.matrix.defenseTypes.map((def) => {
                      const cell: DisputeDefenseMatrixCell | undefined = report.matrix.cells[dt]?.[def];
                      if (!cell || cell.caseCount === 0) {
                        return (
                          <td key={def} className="py-2.5 px-3 text-center text-3xs text-slate-300 border border-slate-200">
                            -
                          </td>
                        );
                      }

                      const rate = cell.employerSupportRate;
                      const hasSupported = cell.employerSupportedCount > 0;

                      return (
                        <td
                          key={def}
                          onClick={() =>
                            handleOpenDrilldown(
                              t('defense.ui.matrixCases', { dispute: dt, defense: def }),
                              t('defense.ui.matrixDescription', { count: cell.caseCount, supported: cell.employerSupportedCount }),
                              cell.caseIds
                            )
                          }
                          className={`py-2 px-2 text-center border border-slate-200 cursor-pointer transition-colors ${
                            rate >= 50
                              ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900'
                              : rate > 0
                              ? 'bg-amber-50 hover:bg-amber-100 text-amber-900'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
                          }`}
                        >
                          <div className="font-mono font-bold text-xs">{t('defense.ui.countLabel', { count: cell.caseCount })}</div>
                          <div className="font-mono text-3xs opacity-80 mt-0.5">
                            {t('defense.ui.rate', { rate: formatRateWithDenominator(rate, cell.employerSupportedCount, cell.knownOutcomeDenominator) })}
                            {cell.employerUnclearCount > 0 ? `{t('defense.ui.excludedUnclear', { count: cell.employerUnclearCount })}` : ''}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-400">{t('defense.noData')}</div>
        )}
      </div>

      {/* 钻取溯源面板 (Drilldown Drawer) */}
      {drilldownCaseIds && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex justify-end animate-in fade-in">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col">
            {/* 抽屉头部 */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-rose-600" />
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
                <div className="py-16 text-center text-xs text-slate-400">
                  {t('defense.ui.noMatching')}
                </div>
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
                            ? 'bg-rose-50/70 border-rose-500 shadow-xs'
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
                              {t('defense.ui.employerOutcome')} {t(`status.${employerOutcomePresentation.outcome === 'partially_supported' ? 'partiallySupported' : employerOutcomePresentation.outcome === 'not_supported' ? 'notSupported' : employerOutcomePresentation.outcome}`)}
                            </span>
                          </div>
                        </div>

                        <h4 className="font-bold text-slate-900 text-xs line-clamp-1">{c.title}</h4>

                        <div className="grid grid-cols-2 gap-2 text-2xs text-slate-500">
                          <div className="truncate">{t('defense.ui.courtLabel')} {c.court}</div>
                          <div className="truncate">{t('defense.ui.dateLabel')} {formatCaseDate(c.date)}</div>
                        </div>

                        {isSelected && (
                          <div className="pt-2 border-t border-slate-200 space-y-2 text-2xs text-slate-700 bg-slate-50/50 p-2.5 rounded-lg mt-2">
                            <div>
                              <span className="text-slate-400">{t('defense.parties')}</span> {t('section.employee')} [{formatPartyName(c.employeeParty)}] vs {t('section.employer')} [{formatPartyName(c.employerParty)}]
                            </div>
                            <div>
                              <span className="text-slate-400">{t('defense.disputeType')}</span>{' '}
                              {c.disputeType.map((value) => getDisputeTypeLabel(value, t)).join('、') || t('defense.notStated')}
                            </div>
                            <div>
                              <span className="text-slate-400">{t('defense.ui.defensesLabel', { count: c.employerDefenses.length })}</span>{' '}
                              {c.employerDefenses.map((d) => getDefenseTypeLabel(d.defenseType, t)).join('、') || t('defense.none')}
                            </div>
                            <div>
                              <span className="text-slate-400">{t('defense.ui.evidenceLabel', { count: c.evidence.length })}</span>{' '}
                              {c.evidence.map((e) => getEvidenceTypeLabel(e.name, t)).join('、') || t('defense.none')}
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
                                    <Check className="w-3 h-3 text-emerald-600" />
                                    {t('defense.ui.copied')}
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />{t('defense.ui.copyJson')}</>
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
              <span>{t('defense.directDataMapping')}</span>
              <button
                onClick={() => {
                  setDrilldownCaseIds(null);
                  setSelectedCaseDetail(null);
                }}
                className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-md font-medium cursor-pointer"
              >
                {t('defense.ui.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
