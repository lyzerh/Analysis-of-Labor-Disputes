import React, { useMemo, useState, useEffect } from 'react';
import { AnalysisCaseRecord } from '../types';
import { Database, Search, FileText, Scale, Target, ShieldAlert, BookOpen, AlertCircle, X } from 'lucide-react';
import { LaborAnalysisPipeline } from '../services/data/LaborAnalysisPipeline';
import { getOutcomePresentation, getPartyOutcomePresentations } from '../services/outcome/OutcomePresentation';
import { evidenceProviderLabel } from '../services/evidence/EvidenceProvider';

interface CaseAnalysisViewProps {
  records?: AnalysisCaseRecord[];
}

export const CaseAnalysisView: React.FC<CaseAnalysisViewProps> = ({ records: initialRecords }) => {
  // ① 所有 state
  const [records, setRecords] = useState<AnalysisCaseRecord[]>(Array.isArray(initialRecords) ? initialRecords : []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const [keyword, setKeyword] = useState('');
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  // ② 所有 effect
  useEffect(() => {
    let cancelled = false;

    if (Array.isArray(initialRecords) && initialRecords.length > 0) {
      setRecords(initialRecords);
      setLoading(false);
      return;
    }

    const loadRecords = async () => {
      try {
        setLoading(true);
        const recs = await LaborAnalysisPipeline.getAllAnalysisRecords(false);
        if (!cancelled) {
          setRecords((Array.isArray(recs) ? recs : []).filter(r => r && r.isIncludedInAnalysisSet));
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load analysis records', err);
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadRecords();

    return () => {
      cancelled = true;
    };
  }, [initialRecords]);

  // ③ 所有 memo / callback
  const filteredRecords = useMemo(() => {
    if (!keyword.trim()) return records;
    const lower = keyword.toLowerCase();
    return (Array.isArray(records) ? records : []).filter(
      (r) =>
        r.title?.toLowerCase().includes(lower) ||
        r.caseNumber?.toLowerCase().includes(lower) ||
        r.court?.toLowerCase().includes(lower) ||
        r.employerParty?.toLowerCase().includes(lower) ||
        r.employeeParty?.toLowerCase().includes(lower)
    );
  }, [records, keyword]);

  // Handle auto-selection when filtered list changes
  useEffect(() => {
    if (!filteredRecords || filteredRecords.length === 0) {
      if (selectedCaseId !== null) {
        setSelectedCaseId(null);
      }
      return;
    }
    
    // Check if any currently selected case is in filteredRecords
    let hasValidSelection = false;
    for (const record of filteredRecords) {
      if (record.caseId === selectedCaseId) {
        hasValidSelection = true;
        break;
      }
    }
    
    // If not, auto select the first one
    if (!hasValidSelection && filteredRecords.length > 0) {
      setSelectedCaseId(filteredRecords[0].caseId);
    }
  }, [filteredRecords, selectedCaseId]);

  const selectedCase = useMemo(() => {
    return (Array.isArray(records) ? records : []).find(r => r.caseId === selectedCaseId) || null;
  }, [records, selectedCaseId]);

  const selectedOutcomePresentations = selectedCase
    ? getPartyOutcomePresentations(selectedCase)
    : null;


  const clearSearch = () => {
    setKeyword('');
  };

  // ④ 最后才允许根据状态 return UI
  if (loading) {
    return <div className="p-8 text-center text-slate-500 flex flex-col items-center justify-center h-full"><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>正在加载数据...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-rose-500 flex flex-col items-center justify-center h-full"><AlertCircle className="w-10 h-10 mb-4" />加载案例数据失败: {error.message}</div>;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm min-h-0">
      
      {/* 顶部工具栏 (可选，目前放在左侧列表上方) */}

      <div className="flex flex-col lg:flex-row h-full divide-y lg:divide-y-0 lg:divide-x divide-slate-200 min-h-0">
        
        {/* 左侧案例列表独立滚动区域 */}
        <aside className="w-full lg:w-1/3 flex flex-col min-h-0 bg-slate-50/50">
          <div className="p-4 border-b border-slate-200 flex-shrink-0">
            <div className="relative flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="搜索案号、标题、法院..."
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-white border border-slate-300 text-sm rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-shadow"
                />
                {keyword.trim() !== '' && (
                  <button onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            
            <div className="text-xs text-slate-500 mt-3 flex justify-between items-center">
              <span>{keyword.trim() !== '' ? `找到 ${filteredRecords.length} 个匹配案例` : `共 ${filteredRecords.length} 个案例`}</span>
              {keyword.trim() !== '' && (
                <button onClick={clearSearch} className="text-indigo-600 hover:text-indigo-700 font-medium">清除搜索</button>
              )}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-1 min-h-0">
            {filteredRecords.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400 flex flex-col items-center">
                <Search className="w-8 h-8 text-slate-300 mb-2" />
                <p>未找到匹配案例</p>
                {keyword.trim() !== '' && (
                  <button onClick={clearSearch} className="mt-4 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg font-medium hover:bg-indigo-100 transition-colors">
                    清除搜索，显示全部
                  </button>
                )}
              </div>
            ) : (Array.isArray(filteredRecords) ? filteredRecords : []).map(record => {
              const isSelected = selectedCaseId === record.caseId;
              return (
                <div
                  key={record.caseId}
                  onClick={() => setSelectedCaseId(record.caseId)}
                  className={`p-3 rounded-xl cursor-pointer transition-all border ${isSelected ? 'bg-indigo-50 border-indigo-200 border-l-4 border-l-indigo-600' : 'bg-white border-transparent hover:border-slate-200 hover:bg-slate-50'}`}
                >
                  <h4 className="text-sm font-bold text-slate-900 line-clamp-1">
                    {record.title || record.caseNumber || '未知案例'}
                  </h4>
                  <div className="text-xs text-slate-500 mt-1 flex gap-2">
                    <span>{record.city}</span>
                    <span>{record.arbitrationCommittee || record.court}</span>
                    <span>{record.year}</span>
                  </div>
                  <div className="flex gap-1 flex-wrap mt-1.5">
                    {Array.isArray(record.disputeType) ? record.disputeType.slice(0, 2).map((dt: any, i: number) => (
                      <span key={i} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]">
                        {dt}
                      </span>
                    )) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* 右侧案例分析独立滚动区域 */}
        <main className="w-full lg:w-2/3 flex-1 flex flex-col min-h-0 min-w-0 bg-slate-50/50">
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 lg:p-8 min-h-0">
            {!selectedCase ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <FileText className="w-12 h-12 mb-3 text-slate-300" />
                <p>{filteredRecords.length === 0 ? '暂无匹配案例' : '请在左侧选择案例进行分析'}</p>
              </div>
            ) : (() => {
              const record = selectedCase;
              return (
              <div className="space-y-6 h-full">
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-1 bg-indigo-100 text-indigo-700 text-[10px] rounded font-bold">当前案例</span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 mb-4">
                      {record.title || record.caseNumber}
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800 text-sm">
                          <BookOpen className="w-4 h-4 text-blue-600" />
                          基本情况
                        </div>
                        <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 text-xs space-y-2">
                          <div className="flex"><span className="text-slate-500 min-w-[5rem]">案号：</span><span className="font-medium text-slate-900">{record.caseNumber || '未知'}</span></div>
                          <div className="flex"><span className="text-slate-500 min-w-[5rem]">裁判日期：</span><span className="font-medium text-slate-900">{record.decisionDate || record.year || '未知'}</span></div>
                          <div className="flex"><span className="text-slate-500 min-w-[5rem]">裁判机构：</span><span className="font-medium text-slate-900">{record.arbitrationCommittee || record.court || '未知'}</span></div>
                          <div className="flex"><span className="text-slate-500 min-w-[5rem]">劳动者：</span><span className="font-medium text-slate-900">{record.employeeParty || '未知'}</span></div>
                          <div className="flex"><span className="text-slate-500 min-w-[5rem]">用人单位：</span><span className="font-medium text-slate-900">{record.employerParty || '未知'}</span></div>
                          <div className="flex"><span className="text-slate-500 min-w-[5rem]">审理程序：</span><span className="font-medium text-slate-900">{record.caseLevel === 'first' ? '一审/初裁' : record.caseLevel === 'second' ? '二审' : record.caseLevel === 'retrial' ? '再审' : '未知'}</span></div>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800 text-sm">
                          <Scale className="w-4 h-4 text-purple-600" />
                          裁判结果与要点
                        </div>
                        {selectedOutcomePresentations && <div className="bg-purple-50/50 p-3 rounded-xl border border-purple-100 text-xs space-y-2">
                          <div className="flex"><span className="text-slate-500 min-w-[6rem]">劳动者结果：</span><span className={`font-bold ${selectedOutcomePresentations.employee.textClassName}`}>{selectedOutcomePresentations.employee.label}</span></div>
                          <div className="flex"><span className="text-slate-500 min-w-[6rem]">用人单位结果：</span><span className={`font-bold ${selectedOutcomePresentations.employer.textClassName}`}>{selectedOutcomePresentations.employer.label}</span></div>
                          <div className="flex"><span className="text-slate-500 min-w-[6rem]">申请人结果：</span><span className={`font-bold ${selectedOutcomePresentations.applicant.textClassName}`}>{selectedOutcomePresentations.applicant.label}</span></div>
                          <div className="flex"><span className="text-slate-500 min-w-[5rem]">争议类型：</span><span className="font-medium text-slate-900">{Array.isArray(record.disputeType) ? record.disputeType.join('、') : (record.disputeType || '未知')}</span></div>
                          {Array.isArray(record.keyLegalPoints) && record.keyLegalPoints.length > 0 && (
                            <div className="flex flex-col mt-2">
                              <span className="text-slate-500 mb-1">关键裁判要点：</span>
                              <span className="font-medium text-slate-900 leading-relaxed bg-white p-2 rounded border border-purple-100">{record.keyLegalPoints.join('；')}</span>
                            </div>
                          )}
                        </div>}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                      <div className="space-y-6">
                        <div className="space-y-3">
                          <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <Target className="w-4 h-4 text-rose-500" />
                            劳动者诉求清单
                          </div>
                          {Array.isArray(record.claims) && record.claims.length > 0 ? (
                            <div className="space-y-2">
                              {record.claims.map((claim, idx) => {
                                const presentation = getOutcomePresentation(claim.supportStatus);
                                return (
                                  <div key={idx} className="bg-white border border-slate-200 p-2.5 rounded-lg text-xs flex justify-between items-start gap-2">
                                    <span className="text-slate-800 leading-relaxed">{claim.claimName}</span>
                                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold ${presentation.badgeClassName}`}>
                                      {presentation.label}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-xl border border-slate-100">未识别</div>
                          )}
                        </div>
                        
                        <div className="space-y-3">
                          <div className="flex items-center gap-1.5 font-bold text-slate-800 text-sm">
                            <ShieldAlert className="w-4 h-4 text-emerald-600" />
                            企业抗辩
                          </div>
                          {Array.isArray(record.employerDefenses) && record.employerDefenses.length > 0 ? (
                            <div className="space-y-2">
                              {record.employerDefenses.map((def: any, idx: number) => (
                                <div key={idx} className="bg-emerald-50 border border-emerald-100 p-2.5 rounded-lg text-xs space-y-1">
                                  <div className="font-bold text-emerald-900">{def.defenseType || def.type}</div>
                                  <div className="text-slate-700 leading-relaxed">{def.matchedText || def.text}</div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-xl border border-slate-100">未识别</div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-6 pt-6 border-t border-slate-100 space-y-3">
                      <div className="flex items-center gap-1.5 font-bold text-slate-800 text-sm">
                        <FileText className="w-4 h-4 text-indigo-600" />
                        关键证据与法院认定
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                          <div className="text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wider">关键证据</div>
                          {Array.isArray(record.evidence) && record.evidence.length > 0 ? (
                            <ul className="list-disc list-inside text-xs text-slate-700 space-y-1">
                              {record.evidence.map((ev: any, idx: number) => (
                                <li key={idx}>
                                  <span className="font-medium text-slate-900">【{evidenceProviderLabel(ev.provider)}】</span>
                                  {ev.name || ev.type}：{ev.matchedText || ev.text}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="text-xs text-slate-400">未识别</div>
                          )}
                        </div>
                        <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                          <div className="text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wider">法院/仲裁委认定理由</div>
                          {typeof record.courtReasoning === 'string' && record.courtReasoning.trim().length > 0 ? (
                            <div className="text-xs text-slate-700 bg-white p-2 border border-slate-100 rounded leading-relaxed">
                              {record.courtReasoning}
                            </div>
                          ) : (
                            <div className="text-xs text-slate-400">未识别</div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                  </div>
              </div>
              );
            })()}
          </div>
        </main>
      </div>
    </div>
  );
};
