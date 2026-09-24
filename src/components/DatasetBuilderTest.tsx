import { LaborAnalysisPipeline } from "../services/data/LaborAnalysisPipeline";
import React, { useState, useEffect, useMemo } from 'react';
import {
  Layers,
  Database,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  Building2,
  MapPin,
  Tag,
  ShieldCheck,
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
  Building,
  ShieldAlert,
  FileText,
  HelpCircle,
  BarChart3,
} from 'lucide-react';
import {
  RawDocument,
  AnalysisCaseRecord,
  DatasetBuildSummary,
  ReviewStatus,
  LegalOutcomeType,
} from '../types';
import { DataService } from '../services/data/dataService';
import { ReviewStorageService } from '../services/data/ReviewStorageService';
import { LaborCaseDatasetBuilder, PRD_CITIES } from '../services/dataset/LaborCaseDatasetBuilder';

export const DatasetBuilderTest: React.FC = () => {
  const [rawDocs, setRawDocs] = useState<RawDocument[]>([]);
  const [records, setRecords] = useState<AnalysisCaseRecord[]>([]);
  const [summary, setSummary] = useState<DatasetBuildSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 筛选与检索状态
  const [filterSet, setFilterSet] = useState<'all' | 'included' | 'pending'>('all');
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [selectedDisputeType, setSelectedDisputeType] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [activeRecord, setActiveRecord] = useState<AnalysisCaseRecord | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 加载数据并执行构建
  const loadAndBuildDataset = async () => {
    setIsLoading(true);
    try {
      const allDocs = await DataService.getLaborInfoRawDocuments(100);
      setRawDocs(allDocs);
      
      // 全局强制重新解析以应用最新的 Parser
      const pipelineResult = await LaborAnalysisPipeline.runPipeline({ forceReparse: true });
      
      const buildResult = LaborCaseDatasetBuilder.buildDataset(allDocs, ReviewStorageService.getAllReviews());
      setRecords(pipelineResult.records);
      setSummary(buildResult.summary);

      if (pipelineResult.records.length > 0) {
        setActiveRecord(pipelineResult.records[0]);
      }
    } catch (err) {
      console.error('构建数据集失败:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAndBuildDataset();
  }, []);

  // 复制 JSON 数据
  const handleCopyJson = (record: AnalysisCaseRecord) => {
    navigator.clipboard.writeText(JSON.stringify(record, null, 2));
    setCopiedId(record.caseId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 过滤后的案件列表
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // 1. 集别过滤 (分析集 vs 待优化池)
      if (filterSet === 'included' && !r.isIncludedInAnalysisSet) return false;
      if (filterSet === 'pending' && r.isIncludedInAnalysisSet) return false;

      // 2. 城市过滤
      if (selectedCity !== 'all' && r.city !== selectedCity) return false;

      // 3. 争议类型过滤
      if (selectedDisputeType !== 'all' && !r.disputeType.includes(selectedDisputeType)) return false;

      // 4. 关键词搜索
      if (searchKeyword.trim()) {
        const kw = searchKeyword.toLowerCase();
        const matchTitle = r.title.toLowerCase().includes(kw);
        const matchCourt = r.court.toLowerCase().includes(kw);
        const matchEmployee = r.employeeParty?.toLowerCase().includes(kw) || false;
        const matchEmployer = r.employerParty?.toLowerCase().includes(kw) || false;
        const matchClaims = r.claims.some((c) => c.claimName.toLowerCase().includes(kw));
        const matchDefenses = r.employerDefenses.some((d) => d.defenseType.toLowerCase().includes(kw));

        if (!matchTitle && !matchCourt && !matchEmployee && !matchEmployer && !matchClaims && !matchDefenses) {
          return false;
        }
      }

      return true;
    });
  }, [records, filterSet, selectedCity, selectedDisputeType, searchKeyword]);

  // 所有涉及的城市清单
  const availableCities = useMemo(() => {
    if (!summary) return [];
    return Object.keys(summary.cityDistribution).sort((a, b) => {
      return (summary.cityDistribution[b] || 0) - (summary.cityDistribution[a] || 0);
    });
  }, [summary]);

  // 所有涉及的争议类型清单
  const availableDisputeTypes = useMemo(() => {
    if (!summary) return [];
    return Object.keys(summary.disputeTypeDistribution).sort((a, b) => {
      return (summary.disputeTypeDistribution[b] || 0) - (summary.disputeTypeDistribution[a] || 0);
    });
  }, [summary]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* 顶部标题与说明 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                广深莞劳动争议分析数据集构建
                <span className="px-2.5 py-0.5 text-xs font-semibold bg-indigo-100 text-indigo-800 rounded-full font-mono">
                  v1.3 阶段一
                </span>
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                融合 RawDocument + 结构化解析 + 人工校验记录，自动构建标准 AnalysisCaseRecord 并执行质量分级准入
              </p>
            </div>
          </div>

          <button
            onClick={loadAndBuildDataset}
            disabled={isLoading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors cursor-pointer self-start md:self-auto shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            重新构建数据集
          </button>
        </div>

        {/* 零污染原则与过滤规则说明条 */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2.5 text-slate-700">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-900">零污染架构原则：</span>
              不改动 <code>RawDocument</code> 原始文书、<code>ArbitrationCase</code> 初始解析、<code>ParserEvaluator</code> 与 <code>ReviewStorage</code>，在内存中纯函数式合成 <code>AnalysisCaseRecord</code>。
            </div>
          </div>

          <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl flex items-start gap-2.5 text-indigo-950">
            <Filter className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">数据集准入过滤规则：</span>
              默认仅当<strong>人工已核准</strong>或<strong>解析质量达到 80 分</strong>时进入正式分析集；其余低分未审案件自动归入<strong>待优化池</strong>。
            </div>
          </div>
        </div>
      </div>

      {/* 核心构建指标看板 (4 项主要指标) */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {/* 1. 原始文书总量 */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="text-2xs text-slate-500 font-semibold uppercase flex items-center gap-1">
              <Database className="w-3.5 h-3.5 text-slate-400" />
              原始文书总量 (RawDocument)
            </div>
            <div className="text-2xl font-bold font-mono text-slate-800 mt-1">
              {summary.totalRawDocs}
            </div>
            <div className="text-2xs text-slate-400 mt-0.5">工劳网及本地导入文书</div>
          </div>

          {/* 2. 成功转换数量 */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="text-2xs text-slate-500 font-semibold uppercase flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              成功转换记录 (Converted)
            </div>
            <div className="text-2xl font-bold font-mono text-indigo-600 mt-1">
              {summary.totalConverted}
            </div>
            <div className="text-2xs text-slate-400 mt-0.5">转换率 100% (标准模式)</div>
          </div>

          {/* 3. 进入正式分析集数量 */}
          <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4 shadow-sm">
            <div className="text-2xs text-emerald-800 font-semibold uppercase flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              进入正式分析集 (Quality ≥ 80 / Approved)
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">
              {summary.includedInAnalysisSetCount}{' '}
              <span className="text-xs font-normal text-emerald-600">({summary.filterRate}%)</span>
            </div>
            <div className="text-2xs text-emerald-700 mt-0.5">达标高质量或人工核准案例</div>
          </div>

          {/* 4. 待优化池数量 */}
          <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-4 shadow-sm">
            <div className="text-2xs text-amber-800 font-semibold uppercase flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              待优化池 (Pending Optimization)
            </div>
            <div className="text-2xl font-bold font-mono text-amber-700 mt-1">
              {summary.pendingOptimizationCount}{' '}
              <span className="text-xs font-normal text-amber-600">
                ({summary.totalConverted > 0 ? (100 - summary.filterRate).toFixed(1) : 0}%)
              </span>
            </div>
            <div className="text-2xs text-amber-700 mt-0.5">评分低于 80 分且未人工核准</div>
          </div>
        </div>
      )}

      {/* 分布统计面板 (质量分布、城市分布、争议类型分布) */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 1. 质量分布 */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                质量与审核分布
              </h3>
              <span className="text-2xs text-slate-400 font-mono">
                平均准入: {summary.filterRate}%
              </span>
            </div>

            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-2xs mb-1">
                  <span className="text-slate-600 font-medium">90 - 100 分 (极佳质量)</span>
                  <span className="font-mono font-bold text-emerald-600">{summary.qualityDistribution.range90_100} 个案例</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${(summary.qualityDistribution.range90_100 / (summary.totalConverted || 1)) * 100}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-2xs mb-1">
                  <span className="text-slate-600 font-medium">80 - 89 分 (良好达标)</span>
                  <span className="font-mono font-bold text-blue-600">{summary.qualityDistribution.range80_89} 个案例</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${(summary.qualityDistribution.range80_89 / (summary.totalConverted || 1)) * 100}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-2xs mb-1">
                  <span className="text-slate-600 font-medium">60 - 79 分 (待优化)</span>
                  <span className="font-mono font-bold text-amber-600">{summary.qualityDistribution.range60_79} 个案例</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full"
                    style={{ width: `${(summary.qualityDistribution.range60_79 / (summary.totalConverted || 1)) * 100}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-2xs mb-1">
                  <span className="text-slate-600 font-medium">&lt; 60 分 (低完整度)</span>
                  <span className="font-mono font-bold text-rose-600">{summary.qualityDistribution.rangeBelow60} 个案例</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-rose-500 rounded-full"
                    style={{ width: `${(summary.qualityDistribution.rangeBelow60 / (summary.totalConverted || 1)) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-2xs text-slate-500">
              <span>人工已核准: <strong className="text-emerald-700">{summary.qualityDistribution.approvedCount}</strong></span>
              <span>已修订: <strong className="text-blue-700">{summary.qualityDistribution.modifiedCount}</strong></span>
              <span>待核验: <strong className="text-slate-700">{summary.qualityDistribution.pendingReviewCount}</strong></span>
            </div>
          </div>

          {/* 2. 城市分布 (聚焦广深莞) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-indigo-600" />
                城市归属分布 (核心三市)
              </h3>
              <span className="text-2xs text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded-full">
                广深莞: {summary.prdCount} 个案例
              </span>
            </div>

            <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
              {availableCities.map((city) => {
                const count = summary.cityDistribution[city] || 0;
                const percent = Math.round((count / (summary.totalConverted || 1)) * 100);
                const isPRD = PRD_CITIES.some((p) => p.name === city);

                return (
                  <div
                    key={city}
                    onClick={() => setSelectedCity(selectedCity === city ? 'all' : city)}
                    className={`p-2 rounded-xl border flex items-center justify-between text-xs cursor-pointer transition-all ${
                      selectedCity === city
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-semibold'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${isPRD ? 'bg-indigo-500' : 'bg-slate-400'}`} />
                      <span>{city}</span>
                      {isPRD && <span className="text-3xs text-indigo-600 bg-indigo-100 px-1 py-0.2 rounded">PRD</span>}
                    </div>
                    <div className="flex items-center gap-2 font-mono text-2xs">
                      <span>{count} 个案例</span>
                      <span className="text-slate-400">({percent}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-100 text-3xs text-slate-400 flex items-center justify-between">
              <span>广深莞覆盖: <strong>{Math.round((summary.prdCount / (summary.totalConverted || 1)) * 100)}%</strong></span>
              <span>点击城市卡片快速筛选明细</span>
            </div>
          </div>

          {/* 3. 争议类型分布 */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-purple-600" />
                争议类型分布
              </h3>
              <span className="text-2xs text-slate-400 font-mono">
                {availableDisputeTypes.length} 个分类标签
              </span>
            </div>

            <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
              {availableDisputeTypes.map((type) => {
                const count = summary.disputeTypeDistribution[type] || 0;
                const percent = Math.round((count / (summary.totalConverted || 1)) * 100);

                return (
                  <div
                    key={type}
                    onClick={() => setSelectedDisputeType(selectedDisputeType === type ? 'all' : type)}
                    className={`p-2 rounded-xl border flex items-center justify-between text-xs cursor-pointer transition-all ${
                      selectedDisputeType === type
                        ? 'bg-purple-50 border-purple-300 text-purple-900 font-semibold'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="truncate pr-2">{type}</div>
                    <div className="flex items-center gap-2 font-mono text-2xs shrink-0">
                      <span>{count} 个案例</span>
                      <span className="text-slate-400">({percent}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-100 text-3xs text-slate-400 flex items-center justify-between">
              <span>多标签结构化映射</span>
              <span>点击类型卡片快速过滤</span>
            </div>
          </div>
        </div>
      )}

      {/* 数据集明细探索器 (Explorer) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
        {/* 筛选与搜索工具栏 */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* 集别切换 */}
            <div className="p-1 bg-slate-100 rounded-xl flex items-center gap-1 text-xs">
              <button
                onClick={() => setFilterSet('all')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  filterSet === 'all' ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                全部案件 ({records.length})
              </button>
              <button
                onClick={() => setFilterSet('included')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  filterSet === 'included' ? 'bg-white text-emerald-700 shadow-2xs font-semibold' : 'text-slate-600 hover:text-emerald-700'
                }`}
              >
                ✅ 正式分析集 ({summary?.includedInAnalysisSetCount ?? 0})
              </button>
              <button
                onClick={() => setFilterSet('pending')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  filterSet === 'pending' ? 'bg-white text-amber-700 shadow-2xs font-semibold' : 'text-slate-600 hover:text-amber-700'
                }`}
              >
                ⏳ 待优化池 ({summary?.pendingOptimizationCount ?? 0})
              </button>
            </div>

            {/* 城市重置 */}
            {selectedCity !== 'all' && (
              <span className="px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-xs flex items-center gap-1">
                城市: {selectedCity}
                <X className="w-3 h-3 cursor-pointer" onClick={() => setSelectedCity('all')} />
              </span>
            )}

            {/* 争议类型重置 */}
            {selectedDisputeType !== 'all' && (
              <span className="px-2.5 py-1 bg-purple-50 border border-purple-200 text-purple-700 rounded-lg text-xs flex items-center gap-1">
                类型: {selectedDisputeType}
                <X className="w-3 h-3 cursor-pointer" onClick={() => setSelectedDisputeType('all')} />
              </span>
            )}
          </div>

          {/* 搜索框 */}
          <div className="relative w-full md:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="搜索案号、当事人、法院、诉求..."
              className="w-full pl-8 pr-8 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
            />
            {searchKeyword && (
              <button
                onClick={() => setSearchKeyword('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 案件记录列表与卡片 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* 左侧：案件列表 (7 栏) */}
          <div className="lg:col-span-7 space-y-3 max-h-[720px] overflow-y-auto pr-1">
            {filteredRecords.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                未检索到符合条件的分析集记录
              </div>
            ) : (
              filteredRecords.map((r, idx) => {
                const isSelected = activeRecord?.caseId === r.caseId;

                return (
                  <div
                    key={r.caseId}
                    onClick={() => setActiveRecord(r)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer text-xs space-y-2.5 ${
                      isSelected
                        ? 'bg-indigo-50/70 border-indigo-500 shadow-sm ring-1 ring-indigo-500'
                        : 'bg-white hover:bg-slate-50/80 border-slate-200 text-slate-700'
                    }`}
                  >
                    {/* 头部状态与标签 */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded text-2xs font-bold font-mono ${
                          r.isIncludedInAnalysisSet
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {r.isIncludedInAnalysisSet ? '✅ 正式分析集' : '⏳ 待优化池'}
                        </span>
                        <span className="px-2 py-0.5 rounded text-2xs font-semibold bg-slate-100 text-slate-700 font-mono">
                          {r.city}
                        </span>
                        {r.year && (
                          <span className="px-1.5 py-0.5 rounded text-2xs text-slate-500 font-mono">
                            {r.year}年
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className={`text-2xs font-mono font-bold px-2 py-0.5 rounded ${
                          r.parserScore >= 85
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : r.parserScore >= 70
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {r.parserScore}分
                        </span>
                        <span className={`text-3xs px-1.5 py-0.5 rounded ${
                          r.reviewStatus === 'approved'
                            ? 'bg-emerald-100 text-emerald-800'
                            : r.reviewStatus === 'modified'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {r.reviewStatus === 'approved' ? '已核准' : r.reviewStatus === 'modified' ? '已修改' : '未审核'}
                        </span>
                      </div>
                    </div>

                    {/* 标题 */}
                    <h4 className="font-bold text-slate-900 line-clamp-1 text-xs">
                      {r.title}
                    </h4>

                    {/* 当事人与审理法院 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-2xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <div className="truncate">
                        <span className="text-slate-400">劳动者:</span> <strong>{r.employeeParty || '未载明'}</strong>
                      </div>
                      <div className="truncate">
                        <span className="text-slate-400">用人单位:</span> <strong>{r.employerParty || '未载明'}</strong>
                      </div>
                    </div>

                    {/* 诉求与抗辩概要 */}
                    <div className="flex items-center justify-between text-2xs text-slate-500 pt-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>诉求 ({r.claims.length} 项)</span>
                        <span>•</span>
                        <span>抗辩 ({r.employerDefenses.length} 项)</span>
                        <span>•</span>
                        <span>证据 ({r.evidence.length} 项)</span>
                      </div>
                      <div className="text-2xs font-semibold text-indigo-600">
                         {r.overallResult === 'supported' ? '获得支持' : r.overallResult === 'not_supported' ? '未获支持' : r.overallResult === 'partially_supported' ? '部分支持' : '结果不明确'}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* 右侧：单条 AnalysisCaseRecord 详情检视器 (5 栏) */}
          <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 max-h-[720px] overflow-y-auto">
            {activeRecord ? (
              <div className="space-y-4 text-xs">
                {/* 详情顶栏 */}
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-indigo-600" />
                    <h3 className="font-bold text-slate-900">标准 AnalysisCaseRecord 检视</h3>
                  </div>

                  <button
                    onClick={() => handleCopyJson(activeRecord)}
                    className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-2xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    {copiedId === activeRecord.caseId ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        已复制
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        复制完整 JSON
                      </>
                    )}
                  </button>
                </div>

                {/* 准入判定理由 */}
                <div className={`p-3 rounded-xl border text-2xs ${
                  activeRecord.isIncludedInAnalysisSet
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    : 'bg-amber-50 border-amber-200 text-amber-950'
                }`}>
                  <div className="font-bold flex items-center gap-1 mb-0.5">
                    {activeRecord.isIncludedInAnalysisSet ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    )}
                    {activeRecord.isIncludedInAnalysisSet ? '已进入正式分析集' : '归入待优化池'}
                  </div>
                  <div>理由: {activeRecord.filterReason}</div>
                </div>

                {/* 1. 基础信息 (Base) */}
                <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <div className="font-bold text-slate-800 text-2xs uppercase text-slate-500">
                    一、基础元数据 (Base Info)
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-2xs">
                    <div><span className="text-slate-400">Case ID:</span> <span className="font-mono">{activeRecord.caseId}</span></div>
                    <div><span className="text-slate-400">数据源:</span> {activeRecord.source}</div>
                    <div><span className="text-slate-400">归属城市:</span> <strong>{activeRecord.city}</strong> {activeRecord.isPRD ? '(广深莞)' : ''}</div>
                    <div><span className="text-slate-400">裁判年份:</span> {activeRecord.year ? `${activeRecord.year} 年` : '未明'}</div>
                    <div className="col-span-2 truncate"><span className="text-slate-400">审理机构:</span> {activeRecord.court}</div>
                    <div className="col-span-2 truncate"><span className="text-slate-400">裁判日期:</span> {activeRecord.date}</div>
                  </div>
                </div>

                {/* 2. 当事人主体 (Parties) */}
                <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <div className="font-bold text-slate-800 text-2xs uppercase text-slate-500">
                    二、当事人主体 (Parties)
                  </div>
                  <div className="space-y-1 text-2xs">
                    <div>
                      <span className="text-slate-400">劳动者 (employeeParty):</span>{' '}
                      <strong className="text-slate-800">{activeRecord.employeeParty || '未识别'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">用人单位 (employerParty):</span>{' '}
                      <strong className="text-slate-800">{activeRecord.employerParty || '未识别'}</strong>
                    </div>
                  </div>
                </div>

                {/* 3. 诉求与裁判结果 (Claims & Outcomes) */}
                <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-2xs font-bold uppercase text-slate-500">
                    <span>三、诉求与判定 (Claims & Outcomes)</span>
                    <span className="text-indigo-600 font-mono">
                      综合: {activeRecord.overallResult}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {activeRecord.claims.map((c, i) => (
                      <div key={i} className="p-2 bg-slate-50 rounded-lg border border-slate-200 text-2xs flex items-center justify-between">
                        <span className="truncate pr-2 font-medium">{c.claimName}</span>
                        <span className={`px-2 py-0.5 rounded text-3xs font-semibold ${
                          c.supportStatus === 'supported'
                            ? 'bg-emerald-100 text-emerald-800'
                            : c.supportStatus === 'partially_supported'
                            ? 'bg-amber-100 text-amber-800'
                            : c.supportStatus === 'not_supported'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}>
                          {c.supportStatus === 'supported' ? '获得支持' : c.supportStatus === 'partially_supported' ? '部分支持' : c.supportStatus === 'not_supported' ? '未获支持' : '结果不明确'}
                        </span>
                      </div>
                    ))}
                    {activeRecord.claims.length === 0 && (
                      <div className="text-3xs text-slate-400 py-1">无诉求明细条目</div>
                    )}
                  </div>
                </div>

                {/* 4. 企业策略与证据 (Strategies & Evidence) */}
                <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <div className="font-bold text-slate-800 text-2xs uppercase text-slate-500">
                    四、企业抗辩与证据 (Defenses & Evidence)
                  </div>
                  <div className="space-y-2 text-2xs">
                    <div>
                      <span className="text-slate-400 block mb-1">抗辩事由 ({activeRecord.employerDefenses.length}):</span>
                      <div className="flex flex-wrap gap-1">
                        {activeRecord.employerDefenses.map((d, i) => (
                          <span key={i} className="px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-800 rounded text-3xs">
                            {d.defenseType}
                          </span>
                        ))}
                        {activeRecord.employerDefenses.length === 0 && (
                          <span className="text-3xs text-slate-400">无企业抗辩事由</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <span className="text-slate-400 block mb-1">关键证据 ({activeRecord.evidence.length}):</span>
                      <div className="flex flex-wrap gap-1">
                        {activeRecord.evidence.map((e, i) => (
                          <span key={i} className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded text-3xs">
                            {e.name}
                          </span>
                        ))}
                        {activeRecord.evidence.length === 0 && (
                          <span className="text-3xs text-slate-400">无提取证据材料</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 5. 质量指标 (Quality) */}
                <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <div className="font-bold text-slate-800 text-2xs uppercase text-slate-500">
                    五、质量指标 (Quality & Audit)
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-2xs">
                    <div><span className="text-slate-400">完整度评分:</span> <strong className="font-mono">{activeRecord.parserScore} 分</strong></div>
                    <div><span className="text-slate-400">综合置信度:</span> <strong className="font-mono">{(activeRecord.confidence * 100).toFixed(0)}%</strong></div>
                    <div><span className="text-slate-400">审核状态:</span> <strong className="font-mono">{activeRecord.reviewStatus === 'approved' ? '已核准' : activeRecord.reviewStatus === 'modified' ? '已修改' : '待核验'}</strong></div>
                    <div><span className="text-slate-400">含人工修订:</span> {activeRecord.hasReviewerChanges ? '是 (已叠加)' : '否'}</div>
                  </div>
                  {activeRecord.reviewerNotes && (
                    <div className="p-2 bg-slate-50 rounded border border-slate-200 text-3xs text-slate-600 mt-1">
                      <strong>质检批注:</strong> {activeRecord.reviewerNotes}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-20 text-center text-xs text-slate-400">
                请在左侧列表中点击选择要检视的案例
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
