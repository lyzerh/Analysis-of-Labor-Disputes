import React, { useState, useEffect } from 'react';
import {
  FileText,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  Code2,
  Layers,
  Database,
  Building,
  Calendar,
  ShieldAlert,
  FileCheck,
  Cpu,
  ChevronRight,
  Sparkles,
  Info,
  Check,
  X,
  Scale,
  UserCheck,
  RefreshCw,
} from 'lucide-react';
import { LaborInfoParsedResult, RawDocument } from '../types';
import { DataService } from '../services/data/dataService';
import { LaborInfoParserAdapter } from '../services/parser/LaborInfoParserAdapter';

export const LaborInfoParserTest: React.FC = () => {
  const [storedDocs, setStoredDocs] = useState<RawDocument[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedResults, setParsedResults] = useState<LaborInfoParsedResult[]>([]);
  const [activeResultIndex, setActiveResultIndex] = useState<number>(0);
  const [viewTab, setViewTab] = useState<'visual' | 'json' | 'arbitrationCase'>('visual');

  // 加载已入库的工劳网案例
  const loadStoredDocs = async () => {
    setIsLoadingDocs(true);
    try {
      const docs = await DataService.getLaborInfoRawDocuments(50);
      setStoredDocs(docs);
      // 默认勾选前 5 份
      if (docs.length > 0) {
        setSelectedDocIds(docs.slice(0, 5).map((d) => d.id));
      }
    } catch (err) {
      console.error('加载已导入案例失败:', err);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  useEffect(() => {
    loadStoredDocs();
  }, []);

  // 切换选中状态
  const toggleDocSelection = (id: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // 快速选前 5 份
  const selectTopFive = () => {
    setSelectedDocIds(storedDocs.slice(0, 5).map((d) => d.id));
  };

  // 执行结构化解析测试
  const handleRunParserTest = () => {
    const targetDocs = storedDocs.filter((d) => selectedDocIds.includes(d.id));
    if (targetDocs.length === 0) return;

    setIsParsing(true);
    setParsedResults([]);
    try {
      const results: LaborInfoParsedResult[] = [];
      for (const doc of targetDocs) {
        const parsed = LaborInfoParserAdapter.parseDetailed(doc);
        results.push(parsed);
      }
      setParsedResults(results);
      setActiveResultIndex(0);
    } catch (err) {
      console.error('执行解析测试失败:', err);
    } finally {
      setIsParsing(false);
    }
  };

  const activeResult: LaborInfoParsedResult | undefined = parsedResults[activeResultIndex];

  // 计算聚合统计指标
  const aggregateStats = parsedResults.length > 0 ? {
    avgDuration: Math.round(parsedResults.reduce((acc, r) => acc + r.parseDurationMs, 0) / parsedResults.length),
    avgCompleteness: Math.round(parsedResults.reduce((acc, r) => acc + r.fieldCompleteness.score, 0) / parsedResults.length),
    totalWords: parsedResults.reduce((acc, r) => acc + r.rawTextLength, 0),
    avgConfidence: Math.round((parsedResults.reduce((acc, r) => acc + r.partyConfidence, 0) / parsedResults.length) * 100),
  } : null;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* 顶部标题与解析测试说明 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                工劳网案例结构化解析测试
                <span className="px-2.5 py-0.5 text-xs font-semibold bg-indigo-100 text-indigo-800 rounded-full font-mono">
                  v1.2 阶段一
                </span>
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                独立解析适配层测试：验证 <code>RawDocument → ArbitrationCase</code> 转换、当事人识别、诉求判定、企业抗辩及四分类结果
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={selectTopFive}
              disabled={storedDocs.length === 0}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              勾选前 5 份案例
            </button>
            <button
              id="btn-run-parser-test"
              onClick={handleRunParserTest}
              disabled={isParsing || selectedDocIds.length === 0}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-300 text-white text-sm font-semibold rounded-xl flex items-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <Play className={`w-4 h-4 ${isParsing ? 'animate-spin' : ''}`} />
              {isParsing ? '正在解析中...' : `开始解析测试 (${selectedDocIds.length}份)`}
            </button>
          </div>
        </div>

        {/* 隔离保护提示 */}
        <div className="mt-4 p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-950 leading-relaxed">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">纯测试环境提示：</span>
            本阶段为<strong>独立的解析质量与字段完整率测试</strong>。完全不触碰现有 <code>ArbitrationCase</code> 统计库、不生成案件结果比例分析、不生成研判报告，仅验证 <code>LaborInfoParserAdapter</code> 的精准提取能力。
          </div>
        </div>
      </div>

      {/* 案例选择器卡片 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-bold text-slate-800">
              从本地 IndexedDB 选取工劳网原始案例 (RawDocument)
            </h2>
            <span className="text-2xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-mono">
              共 {storedDocs.length} 份文书已入库 / 已选 {selectedDocIds.length} 份文书
            </span>
          </div>
          <button
            onClick={loadStoredDocs}
            className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${isLoadingDocs ? 'animate-spin' : ''}`} />
            刷新本地文书
          </button>
        </div>

        {isLoadingDocs ? (
          <div className="py-6 text-center text-xs text-slate-400">
            正在读取本地工劳网 RawDocument...
          </div>
        ) : storedDocs.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-300">
            本地暂无工劳网原始文书。请先进入「工劳网API测试」页面点击「导入测试 5 份案件」入库。
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto p-1">
            {storedDocs.map((doc) => {
              const isSelected = selectedDocIds.includes(doc.id);
              const textLen = doc.rawText?.length || 0;
              return (
                <div
                  key={doc.id}
                  onClick={() => toggleDocSelection(doc.id)}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex items-start gap-2.5 ${
                    isSelected
                      ? 'bg-indigo-50/70 border-indigo-300 text-indigo-950 shadow-2xs'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 pointer-events-none"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate" title={doc.title}>
                      {doc.title}
                    </div>
                    <div className="text-2xs text-slate-500 flex items-center justify-between mt-1 font-mono">
                      <span>ID: {doc.sourceId || doc.id.slice(0, 10)}</span>
                      <span>{textLen.toLocaleString()} 字</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 解析宏观统计看板 (当有解析结果时展示) */}
      {aggregateStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="text-2xs text-slate-500 font-semibold uppercase flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-indigo-500" />
              平均解析耗时
            </div>
            <div className="text-2xl font-bold font-mono text-indigo-600 mt-1">
              {aggregateStats.avgDuration} <span className="text-xs text-slate-400 font-normal">ms/篇</span>
            </div>
            <div className="text-2xs text-emerald-600 font-semibold mt-0.5">本地毫秒级纯规则解析</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="text-2xs text-slate-500 font-semibold uppercase flex items-center gap-1">
              <FileCheck className="w-3.5 h-3.5 text-emerald-500" />
              平均字段完整率
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-600 mt-1">
              {aggregateStats.avgCompleteness}%
            </div>
            <div className="text-2xs text-slate-500 mt-0.5">基础/当事人/争议/诉求/抗辩</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="text-2xs text-slate-500 font-semibold uppercase flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5 text-blue-500" />
              当事人识别置信度
            </div>
            <div className="text-2xl font-bold font-mono text-blue-600 mt-1">
              {aggregateStats.avgConfidence}%
            </div>
            <div className="text-2xs text-slate-500 mt-0.5">避免简单原告/被告误判</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="text-2xs text-slate-500 font-semibold uppercase flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-purple-500" />
              累计解析文本量
            </div>
            <div className="text-2xl font-bold font-mono text-purple-600 mt-1">
              {aggregateStats.totalWords.toLocaleString()} <span className="text-xs text-slate-400 font-normal">字</span>
            </div>
            <div className="text-2xs text-slate-500 mt-0.5">{parsedResults.length} 个案例全部成功转换</div>
          </div>
        </div>
      )}

      {/* 解析结果详细展示与审查区 */}
      {parsedResults.length > 0 && activeResult && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden space-y-0">
          {/* 结果案例切换 Tabs */}
          <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto max-w-2xl py-1">
              {parsedResults.map((res, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveResultIndex(idx)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeResultIndex === idx
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="w-4 h-4 rounded-full bg-white/20 text-2xs flex items-center justify-center font-mono">
                    {idx + 1}
                  </span>
                  <span className="max-w-[120px] truncate">{res.caseTitle}</span>
                  <span className={`text-2xs px-1 rounded ${
                    res.fieldCompleteness.score >= 80 ? 'bg-emerald-500/20 text-emerald-100' : 'bg-amber-500/20 text-amber-100'
                  }`}>
                    {res.fieldCompleteness.score}%
                  </span>
                </button>
              ))}
            </div>

            {/* 切换展示视图 (可视化卡片 / JSON / 标准 ArbitrationCase) */}
            <div className="flex items-center bg-slate-200/70 p-1 rounded-lg text-xs">
              <button
                onClick={() => setViewTab('visual')}
                className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  viewTab === 'visual' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                结构化可视化
              </button>
              <button
                onClick={() => setViewTab('arbitrationCase')}
                className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  viewTab === 'arbitrationCase' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ArbitrationCase 对象
              </button>
              <button
                onClick={() => setViewTab('json')}
                className={`px-3 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  viewTab === 'json' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                解析结果 JSON
              </button>
            </div>
          </div>

          {/* Tab 1: 结构化可视化审查 */}
          {viewTab === 'visual' && (
            <div className="p-6 space-y-6">
              {/* 核心指标条：原文长度 / 耗时 / 完整率 */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center gap-4 flex-wrap">
                  <div>
                    <span className="text-2xs text-slate-500 block uppercase">原文长度</span>
                    <span className="text-sm font-bold font-mono text-slate-900">
                      {activeResult.rawTextLength.toLocaleString()} 字
                    </span>
                  </div>
                  <div className="h-6 w-px bg-slate-200 hidden sm:block" />
                  <div>
                    <span className="text-2xs text-slate-500 block uppercase">解析耗时</span>
                    <span className="text-sm font-bold font-mono text-indigo-600">
                      {activeResult.parseDurationMs} ms
                    </span>
                  </div>
                  <div className="h-6 w-px bg-slate-200 hidden sm:block" />
                  <div>
                    <span className="text-2xs text-slate-500 block uppercase">字段完整率</span>
                    <span className="text-sm font-bold font-mono text-emerald-600">
                      {activeResult.fieldCompleteness.score}% ({activeResult.fieldCompleteness.filledFields}/{activeResult.fieldCompleteness.totalFields}项)
                    </span>
                  </div>
                </div>

                {/* 结果倾向标签 */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">裁判结果倾向:</span>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    activeResult.overallResult === 'supported'
                      ? 'bg-emerald-100 text-emerald-800'
                      : activeResult.overallResult === 'partially_supported'
                      ? 'bg-amber-100 text-amber-800'
                      : activeResult.overallResult === 'not_supported'
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-slate-100 text-slate-700'
                  }`}>
                    {activeResult.overallResult === 'supported'
                       ? '获得支持'
                      : activeResult.overallResult === 'partially_supported'
                       ? '部分支持'
                      : activeResult.overallResult === 'not_supported'
                       ? '未获支持'
                       : '结果不明确'}
                  </span>
                </div>
              </div>

              {/* 模块 1: 基础信息 (caseTitle, court, date, caseLevel, province, city, caseNumber) */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5 text-indigo-600" />
                  一、基础信息解析 (Base Info)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl sm:col-span-2">
                    <div className="text-2xs text-slate-400 font-semibold">案例文书标题 (caseTitle)</div>
                    <div className="text-xs font-bold text-slate-800 mt-1 truncate" title={activeResult.caseTitle}>
                      {activeResult.caseTitle}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="text-2xs text-slate-400 font-semibold">审理法院 (court)</div>
                    <div className="text-xs font-bold text-slate-800 mt-1 truncate" title={activeResult.court}>
                      {activeResult.court || '-'}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="text-2xs text-slate-400 font-semibold">裁判日期 (date)</div>
                    <div className="text-xs font-bold font-mono text-slate-800 mt-1">
                      {activeResult.date || '-'}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="text-2xs text-slate-400 font-semibold">审判层级 (caseLevel)</div>
                    <div className="text-xs font-bold font-mono text-blue-700 mt-1">
                      {activeResult.caseLevel || '-'}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="text-2xs text-slate-400 font-semibold">地域 (province / city)</div>
                    <div className="text-xs font-bold text-slate-800 mt-1">
                      {activeResult.province} {activeResult.city}
                    </div>
                  </div>
                </div>
              </div>

              {/* 模块 2: 当事人识别 (employeeParty, employerParty, confidence) */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                  二、当事人角色识别 (Parties Recognition - 基于语义与组织特征)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl">
                    <div className="text-2xs text-blue-600 font-semibold uppercase">劳动者方 (employeeParty)</div>
                    <div className="text-sm font-bold text-blue-950 mt-1">
                      {activeResult.employeeParty || <span className="text-slate-400 font-normal">null (无法确定)</span>}
                    </div>
                  </div>

                  <div className="p-3.5 bg-purple-50/70 border border-purple-200 rounded-xl">
                    <div className="text-2xs text-purple-600 font-semibold uppercase">用人单位方 (employerParty)</div>
                    <div className="text-sm font-bold text-purple-950 mt-1 truncate" title={activeResult.employerParty || ''}>
                      {activeResult.employerParty || <span className="text-slate-400 font-normal">null (无法确定)</span>}
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                    <div>
                      <div className="text-2xs text-slate-500 font-semibold uppercase">识别置信度 (confidence)</div>
                      <div className="text-sm font-bold font-mono text-slate-800 mt-1">
                        {(activeResult.partyConfidence * 100).toFixed(0)}%
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-2xs font-semibold ${
                      activeResult.partyConfidence >= 0.8 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {activeResult.partyConfidence >= 0.8 ? '高置信度' : '中等置信度'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 模块 3: 争议类型 (disputeType) */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-600" />
                  三、争议类型标签识别 (disputeType)
                </h3>
                <div className="flex flex-wrap gap-2 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                  {activeResult.disputeType.map((dt) => (
                    <span
                      key={dt}
                      className="px-3 py-1 bg-white border border-indigo-200 text-indigo-800 rounded-lg text-xs font-semibold shadow-2xs"
                    >
                      {dt}
                    </span>
                  ))}
                </div>
              </div>

              {/* 模块 4: 诉求解析清单 (claims[]) */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-emerald-600" />
                  四、诉求与支持状态解析 (claims[])
                </h3>
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-3.5 py-2.5">诉求名称 (claimName)</th>
                        <th className="px-3.5 py-2.5">提出方 (claimant)</th>
                        <th className="px-3.5 py-2.5 text-right">支持状态 (supportStatus)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {activeResult.claims.map((c, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3.5 py-2.5 font-medium text-slate-900">{c.claimName}</td>
                          <td className="px-3.5 py-2.5 font-mono text-2xs">
                            <span className={`px-2 py-0.5 rounded ${
                              c.claimant === 'employee' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                            }`}>
                              {c.claimant === 'employee' ? '劳动者 (employee)' : '用人单位 (employer)'}
                            </span>
                          </td>
                          <td className="px-3.5 py-2.5 text-right">
                            <span className={`px-2.5 py-0.5 rounded-full text-2xs font-semibold ${
                              c.supportStatus === 'supported'
                                ? 'bg-emerald-100 text-emerald-800'
                                : c.supportStatus === 'partially_supported'
                                ? 'bg-amber-100 text-amber-800'
                                : c.supportStatus === 'not_supported'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {c.supportStatus === 'supported' ? '✅ 获得支持' : c.supportStatus === 'partially_supported' ? '⚖️ 部分支持' : c.supportStatus === 'not_supported' ? '❌ 未获支持' : '❓ 结果不明确'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 模块 5 & 6: 企业抗辩 (employerDefenses) 与 证据识别 (evidence) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 企业抗辩 */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                    五、企业抗辩理由识别 (employerDefenses)
                  </h3>
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 min-h-[120px]">
                    {activeResult.employerDefenses.length > 0 ? (
                      activeResult.employerDefenses.map((d, i) => (
                        <div key={i} className="p-2 bg-white border border-rose-100 rounded-lg text-xs">
                          <div className="font-bold text-rose-900 flex items-center justify-between">
                            <span>{d.defenseType}</span>
                            <span className="text-2xs font-mono text-slate-400">置信度: {(d.confidence * 100).toFixed(0)}%</span>
                          </div>
                          <div className="text-2xs text-slate-500 mt-1 font-mono bg-slate-50 p-1.5 rounded">
                            匹配片段: "{d.matchedText}"
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-slate-400 py-4 text-center">未提取到典型企业抗辩特征词</div>
                    )}
                  </div>
                </div>

                {/* 证据识别 */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <FileCheck className="w-3.5 h-3.5 text-indigo-600" />
                    六、关键证据识别 (evidence)
                  </h3>
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 min-h-[120px]">
                    {activeResult.evidence.length > 0 ? (
                      activeResult.evidence.map((e, i) => (
                        <div key={i} className="p-2 bg-white border border-indigo-100 rounded-lg text-xs">
                          <div className="font-bold text-indigo-950 flex items-center justify-between">
                            <span>{e.name}</span>
                            <span className="text-2xs font-mono text-slate-400">置信度: {(e.confidence * 100).toFixed(0)}%</span>
                          </div>
                          <div className="text-2xs text-slate-500 mt-1 font-mono bg-slate-50 p-1.5 rounded truncate">
                            匹配依据: "{e.matchedText}"
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-slate-400 py-4 text-center">未提取到典型物证书证名称</div>
                    )}
                  </div>
                </div>
              </div>

              {/* 模块 7: 裁判理由与法理要点 (courtReasoning & keyLegalPoints) */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  七、裁判理由与核心要点 (courtReasoning & keyLegalPoints)
                </h3>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  {/* 法理要点 */}
                  <div className="space-y-1.5">
                    <div className="text-2xs font-semibold text-slate-500 uppercase">提炼核心要点:</div>
                    <div className="space-y-1">
                      {activeResult.keyLegalPoints.map((pt, i) => (
                        <div key={i} className="text-xs text-slate-800 bg-white p-2 border border-slate-200 rounded-lg flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0 mt-1.5" />
                          <span>{pt}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 裁判说理原文 */}
                  <div>
                    <div className="text-2xs font-semibold text-slate-500 uppercase mb-1">裁判理由正文片段 (courtReasoning):</div>
                    <div className="p-3 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap font-sans">
                      {activeResult.courtReasoning || '（未识别到独立说理段落）'}
                    </div>
                  </div>
                </div>
              </div>

              {/* 模块 8: 结果四分类判定 (employeeOutcome, employerOutcome, overallResult) */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-purple-600" />
                  八、结果四分类判定 (Outcomes - 严禁根据标题猜测)
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-center">
                    <div className="text-2xs text-slate-500 font-semibold uppercase">劳动者结果 (employeeOutcome)</div>
                    <div className="text-sm font-bold mt-1 font-mono text-slate-900">
                      {activeResult.employeeOutcome}
                    </div>
                  </div>
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-center">
                    <div className="text-2xs text-slate-500 font-semibold uppercase">用人单位结果 (employerOutcome)</div>
                    <div className="text-sm font-bold mt-1 font-mono text-slate-900">
                      {activeResult.employerOutcome}
                    </div>
                  </div>
                  <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl text-center">
                    <div className="text-2xs text-indigo-600 font-semibold uppercase">综合结果 (overallResult)</div>
                    <div className="text-sm font-bold mt-1 font-mono text-indigo-950">
                      {activeResult.overallResult}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: 标准 ArbitrationCase 对象展示 */}
          {viewTab === 'arbitrationCase' && (
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>转换后的标准系统级 <code>ArbitrationCase</code> 实体对象：</span>
                <span className="font-mono text-indigo-600 font-bold">
                  Quality Score: {activeResult.arbitrationCase.parseQuality.overall}/100 ({activeResult.arbitrationCase.parseStatus})
                </span>
              </div>
              <pre className="p-4 bg-slate-900 rounded-xl text-slate-200 text-xs font-mono overflow-x-auto max-h-[600px] select-text leading-relaxed">
                {JSON.stringify(activeResult.arbitrationCase, null, 2)}
              </pre>
            </div>
          )}

          {/* Tab 3: 完整 LaborInfoParsedResult JSON */}
          {viewTab === 'json' && (
            <div className="p-6 space-y-4">
              <div className="text-xs text-slate-500">
                包含诊断性能、字段完整度判定及中间提炼结果的完整 JSON 报文：
              </div>
              <pre className="p-4 bg-slate-900 rounded-xl text-slate-200 text-xs font-mono overflow-x-auto max-h-[600px] select-text leading-relaxed">
                {JSON.stringify(activeResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
