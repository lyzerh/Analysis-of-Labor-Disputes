import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert,
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
import { formatCaseDate, formatPartyName } from '../services/presentation/CaseMetadataPresentation';
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
          setResearchError('先前选择的 AnalysisRun 已不存在，请重新选择。');
        }
      })
      .catch((error) => setResearchError(error instanceof Error ? error.message : '无法加载 AnalysisRun'));
  }, [initialAnalysisRunId, onAnalysisRunSelect]);

  useEffect(() => {
    if (initialAnalysisRunId) setSelectedAnalysisRunId(initialAnalysisRunId);
  }, [initialAnalysisRunId]);

  // 从用户明确选择的 AnalysisRun 固定输入执行关联分析。
  const loadAndAnalyze = async () => {
    if (!selectedAnalysisRunId) {
      setResearchError('请先选择一个 AnalysisRun。');
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
      if (!execution.result) setResearchError('Analytics Gate 或质量门禁已阻止本次正式分析，请查看 Quality issues。');

      if (generatedReport && generatedReport.failedDefenses.length > 0) {
        setSelectedDefenseKey(generatedReport.failedDefenses[0].defense);
      }
    } catch (err) {
      setResearchError(err instanceof Error ? err.message : '抗辩策略关联分析引擎执行失败');
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
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                企业抗辩策略与证据组合关联分析
                <span className="px-2.5 py-0.5 text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 rounded-full">
                  策略与证据关联
                </span>
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                基于所选 AnalysisRun 的固定输入，分析抗辩、证据与案件结果的共现关系，不推断法院采纳或因果效果
              </p>
            </div>
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
              <span className="font-semibold text-slate-900">严格零推断与零污染：</span>
              分析基于纯结构化统计，只表述抗辩与案件结果的共现频率，不把案件结果解释成法院采纳某项抗辩。
            </div>
          </div>

          <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl flex items-start gap-2.5 text-amber-950">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">不利结果案件对照：</span>
              统计企业结果为“部分支持”或“不支持”案件中的高频缺失证据与裁判否定关键词，只作客观共现对照。
            </div>
          </div>
        </div>
      </div>

      {/* 基础概览卡片 */}
      {report && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="text-2xs text-slate-500 font-semibold uppercase flex items-center gap-1">
              <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
              纳入分析集总数
            </div>
            <div className="text-2xl font-bold font-mono text-slate-800 mt-1">
              {report.analyzedCaseCount}
            </div>
            <div className="text-2xs text-slate-400 mt-0.5">合格有效分析案例</div>
          </div>

          <div
            onClick={() =>
              handleOpenDrilldown(
                '企业获支持案件',
                '裁判结果为企业完全支持的有效案件',
                filterAnalyticsEligibleRecords(allRecords).eligibleRecords
                  .filter((r) => r.employerOutcome === 'supported').map((r) => r.caseId)
              )
            }
            className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4 shadow-sm hover:shadow transition-all cursor-pointer group"
          >
            <div className="text-2xs text-emerald-800 font-semibold uppercase flex items-center justify-between">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                企业获支持 (Supported)
              </span>
              <ChevronRight className="w-3 h-3 text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">
              {report.employerSupportedCaseCount}
            </div>
            <div className="text-2xs text-emerald-600 mt-0.5">占分析集比例 {((report.employerSupportedCaseCount / (report.analyzedCaseCount || 1)) * 100).toFixed(1)}% ({report.employerSupportedCaseCount}/{report.analyzedCaseCount})</div>
          </div>

          <div
            onClick={() =>
              handleOpenDrilldown(
                '企业未完全支持案件',
                '裁判结果为部分支持或全部驳回的案件',
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
                企业未完全支持 (Non-Supported)
              </span>
              <ChevronRight className="w-3 h-3 text-rose-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
            <div className="text-2xl font-bold font-mono text-rose-700 mt-1">
              {report.employerNonSupportedCaseCount}
            </div>
            <div className="text-2xs text-rose-600 mt-0.5">归因分析重点对象</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="text-2xs text-slate-500 font-semibold uppercase flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-indigo-500" />
              已统计抗辩类型
            </div>
            <div className="text-2xl font-bold font-mono text-indigo-600 mt-1">
              {report.defenseRanking.length}
            </div>
            <div className="text-2xs text-slate-400 mt-0.5">涵盖全量标准与自定义抗辩</div>
          </div>
        </div>
      )}

      {/* 一、企业抗辩与案件结果共现分布 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600" />
            <h2 className="text-sm font-bold text-slate-900">一、企业抗辩事由与案件结果共现排行</h2>
          </div>
          <span className="text-2xs text-slate-400 font-mono">
            有利结果共现率 = supported / (supported + partially + not supported)，排除 unclear
          </span>
        </div>

        {report && report.defenseRanking.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-2xs text-slate-500 uppercase bg-slate-50">
                  <th className="py-2.5 px-3 font-semibold">抗辩事由 (Defense)</th>
                  <th className="py-2.5 px-3 font-semibold text-center">案件量</th>
                  <th className="py-2.5 px-3 font-semibold text-center">企业结果 supported</th>
                  <th className="py-2.5 px-3 font-semibold text-center">企业结果 partially</th>
                  <th className="py-2.5 px-3 font-semibold text-center">企业结果 not supported</th>
                  <th className="py-2.5 px-3 font-semibold text-center">有利结果共现率</th>
                  <th className="py-2.5 px-3 font-semibold text-right">溯源</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.defenseRanking.map((item) => (
                  <tr key={item.defenseName} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{item.defenseName}</span>
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                      <button
                        onClick={() =>
                          handleOpenDrilldown(
                            `抗辩: ${item.defenseName} - 全部案件`,
                            `提出 [${item.defenseName}] 抗辩的全部案件`,
                            item.caseIds
                          )
                        }
                        className="hover:text-indigo-600 hover:underline cursor-pointer"
                      >
                        {item.caseCount} 案
                      </button>
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() =>
                          handleOpenDrilldown(
                            `抗辩: ${item.defenseName} - 企业结果 supported 案件`,
                            `提出 [${item.defenseName}] 且企业案件结果为 supported`,
                            item.supportedCaseIds
                          )
                        }
                        className="font-mono font-bold text-emerald-700 hover:underline cursor-pointer"
                      >
                        {item.supportedCount} 案
                      </button>
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() =>
                          handleOpenDrilldown(
                            `抗辩: ${item.defenseName} - 企业结果 partially supported 案件`,
                            `提出 [${item.defenseName}] 且企业案件结果为 partially supported`,
                            item.partiallySupportedCaseIds
                          )
                        }
                        className="font-mono text-amber-700 hover:underline cursor-pointer"
                      >
                        {item.partiallySupportedCount} 案
                      </button>
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() =>
                          handleOpenDrilldown(
                            `抗辩: ${item.defenseName} - 企业结果 not supported 案件`,
                            `提出 [${item.defenseName}] 且企业案件结果为 not supported；不表示法院明确否定该抗辩`,
                            item.notSupportedCaseIds
                          )
                        }
                        className="font-mono text-rose-700 hover:underline cursor-pointer"
                      >
                        {item.notSupportedCount} 案
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
                        {item.employerSupportRate}% ({item.supportedCount}/{item.supportedCount + item.partiallySupportedCount + item.notSupportedCount})
                      </span>
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() =>
                          handleOpenDrilldown(
                            `抗辩: ${item.defenseName}`,
                            `查看 ${item.defenseName} 相关所有 ${item.caseCount} 篇案件`,
                            item.caseIds
                          )
                        }
                        className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded text-2xs font-medium inline-flex items-center gap-1 cursor-pointer"
                      >
                        钻取
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-400">暂无足够数据</div>
        )}
      </div>

      {/* 二、企业结果不利案件共现对照（仅部分支持与不支持，排除 unclear） */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <FileX className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-bold text-slate-900">二、企业结果未完全有利案件对照 (缺失证据与裁判否定词)</h2>
          </div>
          <span className="text-2xs text-slate-400 font-mono">
            分析对象：提出该抗辩且企业结果为 partially / not supported 的案件
          </span>
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
                    {d.failedCaseCount} 失败案
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
                      【{currentFailedDefense.defense}】企业结果未完全有利案件对照
                    </span>
                    <span className="text-2xs text-slate-500">
                      共涉及 {currentFailedDefense.failedCaseCount} 篇企业结果不支持或部分支持案件
                    </span>
                  </div>

                  <button
                    onClick={() =>
                      handleOpenDrilldown(
                        `【${currentFailedDefense.defense}】企业结果未完全有利案件`,
                        `提出 [${currentFailedDefense.defense}] 且企业结果为 partially / not supported 的案件清单`,
                        currentFailedDefense.failedCaseIds
                      )
                    }
                    className="px-2.5 py-1 bg-white hover:bg-amber-50 border border-slate-200 hover:border-amber-300 text-amber-700 rounded-lg text-2xs font-semibold transition-colors cursor-pointer"
                  >
                    查看全部 {currentFailedDefense.failedCaseCount} 篇对照案件 ↗
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* 1. 高频缺失证据 */}
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                    <div className="text-2xs font-bold text-slate-800 uppercase flex items-center gap-1.5 text-rose-700">
                      <FileX className="w-3.5 h-3.5" />
                      高频缺失证据材料
                    </div>
                    {currentFailedDefense.commonEvidenceMissing.length > 0 ? (
                      <div className="space-y-2">
                        {currentFailedDefense.commonEvidenceMissing.map((ev) => (
                          <div
                            key={ev.evidenceName}
                            onClick={() =>
                              handleOpenDrilldown(
                                `【${currentFailedDefense.defense}】缺失 [${ev.evidenceName}] 案件`,
                                `在提出 [${currentFailedDefense.defense}] 且企业结果未完全有利的案件中，未识别到 [${ev.evidenceName}]`,
                                ev.caseIds
                              )
                            }
                            className="p-2 rounded-lg bg-slate-50 hover:bg-rose-50 border border-slate-100 hover:border-rose-200 transition-colors cursor-pointer text-2xs flex items-center justify-between"
                          >
                            <span className="font-medium text-slate-800">{ev.evidenceName}</span>
                            <div className="flex items-center gap-1.5 font-mono">
                              <span className="text-slate-500">{ev.missingCount} 案未提交</span>
                              <span className="font-bold text-rose-600">({ev.missingRate}% = {ev.missingCount}/{currentFailedDefense.failedCaseCount})</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-4 text-center text-3xs text-slate-400">当前无显著缺失样本</div>
                    )}
                  </div>

                  {/* 2. 法院否定裁判理由关键词 */}
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                    <div className="text-2xs font-bold text-slate-800 uppercase flex items-center gap-1.5 text-amber-700">
                      <MessageSquareWarning className="w-3.5 h-3.5" />
                      法院否定依据高频词
                    </div>
                    {currentFailedDefense.commonCourtReasoning.length > 0 ? (
                      <div className="space-y-2">
                        {currentFailedDefense.commonCourtReasoning.map((kw) => (
                          <div
                            key={kw.keyword}
                            onClick={() =>
                              handleOpenDrilldown(
                                `裁判理由包含 [${kw.keyword}] 案件`,
                                `在提出 [${currentFailedDefense.defense}] 且企业结果未完全有利的案件中，裁判文书出现 [${kw.keyword}]`,
                                kw.caseIds
                              )
                            }
                            className="p-2 rounded-lg bg-slate-50 hover:bg-amber-50 border border-slate-100 hover:border-amber-200 transition-colors cursor-pointer text-2xs flex items-center justify-between"
                          >
                            <span className="font-medium text-slate-800">{kw.keyword}</span>
                            <span className="font-mono font-bold text-amber-700">
                              {kw.count} 案命中
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-4 text-center text-3xs text-slate-400">暂无足够数据</div>
                    )}
                  </div>

                  {/* 3. 关联高频争议类型 */}
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                    <div className="text-2xs font-bold text-slate-800 uppercase flex items-center gap-1.5 text-indigo-700">
                      <Scale className="w-3.5 h-3.5" />
                      高发争议诉求分布
                    </div>
                    {currentFailedDefense.commonDisputeTypes.length > 0 ? (
                      <div className="space-y-2">
                        {currentFailedDefense.commonDisputeTypes.map((dt) => (
                          <div
                            key={dt.disputeType}
                            onClick={() =>
                              handleOpenDrilldown(
                                `争议: ${dt.disputeType} × 抗辩: ${currentFailedDefense.defense} 对照案件`,
                                `在 ${dt.disputeType} 争议中提出该抗辩且企业结果未完全有利`,
                                dt.caseIds
                              )
                            }
                            className="p-2 rounded-lg bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 transition-colors cursor-pointer text-2xs flex items-center justify-between"
                          >
                            <span className="font-medium text-slate-800">{dt.disputeType}</span>
                            <span className="font-mono font-bold text-indigo-700">
                              {dt.count} 案
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-4 text-center text-3xs text-slate-400">暂无足够数据</div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-400">暂无足够数据</div>
        )}
      </div>

      {/* 三、证据组合与高频证据关联分析 (企业获支持案件) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-900">三、关键证据及多证据组合在企业获支持案件中出现频率</h2>
          </div>
          <span className="text-2xs text-slate-500 font-medium">
            ⚠️ 严禁因果断言：仅反映证据在企业获支持案件中的共同出现频次
          </span>
        </div>

        {report ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 左侧：多证据组合出现频次 */}
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-900 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-600" />
                  多项证据组合 (Combinations)
                </span>
                <span className="text-3xs text-slate-400 font-normal">
                  企业获支持案件总数: {report.employerSupportedCaseCount} 案
                </span>
              </div>

              {report.evidenceCombinations.length > 0 ? (
                <div className="space-y-2">
                  {report.evidenceCombinations.map((combo) => (
                    <div
                      key={combo.combinationKey}
                      onClick={() =>
                        handleOpenDrilldown(
                          `证据组合: [${combo.combinationKey}] - 企业获支持案件`,
                          `在企业获支持案件中同时提交了 [${combo.combinationKey}]`,
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
                              {e}
                            </span>
                          ))}
                        </div>
                        <span className="font-mono font-bold text-emerald-700 text-xs">
                          {combo.appearanceCount} 案 ({combo.appearanceRate}% = {combo.appearanceCount}/{report.employerSupportedCaseCount})
                        </span>
                      </div>
                      <div className="text-3xs text-slate-400">
                        在企业获支持案件中出现频率: {combo.appearanceRate}%
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">暂无足够数据</div>
              )}
            </div>

            {/* 右侧：单项证据出现率 */}
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-900 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <FileCheck className="w-3.5 h-3.5 text-indigo-600" />
                  单项证据在企业获支持案中出现频次
                </span>
              </div>

              {report.evidenceSingleRanking.length > 0 ? (
                <div className="space-y-2">
                  {report.evidenceSingleRanking.slice(0, 7).map((ev) => (
                    <div
                      key={ev.evidenceName}
                      onClick={() =>
                        handleOpenDrilldown(
                          `证据: ${ev.evidenceName} - 企业获支持案件`,
                          `在企业获支持案件中提交了 [${ev.evidenceName}]`,
                          ev.appearanceInEmployerSupportedCaseIds
                        )
                      }
                      className="bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-300 p-2.5 rounded-xl transition-all cursor-pointer text-xs flex items-center justify-between"
                    >
                      <span className="font-semibold text-slate-800">{ev.evidenceName}</span>
                      <div className="flex items-center gap-3 font-mono text-2xs">
                        <span className="text-slate-500">
                          支持案出现: {ev.appearanceInEmployerSupportedCount} 案
                        </span>
                        <span className="font-bold text-indigo-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                          出现率: {ev.rateInEmployerSupported}% ({ev.appearanceInEmployerSupportedCount}/{ev.employerSupportedDenominator})
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">暂无足够数据</div>
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
            <h2 className="text-sm font-bold text-slate-900">四、争议类型 × 企业抗辩二维交叉矩阵</h2>
          </div>
          <span className="text-2xs text-slate-400 font-mono">
            单元格格式: 案件量 / 企业有利结果共现率 (点击单元格钻取案卷)
          </span>
        </div>

        {report && report.matrix.disputeTypes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-2xs text-slate-600">
                  <th className="py-2.5 px-3 text-left font-semibold border border-slate-200 sticky left-0 bg-slate-50 z-10">
                    争议类型 \ 企业抗辩
                  </th>
                  {report.matrix.defenseTypes.map((def) => (
                    <th key={def} className="py-2.5 px-3 text-center font-semibold border border-slate-200 min-w-[110px]">
                      {def}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.matrix.disputeTypes.map((dt) => (
                  <tr key={dt} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-slate-800 border border-slate-200 sticky left-0 bg-white z-10 text-2xs">
                      {dt}
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
                              `【${dt}】×【${def}】交叉案件`,
                              `共 ${cell.caseCount} 篇案件，其中企业完全支持 ${cell.employerSupportedCount} 案`,
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
                          <div className="font-mono font-bold text-xs">{cell.caseCount} 案</div>
                          <div className="font-mono text-3xs opacity-80 mt-0.5">
                            共现率: {rate}% ({cell.employerSupportedCount}/{cell.knownOutcomeDenominator})
                            {cell.employerUnclearCount > 0 ? `，排除 unclear ${cell.employerUnclearCount}` : ''}
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
          <div className="py-8 text-center text-xs text-slate-400">暂无足够数据</div>
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
                  {drilldownDescription} (共 {drilldownCases.length} 篇有效案例)
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
                  当前分类下无匹配案件或样本不足
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
                              <span className="text-3xs text-slate-400 font-mono">{c.year}年</span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-3xs font-bold font-mono ${employerOutcomePresentation.badgeClassName}`}>
                              企业: {employerOutcomePresentation.label}
                            </span>
                          </div>
                        </div>

                        <h4 className="font-bold text-slate-900 text-xs line-clamp-1">{c.title}</h4>

                        <div className="grid grid-cols-2 gap-2 text-2xs text-slate-500">
                          <div className="truncate">审理法院: {c.court}</div>
                          <div className="truncate">裁判日期: {formatCaseDate(c.date)}</div>
                        </div>

                        {isSelected && (
                          <div className="pt-2 border-t border-slate-200 space-y-2 text-2xs text-slate-700 bg-slate-50/50 p-2.5 rounded-lg mt-2">
                            <div>
                              <span className="text-slate-400">当事人:</span> 劳动者 [{formatPartyName(c.employeeParty)}] vs 用人单位 [{formatPartyName(c.employerParty)}]
                            </div>
                            <div>
                              <span className="text-slate-400">争议类型:</span>{' '}
                              {c.disputeType.join('、') || '未载明'}
                            </div>
                            <div>
                              <span className="text-slate-400">抗辩事由 ({c.employerDefenses.length}):</span>{' '}
                              {c.employerDefenses.map((d) => d.defenseType).join('、') || '无'}
                            </div>
                            <div>
                              <span className="text-slate-400">提取证据 ({c.evidence.length}):</span>{' '}
                              {c.evidence.map((e) => e.name).join('、') || '无'}
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
                                    已复制
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    复制完整记录 JSON
                                  </>
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
              <span>数据层直接映射，零推断零污染</span>
              <button
                onClick={() => {
                  setDrilldownCaseIds(null);
                  setSelectedCaseDetail(null);
                }}
                className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-md font-medium cursor-pointer"
              >
                关闭面板
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
