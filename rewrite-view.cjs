const fs = require('fs');

const code = `import React, { useMemo, useState } from 'react';
import { AnalysisCaseRecord } from '../types';
import { Database, Search, FileText, Scale, Target, ShieldAlert, BookOpen, AlertCircle } from 'lucide-react';
import { DataService } from '../services/data/DataService';

interface CaseAnalysisViewProps {
  records: AnalysisCaseRecord[];
}

export const CaseAnalysisView: React.FC<CaseAnalysisViewProps> = ({ records }) => {
  const [keyword, setKeyword] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filteredRecords = useMemo(() => {
    if (!keyword) return records;
    const lower = keyword.toLowerCase();
    return records.filter(
      (r) =>
        r.title?.toLowerCase().includes(lower) ||
        r.caseNumber?.toLowerCase().includes(lower) ||
        r.court?.toLowerCase().includes(lower)
    );
  }, [records, keyword]);

  const selectedRecords = useMemo(() => {
    return records.filter(r => selectedIds.has(r.caseId));
  }, [records, selectedIds]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
      <div className="grid grid-cols-1 lg:grid-cols-12 h-full divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        <div className="lg:col-span-4 flex flex-col h-[40vh] lg:h-full bg-slate-50/50">
          <div className="p-4 border-b border-slate-200">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="搜索案号、标题、法院..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 text-sm rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-shadow"
              />
            </div>
            <div className="text-xs text-slate-500 mt-2 flex justify-between">
              <span>共找到 {filteredRecords.length} 个案例</span>
              <span>已选 {selectedIds.size} 个</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredRecords.map(record => {
              const isSelected = selectedIds.has(record.caseId);
              return (
                <div
                  key={record.caseId}
                  onClick={() => toggleSelect(record.caseId)}
                  className={\`p-3 rounded-xl cursor-pointer transition-all border \${isSelected ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-transparent hover:border-slate-200 hover:bg-slate-50'}\`}
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
                    {record.disputeType?.slice(0, 2).map((dt: any, i: number) => (
                      <span key={i} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-2xs">
                        {dt}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="lg:col-span-8 flex-1 overflow-y-auto bg-slate-50/50 p-6 lg:p-8">
          {selectedRecords.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <FileText className="w-12 h-12 mb-3 text-slate-300" />
              <p>请在左侧选择至少一个案例进行分析</p>
            </div>
          ) : (
            <div className="space-y-6">
              {selectedRecords.map(record => (
                <div key={record.caseId} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
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
                        <div className="flex"><span className="text-slate-500 w-20">案号：</span><span className="font-medium text-slate-900">{record.caseNumber || '未知'}</span></div>
                        <div className="flex"><span className="text-slate-500 w-20">裁判日期：</span><span className="font-medium text-slate-900">{record.decisionDate || record.year || '未知'}</span></div>
                        <div className="flex"><span className="text-slate-500 w-20">裁判机构：</span><span className="font-medium text-slate-900">{record.arbitrationCommittee || record.court || '未知'}</span></div>
                        <div className="flex"><span className="text-slate-500 w-20">劳动者：</span><span className="font-medium text-slate-900">{record.employeeParty || '未知'}</span></div>
                        <div className="flex"><span className="text-slate-500 w-20">用人单位：</span><span className="font-medium text-slate-900">{record.employerParty || '未知'}</span></div>
                        <div className="flex"><span className="text-slate-500 w-20">审理程序：</span><span className="font-medium text-slate-900">{record.caseLevel === 'first' ? '一审/初裁' : record.caseLevel === 'second' ? '二审' : record.caseLevel === 'retrial' ? '再审' : '未知'}</span></div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center gap-1.5 font-bold text-slate-800 text-sm">
                        <Scale className="w-4 h-4 text-purple-600" />
                        裁判结果与要点
                      </div>
                      <div className="bg-purple-50/50 p-3 rounded-xl border border-purple-100 text-xs space-y-2">
                        <div className="flex"><span className="text-slate-500 w-20">裁判结果：</span>
                          <span className={\`font-bold \${record.employeeOutcome === 'supported' ? 'text-rose-600' : record.employerOutcome === 'supported' ? 'text-emerald-600' : record.overallResult === 'partially_supported' ? 'text-amber-600' : 'text-slate-600'}\`}>
                            {record.employerOutcome === 'supported' ? '用人单位全部胜诉' : record.employeeOutcome === 'supported' ? '劳动者全部胜诉' : record.overallResult === 'partially_supported' ? '部分支持劳动者诉求' : '情况不明'}
                          </span>
                        </div>
                        <div className="flex"><span className="text-slate-500 w-20">争议类型：</span><span className="font-medium text-slate-900">{record.disputeType?.join('、') || '未知'}</span></div>
                        {record.keyLegalPoints && record.keyLegalPoints.length > 0 && (
                          <div className="flex flex-col mt-2">
                            <span className="text-slate-500 mb-1">关键裁判要点：</span>
                            <span className="font-medium text-slate-900 leading-relaxed bg-white p-2 rounded border border-purple-100">{record.keyLegalPoints.join('；')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                    <div className="space-y-6">
                      <div className="space-y-3">
                        <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <Target className="w-4 h-4 text-rose-500" />
                          劳动者诉求清单
                        </div>
                        {record.claims && record.claims.length > 0 ? (
                          <div className="space-y-2">
                            {record.claims.map((claim: any, idx: number) => (
                              <div key={idx} className="bg-white border border-slate-200 p-2.5 rounded-lg text-xs flex justify-between items-start gap-2">
                                <span className="text-slate-800 leading-relaxed">{claim.claimName}</span>
                                {claim.supportStatus !== 'unknown' && (
                                  <span className={\`shrink-0 px-1.5 py-0.5 rounded text-2xs font-bold \${
                                    claim.supportStatus === "supported" || claim.status === "supported" ? 'bg-rose-100 text-rose-700' :
                                    claim.supportStatus === 'rejected' ? 'bg-emerald-100 text-emerald-700' :
                                    'bg-amber-100 text-amber-700'
                                  }\`}>
                                    {claim.supportStatus === "supported" || claim.status === "supported" ? '支持' :
                                     claim.supportStatus === 'rejected' ? '驳回' : '部分支持'}
                                  </span>
                                )}
                              </div>
                            ))}
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
                        {record.employerDefenses && record.employerDefenses.length > 0 ? (
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
                        <div className="text-2xs font-bold text-slate-500 mb-2 uppercase tracking-wider">关键证据</div>
                        {record.evidence && record.evidence.length > 0 ? (
                          <ul className="list-disc list-inside text-xs text-slate-700 space-y-1">
                            {record.evidence.map((ev: any, idx: number) => (
                              <li key={idx}>
                                <span className="font-medium text-slate-900">{ev.provider === 'employer' ? '【单位提供】' : ev.provider === 'employee' ? '【员工提供】' : '【法院调取】'}</span>
                                {ev.name || ev.type}：{ev.matchedText || ev.text}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="text-xs text-slate-400">未识别</div>
                        )}
                      </div>
                      <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                        <div className="text-2xs font-bold text-slate-500 mb-2 uppercase tracking-wider">法院/仲裁委认定理由</div>
                        {record.courtReasoning && record.courtReasoning.length > 0 ? (
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
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
`;

fs.writeFileSync('src/components/CaseAnalysisView.tsx', code);
console.log('Rewrote CaseAnalysisView.tsx completely');
