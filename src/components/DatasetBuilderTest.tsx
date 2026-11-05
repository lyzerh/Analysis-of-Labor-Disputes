import { LaborAnalysisPipeline } from "../services/data/LaborAnalysisPipeline";
import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">{t('dataManagement.datasetBuilderUi.copy001')}{' '}<span className="px-2.5 py-0.5 text-xs font-semibold bg-indigo-100 text-indigo-800 rounded-full font-mono">{t('dataManagement.datasetBuilderUi.copy002')}{' '}</span>
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">{t('dataManagement.datasetBuilderUi.copy003')}{' '}</p>
            </div>
          </div>

          <button
            onClick={loadAndBuildDataset}
            disabled={isLoading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors cursor-pointer self-start md:self-auto shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />{t('dataManagement.datasetBuilderUi.copy004')}{' '}</button>
        </div>

        {/* 零污染原则与过滤规则说明条 */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2.5 text-slate-700">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-900">{t('dataManagement.datasetBuilderUi.copy005')}</span>{t('dataManagement.datasetBuilderUi.copy006')}{' '}<code>RawDocument</code>{t('dataManagement.datasetBuilderUi.copy007')}<code>ArbitrationCase</code>{t('dataManagement.datasetBuilderUi.copy008')}<code>ParserEvaluator</code>{t('dataManagement.datasetBuilderUi.copy009')}{' '}<code>ReviewStorage</code>{t('dataManagement.datasetBuilderUi.copy010')}{' '}<code>AnalysisCaseRecord</code>。
            </div>
          </div>

          <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl flex items-start gap-2.5 text-indigo-950">
            <Filter className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">{t('dataManagement.datasetBuilderUi.copy011')}</span>{t('dataManagement.datasetBuilderUi.copy012')}<strong>{t('dataManagement.datasetBuilderUi.copy013')}</strong>{t('dataManagement.datasetBuilderUi.copy014')}<strong>{t('dataManagement.datasetBuilderUi.copy015')}</strong>{t('dataManagement.datasetBuilderUi.copy016')}<strong>{t('dataManagement.datasetBuilderUi.copy017')}</strong>。
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
              <Database className="w-3.5 h-3.5 text-slate-400" />{t('dataManagement.datasetBuilderUi.copy018')}{' '}</div>
            <div className="text-2xl font-bold font-mono text-slate-800 mt-1">
              {summary.totalRawDocs}
            </div>
            <div className="text-2xs text-slate-400 mt-0.5">{t('dataManagement.datasetBuilderUi.copy019')}</div>
          </div>

          {/* 2. 成功转换数量 */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="text-2xs text-slate-500 font-semibold uppercase flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />{t('dataManagement.datasetBuilderUi.copy020')}{' '}</div>
            <div className="text-2xl font-bold font-mono text-indigo-600 mt-1">
              {summary.totalConverted}
            </div>
            <div className="text-2xs text-slate-400 mt-0.5">{t('dataManagement.datasetBuilderUi.copy021')}</div>
          </div>

          {/* 3. 进入正式分析集数量 */}
          <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4 shadow-sm">
            <div className="text-2xs text-emerald-800 font-semibold uppercase flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />{t('dataManagement.datasetBuilderUi.copy022')}{' '}</div>
            <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">
              {summary.includedInAnalysisSetCount}{' '}
              <span className="text-xs font-normal text-emerald-600">({summary.filterRate}%)</span>
            </div>
            <div className="text-2xs text-emerald-700 mt-0.5">{t('dataManagement.datasetBuilderUi.copy023')}</div>
          </div>

          {/* 4. 待优化池数量 */}
          <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-4 shadow-sm">
            <div className="text-2xs text-amber-800 font-semibold uppercase flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />{t('dataManagement.datasetBuilderUi.copy024')}{' '}</div>
            <div className="text-2xl font-bold font-mono text-amber-700 mt-1">
              {summary.pendingOptimizationCount}{' '}
              <span className="text-xs font-normal text-amber-600">
                ({summary.totalConverted > 0 ? (100 - summary.filterRate).toFixed(1) : 0}%)
              </span>
            </div>
            <div className="text-2xs text-amber-700 mt-0.5">{t('dataManagement.datasetBuilderUi.copy025')}</div>
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
                <ShieldCheck className="w-4 h-4 text-emerald-600" />{t('dataManagement.datasetBuilderUi.copy026')}{' '}</h3>
              <span className="text-2xs text-slate-400 font-mono">{t('dataManagement.datasetBuilderUi.copy027')}{' '}{summary.filterRate}%
              </span>
            </div>

            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-2xs mb-1">
                  <span className="text-slate-600 font-medium">{t('dataManagement.datasetBuilderUi.copy028')}</span>
                  <span className="font-mono font-bold text-emerald-600">{summary.qualityDistribution.range90_100}{t('dataManagement.datasetBuilderUi.copy029')}</span>
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
                  <span className="text-slate-600 font-medium">{t('dataManagement.datasetBuilderUi.copy030')}</span>
                  <span className="font-mono font-bold text-blue-600">{summary.qualityDistribution.range80_89}{t('dataManagement.datasetBuilderUi.copy029')}</span>
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
                  <span className="text-slate-600 font-medium">{t('dataManagement.datasetBuilderUi.copy031')}</span>
                  <span className="font-mono font-bold text-amber-600">{summary.qualityDistribution.range60_79}{t('dataManagement.datasetBuilderUi.copy029')}</span>
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
                  <span className="text-slate-600 font-medium">{t('dataManagement.datasetBuilderUi.copy032')}</span>
                  <span className="font-mono font-bold text-rose-600">{summary.qualityDistribution.rangeBelow60}{t('dataManagement.datasetBuilderUi.copy029')}</span>
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
              <span>{t('dataManagement.datasetBuilderUi.copy033')}{' '}<strong className="text-emerald-700">{summary.qualityDistribution.approvedCount}</strong></span>
              <span>{t('dataManagement.datasetBuilderUi.copy034')}{' '}<strong className="text-blue-700">{summary.qualityDistribution.modifiedCount}</strong></span>
              <span>{t('dataManagement.datasetBuilderUi.copy035')}{' '}<strong className="text-slate-700">{summary.qualityDistribution.pendingReviewCount}</strong></span>
            </div>
          </div>

          {/* 2. 城市分布 (聚焦广深莞) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-indigo-600" />{t('dataManagement.datasetBuilderUi.copy036')}{' '}</h3>
              <span className="text-2xs text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded-full">{t('dataManagement.datasetBuilderUi.copy037')}{' '}{summary.prdCount}{t('dataManagement.datasetBuilderUi.copy029')}{' '}</span>
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
                      <span>{count}{t('dataManagement.datasetBuilderUi.copy029')}</span>
                      <span className="text-slate-400">({percent}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-100 text-3xs text-slate-400 flex items-center justify-between">
              <span>{t('dataManagement.datasetBuilderUi.copy038')}{' '}<strong>{Math.round((summary.prdCount / (summary.totalConverted || 1)) * 100)}%</strong></span>
              <span>{t('dataManagement.datasetBuilderUi.copy039')}</span>
            </div>
          </div>

          {/* 3. 争议类型分布 */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-purple-600" />{t('dataManagement.datasetBuilderUi.copy040')}{' '}</h3>
              <span className="text-2xs text-slate-400 font-mono">
                {availableDisputeTypes.length}{t('dataManagement.datasetBuilderUi.copy041')}{' '}</span>
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
                      <span>{count}{t('dataManagement.datasetBuilderUi.copy029')}</span>
                      <span className="text-slate-400">({percent}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-100 text-3xs text-slate-400 flex items-center justify-between">
              <span>{t('dataManagement.datasetBuilderUi.copy042')}</span>
              <span>{t('dataManagement.datasetBuilderUi.copy043')}</span>
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
              >{t('dataManagement.datasetBuilderUi.copy044')}{records.length})
              </button>
              <button
                onClick={() => setFilterSet('included')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  filterSet === 'included' ? 'bg-white text-emerald-700 shadow-2xs font-semibold' : 'text-slate-600 hover:text-emerald-700'
                }`}
              >{t('dataManagement.datasetBuilderUi.copy045')}{summary?.includedInAnalysisSetCount ?? 0})
              </button>
              <button
                onClick={() => setFilterSet('pending')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  filterSet === 'pending' ? 'bg-white text-amber-700 shadow-2xs font-semibold' : 'text-slate-600 hover:text-amber-700'
                }`}
              >{t('dataManagement.datasetBuilderUi.copy046')}{summary?.pendingOptimizationCount ?? 0})
              </button>
            </div>

            {/* 城市重置 */}
            {selectedCity !== 'all' && (
              <span className="px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-xs flex items-center gap-1">{t('dataManagement.datasetBuilderUi.copy047')}{' '}{selectedCity}
                <X className="w-3 h-3 cursor-pointer" onClick={() => setSelectedCity('all')} />
              </span>
            )}

            {/* 争议类型重置 */}
            {selectedDisputeType !== 'all' && (
              <span className="px-2.5 py-1 bg-purple-50 border border-purple-200 text-purple-700 rounded-lg text-xs flex items-center gap-1">{t('dataManagement.datasetBuilderUi.copy048')}{' '}{selectedDisputeType}
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
              placeholder={t('dataManagement.datasetBuilderUi.copy049')}
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
              <div className="py-12 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">{t('dataManagement.datasetBuilderUi.copy050')}{' '}</div>
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
                          {r.isIncludedInAnalysisSet ? t('dataManagement.datasetBuilderUi.includedIcon') : t('dataManagement.datasetBuilderUi.pendingIcon')}
                        </span>
                        <span className="px-2 py-0.5 rounded text-2xs font-semibold bg-slate-100 text-slate-700 font-mono">
                          {r.city}
                        </span>
                        {r.year && (
                          <span className="px-1.5 py-0.5 rounded text-2xs text-slate-500 font-mono">
                            {r.year}{t('dataManagement.datasetBuilderUi.copy051')}{' '}</span>
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
                          {r.parserScore}{t('dataManagement.datasetBuilderUi.copy052')}{' '}</span>
                        <span className={`text-3xs px-1.5 py-0.5 rounded ${
                          r.reviewStatus === 'approved'
                            ? 'bg-emerald-100 text-emerald-800'
                            : r.reviewStatus === 'modified'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {r.reviewStatus === 'approved' ? t('dataManagement.datasetBuilderUi.approved') : r.reviewStatus === 'modified' ? t('dataManagement.datasetBuilderUi.modified') : t('dataManagement.datasetBuilderUi.notReviewed')}
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
                        <span className="text-slate-400">{t('dataManagement.datasetBuilderUi.copy053')}</span> <strong>{r.employeeParty || t('dataManagement.datasetBuilderUi.notStated')}</strong>
                      </div>
                      <div className="truncate">
                        <span className="text-slate-400">{t('dataManagement.datasetBuilderUi.copy054')}</span> <strong>{r.employerParty || t('dataManagement.datasetBuilderUi.notStated')}</strong>
                      </div>
                    </div>

                    {/* 诉求与抗辩概要 */}
                    <div className="flex items-center justify-between text-2xs text-slate-500 pt-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{t('dataManagement.datasetBuilderUi.copy055')}{r.claims.length}{t('dataManagement.datasetBuilderUi.copy056')}</span>
                        <span>•</span>
                        <span>{t('dataManagement.datasetBuilderUi.copy057')}{r.employerDefenses.length}{t('dataManagement.datasetBuilderUi.copy056')}</span>
                        <span>•</span>
                        <span>{t('dataManagement.datasetBuilderUi.copy058')}{r.evidence.length}{t('dataManagement.datasetBuilderUi.copy056')}</span>
                      </div>
                      <div className="text-2xs font-semibold text-indigo-600">
                         {r.overallResult === 'supported' ? t('dataManagement.datasetBuilderUi.supported') : r.overallResult === 'not_supported' ? t('dataManagement.datasetBuilderUi.notSupported') : r.overallResult === 'partially_supported' ? t('dataManagement.datasetBuilderUi.partiallySupported') : t('dataManagement.datasetBuilderUi.unclear')}
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
                    <h3 className="font-bold text-slate-900">{t('dataManagement.datasetBuilderUi.copy059')}</h3>
                  </div>

                  <button
                    onClick={() => handleCopyJson(activeRecord)}
                    className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-2xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    {copiedId === activeRecord.caseId ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />{t('dataManagement.datasetBuilderUi.copy060')}{' '}</>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />{t('dataManagement.datasetBuilderUi.copy061')}{' '}</>
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
                    {activeRecord.isIncludedInAnalysisSet ? t('dataManagement.datasetBuilderUi.included') : t('dataManagement.datasetBuilderUi.pending')}
                  </div>
                  <div>{t('dataManagement.datasetBuilderUi.copy062')}{' '}{activeRecord.filterReason}</div>
                </div>

                {/* 1. 基础信息 (Base) */}
                <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <div className="font-bold text-slate-800 text-2xs uppercase text-slate-500">{t('dataManagement.datasetBuilderUi.copy063')}{' '}</div>
                  <div className="grid grid-cols-2 gap-2 text-2xs">
                    <div><span className="text-slate-400">Case ID:</span> <span className="font-mono">{activeRecord.caseId}</span></div>
                    <div><span className="text-slate-400">{t('dataManagement.datasetBuilderUi.copy064')}</span> {activeRecord.source}</div>
                    <div><span className="text-slate-400">{t('dataManagement.datasetBuilderUi.copy065')}</span> <strong>{activeRecord.city}</strong> {activeRecord.isPRD ? t('dataManagement.datasetBuilderUi.prd') : ''}</div>
                    <div><span className="text-slate-400">{t('dataManagement.datasetBuilderUi.copy066')}</span> {activeRecord.year ? t('dataManagement.datasetBuilderUi.year', { year: activeRecord.year }) : t('dataManagement.datasetBuilderUi.unknown')}</div>
                    <div className="col-span-2 truncate"><span className="text-slate-400">{t('dataManagement.datasetBuilderUi.copy067')}</span> {activeRecord.court}</div>
                    <div className="col-span-2 truncate"><span className="text-slate-400">{t('dataManagement.datasetBuilderUi.copy068')}</span> {activeRecord.date}</div>
                  </div>
                </div>

                {/* 2. 当事人主体 (Parties) */}
                <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <div className="font-bold text-slate-800 text-2xs uppercase text-slate-500">{t('dataManagement.datasetBuilderUi.copy069')}{' '}</div>
                  <div className="space-y-1 text-2xs">
                    <div>
                      <span className="text-slate-400">{t('dataManagement.datasetBuilderUi.copy070')}</span>{' '}
                      <strong className="text-slate-800">{activeRecord.employeeParty || t('dataManagement.datasetBuilderUi.unidentified')}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">{t('dataManagement.datasetBuilderUi.copy071')}</span>{' '}
                      <strong className="text-slate-800">{activeRecord.employerParty || t('dataManagement.datasetBuilderUi.unidentified')}</strong>
                    </div>
                  </div>
                </div>

                {/* 3. 诉求与裁判结果 (Claims & Outcomes) */}
                <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-2xs font-bold uppercase text-slate-500">
                    <span>{t('dataManagement.datasetBuilderUi.copy072')}</span>
                    <span className="text-indigo-600 font-mono">{t('dataManagement.datasetBuilderUi.copy073')}{' '}{activeRecord.overallResult}
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
                          {c.supportStatus === 'supported' ? t('dataManagement.datasetBuilderUi.supported') : c.supportStatus === 'partially_supported' ? t('dataManagement.datasetBuilderUi.partiallySupported') : c.supportStatus === 'not_supported' ? t('dataManagement.datasetBuilderUi.notSupported') : t('dataManagement.datasetBuilderUi.unclear')}
                        </span>
                      </div>
                    ))}
                    {activeRecord.claims.length === 0 && (
                      <div className="text-3xs text-slate-400 py-1">{t('dataManagement.datasetBuilderUi.copy074')}</div>
                    )}
                  </div>
                </div>

                {/* 4. 企业策略与证据 (Strategies & Evidence) */}
                <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <div className="font-bold text-slate-800 text-2xs uppercase text-slate-500">{t('dataManagement.datasetBuilderUi.copy075')}{' '}</div>
                  <div className="space-y-2 text-2xs">
                    <div>
                      <span className="text-slate-400 block mb-1">{t('dataManagement.datasetBuilderUi.copy076')}{activeRecord.employerDefenses.length}):</span>
                      <div className="flex flex-wrap gap-1">
                        {activeRecord.employerDefenses.map((d, i) => (
                          <span key={i} className="px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-800 rounded text-3xs">
                            {d.defenseType}
                          </span>
                        ))}
                        {activeRecord.employerDefenses.length === 0 && (
                          <span className="text-3xs text-slate-400">{t('dataManagement.datasetBuilderUi.copy077')}</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <span className="text-slate-400 block mb-1">{t('dataManagement.datasetBuilderUi.copy078')}{activeRecord.evidence.length}):</span>
                      <div className="flex flex-wrap gap-1">
                        {activeRecord.evidence.map((e, i) => (
                          <span key={i} className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded text-3xs">
                            {e.name}
                          </span>
                        ))}
                        {activeRecord.evidence.length === 0 && (
                          <span className="text-3xs text-slate-400">{t('dataManagement.datasetBuilderUi.copy079')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 5. 质量指标 (Quality) */}
                <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <div className="font-bold text-slate-800 text-2xs uppercase text-slate-500">{t('dataManagement.datasetBuilderUi.copy080')}{' '}</div>
                  <div className="grid grid-cols-2 gap-2 text-2xs">
                    <div><span className="text-slate-400">{t('dataManagement.datasetBuilderUi.copy081')}</span> <strong className="font-mono">{activeRecord.parserScore}{t('dataManagement.datasetBuilderUi.copy052')}</strong></div>
                    <div><span className="text-slate-400">{t('dataManagement.datasetBuilderUi.copy082')}</span> <strong className="font-mono">{(activeRecord.confidence * 100).toFixed(0)}%</strong></div>
                    <div><span className="text-slate-400">{t('dataManagement.datasetBuilderUi.copy083')}</span> <strong className="font-mono">{activeRecord.reviewStatus === 'approved' ? t('dataManagement.datasetBuilderUi.approved') : activeRecord.reviewStatus === 'modified' ? t('dataManagement.datasetBuilderUi.modified') : t('dataManagement.datasetBuilderUi.pendingReview')}</strong></div>
                    <div><span className="text-slate-400">{t('dataManagement.datasetBuilderUi.copy084')}</span> {activeRecord.hasReviewerChanges ? t('dataManagement.datasetBuilderUi.yesApplied') : t('dataManagement.datasetBuilderUi.no')}</div>
                  </div>
                  {activeRecord.reviewerNotes && (
                    <div className="p-2 bg-slate-50 rounded border border-slate-200 text-3xs text-slate-600 mt-1">
                      <strong>{t('dataManagement.datasetBuilderUi.copy085')}</strong> {activeRecord.reviewerNotes}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-20 text-center text-xs text-slate-400">{t('dataManagement.datasetBuilderUi.copy086')}{' '}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
