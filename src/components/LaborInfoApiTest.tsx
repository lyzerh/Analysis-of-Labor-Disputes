import React, { useState } from 'react';
import {
  Globe,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Code2,
  Search,
  FileText,
  Layers,
  ArrowRight,
  RefreshCw,
  SlidersHorizontal,
  ExternalLink,
  ShieldCheck,
  Download,
  Database,
  Shuffle,
  ChevronRight,
} from 'lucide-react';
import { LaborInfoAdapter } from '../services/dataSource/LaborInfoAdapter';
import { DataService } from '../services/data/dataService';
import { LaborInfoImportHistory } from './LaborInfoImportHistory';

interface TestStepResult<T = any> {
  status: 'idle' | 'running' | 'success' | 'failed';
  url?: string;
  statusCode?: number;
  durationMs?: number;
  data?: T;
  error?: string;
  timestamp?: string;
}

interface ImportTestSummary {
  discovered: number;
  saved: number;
  duplicates: number;
  failed: number;
  checkedPages?: number[];
  details: Array<{
    id: string;
    title: string;
    status: 'saved' | 'duplicate' | 'failed';
    message?: string;
  }>;
  message?: string;
}

export const LaborInfoApiTest: React.FC = () => {
  const [baseUrl, setBaseUrl] = useState<string>('https://laborinfocn.com');
  const [isRunningAll, setIsRunningAll] = useState(false);

  // Step 1: openapi.json
  const [step1, setStep1] = useState<TestStepResult>({ status: 'idle' });

  // Step 2: vocabularies
  const [step2, setStep2] = useState<TestStepResult>({ status: 'idle' });

  // Step 3: search
  const [step3Params, setStep3Params] = useState({
    province: '广东省',
    caseLevel: '二审',
    start_date: '2021-01-01',
    end_date: '2023-12-31',
    page: 1,
    per_page: 5,
  });
  const [step3, setStep3] = useState<TestStepResult>({ status: 'idle' });

  // Step 4: lawcases/:id
  const [step4CaseId, setStep4CaseId] = useState<string>('');
  const [step4, setStep4] = useState<TestStepResult>({ status: 'idle' });

  // Phase 2: 测试 5 篇入库状态
  const [isImportingTest, setIsImportingTest] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportTestSummary | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const executeFetch = async (endpoint: string, options: RequestInit = {}): Promise<{
    url: string;
    statusCode: number;
    data: any;
    durationMs: number;
  }> => {
    const cleanBase = baseUrl.replace(/\/+$/, '');
    const url = `${cleanBase}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const start = performance.now();

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json, text/plain, */*',
        },
        mode: 'cors',
        ...options,
      });
      const durationMs = Math.round(performance.now() - start);
      const text = await res.text();
      let parsedData: any = null;
      try {
        parsedData = JSON.parse(text);
      } catch {
        parsedData = text;
      }

      if (!res.ok) {
        const errorMsg = typeof parsedData === 'object' && parsedData?.message
          ? parsedData.message
          : `HTTP ${res.status}: ${res.statusText || 'Request failed'}`;
        const err: any = new Error(errorMsg);
        err.statusCode = res.status;
        err.url = url;
        err.data = parsedData;
        err.durationMs = durationMs;
        throw err;
      }

      return {
        url,
        statusCode: res.status,
        data: parsedData,
        durationMs,
      };
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - start);
      if (!err.url) err.url = url;
      if (!err.durationMs) err.durationMs = durationMs;
      throw err;
    }
  };

  // 1. 测试 OpenAPI 规范
  const runTestStep1 = async () => {
    setStep1({ status: 'running', timestamp: new Date().toLocaleTimeString() });
    try {
      const res = await executeFetch('/api/v1/openapi.json');
      setStep1({
        status: 'success',
        url: res.url,
        statusCode: res.statusCode,
        durationMs: res.durationMs,
        data: res.data,
        timestamp: new Date().toLocaleTimeString(),
      });
      return res.data;
    } catch (err: any) {
      setStep1({
        status: 'failed',
        url: err.url,
        statusCode: err.statusCode || 0,
        durationMs: err.durationMs,
        error: err.message || (err.name === 'TypeError' ? '网络连接异常或被浏览器 CORS 拦截 (请检查域名或使用代理)' : String(err)),
        data: err.data,
        timestamp: new Date().toLocaleTimeString(),
      });
      throw err;
    }
  };

  // 2. 测试 Vocabularies 字典枚举
  const runTestStep2 = async () => {
    setStep2({ status: 'running', timestamp: new Date().toLocaleTimeString() });
    try {
      const res = await executeFetch('/api/v1/vocabularies');
      setStep2({
        status: 'success',
        url: res.url,
        statusCode: res.statusCode,
        durationMs: res.durationMs,
        data: res.data,
        timestamp: new Date().toLocaleTimeString(),
      });
      return res.data;
    } catch (err: any) {
      setStep2({
        status: 'failed',
        url: err.url,
        statusCode: err.statusCode || 0,
        durationMs: err.durationMs,
        error: err.message || (err.name === 'TypeError' ? '网络连接异常或被浏览器 CORS 拦截' : String(err)),
        data: err.data,
        timestamp: new Date().toLocaleTimeString(),
      });
      throw err;
    }
  };

  // 3. 测试搜索接口（支持指定页码参数）
  const runTestStep3 = async (pageOverride?: number) => {
    const targetPage = typeof pageOverride === 'number' ? pageOverride : step3Params.page;
    if (typeof pageOverride === 'number') {
      setStep3Params((prev) => ({ ...prev, page: targetPage }));
    }

    setStep3({ status: 'running', timestamp: new Date().toLocaleTimeString() });
    try {
      const queryParams = new URLSearchParams();
      if (step3Params.province) queryParams.append('province[]', step3Params.province);
      if (step3Params.caseLevel) queryParams.append('caseLevel[]', step3Params.caseLevel);
      if (step3Params.start_date) queryParams.append('start_date', step3Params.start_date);
      if (step3Params.end_date) queryParams.append('end_date', step3Params.end_date);
      queryParams.append('page', String(targetPage));
      queryParams.append('per_page', String(step3Params.per_page));

      const endpoint = `/api/v1/lawcases/search?${queryParams.toString()}`;
      const res = await executeFetch(endpoint);

      setStep3({
        status: 'success',
        url: res.url,
        statusCode: res.statusCode,
        durationMs: res.durationMs,
        data: res.data,
        timestamp: new Date().toLocaleTimeString(),
      });

      // 提取案件列表以供 Step 4 选择
      const casesList = Array.isArray(res.data)
        ? res.data
        : res.data?.data || res.data?.items || res.data?.lawcases || [];

      if (casesList.length > 0) {
        const randomIndex = Math.floor(Math.random() * casesList.length);
        const selectedId = casesList[randomIndex]?.id || casesList[randomIndex]?._id || casesList[0]?.id;
        if (selectedId) {
          setStep4CaseId(String(selectedId));
        }
      }

      return res.data;
    } catch (err: any) {
      setStep3({
        status: 'failed',
        url: err.url,
        statusCode: err.statusCode || 0,
        durationMs: err.durationMs,
        error: err.message || (err.name === 'TypeError' ? '网络连接异常或被浏览器 CORS 拦截' : String(err)),
        data: err.data,
        timestamp: new Date().toLocaleTimeString(),
      });
      throw err;
    }
  };

  // 3.1 随机页测试：根据当前查询条件的真实 total_pages 随机选择一页并请求
  const handleRandomPageTest = async () => {
    try {
      let totalPages = getTotalPages(step3.data);

      // 若当前尚未检索或没有 total_pages，先做一次快速查询以获取真实 total_pages
      if (!totalPages || totalPages <= 1) {
        const firstPageData = await runTestStep3(1);
        totalPages = getTotalPages(firstPageData);
      }

      if (totalPages > 1) {
        const randomPage = Math.floor(Math.random() * totalPages) + 1;
        await runTestStep3(randomPage);
      } else {
        await runTestStep3(1);
      }
    } catch (e) {
      console.warn('随机页测试异常:', e);
    }
  };

  // 3.2 下一页测试：page + 1 并在不超过 total_pages 的前提下重新请求
  const handleNextPageTest = async () => {
    const totalPages = getTotalPages(step3.data) || 1;
    const nextPage = step3Params.page + 1;
    if (nextPage <= totalPages) {
      await runTestStep3(nextPage);
    } else {
      await runTestStep3(1);
    }
  };

  // 4. 测试详情接口
  const runTestStep4 = async (customId?: string) => {
    const targetId = customId || step4CaseId;
    if (!targetId) {
      setStep4({
        status: 'failed',
        error: '未指定案件 ID，请先执行「测试 3」搜索案件或手动输入一个案件 ID',
      });
      return;
    }

    setStep4({ status: 'running', timestamp: new Date().toLocaleTimeString() });
    try {
      const endpoint = `/api/v1/lawcases/${encodeURIComponent(targetId)}`;
      const res = await executeFetch(endpoint);

      const docData = res.data?.data || res.data;
      const hasFbqw = Boolean(docData && typeof docData.fbqw === 'string' && docData.fbqw.trim());
      const hasContent = Boolean(docData && typeof docData.content === 'string' && docData.content.trim());
      const hasBody = Boolean(docData && typeof docData.body === 'string' && docData.body.trim());

      let fullText = '';
      if (hasFbqw) {
        fullText = docData.fbqw.trim();
      } else if (
        docData &&
        (docData.jbqk || docData.fxgc || docData.cpjg || docData.ssjl || docData.dsr)
      ) {
        const parts: string[] = [];
        if (docData.name) parts.push(String(docData.name));
        if (docData.no) parts.push(String(docData.no));
        if (docData.dsr) parts.push(`【当事人】\n${docData.dsr}`);
        if (docData.ssjl) parts.push(`【诉讼记录】\n${docData.ssjl}`);
        if (docData.jbqk) parts.push(`【基本情况】\n${docData.jbqk}`);
        if (docData.fxgc) parts.push(`【分析过程】\n${docData.fxgc}`);
        if (docData.cpjg) parts.push(`【裁判结果】\n${docData.cpjg}`);
        fullText = parts.join('\n\n');
      } else if (hasContent) {
        fullText = String(docData.content).trim();
      } else if (hasBody) {
        fullText = String(docData.body).trim();
      }

      const enrichedData = {
        raw: res.data,
        docData,
        hasFbqw,
        hasContent,
        hasBody,
        contentLength: fullText.length,
        previewText: fullText.slice(0, 300),
      };

      setStep4({
        status: 'success',
        url: res.url,
        statusCode: res.statusCode,
        durationMs: res.durationMs,
        data: enrichedData,
        timestamp: new Date().toLocaleTimeString(),
      });
      return enrichedData;
    } catch (err: any) {
      setStep4({
        status: 'failed',
        url: err.url,
        statusCode: err.statusCode || 0,
        durationMs: err.durationMs,
        error: err.message || (err.name === 'TypeError' ? '网络连接异常或被浏览器 CORS 拦截' : String(err)),
        data: err.data,
        timestamp: new Date().toLocaleTimeString(),
      });
    }
  };

  // 5. 阶段二核心：导入测试 5 份案件入库（自动翻页寻找未入库新案件，最多检查 10 页）
  const handleImportFiveCases = async () => {
    setIsImportingTest(true);
    const summary: ImportTestSummary = {
      discovered: 0,
      saved: 0,
      duplicates: 0,
      failed: 0,
      checkedPages: [],
      details: [],
    };

    const adapter = new LaborInfoAdapter(baseUrl);

    try {
      // 1. 获取现有 IndexedDB 中已经入库的所有 sourceId，用于智能寻找新案件
      const existingDocs = await DataService.getLaborInfoRawDocuments();
      const existingSourceIds = new Set(existingDocs.map((d) => String(d.sourceId)));

      let targetItemsToImport: any[] = [];
      let currentPage = 1;
      let totalPages = 1;
      const maxPagesToCheck = 10;

      // 2. 循环翻页（最多 10 页），找到包含未入库新案件的列表或收集前 5 件
      while (currentPage <= maxPagesToCheck) {
        summary.checkedPages?.push(currentPage);
        const searchResult = await adapter.searchCases({
          province: step3Params.province,
          caseLevel: step3Params.caseLevel,
          start_date: step3Params.start_date,
          end_date: step3Params.end_date,
          page: currentPage,
          per_page: 5,
        });

        const metaTotalPages = searchResult.rawResponse?.meta?.total_pages;
        if (typeof metaTotalPages === 'number') {
          totalPages = metaTotalPages;
        }

        const items = searchResult.items || [];
        if (items.length === 0) {
          break;
        }

        // 检查该页中是否有在 IndexedDB 中尚未存在的 sourceId
        const newItemsInPage = items.filter((item) => !existingSourceIds.has(String(item.sourceId)));

        if (newItemsInPage.length > 0) {
          // 找到了包含新文书的页面，采用该页中的案件（优先取新案件，凑齐至多 5 件）
          targetItemsToImport = [...newItemsInPage, ...items.filter((item) => existingSourceIds.has(String(item.sourceId)))].slice(0, 5);
          break;
        }

        // 如果全部已经存在且还有下一页，继续尝试下一页
        if (currentPage >= totalPages) {
          // 已到最后一页
          targetItemsToImport = items.slice(0, 5);
          break;
        }

        currentPage += 1;
      }

      // 如果前 10 页全都在 IndexedDB 中存在，默认取第 1 页执行标准去重检查
      if (targetItemsToImport.length === 0) {
        const fallbackSearch = await adapter.searchCases({
          province: step3Params.province,
          caseLevel: step3Params.caseLevel,
          start_date: step3Params.start_date,
          end_date: step3Params.end_date,
          page: 1,
          per_page: 5,
        });
        targetItemsToImport = fallbackSearch.items.slice(0, 5);
      }

      summary.discovered = targetItemsToImport.length;

      if (targetItemsToImport.length === 0) {
        throw new Error('未检索到任何符合条件的案件元数据，请检查检索参数');
      }

      // 3. 逐个 fetch 详情并由现有 DataService.saveLaborInfoRawDocument 执行标准保存与去重
      for (const meta of targetItemsToImport) {
        try {
          const rawDoc = await adapter.fetchCaseDetail(meta.sourceId, meta);
          const saveResult = await DataService.saveLaborInfoRawDocument(rawDoc);

          if (saveResult.saved) {
            summary.saved += 1;
            summary.details.push({
              id: meta.sourceId,
              title: meta.title,
              status: 'saved',
              message: `成功保存至 IndexedDB (docId: ${saveResult.docId})`,
            });
          } else if (saveResult.isDuplicate) {
            summary.duplicates += 1;
            summary.details.push({
              id: meta.sourceId,
              title: meta.title,
              status: 'duplicate',
              message: `已存在跳过: ${saveResult.reason || '重复文书'}`,
            });
          }
        } catch (detailErr: any) {
          summary.failed += 1;
          summary.details.push({
            id: meta.sourceId,
            title: meta.title,
            status: 'failed',
            message: detailErr.message || '详情获取或写入失败',
          });
        }
      }

      if (summary.saved === 0 && summary.duplicates > 0 && summary.checkedPages && summary.checkedPages.length >= maxPagesToCheck) {
        summary.message = '当前测试范围内前 10 页文书均已入库，未发现新的案件，请扩大日期范围或继续分页。';
      }

      setImportSummary(summary);
      setHistoryRefreshKey((k) => k + 1);
    } catch (err: any) {
      console.error('导入测试 5 份案件流程异常:', err);
      summary.details.push({
        id: 'error',
        title: '流程全局错误',
        status: 'failed',
        message: err.message || '工劳网检索或网络连接中断',
      });
      setImportSummary(summary);
    } finally {
      setIsImportingTest(false);
    }
  };

  // 执行全流程测试
  const handleRunAllTests = async () => {
    setIsRunningAll(true);
    try {
      await runTestStep1();
      await runTestStep2();
      const searchRes = await runTestStep3(1);

      const casesList = Array.isArray(searchRes)
        ? searchRes
        : searchRes?.data || searchRes?.items || searchRes?.lawcases || [];

      if (casesList.length > 0) {
        const firstId = casesList[0]?.id || casesList[0]?._id;
        if (firstId) {
          await runTestStep4(String(firstId));
        }
      }
    } catch (e) {
      console.warn('测试链路中断:', e);
    } finally {
      setIsRunningAll(false);
    }
  };

  // 解析 Step 2 中的省份与审判层级字典
  const getVocabProvinces = (vocabData: any): string[] => {
    if (!vocabData) return [];
    if (Array.isArray(vocabData.provinces)) return vocabData.provinces;
    if (Array.isArray(vocabData.province)) return vocabData.province;
    if (vocabData.data && Array.isArray(vocabData.data.lawcases?.province)) return vocabData.data.lawcases.province;
    if (typeof vocabData.provinces === 'object') return Object.keys(vocabData.provinces);
    return [];
  };

  const getVocabCaseLevels = (vocabData: any): string[] => {
    if (!vocabData) return [];
    if (Array.isArray(vocabData.caseLevels)) return vocabData.caseLevels;
    if (Array.isArray(vocabData.case_levels)) return vocabData.case_levels;
    if (Array.isArray(vocabData.caseLevel)) return vocabData.caseLevel;
    if (vocabData.data && Array.isArray(vocabData.data.lawcases?.caseLevel)) return vocabData.data.lawcases.caseLevel;
    if (typeof vocabData.caseLevels === 'object') return Object.keys(vocabData.caseLevels);
    return [];
  };

  // 解析 Step 3 中的搜索结果列表（优先读取 response.data）
  const getSearchItems = (searchData: any): any[] => {
    if (!searchData) return [];
    if (Array.isArray(searchData)) return searchData;
    if (Array.isArray(searchData.data)) return searchData.data;
    if (Array.isArray(searchData.items)) return searchData.items;
    if (Array.isArray(searchData.lawcases)) return searchData.lawcases;
    if (Array.isArray(searchData.results)) return searchData.results;
    return [];
  };

  // 正确读取总案件数：优先从 meta.total_count 读取
  const getTotalCount = (searchData: any): number => {
    if (!searchData) return 0;
    if (typeof searchData.meta?.total_count === 'number') return searchData.meta.total_count;
    if (typeof searchData.total_count === 'number') return searchData.total_count;
    if (typeof searchData.total === 'number') return searchData.total;
    if (typeof searchData.count === 'number') return searchData.count;
    if (Array.isArray(searchData.data)) return searchData.data.length;
    if (Array.isArray(searchData)) return searchData.length;
    return 0;
  };

  // 读取总页数：从 meta.total_pages 读取
  const getTotalPages = (searchData: any): number => {
    if (!searchData) return 0;
    if (typeof searchData.meta?.total_pages === 'number') return searchData.meta.total_pages;
    if (typeof searchData.total_pages === 'number') return searchData.total_pages;
    const totalCount = getTotalCount(searchData);
    const perPage = searchData.meta?.per_page || step3Params.per_page || 5;
    return totalCount > 0 ? Math.ceil(totalCount / perPage) : 0;
  };

  // 读取当前响应中的页码
  const getCurrentPage = (searchData: any): number => {
    if (!searchData) return step3Params.page;
    if (typeof searchData.meta?.page === 'number') return searchData.meta.page;
    return step3Params.page;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* 顶部标题与环境配置区 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                <Globe className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  工劳网 API 连通性与入库测试
                  <span className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800 rounded-full">
                    v1.1 阶段二
                  </span>
                </h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  验证工劳网接口通信、RawDocument 转换适配及 IndexedDB 零污染入库与去重机制
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              id="btn-import-5-cases-test"
              onClick={handleImportFiveCases}
              disabled={isImportingTest || isRunningAll}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-300 text-white text-sm font-semibold rounded-xl flex items-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <Download className={`w-4 h-4 ${isImportingTest ? 'animate-bounce' : ''}`} />
              {isImportingTest ? '正在入库 5 份案件...' : '导入测试 5 份案件'}
            </button>

            <button
              id="btn-run-all-api-tests"
              onClick={handleRunAllTests}
              disabled={isRunningAll || isImportingTest}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-300 text-white text-sm font-semibold rounded-xl flex items-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <Play className={`w-4 h-4 ${isRunningAll ? 'animate-spin' : ''}`} />
              {isRunningAll ? '正在执行测试...' : '一键执行连通性测试'}
            </button>
          </div>
        </div>

        {/* 基础域名配置与说明 */}
        <div className="mt-5 pt-5 border-t border-slate-100 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          <div className="md:col-span-4">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              工劳网 API 基础域名 (Base URL)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://laborinfocn.com"
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>
          </div>

          <div className="md:col-span-8 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400 font-medium">推荐候选域名:</span>
            {['https://laborinfocn.com', 'https://search.laborinfocn.com', 'https://laborinfozh.com'].map((domain) => (
              <button
                key={domain}
                type="button"
                onClick={() => setBaseUrl(domain)}
                className={`px-2.5 py-1 rounded-md border font-mono transition-colors cursor-pointer ${
                  baseUrl === domain
                    ? 'bg-blue-50 border-blue-300 text-blue-700 font-bold'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {domain}
              </button>
            ))}
          </div>
        </div>

        {/* 阶段二去重与零污染合规声明 */}
        <div className="mt-4 p-3.5 bg-indigo-50/80 border border-indigo-200 rounded-xl flex items-start gap-2.5 text-xs text-indigo-950 leading-relaxed">
          <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">阶段二入库与去重保护：</span>
            点击「导入测试 5 份案件」将自动调用 search → fetch 详情 → 转换为 <code>RawDocument</code> 实体 → 保存至本地 IndexedDB <code>rawDocuments</code> 表。采用 <code>source + sourceId</code> 优先、<code>contentHash</code> 兜底去重机制。完全不触发统计分析、不修改 v1.0 现有分析与解析表。
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 导入测试执行结果面板 (发现/成功/重复/失败) */}
      {/* ========================================================================= */}
      {importSummary && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-indigo-600" />
              <h2 className="text-base font-bold text-slate-900">本次测试导入执行结果</h2>
            </div>
            <div className="flex items-center gap-3">
              {importSummary.checkedPages && importSummary.checkedPages.length > 0 && (
                <span className="text-xs text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200">
                  检查页码: {importSummary.checkedPages.join(', ')} 页
                </span>
              )}
              <span className="text-2xs font-mono text-slate-400">
                {new Date().toLocaleTimeString()}
              </span>
            </div>
          </div>

          {/* 提示信息 */}
          {importSummary.message && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{importSummary.message}</span>
            </div>
          )}

          {/* 4 维指标汇总 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-2xs text-slate-500 font-semibold uppercase">发现文书 (Found)</div>
              <div className="text-2xl font-bold font-mono text-slate-800 mt-1">{importSummary.discovered}</div>
            </div>
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="text-2xs text-emerald-600 font-semibold uppercase">成功入库 (Saved)</div>
              <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">{importSummary.saved}</div>
            </div>
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="text-2xs text-amber-600 font-semibold uppercase">已存在跳过 (Duplicates)</div>
              <div className="text-2xl font-bold font-mono text-amber-700 mt-1">{importSummary.duplicates}</div>
            </div>
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl">
              <div className="text-2xs text-rose-600 font-semibold uppercase">失败 (Failed)</div>
              <div className="text-2xl font-bold font-mono text-rose-700 mt-1">{importSummary.failed}</div>
            </div>
          </div>

          {/* 逐篇状态清单 */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-700">文书处理明细清单:</div>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
              {importSummary.details.map((item, idx) => (
                <div key={idx} className="p-3 flex items-center justify-between gap-3 bg-white hover:bg-slate-50">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {item.status === 'saved' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                    {item.status === 'duplicate' && <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />}
                    {item.status === 'failed' && <XCircle className="w-4 h-4 text-rose-600 shrink-0" />}
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 truncate">{item.title}</div>
                      <div className="text-2xs font-mono text-slate-400">ID: {item.id}</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`px-2.5 py-0.5 rounded-full text-2xs font-semibold ${
                      item.status === 'saved'
                        ? 'bg-emerald-100 text-emerald-800'
                        : item.status === 'duplicate'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}>
                      {item.status === 'saved' ? '成功入库' : item.status === 'duplicate' ? '重复跳过' : '处理失败'}
                    </span>
                    <div className="text-2xs text-slate-500 mt-0.5">{item.message}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 阶段二：工劳网入库文书历史列表 (LaborInfoImportHistory) */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <LaborInfoImportHistory onRefreshTrigger={historyRefreshKey} />
      </div>

      {/* 4 个测试步骤模块卡片 */}
      <div className="space-y-6">
        {/* ========================================================================= */}
        {/* 测试 1: OpenAPI 规范 */}
        {/* ========================================================================= */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-sm font-mono">
                1
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  OpenAPI 规范文档探测
                  <code className="text-xs px-2 py-0.5 bg-slate-200/70 text-slate-700 font-mono rounded">
                    GET /api/v1/openapi.json
                  </code>
                </h2>
                <p className="text-xs text-slate-500">检验工劳网接口机读规范是否存在及可用性</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <StatusBadge status={step1.status} statusCode={step1.statusCode} durationMs={step1.durationMs} />
              <button
                id="btn-test-step-1"
                onClick={runTestStep1}
                disabled={step1.status === 'running'}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${step1.status === 'running' ? 'animate-spin' : ''}`} />
                单独测试
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {step1.url && (
              <div className="text-xs text-slate-500 font-mono flex items-center gap-2">
                <span className="font-semibold text-slate-600">请求 URL:</span>
                <span className="bg-slate-50 px-2 py-1 border border-slate-200 rounded text-slate-700 break-all select-all">
                  {step1.url}
                </span>
              </div>
            )}

            {step1.status === 'failed' && (
              <ErrorBox error={step1.error} statusCode={step1.statusCode} url={step1.url} />
            )}

            {step1.status === 'success' && step1.data && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="text-2xs text-slate-400 font-semibold uppercase">OpenAPI 版本</div>
                    <div className="text-sm font-bold font-mono text-slate-800 mt-0.5">
                      {step1.data.openapi || step1.data.swagger || '未声明'}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="text-2xs text-slate-400 font-semibold uppercase">文档标题</div>
                    <div className="text-sm font-bold text-slate-800 mt-0.5 truncate">
                      {step1.data.info?.title || '工劳网 API'}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="text-2xs text-slate-400 font-semibold uppercase">API 版本</div>
                    <div className="text-sm font-bold font-mono text-slate-800 mt-0.5">
                      {step1.data.info?.version || '1.0.0'}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="text-2xs text-slate-400 font-semibold uppercase">已声明 Paths 数量</div>
                    <div className="text-sm font-bold font-mono text-blue-600 mt-0.5">
                      {step1.data.paths ? Object.keys(step1.data.paths).length : 0} 个端点
                    </div>
                  </div>
                </div>

                {step1.data.paths && (
                  <div>
                    <div className="text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                      <Code2 className="w-3.5 h-3.5 text-blue-600" />
                      发现的公开端点列表:
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-slate-900 rounded-xl text-xs font-mono text-slate-300">
                      {Object.keys(step1.data.paths).map((path) => (
                        <span key={path} className="px-2 py-0.5 bg-slate-800 rounded text-emerald-400 border border-slate-700">
                          {path}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {step1.status === 'idle' && (
              <div className="text-center py-6 text-xs text-slate-400">
                尚未执行测试。点击右上角「单独测试」或「一键执行完整连通性测试」。
              </div>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 测试 2: Vocabularies 枚举字典 */}
        {/* ========================================================================= */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-sm font-mono">
                2
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  检索字典与枚举值获取
                  <code className="text-xs px-2 py-0.5 bg-slate-200/70 text-slate-700 font-mono rounded">
                    GET /api/v1/vocabularies
                  </code>
                </h2>
                <p className="text-xs text-slate-500">探测省份列表（province）与审判层级列表（caseLevel）字典</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <StatusBadge status={step2.status} statusCode={step2.statusCode} durationMs={step2.durationMs} />
              <button
                id="btn-test-step-2"
                onClick={runTestStep2}
                disabled={step2.status === 'running'}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${step2.status === 'running' ? 'animate-spin' : ''}`} />
                单独测试
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {step2.url && (
              <div className="text-xs text-slate-500 font-mono flex items-center gap-2">
                <span className="font-semibold text-slate-600">请求 URL:</span>
                <span className="bg-slate-50 px-2 py-1 border border-slate-200 rounded text-slate-700 break-all select-all">
                  {step2.url}
                </span>
              </div>
            )}

            {step2.status === 'failed' && (
              <ErrorBox error={step2.error} statusCode={step2.statusCode} url={step2.url} />
            )}

            {step2.status === 'success' && step2.data && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 省份列表 */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-indigo-600" />
                      支持的省份列表 (Provinces)
                    </span>
                    <span className="text-2xs font-mono px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full font-bold">
                      {getVocabProvinces(step2.data).length} 个省区
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-2 bg-white border border-slate-200 rounded-lg">
                    {getVocabProvinces(step2.data).length > 0 ? (
                      getVocabProvinces(step2.data).map((prov) => (
                        <span
                          key={prov}
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            prov.includes('广东')
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {prov}
                        </span>
                      ))
                    ) : (
                      <pre className="text-xs font-mono text-slate-600 p-2">
                        {JSON.stringify(step2.data, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>

                {/* 审判层级列表 */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
                      支持的审判层级 (CaseLevel / TrialLevel)
                    </span>
                    <span className="text-2xs font-mono px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full font-bold">
                      {getVocabCaseLevels(step2.data).length} 类
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-2 bg-white border border-slate-200 rounded-lg">
                    {getVocabCaseLevels(step2.data).length > 0 ? (
                      getVocabCaseLevels(step2.data).map((lvl) => (
                        <span key={lvl} className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded text-xs font-semibold">
                          {lvl}
                        </span>
                      ))
                    ) : (
                      <pre className="text-xs font-mono text-slate-600 p-2">
                        {JSON.stringify(step2.data, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            )}

            {step2.status === 'idle' && (
              <div className="text-center py-6 text-xs text-slate-400">
                尚未执行测试。
              </div>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 测试 3: Lawcases Search 检索测试 */}
        {/* ========================================================================= */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-sm font-mono">
                3
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  判决文书检索测试
                  <code className="text-xs px-2 py-0.5 bg-slate-200/70 text-slate-700 font-mono rounded">
                    GET /api/v1/lawcases/search
                  </code>
                </h2>
                <p className="text-xs text-slate-500">
                  支持指定参数、随机分页与连续翻页测试（广东省 + 二审 + 2021-01-01至2023-12-31）
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={step3.status} statusCode={step3.statusCode} durationMs={step3.durationMs} />
              
              {/* 页码选择与快捷测试按钮群 */}
              <button
                id="btn-test-step-3-page-1"
                onClick={() => runTestStep3(1)}
                disabled={step3.status === 'running'}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                title="重置为第 1 页测试"
              >
                第 1 页
              </button>

              <button
                id="btn-test-step-3-random"
                onClick={handleRandomPageTest}
                disabled={step3.status === 'running'}
                className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 text-xs font-semibold rounded-lg flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                title="根据总页数随机选择一页测试"
              >
                <Shuffle className={`w-3.5 h-3.5 ${step3.status === 'running' ? 'animate-spin' : ''}`} />
                随机页
              </button>

              <button
                id="btn-test-step-3-next"
                onClick={handleNextPageTest}
                disabled={step3.status === 'running'}
                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-semibold rounded-lg flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                title="测试下一页数据"
              >
                下一页
                <ChevronRight className="w-3.5 h-3.5" />
              </button>

              <button
                id="btn-test-step-3"
                onClick={() => runTestStep3()}
                disabled={step3.status === 'running'}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <Search className={`w-3.5 h-3.5 ${step3.status === 'running' ? 'animate-spin' : ''}`} />
                执行检索测试
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* 设定参数与实际请求页展示 */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-2 sm:grid-cols-6 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-2xs font-medium">province</span>
                <span className="font-semibold text-slate-800 font-mono">{step3Params.province}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-2xs font-medium">caseLevel</span>
                <span className="font-semibold text-slate-800 font-mono">{step3Params.caseLevel}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-2xs font-medium">start_date</span>
                <span className="font-semibold text-slate-800 font-mono">{step3Params.start_date}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-2xs font-medium">end_date</span>
                <span className="font-semibold text-slate-800 font-mono">{step3Params.end_date}</span>
              </div>
              <div className="p-1.5 bg-blue-50/70 border border-blue-200 rounded-lg">
                <span className="text-blue-500 block text-2xs font-bold">当前请求页 (page)</span>
                <span className="font-bold text-blue-700 font-mono text-sm">{step3Params.page}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-2xs font-medium">每页数量 (per_page)</span>
                <span className="font-semibold text-slate-800 font-mono">{step3Params.per_page}</span>
              </div>
            </div>

            {step3.url && (
              <div className="text-xs text-slate-500 font-mono flex items-center gap-2">
                <span className="font-semibold text-slate-600">请求 URL:</span>
                <span className="bg-slate-50 px-2 py-1 border border-slate-200 rounded text-slate-700 break-all select-all">
                  {step3.url}
                </span>
              </div>
            )}

            {step3.status === 'failed' && (
              <ErrorBox error={step3.error} statusCode={step3.statusCode} url={step3.url} />
            )}

            {step3.status === 'success' && step3.data && (
              <div className="space-y-4">
                {/* 诊断看板信息 */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="text-2xs text-slate-500 font-semibold uppercase">HTTP 状态</div>
                    <div className="text-lg font-bold font-mono text-emerald-600 mt-0.5">
                      {step3.statusCode || 200} OK
                    </div>
                  </div>
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="text-2xs text-slate-500 font-semibold uppercase">检索总案件数 (total_count)</div>
                    <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">
                      {getTotalCount(step3.data).toLocaleString()} 篇
                    </div>
                  </div>
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="text-2xs text-slate-500 font-semibold uppercase">总页数 (total_pages)</div>
                    <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">
                      {getTotalPages(step3.data).toLocaleString()} 页
                    </div>
                  </div>
                  <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl">
                    <div className="text-2xs text-blue-600 font-semibold uppercase">当前页 / 返回数</div>
                    <div className="text-lg font-bold font-mono text-blue-700 mt-0.5">
                      第 {getCurrentPage(step3.data)} 页 / {getSearchItems(step3.data).length} 篇
                    </div>
                  </div>
                </div>

                {/* 案件列表展示 */}
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-3.5 py-2.5">ID</th>
                        <th className="px-3.5 py-2.5">案件标题 (name)</th>
                        <th className="px-3.5 py-2.5">案号 (no)</th>
                        <th className="px-3.5 py-2.5">审理法院 (courtNm)</th>
                        <th className="px-3.5 py-2.5">裁判日期 (pbDt)</th>
                        <th className="px-3.5 py-2.5">审判层级 (caseLevel)</th>
                        <th className="px-3.5 py-2.5 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {getSearchItems(step3.data).map((item: any, idx: number) => {
                        const itemId = item.id ?? item._id ?? String(idx + 1);
                        const itemTitle = item.name || item.title || '无标题';
                        const itemNo = item.no || '-';
                        const itemCourt = item.courtNm || item.court || item.courtName || '-';
                        const itemDate = item.pbDt || item.date || item.judgement_date || '-';
                        const itemLevel = item.caseLevel || item.level || '二审';

                        return (
                          <tr key={itemId} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-3.5 py-2.5 font-mono text-slate-500 font-semibold">{itemId}</td>
                            <td className="px-3.5 py-2.5 font-medium text-slate-900 max-w-xs truncate" title={itemTitle}>
                              {itemTitle}
                            </td>
                            <td className="px-3.5 py-2.5 font-mono text-slate-600 max-w-xs truncate" title={itemNo}>
                              {itemNo}
                            </td>
                            <td className="px-3.5 py-2.5 text-slate-600">{itemCourt}</td>
                            <td className="px-3.5 py-2.5 font-mono text-slate-600">{itemDate}</td>
                            <td className="px-3.5 py-2.5">
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded font-mono font-medium">
                                {itemLevel}
                              </span>
                            </td>
                            <td className="px-3.5 py-2.5 text-right">
                              <button
                                onClick={() => {
                                  setStep4CaseId(String(itemId));
                                  runTestStep4(String(itemId));
                                }}
                                className="px-2 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-700 font-medium rounded transition-colors cursor-pointer"
                              >
                                测试取此正文
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {step3.status === 'idle' && (
              <div className="text-center py-6 text-xs text-slate-400">
                尚未执行检索测试。
              </div>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 测试 4: Lawcase Detail 详情正文测试 */}
        {/* ========================================================================= */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 font-bold flex items-center justify-center text-sm font-mono">
                4
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  判决文书详情正文探测
                  <code className="text-xs px-2 py-0.5 bg-slate-200/70 text-slate-700 font-mono rounded">
                    GET /api/v1/lawcases/:id
                  </code>
                </h2>
                <p className="text-xs text-slate-500">
                  验证目标案件的发布全文（fbqw）、正文字符长度及各结构化字段
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <StatusBadge status={step4.status} statusCode={step4.statusCode} durationMs={step4.durationMs} />
              <button
                id="btn-test-step-4"
                onClick={() => runTestStep4()}
                disabled={step4.status === 'running' || !step4CaseId}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-100 disabled:bg-slate-50 disabled:text-slate-400 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <FileText className={`w-3.5 h-3.5 ${step4.status === 'running' ? 'animate-spin' : ''}`} />
                单独测试详情正文
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* 目标 ID 输入框 */}
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-slate-600">目标案件 ID:</label>
              <input
                type="text"
                value={step4CaseId}
                onChange={(e) => setStep4CaseId(e.target.value)}
                placeholder="先执行测试 3 获取或在此粘贴案件 ID"
                className="w-72 px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white"
              />
              <span className="text-2xs text-slate-400">
                (已自动绑定上一步随机/选取的案件)
              </span>
            </div>

            {step4.url && (
              <div className="text-xs text-slate-500 font-mono flex items-center gap-2">
                <span className="font-semibold text-slate-600">请求 URL:</span>
                <span className="bg-slate-50 px-2 py-1 border border-slate-200 rounded text-slate-700 break-all select-all">
                  {step4.url}
                </span>
              </div>
            )}

            {step4.status === 'failed' && (
              <ErrorBox error={step4.error} statusCode={step4.statusCode} url={step4.url} />
            )}

            {step4.status === 'success' && step4.data && (
              <div className="space-y-4">
                {/* 字段探测分析看板 */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="text-2xs font-semibold text-slate-400 uppercase">正文总字符长度</div>
                    <div className="text-2xl font-bold font-mono text-purple-700 mt-1">
                      {step4.data.contentLength?.toLocaleString()} 字
                    </div>
                    <div className="text-2xs text-slate-400 mt-0.5 font-mono">
                      {step4.data.contentLength > 500 ? '✅ 正文完整充实' : '⚠️ 正文偏短'}
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="text-2xs font-semibold text-slate-400 uppercase">发布全文 (fbqw) 字段状态</div>
                    <div className="text-lg font-bold font-mono mt-1 flex items-center gap-2">
                      {step4.data.hasFbqw ? (
                        <span className="text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" /> 存在 (标准正文)
                        </span>
                      ) : (
                        <span className="text-slate-400 flex items-center gap-1">
                          <XCircle className="w-4 h-4" /> 未声明
                        </span>
                      )}
                    </div>
                    <div className="text-2xs text-slate-400 mt-0.5 font-mono">
                      docData.fbqw
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="text-2xs font-semibold text-slate-400 uppercase">结构化判决段落状态</div>
                    <div className="text-lg font-bold font-mono mt-1 flex items-center gap-2">
                      {step4.data.docData?.cpjg || step4.data.docData?.fxgc || step4.data.docData?.jbqk ? (
                        <span className="text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" /> 裁判/论述/事实完整
                        </span>
                      ) : (
                        <span className="text-slate-400 flex items-center gap-1">
                          <XCircle className="w-4 h-4" /> 无结构段落
                        </span>
                      )}
                    </div>
                    <div className="text-2xs text-slate-400 mt-0.5 font-mono">
                      cpjg / fxgc / jbqk
                    </div>
                  </div>
                </div>

                {/* 正文预览 */}
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-slate-200 text-xs">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 font-semibold text-slate-400">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <Code2 className="w-4 h-4" />
                      正文前 300 字符切片预览
                    </span>
                    <span className="font-mono text-2xs text-slate-500">utf-8 text</span>
                  </div>
                  <p className="font-sans leading-relaxed text-slate-300 whitespace-pre-wrap">
                    {step4.data.previewText || '（正文内容为空）'}
                    {step4.data.contentLength > 300 && '...'}
                  </p>
                </div>
              </div>
            )}

            {step4.status === 'idle' && (
              <div className="text-center py-6 text-xs text-slate-400">
                尚未执行正文详情探测。
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// 状态徽章组件
const StatusBadge: React.FC<{
  status: 'idle' | 'running' | 'success' | 'failed';
  statusCode?: number;
  durationMs?: number;
}> = ({ status, statusCode, durationMs }) => {
  if (status === 'idle') {
    return (
      <span className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-full text-xs font-medium">
        待测试
      </span>
    );
  }

  if (status === 'running') {
    return (
      <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping inline-block" />
        请求中...
      </span>
    );
  }

  if (status === 'success') {
    return (
      <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-medium flex items-center gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
        HTTP {statusCode || 200}
        {durationMs !== undefined && <span className="font-mono text-2xs text-emerald-600">({durationMs}ms)</span>}
      </span>
    );
  }

  return (
    <span className="px-2.5 py-1 bg-rose-100 text-rose-800 rounded-full text-xs font-medium flex items-center gap-1.5">
      <XCircle className="w-3.5 h-3.5 text-rose-600" />
      {statusCode ? `HTTP ${statusCode}` : '请求失败'}
      {durationMs !== undefined && <span className="font-mono text-2xs text-rose-600">({durationMs}ms)</span>}
    </span>
  );
};

// 错误展示与排查建议组件
const ErrorBox: React.FC<{
  error?: string;
  statusCode?: number;
  url?: string;
}> = ({ error, statusCode, url }) => {
  const isCorsOrNetwork = !statusCode || statusCode === 0 || error?.includes('CORS') || error?.includes('Failed to fetch');

  return (
    <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2 text-xs text-rose-900">
      <div className="flex items-center gap-2 font-bold text-rose-700">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>请求异常响应</span>
      </div>

      <div className="space-y-1 font-mono text-2xs">
        {url && (
          <div>
            <span className="text-rose-500 font-semibold">请求 URL:</span> {url}
          </div>
        )}
        <div>
          <span className="text-rose-500 font-semibold">状态码 (Status):</span> {statusCode || '0 (无 HTTP 响应)'}
        </div>
        <div>
          <span className="text-rose-500 font-semibold">错误信息:</span> {error || '未知错误'}
        </div>
      </div>

      {isCorsOrNetwork && (
        <div className="mt-2 pt-2 border-t border-rose-200/80 text-2xs text-rose-800 leading-relaxed font-sans">
          <strong>排查与说明：</strong> 当前请求未能从目标服务器完成跨域握手（可能原因：浏览器沙箱跨域限制、目标域名 DNS 波动或被防火墙拦截）。在真实部署环境中可通过配置开发代理或使用工劳网其他镜像域名（如 <code>https://laborinfocn.com</code> / <code>https://search.laborinfocn.com</code>）重试。
        </div>
      )}
    </div>
  );
};
