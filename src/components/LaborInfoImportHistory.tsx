import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Clock,
  ExternalLink,
  Layers,
  Search,
  RefreshCw,
  Hash,
  Eye,
  X,
  Code2,
  Building,
  Calendar,
  AlertCircle,
  Filter,
} from 'lucide-react';
import { RawDocument } from '../types';
import { DataService } from '../services/data/dataService';

interface LaborInfoImportHistoryProps {
  onRefreshTrigger?: number;
}

export const LaborInfoImportHistory: React.FC<LaborInfoImportHistoryProps> = ({ onRefreshTrigger }) => {
  const [documents, setDocuments] = useState<RawDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<RawDocument | null>(null);
  const [filterKeyword, setFilterKeyword] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('ALL');

  const [stats, setStats] = useState<{
    total: number;
    year2021: number;
    year2022: number;
    year2023: number;
    otherYears: number;
  }>({
    total: 0,
    year2021: 0,
    year2022: 0,
    year2023: 0,
    otherYears: 0,
  });

  const loadDocumentsAndStats = useCallback(async () => {
    setLoading(true);
    try {
      const [docs, statData] = await Promise.all([
        DataService.getLaborInfoRawDocuments(2000),
        DataService.getLaborInfoStats(),
      ]);
      setDocuments(docs);
      setStats(statData);
    } catch (err) {
      console.error('加载工劳网案例库失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocumentsAndStats();
  }, [loadDocumentsAndStats, onRefreshTrigger]);

  const filteredDocs = documents.filter((doc) => {
    const dateStr = doc.publishedAt || doc.sourceMetadata?.date || doc.sourceMetadata?.pbDt || '';
    
    // 年份筛选
    if (selectedYear !== 'ALL') {
      if (selectedYear === 'OTHER') {
        if (dateStr.startsWith('2021') || dateStr.startsWith('2022') || dateStr.startsWith('2023')) {
          return false;
        }
      } else if (!dateStr.startsWith(selectedYear)) {
        return false;
      }
    }

    // 关键词筛选 (标题、法院、案号、sourceId、ID、正文)
    if (!filterKeyword.trim()) return true;
    const kw = filterKeyword.toLowerCase();
    const court = (doc.sourceMetadata?.court || doc.sourceMetadata?.courtNm || '').toLowerCase();
    const caseNo = (doc.sourceMetadata?.no || '').toLowerCase();
    const title = (doc.title || '').toLowerCase();
    const sourceId = (doc.sourceId || '').toLowerCase();
    const docId = doc.id.toLowerCase();
    const text = (doc.rawText || '').toLowerCase();

    return (
      title.includes(kw) ||
      court.includes(kw) ||
      caseNo.includes(kw) ||
      sourceId.includes(kw) ||
      docId.includes(kw) ||
      text.includes(kw)
    );
  });

  return (
    <div className="space-y-6">
      {/* 顶部统计卡片群 (符合需求十二：工劳网文书总数、2021、2022、2023 统计) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-5 bg-indigo-50/70 border border-indigo-100 rounded-2xl shadow-sm">
          <div className="text-2xs font-semibold text-indigo-700 uppercase tracking-wide">
            工劳网文书总数
          </div>
          <div className="text-2xl font-bold font-mono text-indigo-900 mt-1">
            {stats.total.toLocaleString()} <span className="text-xs font-normal text-indigo-600">份文书</span>
          </div>
        </div>

        <div className="p-5 bg-white/80 border border-white/80 rounded-2xl shadow-sm">
          <div className="text-2xs font-semibold text-slate-500 uppercase tracking-wide">
            2023 年文书
          </div>
          <div className="text-xl font-bold font-mono text-slate-800 mt-1">
            {stats.year2023.toLocaleString()} <span className="text-xs font-normal text-slate-500">份文书</span>
          </div>
        </div>

        <div className="p-5 bg-white/80 border border-white/80 rounded-2xl shadow-sm">
          <div className="text-2xs font-semibold text-slate-500 uppercase tracking-wide">
            2022 年文书
          </div>
          <div className="text-xl font-bold font-mono text-slate-800 mt-1">
            {stats.year2022.toLocaleString()} <span className="text-xs font-normal text-slate-500">份文书</span>
          </div>
        </div>

        <div className="p-5 bg-white/80 border border-white/80 rounded-2xl shadow-sm">
          <div className="text-2xs font-semibold text-slate-500 uppercase tracking-wide">
            2021 年文书
          </div>
          <div className="text-xl font-bold font-mono text-slate-800 mt-1">
            {stats.year2021.toLocaleString()} <span className="text-xs font-normal text-slate-500">份文书</span>
          </div>
        </div>

        <div className="p-5 bg-white/80 border border-white/80 rounded-2xl shadow-sm">
          <div className="text-2xs font-semibold text-slate-500 uppercase tracking-wide">
            其他年份
          </div>
          <div className="text-xl font-bold font-mono text-slate-800 mt-1">
            {stats.otherYears.toLocaleString()} <span className="text-xs font-normal text-slate-500">份文书</span>
          </div>
        </div>
      </div>

      {/* 头部统计与操作过滤条 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-5 bg-white/80 border border-white/80 rounded-[24px] shadow-sm">
        <div className="flex items-center gap-2.5">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              已导入文书
              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-mono font-bold rounded-full">
                显示 {filteredDocs.length} / 共 {documents.length} 份文书
              </span>
            </h3>
            <p className="text-2xs text-slate-500">
              原始文书保存在本地浏览器，可在此筛选、查看与追溯导入记录
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 年份筛选器 */}
          <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg px-2 py-1">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="text-xs text-slate-700 bg-transparent border-none focus:outline-none cursor-pointer"
            >
              <option value="ALL">全部年份</option>
              <option value="2023">2023 年 ({stats.year2023})</option>
              <option value="2022">2022 年 ({stats.year2022})</option>
              <option value="2021">2021 年 ({stats.year2021})</option>
              <option value="OTHER">其他年份 ({stats.otherYears})</option>
            </select>
          </div>

          {/* 搜索框：标题、法院、案号、sourceId */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filterKeyword}
              onChange={(e) => setFilterKeyword(e.target.value)}
              placeholder="搜索标题 / 法院 / 案号 / sourceId..."
              className="pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-56"
            />
          </div>

          <button
            onClick={loadDocumentsAndStats}
            disabled={loading}
            className="p-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-slate-600 transition-colors cursor-pointer"
            title="刷新案例库"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 历史列表表格 */}
      {loading ? (
        <div className="text-center py-12 text-xs text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-500" />
          正在读取本地数据库中的工劳网案例库...
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="text-center py-10 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-xs text-slate-400">
          {documents.length === 0
            ? '暂无已入库的工劳网文书，可在上方启动「工劳网案例批量采集」进行下载入库'
            : '没有匹配当前筛选条件的案例记录'}
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-[24px] bg-white shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-3.5 py-2.5">来源</th>
                <th className="px-3.5 py-2.5">文书标题</th>
                <th className="px-3.5 py-2.5">案号</th>
                <th className="px-3.5 py-2.5">审理法院</th>
                <th className="px-3.5 py-2.5">裁判日期</th>
                <th className="px-3.5 py-2.5">正文长度</th>
                <th className="px-3.5 py-2.5">入库时间</th>
                <th className="px-3.5 py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredDocs.map((doc) => {
                const court = doc.sourceMetadata?.court || doc.sourceMetadata?.courtNm || '-';
                const caseNo = doc.sourceMetadata?.no || '-';
                const date = doc.publishedAt || doc.sourceMetadata?.date || doc.sourceMetadata?.pbDt || '-';
                const textLen = doc.rawText?.length || 0;

                return (
                  <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-3.5 py-2.5 text-slate-600">
                      <div className="font-semibold text-slate-700">工劳网</div>
                      <details className="text-2xs text-slate-400">
                        <summary className="cursor-pointer select-none">技术详情</summary>
                        <div className="mt-1 font-mono truncate max-w-[150px]">sourceId: {doc.sourceId || '-'}</div>
                        <div className="font-mono truncate max-w-[150px]">raw ID: {doc.id}</div>
                      </details>
                    </td>
                    <td className="px-3.5 py-2.5 font-medium text-slate-900 max-w-xs truncate" title={doc.title}>
                      {doc.title}
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-slate-600 max-w-[130px] truncate" title={caseNo}>
                      {caseNo}
                    </td>
                    <td className="px-3.5 py-2.5 text-slate-600">
                      <div className="flex items-center gap-1">
                        <Building className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate max-w-[130px]">{court}</span>
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-slate-600 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                        {date}
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 font-mono">
                      <span className={`px-2 py-0.5 rounded text-2xs font-semibold ${
                        textLen > 1000 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {textLen.toLocaleString()} 字
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-2xs text-slate-400 whitespace-nowrap">
                      {new Date(doc.importedAt).toLocaleString('zh-CN', {
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="px-3.5 py-2.5 text-right">
                      <button
                        onClick={() => setSelectedDoc(doc)}
                        className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg flex items-center gap-1 ml-auto transition-colors cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        查看正文详情
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* RawDocument 详情模态框 */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 truncate max-w-xl">
                    {selectedDoc.title}
                  </h3>
                  <div className="text-2xs font-mono text-slate-500 mt-0.5">
                    Doc ID: {selectedDoc.id} | Source: {selectedDoc.source} (ID: {selectedDoc.sourceId || '-'})
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedDoc(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4">
              {/* 元数据卡片 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-2xs font-semibold text-slate-400 uppercase">审理法院</div>
                  <div className="text-xs font-bold text-slate-800 mt-0.5">
                    {selectedDoc.sourceMetadata?.court || selectedDoc.sourceMetadata?.courtNm || '-'}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-2xs font-semibold text-slate-400 uppercase">裁判日期</div>
                  <div className="text-xs font-bold font-mono text-slate-800 mt-0.5">
                    {selectedDoc.publishedAt || selectedDoc.sourceMetadata?.date || selectedDoc.sourceMetadata?.pbDt || '-'}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-2xs font-semibold text-slate-400 uppercase">正文字符数</div>
                  <div className="text-xs font-bold font-mono text-indigo-600 mt-0.5">
                    {selectedDoc.rawText?.length.toLocaleString() || 0} 字
                  </div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-2xs font-semibold text-slate-400 uppercase">内容哈希 (SHA-256)</div>
                  <div className="text-2xs font-mono text-slate-600 mt-0.5 truncate" title={selectedDoc.contentHash}>
                    {selectedDoc.contentHash}
                  </div>
                </div>
              </div>

              {/* 案号与公开链接 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-2xs font-semibold text-slate-400 uppercase">判决案号</div>
                  <div className="text-xs font-bold font-mono text-slate-800 mt-0.5">
                    {selectedDoc.sourceMetadata?.no || '未记载'}
                  </div>
                </div>
                {selectedDoc.sourceUrl && (
                  <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="text-2xs font-semibold text-blue-700 uppercase">数据源 API 地址</div>
                      <div className="text-xs font-mono text-blue-900 truncate">{selectedDoc.sourceUrl}</div>
                    </div>
                    <a
                      href={selectedDoc.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-600 hover:underline shrink-0 ml-2 font-semibold"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      打开接口
                    </a>
                  </div>
                )}
              </div>

              {/* 原始文本内容 */}
              <div>
                <div className="text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-indigo-600" />
                  完整裁判文书正文 (fbqw / rawText):
                </div>
                <div className="p-4 bg-slate-900 rounded-xl text-slate-200 text-xs font-sans leading-relaxed max-h-96 overflow-y-auto whitespace-pre-wrap select-text">
                  {selectedDoc.rawText || '（正文为空）'}
                </div>
              </div>

              {/* 原始元数据 JSON */}
              {selectedDoc.sourceMetadata && (
                <div>
                  <div className="text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                    <Code2 className="w-3.5 h-3.5 text-slate-500" />
                    原始接口响应元数据 (sourceMetadata):
                  </div>
                  <pre className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-2xs font-mono text-slate-700 max-h-48 overflow-y-auto">
                    {JSON.stringify(selectedDoc.sourceMetadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
              <button
                onClick={() => setSelectedDoc(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
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
