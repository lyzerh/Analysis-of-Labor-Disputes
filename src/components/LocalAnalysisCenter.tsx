import React, { useState, useEffect, useMemo } from 'react';
import {
  Brain,
  Scale,
  ShieldAlert,
  ShieldCheck,
  FileSpreadsheet,
  Download,
  Printer,
  ChevronRight,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowUpDown,
  BookOpen,
  Eye,
  ExternalLink,
  Layers,
  Sparkles,
  Search,
  FileText,
  PieChart as PieIcon,
  BarChart2,
  TrendingUp,
} from 'lucide-react';
import {
  ArbitrationCase,
  DefenseOutcomeStat,
  DefenseEvidenceComboStat,
  LossReasonStat,
  TfIdfWordItem,
  CooccurrenceCell,
  LocalResearchReport,
} from '../types';
import { db } from '../db';
import { LocalAnalysisService } from '../services/textEngine/LocalAnalysisService';
import { AnalysisWorkerBridge, AnalysisProgress } from '../services/textEngine/analysisWorkerBridge';
import { DISPUTE_RULES } from '../services/textEngine/DisputeElementExtractor';

interface LocalAnalysisCenterProps {
  onSelectCase: (c: ArbitrationCase) => void;
  onNavigateToDatabase: (params: any) => void;
}

