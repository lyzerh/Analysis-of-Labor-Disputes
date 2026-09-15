import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
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
  TARGET_CITIES_CONFIG,
  KEY_DISPUTE_TYPES,
  KEY_EMPLOYER_DEFENSES,
  KEY_EVIDENCE_TYPES,
} from '../services/analytics/LaborDisputeAnalyticsEngine';
import { getOutcomePresentation } from '../services/outcome/OutcomePresentation';
import {
  ResearchAnalysisService,
  type ResearchAnalysisContext,
  type ResearchAnalyticsMetadata,
} from '../services/analysis/ResearchAnalysisService';
import { ResearchAnalysisHeader } from './ResearchAnalysisHeader';

const researchAnalysisService = new ResearchAnalysisService();

interface LaborAnalyticsTestProps {
  initialAnalysisRunId?: string;
}

export const LaborAnalyticsTest: React.FC<LaborAnalyticsTestProps> = ({ initialAnalysisRunId = '' }) => {
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
      .then(setAnalysisRuns)
      .catch((error) => setResearchError(error instanceof Error ? error.message : '无法加载 AnalysisRun'));
  }, []);

  useEffect(() => {
    if (initialAnalysisRunId) setSelectedAnalysisRunId(initialAnalysisRunId);
  }, [initialAnalysisRunId]);

  // 从用户明确选择的 AnalysisRun 固定输入执行分析。
  const loadData = async () => {
    if (!selectedAnalysisRunId) {
      setResearchError('请先选择一个 AnalysisRun。');
      return;
    }
    setIsLoading(true);
    setResearchError(null);
    try {
      const execution = await researchAnalysisService.executeResearchAnalysis(
        selectedAnalysisRunId,
        (records) => LaborDisputeAnalyticsEngine.generateReport(records),
      );
      setResearchContext(execution.context);
      setAllRecords(execution.context.records);
      setReport(execution.result?.result ?? null);
      setResearchMetadata(execution.result?.metadata ?? null);
      if (!execution.result) setResearchError('质量门禁已阻止本次正式分析，请查看 Quality issues。');
    } catch (err) {
      setResearchError(err instanceof Error ? err.message : '统计分析引擎执行失败');
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
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* 顶部标题与说明 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                劳动争议基础统计分析
                <span className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                  正式分析集统计
                </span>
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                只分析所选 AnalysisRun 的冻结输入，并显示 corpus/sample 范围、N、质量警告与 provenance
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
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2.5 text-slate-700">
            <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-900">数据范围：</span>
              分析仅作用于所选 AnalysisRun 的冻结输入；exhaustive 描述 Snapshot 语料，sampled 只描述本次样本。
            </div>
          </div>

          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-emerald-950">
            <Percent className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">客观统计与胜诉率定义：</span>
              胜负计算分母<strong>严格排除 unclear</strong>；部分支持独立统计，不直接算作胜诉；证据统计仅反映关联出现频次，不作因果推断。
            </div>
          </div>
        </div>
      </div>

      {/* 一、基础总体统计 (Overall Statistics) */}
      {report && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="text-2xs text-slate-500 font-semibold uppercase flex items-center gap-1">
              <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
              案件总量 (Total Cases)
            </div>
            <div className="text-2xl font-bold font-mono text-slate-800 mt-1">
              {report.overall.totalCases}
            </div>
            <div className="text-2xs text-slate-400 mt-0.5">所选 AnalysisRun 固定输入</div>
          </div>

          <div
            onClick={() =>
              handleOpenDrilldown(
                '正式分析集案件',
                '质量分 >= 80 或已通过人工审核的合格分析集案例',
                (Array.isArray(allRecords) ? allRecords : []).filter((r) => r.isIncludedInAnalysisSet).map((r) => r.caseId)
              )
            }
            className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4 shadow-sm hover:shadow transition-all cursor-pointer group"
          >
            <div className="text-2xs text-emerald-800 font-semibold uppercase flex items-center justify-between">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                有效分析量 (Included)
              </span>
              <ChevronRight className="w-3 h-3 text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">
              {report.overall.includedCases}
            </div>
            <div className="text-2xs text-emerald-600 mt-0.5">点击查看全部入集案件</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="text-2xs text-slate-500 font-semibold uppercase flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              平均质量分 (Avg Parser Score)
            </div>
            <div className="text-2xl font-bold font-mono text-indigo-600 mt-1">
              {report.overall.averageParserScore}{' '}
              <span className="text-xs font-normal text-slate-400">/ 100</span>
            </div>
            <div className="text-2xs text-slate-400 mt-0.5">合格集平均完整度</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="text-2xs text-slate-500 font-semibold uppercase flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-purple-500" />
              人工审核状态
            </div>
            <div className="text-sm font-bold text-slate-800 mt-2 flex items-center gap-2 font-mono">
              <span className="text-emerald-700">{report.overall.reviewApprovedCount} 核准</span>
              <span className="text-slate-300">|</span>
              <span className="text-blue-700">{report.overall.modifiedReviewCount} 修订</span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-500">{report.overall.pendingReviewCount} 待核</span>
            </div>
            <div className="text-2xs text-slate-400 mt-1">人工校验覆盖构成</div>
          </div>
        </div>
      )}

      {/* 二、城市排行与对比 (广州、深圳、东莞) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900">二、广深莞目标城市裁判结果统计</h2>
          </div>
          <span className="text-2xs text-slate-400 font-mono">
            限定范围: 广州市、深圳市、东莞市 (其他城市数据保留但不计入)
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
                          `${citySummary.city} - 全部有效分析案件`,
                          `共检索到 ${citySummary.caseCount} 篇入集案件`,
                          citySummary.caseIds
                        )
                      }
                      className="px-2 py-0.5 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-indigo-700 rounded-md text-2xs font-mono font-semibold transition-colors cursor-pointer"
                    >
                      {citySummary.caseCount} 案 ↗
                    </button>
                  </div>

                  {hasCases ? (
                    <>
                      {/* 胜诉率大卡片 */}
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div
                          onClick={() =>
                            handleOpenDrilldown(
                              `${citySummary.city} - 企业胜诉 (Supported) 案件`,
                              `企业诉求或抗辩获得完全支持`,
                              citySummary.employerOutcome.caseIds.supported
                            )
                          }
                          className="bg-white p-2.5 rounded-lg border border-slate-200 hover:border-emerald-300 transition-all cursor-pointer group"
                        >
                          <div className="text-3xs text-slate-500 font-semibold uppercase">企业支持率</div>
                          <div className="text-lg font-bold font-mono text-emerald-600 group-hover:text-emerald-700">
                            {citySummary.employerWinRate}%
                          </div>
                          <div className="text-3xs text-slate-400 font-mono">
                            {citySummary.employerOutcome.supported} /{' '}
                            {citySummary.employerOutcome.supported +
                              citySummary.employerOutcome.partially_supported +
                              citySummary.employerOutcome.not_supported}{' '}
                            案
                          </div>
                        </div>

                        <div
                          onClick={() =>
                            handleOpenDrilldown(
                              `${citySummary.city} - 劳动者胜诉 (Supported) 案件`,
                              `劳动者诉求获得完全支持`,
                              citySummary.employeeOutcome.caseIds.supported
                            )
                          }
                          className="bg-white p-2.5 rounded-lg border border-slate-200 hover:border-indigo-300 transition-all cursor-pointer group"
                        >
                          <div className="text-3xs text-slate-500 font-semibold uppercase">员工支持率</div>
                          <div className="text-lg font-bold font-mono text-indigo-600 group-hover:text-indigo-700">
                            {citySummary.employeeWinRate}%
                          </div>
                          <div className="text-3xs text-slate-400 font-mono">
                            {citySummary.employeeOutcome.supported} /{' '}
                            {citySummary.employeeOutcome.supported +
                              citySummary.employeeOutcome.partially_supported +
                              citySummary.employeeOutcome.not_supported}{' '}
                            案
                          </div>
                        </div>
                      </div>

                      {/* 裁判四分类细目分布 */}
                      <div className="space-y-1.5 text-2xs pt-1 border-t border-slate-200/60">
                        <div className="text-3xs text-slate-400 font-semibold uppercase">
                          企业视角四分类结果构成
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">全额支持 (Supported):</span>
                          <button
                            onClick={() =>
                              handleOpenDrilldown(
                                `${citySummary.city} - 企业全额支持案件`,
                                '企业获得完全支持',
                                citySummary.employerOutcome.caseIds.supported
                              )
                            }
                            className="font-mono font-semibold text-emerald-700 hover:underline cursor-pointer"
                          >
                            {citySummary.employerOutcome.supported} 案
                          </button>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">部分支持 (Partially):</span>
                          <button
                            onClick={() =>
                              handleOpenDrilldown(
                                `${citySummary.city} - 企业部分支持案件`,
                                '双方各获部分支持',
                                citySummary.employerOutcome.caseIds.partially_supported
                              )
                            }
                            className="font-mono font-semibold text-amber-700 hover:underline cursor-pointer"
                          >
                            {citySummary.employerOutcome.partially_supported} 案 ({citySummary.employerPartialRate}%)
                          </button>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-slate-600">全部驳回 (Not Supported):</span>
                          <button
                            onClick={() =>
                              handleOpenDrilldown(
                                `${citySummary.city} - 企业结果不支持案件`,
                                '企业案件结果为不支持；不据此推断具体抗辩是否获法院采纳',
                                citySummary.employerOutcome.caseIds.not_supported
                              )
                            }
                            className="font-mono font-semibold text-rose-700 hover:underline cursor-pointer"
                          >
                            {citySummary.employerOutcome.not_supported} 案
                          </button>
                        </div>

                        {citySummary.employerOutcome.unclear > 0 && (
                          <div className="flex items-center justify-between text-slate-400">
                            <span>未明确结果 (Unclear):</span>
                            <span className="font-mono">{citySummary.employerOutcome.unclear} 案 (已剔除)</span>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="py-8 text-center text-xs text-slate-400 bg-white rounded-lg border border-dashed border-slate-200">
                      当前样本不足
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-400">当前样本不足</div>
        )}
      </div>

      {/* 三、争议类型排行 (Dispute Types Ranking) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-purple-600" />
            <h2 className="text-sm font-bold text-slate-900">三、重点争议类型胜诉率与案量排行</h2>
          </div>
          <span className="text-2xs text-slate-400 font-mono">
            点击任意案件数或支持率钻取案件列表
          </span>
        </div>

        {report && report.disputeTypes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-2xs text-slate-500 uppercase bg-slate-50">
                  <th className="py-2.5 px-3 font-semibold">争议类型标签</th>
                  <th className="py-2.5 px-3 font-semibold text-center">入集案件量</th>
                  <th className="py-2.5 px-3 font-semibold text-center">企业支持率 (排除unclear)</th>
                  <th className="py-2.5 px-3 font-semibold text-center">员工支持率</th>
                  <th className="py-2.5 px-3 font-semibold text-center">部分支持</th>
                  <th className="py-2.5 px-3 font-semibold text-right">操作溯源</th>
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
                          <span>{dt.disputeType}</span>
                          {isKey && (
                            <span className="px-1.5 py-0.2 bg-purple-50 border border-purple-200 text-purple-700 rounded text-3xs font-semibold">
                              重点类型
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                        <button
                          onClick={() =>
                            handleOpenDrilldown(
                              `争议类型: ${dt.disputeType} - 全部案件`,
                              `共 ${dt.caseCount} 篇案件`,
                              dt.caseIds
                            )
                          }
                          className="hover:text-indigo-600 hover:underline cursor-pointer"
                        >
                          {dt.caseCount} 案
                        </button>
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() =>
                            handleOpenDrilldown(
                              `争议类型: ${dt.disputeType} - 企业支持案件`,
                              `企业获得支持的案件列表`,
                              dt.employerOutcome.caseIds.supported
                            )
                          }
                          className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 hover:bg-emerald-100 cursor-pointer"
                        >
                          {dt.employerWinRate}% ({dt.employerOutcome.supported}/{employerKnownN})
                        </button>
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono text-indigo-700">
                        <button
                          onClick={() =>
                            handleOpenDrilldown(
                              `争议类型: ${dt.disputeType} - 劳动者支持案件`,
                              `劳动者诉求获得支持的案件列表`,
                              dt.employeeOutcome.caseIds.supported
                            )
                          }
                          className="hover:underline cursor-pointer"
                        >
                          {dt.employeeWinRate}% ({dt.employeeOutcome.supported}/{employeeKnownN})
                        </button>
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono text-amber-700">
                        <button
                          onClick={() =>
                            handleOpenDrilldown(
                              `争议类型: ${dt.disputeType} - 部分支持案件`,
                              `部分支持案件列表`,
                              dt.employerOutcome.caseIds.partially_supported
                            )
                          }
                          className="hover:underline cursor-pointer"
                        >
                          {dt.employerOutcome.partially_supported} 案
                        </button>
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() =>
                            handleOpenDrilldown(
                              `争议类型: ${dt.disputeType}`,
                              `查看涉及 ${dt.disputeType} 的全部 ${dt.caseCount} 篇案件`,
                              dt.caseIds
                            )
                          }
                          className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded text-2xs font-medium inline-flex items-center gap-1 cursor-pointer"
                        >
                          查看案件
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-400">当前样本不足</div>
        )}
      </div>

      {/* 四、企业抗辩分析 (Employer Defenses Ranking) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600" />
            <h2 className="text-sm font-bold text-slate-900">四、企业抗辩与案件结果共现排行</h2>
          </div>
          <span className="text-2xs text-slate-400 font-mono">
            有利结果共现率 = 企业 supported / (supported + partially + not supported)，排除 unclear
          </span>
        </div>

        {report && report.employerDefenses.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-2xs text-slate-500 uppercase bg-slate-50">
                  <th className="py-2.5 px-3 font-semibold">抗辩事由</th>
                  <th className="py-2.5 px-3 font-semibold text-center">出现总频次</th>
                  <th className="py-2.5 px-3 font-semibold text-center">涉及案件数</th>
                  <th className="py-2.5 px-3 font-semibold text-center">企业胜诉支持</th>
                  <th className="py-2.5 px-3 font-semibold text-center">部分支持</th>
                  <th className="py-2.5 px-3 font-semibold text-center">企业未获支持</th>
                  <th className="py-2.5 px-3 font-semibold text-center">有利结果共现率</th>
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
                          <span>{def.defenseType}</span>
                          {isKey && (
                            <span className="px-1.5 py-0.2 bg-rose-50 border border-rose-200 text-rose-700 rounded text-3xs font-semibold">
                              核心抗辩
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono text-slate-600">
                        {def.frequency} 次
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800">
                        <button
                          onClick={() =>
                            handleOpenDrilldown(
                              `抗辩事由: ${def.defenseType} - 涉及案件`,
                              `共 ${def.caseCount} 篇案件提出该抗辩`,
                              def.caseIds
                            )
                          }
                          className="hover:text-indigo-600 hover:underline cursor-pointer"
                        >
                          {def.caseCount} 案
                        </button>
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() =>
                            handleOpenDrilldown(
                              `抗辩事由: ${def.defenseType} - 企业胜诉案件`,
                              `提出该抗辩且企业获支持`,
                              def.employerSupportedCaseIds
                            )
                          }
                          className="font-mono font-bold text-emerald-700 hover:underline cursor-pointer"
                        >
                          {def.employerSupportedCount} 案
                        </button>
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() =>
                            handleOpenDrilldown(
                              `抗辩事由: ${def.defenseType} - 企业部分支持案件`,
                              `提出该抗辩且部分支持`,
                              def.employerPartialCaseIds
                            )
                          }
                          className="font-mono text-amber-700 hover:underline cursor-pointer"
                        >
                          {def.employerPartialCount} 案
                        </button>
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() =>
                            handleOpenDrilldown(
                              `抗辩事由: ${def.defenseType} - 企业未获支持案件`,
                              `提出该抗辩且企业案件结果为不支持；不表示法院明确否定该抗辩`,
                              def.employerNotSupportedCaseIds
                            )
                          }
                          className="font-mono text-rose-700 hover:underline cursor-pointer"
                        >
                          {def.employerNotSupportedCount} 案
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
                          {def.supportRate}% ({def.employerSupportedCount}/{knownOutcomeN})
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-400">当前样本不足</div>
        )}
      </div>

      {/* 五、证据关联分析 (Evidence Ranking) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900">五、关键证据材料关联频次统计</h2>
          </div>
          <span className="text-2xs text-slate-500 font-medium">
            ⚠️ 严格统计规范：本栏仅反映证据在支持企业结果案件中的关联出现频率，严禁做因果推断
          </span>
        </div>

        {report && report.evidenceRanking.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {report.evidenceRanking.map((ev) => {
              const isKey = (KEY_EVIDENCE_TYPES as readonly string[]).includes(ev.evidenceName);

              return (
                <div
                  key={ev.evidenceName}
                  className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5 hover:border-indigo-300 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                      <span>{ev.evidenceName}</span>
                      {isKey && (
                        <span className="px-1.5 py-0.2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded text-3xs font-semibold">
                          重点证据
                        </span>
                      )}
                    </div>
                    <span className="text-2xs text-slate-400 font-mono">
                      总出现: {ev.frequency} 次
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-2xs pt-1 border-t border-slate-200/60">
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <div className="text-3xs text-slate-400">涉及案件总数</div>
                      <button
                        onClick={() =>
                          handleOpenDrilldown(
                            `证据: ${ev.evidenceName} - 涉及案件`,
                            `提交了 [${ev.evidenceName}] 的案件清单`,
                            ev.caseIds
                          )
                        }
                        className="font-bold font-mono text-slate-800 hover:text-indigo-600 hover:underline cursor-pointer"
                      >
                        {ev.caseCount} 案
                      </button>
                    </div>

                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <div className="text-3xs text-slate-400">支持企业案中出现</div>
                      <button
                        onClick={() =>
                          handleOpenDrilldown(
                            `证据: ${ev.evidenceName} - 企业获支持案件`,
                            `在支持企业结果案件中出现了 [${ev.evidenceName}]`,
                            ev.appearanceInEmployerSupportedCaseIds
                          )
                        }
                        className="font-bold font-mono text-emerald-700 hover:underline cursor-pointer"
                      >
                        {ev.appearanceInEmployerSupportedCount} 案
                      </button>
                    </div>
                  </div>

                  <div className="text-3xs text-slate-500 bg-emerald-50/60 border border-emerald-100 p-2 rounded-lg flex items-center justify-between font-mono">
                    <span>企业获支持案件中的出现率:</span>
                    <strong className="text-emerald-800">{ev.rateInEmployerSupported}% ({ev.appearanceInEmployerSupportedCount}/{ev.employerSupportedDenominator})</strong>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-400">当前样本不足</div>
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
                  {drilldownDescription} (共 {drilldownCases.length} 篇有效案件)
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
                          <div className="truncate">裁判日期: {c.date}</div>
                        </div>

                        {isSelected && (
                          <div className="pt-2 border-t border-slate-200 space-y-2 text-2xs text-slate-700 bg-slate-50/50 p-2.5 rounded-lg mt-2">
                            <div>
                              <span className="text-slate-400">当事人:</span> 劳动者 [{c.employeeParty || '未载明'}] vs 用人单位 [{c.employerParty || '未载明'}]
                            </div>
                            <div>
                              <span className="text-slate-400">诉求条目 ({(Array.isArray(c.claims) ? c.claims.length : 0)}):</span>{' '}
                              {Array.isArray(c.claims) ? c.claims.map((cl) => cl.claimName).join('、') : '无'}
                            </div>
                            <div>
                              <span className="text-slate-400">抗辩事由 ({(Array.isArray(c.employerDefenses) ? c.employerDefenses.length : 0)}):</span>{' '}
                              {Array.isArray(c.employerDefenses) ? c.employerDefenses.map((d) => d.defenseType).join('、') : '无'}
                            </div>
                            <div>
                              <span className="text-slate-400">提取证据 ({(Array.isArray(c.evidence) ? c.evidence.length : 0)}):</span>{' '}
                              {Array.isArray(c.evidence) ? c.evidence.map((e) => e.name).join('、') : '无'}
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
