import React, { useState, useEffect, useMemo } from 'react';
import { Search, MapPin, Calendar, FileText, Briefcase, Database, X, Eye, ExternalLink, RefreshCw, XCircle, Scale } from 'lucide-react';
import { AnalysisCaseRecord, RawDocument } from '../types';
import { LaborAnalysisPipeline } from '../services/data/LaborAnalysisPipeline';
import { DataService } from '../services/data/dataService';
import { getOutcomePresentation, getPartyOutcomePresentations } from '../services/outcome/OutcomePresentation';

export const LaborAnalysisCaseLibrary: React.FC<{ onNavigateToCrawler?: () => void, onNavigateToReview?: () => void, onNavigateToAnalytics?: () => void, onNavigateToDefense?: () => void }> = () => {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<AnalysisCaseRecord[]>([]);
  const [pipelineStats, setPipelineStats] = useState({
    rawCount: 0,
    structuredCount: 0,
    pendingCount: 0,
    failedCount: 0,
  });
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [cityFilter, setCityFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [disputeFilter, setDisputeFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');

  const [selectedRecord, setSelectedRecord] = useState<AnalysisCaseRecord | null>(null);
  const [selectedRawDoc, setSelectedRawDoc] = useState<RawDocument | null>(null);
  const [detailTab, setDetailTab] = useState<'profile' | 'rawText'>('profile');

  const loadData = async (forceRefresh = false) => {
      setLoading(true);
      try {
        const rawDocs = await DataService.getLaborInfoRawDocuments(0);
        const recs = await LaborAnalysisPipeline.getAllAnalysisRecords(forceRefresh);
        const failedItems = LaborAnalysisPipeline.getFailedItems();
        
        const qualifiedRecords = recs.filter(r => r.isIncludedInAnalysisSet);
        const pendingRecords = recs.filter(r => !r.isIncludedInAnalysisSet);

        setRecords(qualifiedRecords);
        setPipelineStats({
          rawCount: rawDocs.length,
          structuredCount: recs.length,
          qualifiedCount: qualifiedRecords.length,
          pendingCount: pendingRecords.length,
          failedCount: failedItems.length
        });
      } catch (err) {
        console.error('Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => {
    loadData();
    const handleUpdate = () => loadData(false);
    window.addEventListener('labor-data-updated', handleUpdate);
    return () => window.removeEventListener('labor-data-updated', handleUpdate);
  }, []);

  const stats = useMemo(() => {
    const gz = (Array.isArray(records) ? records : []).filter(r => r.city?.includes('广州')).length;
    const sz = (Array.isArray(records) ? records : []).filter(r => r.city?.includes('深圳')).length;
    const dg = (Array.isArray(records) ? records : []).filter(r => r.city?.includes('东莞')).length;
    
    const years = new Set(records.map(r => r.year).filter(Boolean));
    const yearRange = years.size > 0 ? `${Math.min(...Array.from(years).map(Number))} - ${Math.max(...Array.from(years).map(Number))}` : '-';

    return { total: records.length, gz, sz, dg, yearRange };
  }, [records]);

  const availableCities = useMemo(() => Array.from(new Set(records.map(r => r.city).filter(Boolean))).sort(), [records]);
  const availableYears = useMemo(() => Array.from(new Set(records.map(r => r.year).filter(Boolean))).sort().reverse(), [records]);
  const availableDisputes = useMemo(() => {
    const set = new Set<string>();
    (Array.isArray(records) ? records : []).forEach(r => r.disputeTypes?.forEach(d => set.add(d)));
    return Array.from(set).sort();
  }, [records]);

  const filteredRecords = useMemo(() => {
    return (Array.isArray(records) ? records : []).filter(r => {
      if (cityFilter !== 'all' && r.city !== cityFilter) return false;
      if (yearFilter !== 'all' && r.year !== yearFilter) return false;
      if (levelFilter !== 'all' && r.caseLevel !== levelFilter) return false;
      if (disputeFilter !== 'all' && !r.disputeTypes?.includes(disputeFilter)) return false;
      
      if (keyword) {
        const kw = keyword.toLowerCase();
        if (!r.caseNumber?.toLowerCase().includes(kw) && 
            !r.title?.toLowerCase().includes(kw) &&
            !r.court?.toLowerCase().includes(kw)) {
          return false;
        }
      }
      return true;
    });
  }, [records, keyword, cityFilter, yearFilter, levelFilter, disputeFilter]);

  const handleOpenDetail = async (record: AnalysisCaseRecord) => {
    setSelectedRecord(record);
    setDetailTab('profile');
    try {
      const raw = await DataService.getRawDocumentById(record.caseId);
      setSelectedRawDoc(raw || null);
    } catch (e) {
      setSelectedRawDoc(null);
    }
  };

  const selectedOutcomePresentations = selectedRecord
    ? getPartyOutcomePresentations(selectedRecord)
    : null;

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Database className="w-6 h-6 text-blue-600" />
          劳动争议案例库
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          本库收录了经过结构化清洗和标准化的劳动争议历史裁决案例，支持多维过滤检索与案情溯源。
        </p>
      </div>


      <div className="flex flex-col gap-4">
        {/* 数据一致性与操作栏 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6 text-sm">
            <div className="flex flex-col">
              <span className="text-slate-500 text-xs">原始文书</span>
              <span className="font-bold text-slate-900 text-lg">{pipelineStats.rawCount}</span>
            </div>
            <div className="flex flex-col border-l border-slate-200 pl-6">
              <span className="text-emerald-600 text-xs font-semibold">已结构化 (当前展示)</span>
              <span className="font-bold text-emerald-700 text-lg">{pipelineStats.structuredCount}</span>
            </div>
            <div className="flex flex-col border-l border-slate-200 pl-6">
              <span className="text-amber-600 text-xs font-semibold">待处理 / 待人工确认</span>
              <span className="font-bold text-amber-700 text-lg">{pipelineStats.pendingCount}</span>
            </div>
            <div className="flex flex-col border-l border-slate-200 pl-6">
              <span className="text-rose-600 text-xs font-semibold">解析失败</span>
              <span className="font-bold text-rose-700 text-lg">{pipelineStats.failedCount}</span>
            </div>
          </div>
          <button
            disabled={isRebuilding}
            onClick={async () => {
              setIsRebuilding(true);
              try {
                await loadData(true);
              } finally {
                setIsRebuilding(false);
              }
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 font-semibold text-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRebuilding ? 'animate-spin' : ''}`} />
            重新构建案例库
          </button>
        </div>

        {/* 覆盖统计 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm text-center">
            <div className="text-xs font-semibold text-slate-500 mb-1">覆盖年份</div>
            <div className="text-2xl font-bold text-slate-900">{stats.yearRange}</div>
          </div>
          <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm text-center">
            <div className="text-xs font-semibold text-slate-500 mb-1">广州案例数</div>
            <div className="text-2xl font-bold text-slate-900">{stats.gz}</div>
          </div>
          <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm text-center">
            <div className="text-xs font-semibold text-slate-500 mb-1">深圳案例数</div>
            <div className="text-2xl font-bold text-slate-900">{stats.sz}</div>
          </div>
          <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm text-center">
            <div className="text-xs font-semibold text-slate-500 mb-1">东莞案例数</div>
            <div className="text-2xl font-bold text-slate-900">{stats.dg}</div>
          </div>
        </div>
      </div>


      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索案件标题、案号、法院..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <select value={cityFilter} onChange={e => setCityFilter(e.target.value)} className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <option value="all">所有城市</option>
            {availableCities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <option value="all">所有年份</option>
            {availableYears.map(y => <option key={y} value={y}>{y}年</option>)}
          </select>
          <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)} className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <option value="all">所有审级</option>
            <option value="first">一审/初裁</option>
            <option value="second">二审</option>
            <option value="retrial">再审</option>
          </select>
          <select value={disputeFilter} onChange={e => setDisputeFilter(e.target.value)} className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <option value="all">所有争议类型</option>
            {availableDisputes.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">正在加载案例数据...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="px-4 py-3 whitespace-nowrap">案件标题</th>
                  <th className="px-4 py-3 whitespace-nowrap">案号</th>
                  <th className="px-4 py-3 whitespace-nowrap">法院/仲裁委</th>
                  <th className="px-4 py-3 whitespace-nowrap">城市</th>
                  <th className="px-4 py-3 whitespace-nowrap">裁判日期</th>
                  <th className="px-4 py-3 whitespace-nowrap">争议类型</th>
                  <th className="px-4 py-3 whitespace-nowrap text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {(Array.isArray(filteredRecords) ? filteredRecords : []).map(r => (
                  <tr key={r.caseId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 max-w-[200px] truncate font-medium text-slate-900" title={r.title}>{r.title || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-slate-500">{r.caseNumber || '-'}</td>
                    <td className="px-4 py-3 max-w-[150px] truncate text-slate-700">{r.court || r.arbitrationCommittee || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">{r.city || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">{r.decisionDate || r.year || '-'}</td>
                    <td className="px-4 py-3 max-w-[150px] truncate text-slate-700">
                      {Array.isArray(r.disputeType) ? r.disputeType.join('、') : (r.disputeType || '-')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleOpenDetail(r)} className="text-blue-600 hover:text-blue-800 font-semibold px-2 py-1 bg-blue-50 hover:bg-blue-100 rounded transition-colors">
                        查看详情
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredRecords.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                      没有符合筛选条件的案例
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Case Detail Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 pr-8 truncate">
                {selectedRecord.title || selectedRecord.caseNumber}
              </h3>
              <button onClick={() => setSelectedRecord(null)} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors shrink-0">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-2 bg-slate-50 border-b border-slate-100 flex gap-4">
              <button
                onClick={() => setDetailTab('profile')}
                className={`text-sm font-semibold pb-2 border-b-2 transition-colors ${
                  detailTab === 'profile' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                结构化分析结果
              </button>
              <button
                onClick={() => setDetailTab('rawText')}
                className={`text-sm font-semibold pb-2 border-b-2 transition-colors ${
                  detailTab === 'rawText' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                原始裁判文书
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {detailTab === 'profile' && (
                <div className="space-y-6">
                  {/* 基本信息 */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-blue-600" /> 基本信息
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-y-3 gap-x-4 text-xs">
                      <div><span className="text-slate-500">案号：</span><span className="font-semibold">{selectedRecord.caseNumber || '-'}</span></div>
                      <div><span className="text-slate-500">法院：</span><span className="font-semibold">{selectedRecord.court || selectedRecord.arbitrationCommittee || '-'}</span></div>
                      <div><span className="text-slate-500">城市：</span><span className="font-semibold">{selectedRecord.city || '-'}</span></div>
                      <div><span className="text-slate-500">裁判日期：</span><span className="font-semibold">{selectedRecord.decisionDate || selectedRecord.year || '-'}</span></div>
                      <div><span className="text-slate-500">审级：</span><span className="font-semibold">{selectedRecord.caseLevel === 'first' ? '一审/初裁' : selectedRecord.caseLevel === 'second' ? '二审' : '再审/其他'}</span></div>
                      <div><span className="text-slate-500">劳动者：</span><span className="font-semibold">{selectedRecord.employeeParty || '-'}</span></div>
                      <div><span className="text-slate-500">用人单位：</span><span className="font-semibold">{selectedRecord.employerParty || '-'}</span></div>
                    </div>
                  </div>

                  {/* 裁判结果 */}
                  {selectedOutcomePresentations && <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
                    <h4 className="text-sm font-bold text-purple-900 mb-3 flex items-center gap-2">
                      <Scale className="w-4 h-4 text-purple-600" /> 裁判结果
                    </h4>
                    <div className="text-xs space-y-2 text-slate-700">
                      <div className="flex"><span className="text-slate-500 w-24 shrink-0">劳动者结果：</span><span className={`font-bold ${selectedOutcomePresentations.employee.textClassName}`}>{selectedOutcomePresentations.employee.label}</span></div>
                      <div className="flex"><span className="text-slate-500 w-24 shrink-0">用人单位结果：</span><span className={`font-bold ${selectedOutcomePresentations.employer.textClassName}`}>{selectedOutcomePresentations.employer.label}</span></div>
                      <div className="flex"><span className="text-slate-500 w-24 shrink-0">申请人结果：</span><span className={`font-bold ${selectedOutcomePresentations.applicant.textClassName}`}>{selectedOutcomePresentations.applicant.label}</span></div>
                      <div className="flex"><span className="text-slate-500 w-24 shrink-0">主要争议：</span><span>{Array.isArray(selectedRecord.disputeType) ? selectedRecord.disputeType.join('、') : (selectedRecord.disputeType || '-')}</span></div>
                      {selectedRecord.legalOutcomeSummary && (
                        <div className="flex mt-2 pt-2 border-t border-purple-200/50">
                          <span className="text-slate-500 w-24 shrink-0">关键要点：</span>
                          <span className="leading-relaxed bg-white/60 p-2 rounded">{selectedRecord.legalOutcomeSummary}</span>
                        </div>
                      )}
                    </div>
                  </div>}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <h4 className="text-sm font-bold text-slate-800 border-b pb-2">劳动者诉求</h4>
                      {Array.isArray(selectedRecord.claims) && selectedRecord.claims.length > 0 ? (
                        <div className="space-y-2">
                          {selectedRecord.claims.map((c, i) => {
                            const presentation = getOutcomePresentation(c.supportStatus);
                            return (
                              <div key={i} className="bg-slate-50 p-2 rounded text-xs text-slate-700 border border-slate-200 flex justify-between gap-2">
                                <span>{c.claimName || (c as any).text || '-'}</span>
                                <span className={`shrink-0 px-1.5 py-0.5 rounded text-2xs font-bold ${presentation.badgeClassName}`}>
                                  {presentation.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : <div className="text-xs text-slate-400">无记录</div>}
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-sm font-bold text-slate-800 border-b pb-2">企业抗辩</h4>
                      {Array.isArray(selectedRecord.employerDefenses) && selectedRecord.employerDefenses.length > 0 ? (
                        <div className="space-y-2">
                          {selectedRecord.employerDefenses.map((d, i) => (
                            <div key={i} className="bg-emerald-50 p-2 rounded text-xs text-slate-700 border border-emerald-100">
                              <span className="font-bold text-emerald-800 mr-2">[{d.defenseType || (d as any).type || '未分类'}]</span>
                              {d.matchedText || (d as any).text || '-'}
                            </div>
                          ))}
                        </div>
                      ) : <div className="text-xs text-slate-400">无记录</div>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <h4 className="text-sm font-bold text-slate-800 border-b pb-2">关键证据</h4>
                      {Array.isArray(selectedRecord.evidence) && selectedRecord.evidence.length > 0 ? (
                        <ul className="list-disc list-inside text-xs text-slate-700 space-y-1">
                          {selectedRecord.evidence.map((e, i) => (
                            <li key={i}>{e.provider === 'employer' ? '【单位】' : e.provider === 'employee' ? '【员工】' : '【法院】'} {e.name || (e as any).type}：{e.matchedText || (e as any).text}</li>
                          ))}
                        </ul>
                      ) : <div className="text-xs text-slate-400">无记录</div>}
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-sm font-bold text-slate-800 border-b pb-2">法院裁判理由</h4>
                      {typeof selectedRecord.courtReasoning === 'string' && selectedRecord.courtReasoning.length > 0 ? (
                        <div className="text-xs text-slate-700 bg-slate-50 p-2 rounded border border-slate-100 leading-relaxed whitespace-pre-wrap">
                          {selectedRecord.courtReasoning}
                        </div>
                      ) : <div className="text-xs text-slate-400">无记录</div>}
                    </div>
                  </div>
                </div>
              )}

              {detailTab === 'rawText' && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-sans">
                  {selectedRawDoc ? selectedRawDoc.rawText : <span className="text-slate-400">无法加载原始文书或原文本为空。</span>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default LaborAnalysisCaseLibrary;