export const LocalAnalysisCenter: React.FC<LocalAnalysisCenterProps> = ({
  onSelectCase,
  onNavigateToDatabase,
}) => {
  const [allCases, setAllCases] = useState<ArbitrationCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<'defense' | 'combo' | 'loss' | 'tfidf' | 'report'>('defense');

  // Filters
  const [selectedDispute, setSelectedDispute] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');

  // Drilldown Modal
  const [drilldownCaseIds, setDrilldownCaseIds] = useState<string[] | null>(null);
  const [drilldownTitle, setDrilldownTitle] = useState<string>('');

  // Report state
  const [reportData, setReportData] = useState<LocalResearchReport | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);

  // TF-IDF category filter
  const [tfidfCategory, setTfidfCategory] = useState<string>('all');

  useEffect(() => {
    const loadCases = async () => {
      setLoading(true);
      try {
        const cases = await db.arbitrationCases.toArray();
        setAllCases(cases);
      } catch (err) {
        console.error('Failed to load cases for analysis:', err);
      } finally {
        setLoading(false);
      }
    };
    loadCases();
  }, []);

  // Filtered cases
  const filteredCases = useMemo(() => {
    return allCases.filter((c) => {
      if (selectedYear !== 'all' && String(c.year) !== selectedYear) return false;
      if (selectedDispute !== 'all') {
        const profile = LocalAnalysisService.generateCaseProfile(c);
        if (!profile.disputeTypes.includes(selectedDispute)) return false;
      }
      return true;
    });
  }, [allCases, selectedDispute, selectedYear]);

  // Distinct years
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    allCases.forEach((c) => {
      if (c.year) years.add(String(c.year));
    });
    return Array.from(years).sort().reverse();
  }, [allCases]);

  // Analytics datasets
  const defenseStats = useMemo(() => {
    return LocalAnalysisService.analyzeDefenseOutcomes(filteredCases);
  }, [filteredCases]);

  const comboStats = useMemo(() => {
    return LocalAnalysisService.analyzeDefenseEvidenceCombo(filteredCases);
  }, [filteredCases]);

  const lossStats = useMemo(() => {
    return LocalAnalysisService.analyzeLossReasons(filteredCases);
  }, [filteredCases]);

  const tfidfWords = useMemo(() => {
    const corpus = filteredCases.map((c) => ({
      id: c.id,
      text: `${c.title} ${c.claims.join(' ')} ${c.facts} ${c.tribunalReasoning}`,
    }));
    return LocalAnalysisService.generateResearchReport(filteredCases).topKeywords;
  }, [filteredCases]);

  const cooccurrences = useMemo(() => {
    return LocalAnalysisService.generateResearchReport(filteredCases).topCooccurrences;
  }, [filteredCases]);

  // Handle drilldown cases lookup
  const drilldownCasesList = useMemo(() => {
    if (!drilldownCaseIds) return [];
    const idSet = new Set(drilldownCaseIds);
    return allCases.filter((c) => idSet.has(c.id));
  }, [drilldownCaseIds, allCases]);

  const handleOpenDrilldown = (title: string, caseIds: string[]) => {
    setDrilldownTitle(title);
    setDrilldownCaseIds(caseIds);
  };

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    setProgress({ processed: 0, total: filteredCases.length, stage: '准备启动本地引擎...', percentage: 0 });
    try {
      const rep = await AnalysisWorkerBridge.runReportAsync(
        filteredCases,
        {
          disputeTypeFilter: selectedDispute === 'all' ? '全部争议类型' : selectedDispute,
          yearRange: selectedYear === 'all' ? '全部年份' : `${selectedYear}年`,
        },
        (p) => setProgress(p)
      );
      setReportData(rep);
      setActiveSubTab('report');
    } catch (err) {
      console.error('Failed to generate report:', err);
    } finally {
      setGeneratingReport(false);
      setProgress(null);
    }
  };

  const handleExportMarkdown = () => {
    if (!reportData) return;
    let md = `# 深圳劳动仲裁裁决本地实证研究报告\n\n`;
    md += `> **合规声明**：${reportData.disclaimer}\n\n`;
    md += `- **生成时间**：${reportData.generatedAt}\n`;
    md += `- **样本规模**：${reportData.sampleSize} 个案例\n`;
    md += `- **争议过滤**：${reportData.filterSummary.disputeTypeFilter}\n`;
    md += `- **年份范围**：${reportData.filterSummary.yearRange}\n\n`;

    md += `## 一、裁决结果分布\n\n`;
    for (const [outcome, count] of Object.entries(reportData.outcomeDistribution)) {
      const cnt = Number(count) || 0;
      const rate = ((cnt / (reportData.sampleSize || 1)) * 100).toFixed(1);
      md += `- **${outcome}**：${cnt} 个案例 (${rate}%)\n`;
    }

    md += `\n## 二、企业抗辩策略有利结果比例统计\n\n`;
    md += `| 抗辩策略 | 样本数 | 用人单位结果偏有利 | 结果偏不利/部分支持 | 有利结果比例 | 高频采信证据 |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    for (const def of reportData.defenseOutcomes) {
      md += `| ${def.defenseType} | ${def.totalCount} | ${def.supportedCount} | ${def.unsupportedCount} | ${def.winRate}% | ${def.topEvidence.join(', ') || '无'} |\n`;
    }

    md += `\n## 三、抗辩 × 证据组合胜率分析\n\n`;
    md += `| 策略组合 | 样本数 | 结果偏有利案例数 | 有利结果比例 |\n`;
    md += `| :--- | :--- | :--- | :--- |\n`;
    for (const combo of reportData.comboOutcomes.slice(0, 15)) {
      md += `| ${combo.comboKey} | ${combo.totalCount} | ${combo.supportedCount} | ${combo.winRate}% |\n`;
    }

    md += `\n## 四、用人单位结果不利原因诊断\n\n`;
    for (const lr of reportData.lossReasons) {
      md += `### 1. ${lr.reason} (出现 ${lr.count} 次 / 结果不利案例占比 ${lr.percentage}%)\n`;
      if (lr.involvedDefenses.length > 0) {
        md += `- 涉及主要抗辩：${lr.involvedDefenses.map((d) => `${d.defense}(${d.count}次)`).join(', ')}\n`;
      }
      if (lr.sampleCases.length > 0) {
        md += `- 典型裁判观点摘录：\n`;
        lr.sampleCases.slice(0, 2).forEach((sc) => {
          md += `  > 「${sc.caseNumber}」：${sc.snippet || '说理理由见案卷'}\n`;
        });
      }
      md += `\n`;
    }

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `深圳劳动仲裁本地研究报告_${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Disclaimer & Engine Header */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="w-9 h-9 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400">
                <Brain className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold tracking-tight">
                本地文本分析与裁判实证引擎
              </h2>
              <span className="text-2xs bg-emerald-950 text-emerald-300 border border-emerald-700/60 px-2.5 py-0.5 rounded-full font-mono font-semibold">
                本地规则与统计计算
              </span>
            </div>
            <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
              基于真实仲裁裁决原文构建「法律要素 → 抗辩策略 → 证据链条 → 裁决理由 → 裁判结果」纯规则分析系统。
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              id="btn-generate-report"
              onClick={handleGenerateReport}
              disabled={generatingReport || filteredCases.length === 0}
              className="lawlens-primary-button flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-xl cursor-pointer disabled:bg-slate-200"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{generatingReport ? '计算分析中...' : '一键生成本地研究报告'}</span>
            </button>
          </div>
        </div>

        {/* Disclaimer Bar */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex items-center gap-2 text-2xs text-amber-300/90 font-medium">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-amber-400" />
          <span>免责声明：本地文本分析结果仅用于案例实证研究和客观统计，不构成任何法律意见。</span>
        </div>
      </div>

      {/* Progress Bar (if generating) */}
      {generatingReport && progress && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2 animate-fadeIn">
          <div className="flex items-center justify-between text-xs text-blue-900 font-semibold">
            <span>{progress.stage}</span>
            <span className="font-mono">{progress.percentage}%</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Control Bar: Filters & Sample stats */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>样本筛选:</span>
          </div>

          {/* Dispute Tag Filter */}
          <select
            id="select-dispute-filter"
            value={selectedDispute}
            onChange={(e) => setSelectedDispute(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全部争议类型 (全库)</option>
            {DISPUTE_RULES.map((r) => (
              <option key={r.tag} value={r.tag}>
                {r.tag}
              </option>
            ))}
          </select>

          {/* Year Filter */}
          <select
            id="select-year-filter"
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全部年份</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y} 年
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-600">
          <span>
            当前分析样本：
            <strong className="text-blue-700 font-mono text-sm px-1">
              {filteredCases.length}
            </strong>
            份文书
          </span>
          <span className="text-slate-300">|</span>
          <span>全库总计：{allCases.length} 份</span>
        </div>
      </div>

      {/* Navigation SubTabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          id="tab-defense-outcome"
          onClick={() => setActiveSubTab('defense')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all shrink-0 ${
            activeSubTab === 'defense'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Scale className="w-3.5 h-3.5" />
          <span>抗辩策略与有利结果比例</span>
          <span className="font-mono text-2xs opacity-80">({defenseStats.length})</span>
        </button>

        <button
          id="tab-defense-evidence"
          onClick={() => setActiveSubTab('combo')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all shrink-0 ${
            activeSubTab === 'combo'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>抗辩 × 证据组合效果</span>
          <span className="font-mono text-2xs opacity-80">({comboStats.length})</span>
        </button>

        <button
          id="tab-loss-reasons"
          onClick={() => setActiveSubTab('loss')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all shrink-0 ${
            activeSubTab === 'loss'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>结果不利原因诊断</span>
          <span className="font-mono text-2xs opacity-80">({lossStats.length})</span>
        </button>

        <button
          id="tab-tfidf-words"
          onClick={() => setActiveSubTab('tfidf')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all shrink-0 ${
            activeSubTab === 'tfidf'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>TF-IDF 关键词与共现</span>
        </button>

        <button
          id="tab-full-report"
          onClick={() => {
            if (!reportData) handleGenerateReport();
            else setActiveSubTab('report');
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all shrink-0 ${
            activeSubTab === 'report'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>完整本地研究报告</span>
        </button>
      </div>

      {/* Main Content Area based on Tab */}
      {loading ? (
        <div className="py-20 text-center text-slate-400 text-xs animate-pulse">
          正在载入文书并执行本地多维特征抽取...
        </div>
      ) : filteredCases.length === 0 ? (
        <div className="py-20 text-center text-slate-400 text-xs bg-white rounded-xl border border-slate-200">
          当前筛选条件下暂无裁判文书样本
        </div>
      ) : (
        <>
          {/* TAB 1: 抗辩策略与有利结果比例 */}
          {activeSubTab === 'defense' && (
            <div className="space-y-4">
              <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3.5 flex items-center justify-between text-xs text-blue-900">
                <span>
                  共识别出 <strong>{defenseStats.length}</strong> 类企业抗辩策略。点击任意抗辩卡片可直接
                  <strong>追溯查看全部关联真实案件</strong>。
                </span>
                <span className="text-2xs font-mono text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200">
                  有利结果比例 = 用人单位结果偏有利案例数 / 该抗辩出现案例数
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {defenseStats.map((item) => (
                  <div
                    key={item.defenseType}
                    className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                            <Scale className="w-4 h-4 text-blue-600 shrink-0" />
                            {item.defenseType}
                          </h3>
                          <span className="text-2xs text-slate-400 font-mono">
                            样本出现 {item.totalCount} 个案例
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold font-mono text-blue-700">
                            {item.winRate}%
                          </div>
                          <div className="text-2xs text-slate-500">有利结果比例</div>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="w-full bg-slate-100 rounded-full h-2 mb-3 overflow-hidden">
                        <div
                          className={`h-2 rounded-full ${
                            item.winRate >= 60
                              ? 'bg-emerald-500'
                              : item.winRate >= 40
                              ? 'bg-blue-500'
                              : 'bg-rose-500'
                          }`}
                          style={{ width: `${item.winRate}%` }}
                        />
                      </div>

                      {/* Outcome Breakdown pills */}
                      <div className="grid grid-cols-3 gap-1.5 mb-3 text-2xs font-mono text-center">
                        <div className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded p-1.5">
                          <div>结果偏有利</div>
                          <div className="font-bold">{item.supportedCount}</div>
                        </div>
                        <div className="bg-rose-50 text-rose-700 border border-rose-200 rounded p-1.5">
                          <div>结果偏不利</div>
                          <div className="font-bold">{item.unsupportedCount - item.partialCount}</div>
                        </div>
                        <div className="bg-blue-50 text-blue-700 border border-blue-200 rounded p-1.5">
                          <div>部分支持</div>
                          <div className="font-bold">{item.partialCount}</div>
                        </div>
                      </div>

                      {/* High frequency evidence */}
                      {item.topEvidence.length > 0 && (
                        <div className="mb-2 text-2xs text-slate-500">
                          <span className="font-medium text-slate-700">高频搭配证据：</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {item.topEvidence.map((ev) => (
                              <span
                                key={ev}
                                className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded"
                              >
                                {ev}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Loss reasons */}
                      {item.commonLossReasons.length > 0 && (
                        <div className="text-2xs text-rose-600/80">
                          <span className="font-medium text-rose-700">常见败因：</span>
                          <span>{item.commonLossReasons.join('、')}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <button
                        onClick={() =>
                          handleOpenDrilldown(`抗辩「${item.defenseType}」关联案件`, item.sourceCaseIds)
                        }
                        className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>查看 {item.totalCount} 个溯源案例</span>
                      </button>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: 抗辩 × 证据组合效果 */}
          {activeSubTab === 'combo' && (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between text-xs text-slate-700">
                <span>
                  基于实证计算 <strong>Defense × Evidence × Outcome</strong> 的结果共现，展示不同证据组合与有利结果比例的关联。
                </span>
                <span className="text-2xs text-slate-500">
                  共统计 {comboStats.length} 组有效抗辩证据链
                </span>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-3 px-4">抗辩策略</th>
                        <th className="py-3 px-4">采信证据链组合</th>
                        <th className="py-3 px-4 text-center">样本案件数</th>
                        <th className="py-3 px-4 text-center">用人单位结果偏有利</th>
                        <th className="py-3 px-4 text-center">有利结果比例</th>
                        <th className="py-3 px-4 text-right">溯源查看</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {comboStats.map((combo) => (
                        <tr key={combo.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-800">
                            {combo.defenseType}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {combo.evidenceList.map((ev) => (
                                <span
                                  key={ev}
                                  className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-2xs font-medium"
                                >
                                  {ev}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-medium text-slate-700">
                            {combo.totalCount}
                          </td>
                          <td className="py-3 px-4 text-center font-mono text-emerald-700 font-bold">
                            {combo.supportedCount}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full font-mono font-bold text-2xs ${
                                combo.winRate >= 70
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : combo.winRate >= 40
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {combo.winRate}%
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() =>
                                handleOpenDrilldown(`组合「${combo.comboKey}」关联案例`, combo.sourceCaseIds)
                              }
                              className="text-2xs font-semibold text-blue-600 hover:text-blue-800 underline cursor-pointer"
                            >
                              查看 {combo.totalCount} 个案例
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: 结果不利原因诊断 */}
          {activeSubTab === 'loss' && (
            <div className="space-y-4">
              <div className="bg-rose-50/60 border border-rose-100 rounded-xl p-3.5 flex items-center justify-between text-xs text-rose-900">
                <span>
                  对结果不利及部分支持案例的说理理由进行深度语义扫描，归纳企业核心结果不利原因。
                </span>
                <span className="text-2xs font-mono text-rose-700 bg-white px-2 py-0.5 rounded border border-rose-200">
                  真实说理片段溯源
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {lossStats.map((lr) => (
                  <div
                    key={lr.reason}
                    className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                            <AlertTriangle className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-slate-900">{lr.reason}</h4>
                            <div className="text-2xs text-slate-400 font-mono">
                              发生频次：{lr.count} 次
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-base font-bold font-mono text-rose-600">
                            {lr.percentage}%
                          </div>
                          <div className="text-2xs text-slate-400">结果不利案例占比</div>
                        </div>
                      </div>

                      {/* Involved defenses */}
                      {lr.involvedDefenses.length > 0 && (
                        <div className="mt-3 text-2xs text-slate-600">
                          <span className="font-medium text-slate-700">易发抗辩：</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {lr.involvedDefenses.slice(0, 4).map((d) => (
                              <span
                                key={d.defense}
                                className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded"
                              >
                                {d.defense} ({d.count})
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Sample snippets */}
                      {lr.sampleCases.length > 0 && (
                        <div className="mt-3 bg-slate-50 rounded-lg p-2.5 border border-slate-100 text-2xs text-slate-700 space-y-1.5">
                          <div className="font-semibold text-slate-800">裁判说理摘录：</div>
                          {lr.sampleCases.slice(0, 2).map((sc) => (
                            <div key={sc.caseId} className="text-slate-600 italic">
                              「<strong className="text-slate-800">{sc.caseNumber}</strong>」:{' '}
                              {sc.snippet ? `"...${sc.snippet}..."` : '详见裁决说理'}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <button
                        onClick={() =>
                          handleOpenDrilldown(`结果不利归因「${lr.reason}」关联案例`, lr.sourceCaseIds)
                        }
                        className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>查看 {lr.count} 份真实案卷</span>
                      </button>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: TF-IDF 关键词与共现 */}
          {activeSubTab === 'tfidf' && (
            <div className="space-y-6">
              {/* TF-IDF Keywords */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-blue-600" />
                      语料库 TF-IDF 高区分度关键词 (Top 50)
                    </h3>
                    <p className="text-2xs text-slate-500">
                      通过词频与逆文档频率数学加权，自动剔除文书通用虚词，提取决定案件走向的核心实体。
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {['all', 'defense', 'evidence', 'loss', 'dispute'].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setTfidfCategory(cat)}
                        className={`px-2.5 py-1 rounded text-2xs font-semibold transition-all ${
                          tfidfCategory === cat
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {cat === 'all'
                          ? '全部'
                          : cat === 'defense'
                          ? '抗辩词'
                          : cat === 'evidence'
                          ? '证据词'
                          : cat === 'loss'
                          ? '败因词'
                          : '争议词'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  {tfidfWords
                    .filter((w) => tfidfCategory === 'all' || w.category === tfidfCategory)
                    .map((item) => (
                      <div
                        key={item.word}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 text-xs hover:border-blue-400 hover:bg-blue-50 transition-all"
                      >
                        <span className="font-bold">{item.word}</span>
                        <span className="text-2xs font-mono text-slate-400">
                          TF:{item.totalFreq} | DF:{item.docFreq}
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Cooccurrence Network */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-purple-600" />
                    高频词语语义共现关系 (Co-occurrence Matrix)
                  </h3>
                  <p className="text-2xs text-slate-500">
                    分析抗辩、证据、结果不利原因与裁决结果之间的共同出现频次与相关度 (Jaccard Coefficient)。
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {cooccurrences.slice(0, 24).map((c, i) => (
                    <div
                      key={i}
                      className="border border-slate-200 rounded-lg p-3 hover:border-purple-300 hover:bg-purple-50/30 transition-all text-xs flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5 flex-wrap font-bold text-slate-800">
                          <span className="text-blue-700">{c.wordA}</span>
                          <span className="text-slate-400 font-mono">⟷</span>
                          <span className="text-purple-700">{c.wordB}</span>
                        </div>
                        <span className="text-2xs font-mono font-bold bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded">
                          {c.count} 个案例共现
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-2xs text-slate-500 mt-1">
                        <span>相关度: {c.correlation}</span>
                        <button
                          onClick={() =>
                            handleOpenDrilldown(
                              `共现「${c.wordA} + ${c.wordB}」案件`,
                              c.sourceCaseIds
                            )
                          }
                          className="text-blue-600 hover:underline font-semibold cursor-pointer"
                        >
                          查看案件
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: 完整本地研究报告 */}
          {activeSubTab === 'report' && (
            <div className="space-y-6">
              {reportData ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-8 print:border-none print:shadow-none">
                  {/* Report Header */}
                  <div className="border-b border-slate-200 pb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">
                        深圳劳动人事争议仲裁裁判实证分析
                      </div>
                      <h2 className="text-2xl font-bold text-slate-900">
                        企业法务抗辩实效与裁判要旨实证研究报告
                      </h2>
                      <div className="text-xs text-slate-400 mt-1">
                        生成时间: {reportData.generatedAt} · 分析样本:{' '}
                        <strong className="text-slate-700 font-mono">{reportData.sampleSize}</strong> 个案例
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 print:hidden">
                      <button
                        onClick={handleExportMarkdown}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-blue-600" />
                        <span>导出 Markdown</span>
                      </button>
                      <button
                        onClick={handlePrint}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>打印报告</span>
                      </button>
                    </div>
                  </div>

                  {/* Section 1: 结果与样本分布 */}
                  <div className="space-y-3">
                    <h3 className="text-base font-bold text-slate-900 border-l-3 border-blue-600 pl-2">
                      一、样本裁判结果分布
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {Object.entries(reportData.outcomeDistribution).map(([outcome, count]) => {
                        const cnt = Number(count) || 0;
                        const rate = ((cnt / (reportData.sampleSize || 1)) * 100).toFixed(1);
                        return (
                          <div key={outcome} className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                            <div className="text-xs text-slate-500 font-medium">{outcome}</div>
                            <div className="text-xl font-bold font-mono text-slate-800 mt-1">{cnt} 个案例</div>
                            <div className="text-2xs text-slate-400 font-mono">占比 {rate}%</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Section 2: 抗辩有利结果比例表 */}
                  <div className="space-y-3">
                    <h3 className="text-base font-bold text-slate-900 border-l-3 border-blue-600 pl-2">
                      二、企业抗辩策略有利结果比例与证据实证
                    </h3>
                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                          <tr>
                            <th className="py-2.5 px-3">抗辩策略</th>
                            <th className="py-2.5 px-3 text-center">样本案件数</th>
                            <th className="py-2.5 px-3 text-center">结果偏有利案例数</th>
                            <th className="py-2.5 px-3 text-center">有利结果比例</th>
                            <th className="py-2.5 px-3">高频有效证据</th>
                            <th className="py-2.5 px-3">核心结果不利归因</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {reportData.defenseOutcomes.map((d) => (
                            <tr key={d.defenseType}>
                              <td className="py-2.5 px-3 font-bold text-slate-800">{d.defenseType}</td>
                              <td className="py-2.5 px-3 text-center font-mono">{d.totalCount}</td>
                              <td className="py-2.5 px-3 text-center font-mono text-emerald-700 font-bold">
                                {d.supportedCount}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono font-bold text-blue-700">
                                {d.winRate}%
                              </td>
                              <td className="py-2.5 px-3 text-slate-600">{d.topEvidence.join('、') || '无'}</td>
                              <td className="py-2.5 px-3 text-rose-600">{d.commonLossReasons.join('、') || '无'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Section 3: 结果不利原因归因 */}
                  <div className="space-y-3">
                    <h3 className="text-base font-bold text-slate-900 border-l-3 border-blue-600 pl-2">
                      三、用人单位结果不利核心原因诊断
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {reportData.lossReasons.slice(0, 6).map((lr) => (
                        <div key={lr.reason} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-900 mb-1">
                            <span>{lr.reason}</span>
                            <span className="font-mono text-rose-600">{lr.percentage}% 结果不利案例涉及</span>
                          </div>
                          <p className="text-2xs text-slate-500">
                            典型涉及抗辩: {lr.involvedDefenses.map((d) => d.defense).join('、') || '通用争议'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Section 4: 代表性典型案例 */}
                  <div className="space-y-3">
                    <h3 className="text-base font-bold text-slate-900 border-l-3 border-blue-600 pl-2">
                      四、代表性案卷索引 (支持追溯)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      {reportData.representativeCases.map((rc) => (
                        <div
                          key={rc.caseId}
                          className="border border-slate-200 rounded-xl p-3 flex flex-col justify-between hover:bg-slate-50 cursor-pointer"
                          onClick={() => {
                            const found = allCases.find((c) => c.id === rc.caseId);
                            if (found) onSelectCase(found);
                          }}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="font-bold font-mono text-blue-700">{rc.caseNumber}</span>
                              <span
                                className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${
                                  rc.outcome === '用人单位胜诉'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {rc.outcome}
                              </span>
                            </div>
                            <div className="text-slate-800 font-medium truncate mb-2">{rc.title}</div>
                            <div className="text-2xs text-slate-500 space-y-0.5">
                              <div>抗辩: {rc.defenses.join('、') || '未录入'}</div>
                              <div>证据: {rc.evidence.join('、') || '无'}</div>
                            </div>
                          </div>
                          <div className="mt-2 text-2xs text-blue-600 font-semibold flex items-center gap-1">
                            <span>点击打开文书详情</span>
                            <ChevronRight className="w-3 h-3" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Disclaimer Footer */}
                  <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 text-2xs text-amber-900">
                    <strong>报告声明：</strong>
                    {reportData.disclaimer} 本报告基于本机已保存的公开裁决文书，由本地规则与统计计算生成；如启用 AI 语义分析，相关文本处理遵循当前 AI 配置。
                  </div>
                </div>
              ) : (
                <div className="py-20 text-center text-slate-400 text-xs bg-white rounded-xl border border-slate-200">
                  点击上方「一键生成本地研究报告」启动分析
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Drilldown Modal (溯源真实案件列表) */}
      {drilldownCaseIds && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900">{drilldownTitle}</h3>
                <p className="text-xs text-slate-500">
                  共溯源匹配到 <strong>{drilldownCasesList.length}</strong> 份具体真实案卷
                </p>
              </div>
              <button
                onClick={() => setDrilldownCaseIds(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {drilldownCasesList.map((c) => (
                <div
                  key={c.id}
                  onClick={() => {
                    setDrilldownCaseIds(null);
                    onSelectCase(c);
                  }}
                  className="p-4 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 overflow-hidden">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold font-mono text-blue-700">
                        {c.caseNumber}
                      </span>
                      <span
                        className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${
                          c.decisionOutcome === '用人单位胜诉'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {c.decisionOutcome}
                      </span>
                      {c.publishedDate && (
                        <span className="text-2xs text-slate-400">{c.publishedDate}</span>
                      )}
                    </div>
                    <h4 className="text-sm font-semibold text-slate-800 truncate">{c.title}</h4>
                    <p className="text-2xs text-slate-500 line-clamp-1">
                      {c.facts || '事实查明内容见案卷全文'}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 text-xs font-semibold text-blue-600 shrink-0">
                    <span>查看案卷</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              ))}
            </div>

            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-2xs text-slate-400">
              <span>数据来源：IndexedDB 深圳劳动仲裁研究库</span>
              <button
                onClick={() => setDrilldownCaseIds(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
