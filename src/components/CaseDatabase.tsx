import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Filter,
  Download,
  Trash2,
  RefreshCw,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RotateCcw,
  CheckSquare,
  Square,
  SlidersHorizontal,
  FileSpreadsheet,
  FileCode,
  Tag,
  Scale,
  X,
  AlertTriangle,
} from 'lucide-react';
import { DataService } from '../services/data/dataService';
import { ArbitrationCase, CaseFilterOptions, DecisionOutcome } from '../types';

interface CaseDatabaseProps {
  initialFilter?: Partial<CaseFilterOptions>;
  onSelectCase: (caseItem: ArbitrationCase) => void;
  onRefreshData?: () => void;
}

export const CaseDatabase: React.FC<CaseDatabaseProps> = ({
  initialFilter,
  onSelectCase,
  onRefreshData,
}) => {
  const [cases, setCases] = useState<ArbitrationCase[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [filter, setFilter] = useState<CaseFilterOptions>({
    keyword: initialFilter?.keyword || '',
    keywordMode: 'AND',
    year: initialFilter?.year || '全部',
    committee: initialFilter?.committee || '全部',
    disputeTag: initialFilter?.disputeTag || '全部',
    decisionOutcome: initialFilter?.decisionOutcome || '全部',
    minQualityScore: 0,
    sortBy: 'publishedDate',
    sortOrder: 'desc',
    ...initialFilter,
  });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);

  const fetchCases = useCallback(async () => {
    setLoading(true);
    try {
      const result = await DataService.queryCases(filter, page, pageSize);
      setCases(result.items);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (err) {
      console.error('Failed to query cases:', err);
    } finally {
      setLoading(false);
    }
  }, [filter, page, pageSize]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  // Handle external initial filter change
  useEffect(() => {
    if (initialFilter) {
      setFilter((prev) => ({ ...prev, ...initialFilter }));
      setPage(1);
    }
  }, [initialFilter]);

  const handleFilterChange = (key: keyof CaseFilterOptions, value: any) => {
    setFilter((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const handleResetFilter = () => {
    setFilter({
      keyword: '',
      keywordMode: 'AND',
      year: '全部',
      committee: '全部',
      disputeTag: '全部',
      decisionOutcome: '全部',
      minQualityScore: 0,
      sortBy: 'publishedDate',
      sortOrder: 'desc',
    });
    setPage(1);
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllOnPage = () => {
    const pageIds = cases.map((c) => c.id);
    const allSelected = pageIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const handleExportCsv = () => {
    const targetCases =
      selectedIds.length > 0
        ? cases.filter((c) => selectedIds.includes(c.id))
        : cases;
    if (targetCases.length === 0) return;

    const csvContent = DataService.exportToCsv(targetCases);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `深圳劳动仲裁案例_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    const targetCases =
      selectedIds.length > 0
        ? cases.filter((c) => selectedIds.includes(c.id))
        : cases;
    if (targetCases.length === 0) return;

    const blob = new Blob([JSON.stringify(targetCases, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `深圳劳动仲裁案例_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    await DataService.deleteBatchCases(selectedIds);
    setSelectedIds([]);
    setShowDeleteConfirm(false);
    fetchCases();
    onRefreshData?.();
  };

  const handleReparse = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = await DataService.reparseCase(id);
    if (updated) {
      fetchCases();
      onRefreshData?.();
    }
  };

  const getOutcomeBadge = (outcome: DecisionOutcome) => {
    switch (outcome) {
      case '用人单位胜诉':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            用人单位胜诉
          </span>
        );
      case '用人单位败诉':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            用人单位败诉
          </span>
        );
      case '部分支持':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            部分支持
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            {outcome}
          </span>
        );
    }
  };

  const getQualityBadge = (score: number) => {
    if (score >= 80) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          {score}分 (优)
        </span>
      );
    }
    if (score >= 60) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200">
          {score}分 (良)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200">
        {score}分 (需补)
      </span>
    );
  };

  return (
    <div className="p-4 lg:p-8 max-w-[1920px] mx-auto space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Scale className="w-5 h-5 text-blue-600" />
            案例数据库
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            共收录 <span className="font-semibold text-slate-900 font-mono">{total}</span> 份本地裁决案例，支持多字段组合检索、批处理及要素导出
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg text-xs text-blue-900">
              <span>已选 {selectedIds.length} 项</span>
              <button
                id="btn-batch-ai"
                onClick={() => setShowAiModal(true)}
                className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium flex items-center gap-1 transition-colors"
              >
                <Sparkles className="w-3 h-3" />
                批量分析 (预留)
              </button>
              <button
                id="btn-batch-delete"
                onClick={() => setShowDeleteConfirm(true)}
                className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded font-medium flex items-center gap-1 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                删除
              </button>
            </div>
          )}

          <button
            id="btn-export-csv"
            onClick={handleExportCsv}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 flex items-center gap-1.5 shadow-2xs transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            导出 CSV
          </button>
          <button
            id="btn-export-json"
            onClick={handleExportJson}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 flex items-center gap-1.5 shadow-2xs transition-colors"
          >
            <FileCode className="w-3.5 h-3.5 text-blue-600" />
            导出 JSON
          </button>

          <button
            id="btn-toggle-filter-mobile"
            onClick={() => setShowFilterDrawer(!showFilterDrawer)}
            className="lg:hidden px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            筛选条件
          </button>
        </div>
      </div>

      {/* Main Grid: Left Filter Panel (lg: 3 cols) + Right Table (lg: 9 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Filter Sidebar */}
        <div
          className={`lg:col-span-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-4 ${
            showFilterDrawer ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-blue-600" />
              检索与筛选条件
            </span>
            <button
              onClick={handleResetFilter}
              className="text-2xs text-slate-500 hover:text-blue-600 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> 重置
            </button>
          </div>

          {/* Search Keyword */}
          <div>
            <label className="block text-2xs font-semibold text-slate-600 mb-1">
              关键词全文检索 (支持 AND / OR)
            </label>
            <div className="relative">
              <input
                id="input-filter-keyword"
                type="text"
                value={filter.keyword || ''}
                onChange={(e) => handleFilterChange('keyword', e.target.value)}
                placeholder="如: 违法解除 AND 员工手册"
                className="w-full pl-3 pr-8 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {filter.keyword && (
                <button
                  onClick={() => handleFilterChange('keyword', '')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 text-2xs text-slate-500">
              <span>模式:</span>
              <button
                onClick={() => handleFilterChange('keywordMode', 'AND')}
                className={`px-1.5 py-0.5 rounded ${
                  filter.keywordMode === 'AND'
                    ? 'bg-blue-600 text-white font-bold'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                AND (且)
              </button>
              <button
                onClick={() => handleFilterChange('keywordMode', 'OR')}
                className={`px-1.5 py-0.5 rounded ${
                  filter.keywordMode === 'OR'
                    ? 'bg-blue-600 text-white font-bold'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                OR (或)
              </button>
            </div>
          </div>

          {/* Year */}
          <div>
            <label className="block text-2xs font-semibold text-slate-600 mb-1">裁决年份</label>
            <select
              id="select-filter-year"
              value={filter.year || '全部'}
              onChange={(e) => handleFilterChange('year', e.target.value)}
              className="w-full py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="全部">全部年份</option>
              <option value="2025">2025 年</option>
              <option value="2024">2024 年</option>
              <option value="2023">2023 年</option>
              <option value="2022">2022 年</option>
              <option value="2021">2021 年</option>
            </select>
          </div>

          {/* Committee */}
          <div>
            <label className="block text-2xs font-semibold text-slate-600 mb-1">仲裁委员会 / 辖区</label>
            <select
              id="select-filter-committee"
              value={filter.committee || '全部'}
              onChange={(e) => handleFilterChange('committee', e.target.value)}
              className="w-full py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="全部">全部仲裁机构</option>
              <option value="深圳市劳动人事争议仲裁委员会">深圳市直属仲裁委</option>
              <option value="福田区">福田区仲裁委</option>
              <option value="南山区">南山区仲裁委</option>
              <option value="宝安区">宝安区仲裁委</option>
              <option value="龙岗区">龙岗区仲裁委</option>
              <option value="龙华区">龙华区仲裁委</option>
              <option value="坪山区">坪山区仲裁委</option>
              <option value="光明区">光明区仲裁委</option>
              <option value="盐田区">盐田区仲裁委</option>
              <option value="罗湖区">罗湖区仲裁委</option>
              <option value="大鹏新区">大鹏新区仲裁委</option>
            </select>
          </div>

          {/* Dispute Tag */}
          <div>
            <label className="block text-2xs font-semibold text-slate-600 mb-1">争议类型</label>
            <select
              id="select-filter-dispute-tag"
              value={filter.disputeTag || '全部'}
              onChange={(e) => handleFilterChange('disputeTag', e.target.value)}
              className="w-full py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="全部">全部争议类型</option>
              <option value="违法解除">违法解除劳动合同</option>
              <option value="加班工资">加班费 / 工时争议</option>
              <option value="年终奖与绩效">年终奖与绩效奖金</option>
              <option value="未签劳动合同">未签劳动合同二倍工资</option>
              <option value="调岗降薪">调岗降薪 / 工作地点变更</option>
              <option value="经济补偿">经济补偿金争议</option>
              <option value="工伤待遇">工伤医疗待遇</option>
              <option value="竞业限制">竞业限制与商业秘密</option>
              <option value="试用期争议">试用期解除争议</option>
            </select>
          </div>

          {/* Decision Outcome */}
          <div>
            <label className="block text-2xs font-semibold text-slate-600 mb-1">裁决结果倾向</label>
            <select
              id="select-filter-outcome"
              value={filter.decisionOutcome || '全部'}
              onChange={(e) => handleFilterChange('decisionOutcome', e.target.value)}
              className="w-full py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="全部">全部结果</option>
              <option value="用人单位胜诉">用人单位胜诉 (全驳回)</option>
              <option value="部分支持">部分支持</option>
              <option value="用人单位败诉">用人单位败诉 (全额裁付)</option>
              <option value="调解/其他">调解/其他</option>
            </select>
          </div>

          {/* Quality Rating */}
          <div>
            <label className="block text-2xs font-semibold text-slate-600 mb-1">解析质量要求</label>
            <select
              id="select-filter-quality"
              value={filter.minQualityScore || 0}
              onChange={(e) => handleFilterChange('minQualityScore', parseInt(e.target.value, 10))}
              className="w-full py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="0">全部质量评分</option>
              <option value="80">高质量 (80分及以上)</option>
              <option value="60">标准质量 (60分及以上)</option>
            </select>
          </div>

          {/* Sort By */}
          <div>
            <label className="block text-2xs font-semibold text-slate-600 mb-1">排序规则</label>
            <div className="grid grid-cols-2 gap-2">
              <select
                id="select-filter-sort-by"
                value={filter.sortBy || 'publishedDate'}
                onChange={(e) => handleFilterChange('sortBy', e.target.value)}
                className="py-1.5 px-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
              >
                <option value="publishedDate">按裁决日期</option>
                <option value="parseQuality">按解析质量</option>
                <option value="year">按年份</option>
                <option value="caseNumber">按案号</option>
              </select>
              <select
                id="select-filter-sort-order"
                value={filter.sortOrder || 'desc'}
                onChange={(e) => handleFilterChange('sortOrder', e.target.value)}
                className="py-1.5 px-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
              >
                <option value="desc">降序 (最新)</option>
                <option value="asc">升序 (最早)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Right Table Section */}
        <div className="lg:col-span-9 bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
          {/* Table Toolbar */}
          <div className="p-3 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <button
                id="btn-select-all"
                onClick={handleSelectAllOnPage}
                className="p-1 hover:text-slate-900 flex items-center gap-1.5 font-medium"
              >
                {cases.length > 0 && cases.every((c) => selectedIds.includes(c.id)) ? (
                  <CheckSquare className="w-4 h-4 text-blue-600" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400" />
                )}
                <span>本页全选</span>
              </button>
            </div>

            <div className="flex items-center gap-2 font-mono text-2xs">
              <span>
                显示 {(page - 1) * pageSize + (cases.length > 0 ? 1 : 0)} -{' '}
                {Math.min(page * pageSize, total)} 条 / 共 {total} 条
              </span>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto min-h-[420px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-700 font-semibold select-none">
                  <th className="py-2.5 px-3 w-10 text-center">#</th>
                  <th className="py-2.5 px-3 w-40">案号</th>
                  <th className="py-2.5 px-3 w-40">仲裁委员会</th>
                  <th className="py-2.5 px-3 w-24">裁决日期</th>
                  <th className="py-2.5 px-3 w-48">当事人</th>
                  <th className="py-2.5 px-3 w-36">争议类型</th>
                  <th className="py-2.5 px-3 w-28 text-center">裁决倾向</th>
                  <th className="py-2.5 px-3 w-24 text-right">裁付金额</th>
                  <th className="py-2.5 px-3 w-24 text-center">质量评分</th>
                  <th className="py-2.5 px-3 w-24 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="py-16 text-center text-slate-400">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                        <span>正在检索本地案例数据...</span>
                      </div>
                    </td>
                  </tr>
                ) : cases.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-16 text-center text-slate-400">
                      <div className="max-w-xs mx-auto space-y-2">
                        <p>未找到符合条件的裁决案例</p>
                        <button
                          onClick={handleResetFilter}
                          className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs"
                        >
                          重置筛选条件
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  cases.map((c) => {
                    const isSelected = selectedIds.includes(c.id);
                    return (
                      <tr
                        key={c.id}
                        onClick={() => onSelectCase(c)}
                        className={`hover:bg-blue-50/40 cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50/60' : ''
                        }`}
                      >
                        <td
                          className="py-3 px-3 text-center"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleSelect(c.id);
                          }}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-blue-600 mx-auto" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 mx-auto hover:text-slate-500" />
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-blue-700 truncate max-w-[160px]">
                          {c.caseNumber}
                        </td>
                        <td className="py-3 px-3 text-slate-600 truncate max-w-[160px]">
                          {c.arbitrationCommittee}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-500">{c.publishedDate}</td>
                        <td className="py-3 px-3">
                          <div className="truncate max-w-[180px]">
                            <span className="font-semibold text-slate-900">{c.applicant}</span>
                            <span className="text-slate-400 mx-1">vs</span>
                            <span className="text-slate-700">{c.respondent}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap gap-1">
                            {c.disputeTags.slice(0, 2).map((t, idx) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 rounded text-2xs bg-slate-100 text-slate-700 border border-slate-200"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center">{getOutcomeBadge(c.decisionOutcome)}</td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-800">
                          {c.compensationAmount ? `¥${c.compensationAmount.toLocaleString()}` : '-'}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {getQualityBadge(c.parseQuality?.overall || 0)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              id={`btn-view-case-${c.id}`}
                              onClick={() => onSelectCase(c)}
                              className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-slate-100"
                              title="查看案例详情"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                            <button
                              id={`btn-reparse-case-${c.id}`}
                              onClick={(e) => handleReparse(c.id, e)}
                              className="p-1 rounded text-slate-500 hover:text-emerald-600 hover:bg-slate-100"
                              title="重新解析此文书"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span>每页显示</span>
              <select
                id="select-page-size"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(parseInt(e.target.value, 10));
                  setPage(1);
                }}
                className="py-1 px-2 text-xs bg-white border border-slate-200 rounded"
              >
                <option value="10">10</option>
                <option value="15">15</option>
                <option value="30">30</option>
                <option value="50">50</option>
              </select>
              <span>条</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                id="btn-prev-page"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 bg-white border border-slate-200 rounded text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> 上一页
              </button>
              <span className="font-mono px-2">
                第 <span className="font-bold text-slate-900">{page}</span> / {totalPages} 页
              </span>
              <button
                id="btn-next-page"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 bg-white border border-slate-200 rounded text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 flex items-center gap-1"
              >
                下一页 <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* AI Standby Notice Modal (Preserved interface for Stage 2) */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-bold text-slate-900">AI 批量深度分析模块（第二阶段预留）</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                当前系统正处于【第一阶段本地极速模式】，所有数据检索、要素抽取与统计分析均在浏览器 IndexedDB
                本地计算完成，不依赖外部 API。AI 批量研判与败诉风险推演将在第二阶段统一接入。
              </p>
            </div>
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs text-slate-600 space-y-1">
              <div className="font-semibold text-slate-800">当前已选择案例：</div>
              <div>共勾选 {selectedIds.length} 篇裁决书</div>
              <div className="text-slate-500 text-2xs mt-1">
                您可以随时使用「导出 CSV / JSON」或「统计分析」进行本地多维法务研判。
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                id="btn-close-ai-modal"
                onClick={() => setShowAiModal(false)}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl border border-slate-200 space-y-4">
            <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="text-center">
              <h3 className="text-sm font-bold text-slate-900">确认批量删除所选案例？</h3>
              <p className="text-xs text-slate-500 mt-1">
                即将从本地 IndexedDB 永久删除 {selectedIds.length} 篇案例及对应的原始文书记录。
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium"
              >
                取消
              </button>
              <button
                id="btn-confirm-delete"
                onClick={handleDeleteSelected}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
