import React, { useMemo, useState, useEffect } from 'react';
import { AnalysisCaseRecord, CaseParty, OutcomeResolutionDiagnostic, OutcomeReviewItem, ProceduralRole } from '../types';
import { Database, Search, FileText, Scale, Target, ShieldAlert, BookOpen, AlertCircle, X } from 'lucide-react';
import { LaborAnalysisPipeline } from '../services/data/LaborAnalysisPipeline';
import { getCaseEntityOutcomeLabel, getClaimOwnershipPresentation, getOutcomePresentation, getPartyOutcomePresentations } from '../services/outcome/OutcomePresentation';
import { evidenceProviderLabel } from '../services/evidence/EvidenceProvider';
import { createCaseSummaryPresentation, formatCaseDate, formatCaseLevel, formatCaseNumber, formatPartyName } from '../services/presentation/CaseMetadataPresentation';
import {
  buildOutcomeReviewQueue,
  outcomeReviewReasonLabels,
  outcomeReviewEvidenceFields,
} from '../services/outcome/OutcomeReviewQueue';
import { ResearchAnalysisService, type ResearchAnalysisContext } from '../services/analysis/ResearchAnalysisService';
import { AnalysisContextBar } from './AnalysisContextBar';
import { createCaseAnalysisScopeNotice, createCaseListScopeLabel } from '../services/presentation/CaseAnalysisScopePresentation';
import { PipelineWorkspace } from './PipelineWorkspace';
import { CollapsibleText } from './CollapsibleText';
import { cleanPipelineDiagnosticMessage } from '../services/presentation/PipelineStagePresentation';
import { runSingleCaseSemanticAnalysis, type SingleCaseSemanticRunResult } from '../services/semantic/LlmRuntimeService';

const proceduralRoleLabels: Record<ProceduralRole, string> = {
  plaintiff: '原告',
  defendant: '被告',
  appellant: '上诉人',
  appellee: '被上诉人',
  applicant: '申请人',
  respondent: '被申请人',
  counterclaimPlaintiff: '反诉原告',
  counterclaimDefendant: '反诉被告',
  counterclaimant: '反诉原告',
  third_party: '第三人',
  unknown: '未识别',
};

const laborRoleLabels: Record<CaseParty['laborRole'], string> = {
  employee: '劳动者',
  employer: '用人单位',
  other: '其他主体',
  unknown: '未识别',
};

interface CaseAnalysisViewProps {
  records?: AnalysisCaseRecord[];
  initialAnalysisRunId?: string;
}

type CaseAnalysisSubview = 'browse' | 'pipeline';

const researchAnalysisService = new ResearchAnalysisService();

const OutcomeEvidenceFields: React.FC<{
  item: ReturnType<typeof buildOutcomeReviewQueue>[number];
  compact?: boolean;
  expanded?: boolean;
}> = ({ item, compact = false, expanded = false }) => {
  const fields = outcomeReviewEvidenceFields(item);
  if (fields.length === 0) return null;
  const coreEvidenceKeys = new Set(['claimText', 'dispositionText', 'diagnosticText']);
  const visibleFields = compact && !expanded
    ? [
      ...fields.filter((field) => coreEvidenceKeys.has(field.key)),
      ...fields.filter((field) => !coreEvidenceKeys.has(field.key)),
    ].slice(0, 3)
    : fields;
  return (
    <div className={compact ? 'mt-2 grid gap-1 text-[11px] text-slate-700 lg:grid-cols-3' : 'mt-1 space-y-1 break-words'}>
      {visibleFields.map((field) => (
        <div key={field.key} className={compact ? 'min-w-0 rounded border border-slate-200/80 bg-slate-50/70 px-1 py-0.5' : undefined} title={field.text || field.placeholder}>
          <span className="block font-medium text-slate-700">{field.label}</span>
          <CollapsibleText text={field.key === 'diagnosticText' ? cleanPipelineDiagnosticMessage(field.text, field.placeholder || '') : (field.text || field.placeholder)} collapsedLines={4} className={compact ? 'mt-0.5 leading-4' : 'mt-0.5'} />
        </div>
      ))}
    </div>
  );
};

export const CaseAnalysisView: React.FC<CaseAnalysisViewProps> = ({ records: initialRecords, initialAnalysisRunId = '' }) => {
  // ① 所有 state
  const [records, setRecords] = useState<AnalysisCaseRecord[]>(Array.isArray(initialRecords) ? initialRecords : []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const [keyword, setKeyword] = useState('');
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [analysisContext, setAnalysisContext] = useState<ResearchAnalysisContext | null>(null);
  const [activeSubview, setActiveSubview] = useState<CaseAnalysisSubview>('browse');
  const [selectedReviewItem, setSelectedReviewItem] = useState<OutcomeReviewItem | null>(null);

  // ② 所有 effect
  useEffect(() => {
    let cancelled = false;

    if (Array.isArray(initialRecords) && initialRecords.length > 0) {
      setRecords(initialRecords);
      setAnalysisContext(null);
      setLoading(false);
      return;
    }

    const loadRecords = async () => {
      try {
        setLoading(true);
        if (initialAnalysisRunId) {
          const context = await researchAnalysisService.loadResearchAnalysisContext(initialAnalysisRunId);
          if (!cancelled) {
            setAnalysisContext(context);
            setRecords(context.records.filter((record) => record && record.isIncludedInAnalysisSet));
          }
          return;
        }
        setAnalysisContext(null);
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
  }, [initialAnalysisRunId, initialRecords]);

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
  const hasAnalysisRun = Boolean(analysisContext?.analysisRun);
  const hasCaseFilter = keyword.trim() !== '';
  const caseListScopeLabel = createCaseListScopeLabel({
    hasAnalysisRun,
    totalCount: records.length,
    visibleCount: filteredRecords.length,
    isFiltered: hasCaseFilter,
  });

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
  const reviewQueue = useMemo(() => buildOutcomeReviewQueue(records), [records]);
  const selectedDiagnostics = selectedCase?.outcomeDiagnostics || [];

  const handleReviewItemClick = (item: OutcomeReviewItem) => {
    setKeyword('');
    setSelectedCaseId(item.caseId);
    setSelectedReviewItem(item);
    setActiveSubview('browse');
  };

  const handleRunSingleCase = async (record: AnalysisCaseRecord): Promise<SingleCaseSemanticRunResult> => {
    const rawDocument = await LaborAnalysisPipeline.getRawDocumentForRecord(record);
    return runSingleCaseSemanticAnalysis(record, rawDocument);
  };


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
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="mx-4 mt-4 shrink-0 space-y-2">
        <div role="tablist" aria-label="案例分析视图" className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
          <button
            type="button"
            role="tab"
            aria-selected={activeSubview === 'browse'}
            onClick={() => setActiveSubview('browse')}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${activeSubview === 'browse' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            案例浏览
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSubview === 'pipeline'}
            onClick={() => setActiveSubview('pipeline')}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${activeSubview === 'pipeline' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            流水线工作台
          </button>
        </div>
        {analysisContext?.analysisRun && (
          <AnalysisContextBar
            run={analysisContext.analysisRun}
            snapshotId={analysisContext.snapshot.id}
            scopeLabel={analysisContext.statisticalScope === 'corpus' ? '语料总体' : '本次样本'}
            reviewQueueCount={reviewQueue.length}
            qualityStatus={analysisContext.quality.status}
          />
        )}
        {activeSubview === 'browse' && (
          <div className="text-[11px] text-slate-500">
            {createCaseAnalysisScopeNotice(hasAnalysisRun)}
          </div>
        )}
      </div>

      {activeSubview === 'pipeline' && (
        <PipelineWorkspace records={records} reviewItems={reviewQueue} onSelectCase={handleReviewItemClick} hasAnalysisRun={hasAnalysisRun} onRunSingleCase={handleRunSingleCase} />
      )}

      {activeSubview === 'browse' && selectedReviewItem && selectedCase && selectedReviewItem.caseId === selectedCase.caseId && (
        <div className="mx-4 mt-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-950">
          <div className="font-semibold">已定位到当前案例的诊断线索</div>
          <div className="mt-1">原因：{cleanPipelineDiagnosticMessage(selectedReviewItem.reasonMessage, (selectedReviewItem.reasonCode && outcomeReviewReasonLabels[selectedReviewItem.reasonCode]) || '待复核')} {selectedReviewItem.reasonCode && <span className="text-indigo-700/70">（{selectedReviewItem.reasonCode}）</span>}</div>
          <details className="mt-1">
            <summary className="cursor-pointer text-indigo-700">展开诊断证据片段</summary>
            <OutcomeEvidenceFields item={selectedReviewItem} />
          </details>
        </div>
      )}

      {/* 顶部工具栏 (可选，目前放在左侧列表上方) */}

      {activeSubview === 'browse' && <div className="flex flex-col lg:flex-row h-full divide-y lg:divide-y-0 lg:divide-x divide-slate-200 min-h-0">
        
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
              <span>{caseListScopeLabel}</span>
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
                    {(() => {
                      const summary = createCaseSummaryPresentation(record);
                      return (summary.primary || summary.secondary) ? (
                        <div aria-label="案件摘要" className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs text-indigo-950">
                          {summary.primary && <div className="font-medium">{summary.primary}</div>}
                          {summary.secondary && <div className="mt-0.5 text-[11px] text-indigo-800/80">{summary.secondary}</div>}
                        </div>
                      ) : null;
                    })()}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800 text-sm">
                          <BookOpen className="w-4 h-4 text-blue-600" />
                          基本情况
                        </div>
                        <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 text-xs space-y-2">
                          <div className="flex"><span className="text-slate-500 min-w-[5rem]">案号：</span><span className="font-medium text-slate-900">{formatCaseNumber(record.caseNumber)}</span></div>
                          <div className="flex"><span className="text-slate-500 min-w-[5rem]">裁判日期：</span><span className="font-medium text-slate-900">{formatCaseDate(record.date)}</span></div>
                          <div className="flex"><span className="text-slate-500 min-w-[5rem]">裁判机构：</span><span className="font-medium text-slate-900">{record.arbitrationCommittee || record.court || '未知'}</span></div>
                          <div className="flex"><span className="text-slate-500 min-w-[5rem]">劳动者：</span><span className="font-medium text-slate-900">{formatPartyName(record.employeeParty)}</span></div>
                          <div className="flex"><span className="text-slate-500 min-w-[5rem]">用人单位：</span><span className="font-medium text-slate-900">{formatPartyName(record.employerParty)}</span></div>
                          <div className="flex"><span className="text-slate-500 min-w-[5rem]">审理程序：</span><span className="font-medium text-slate-900">{formatCaseLevel(record.caseLevel)}</span></div>
                        </div>
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-2">
                          <div className="font-bold text-slate-800">程序身份映射</div>
                          {record.parties?.length ? record.parties.map((party) => (
                            <div key={party.id} className="flex items-start gap-2">
                              <span className="text-slate-500 min-w-[4.5rem]">{party.proceduralRoles.length
                                ? party.proceduralRoles.map((role) => proceduralRoleLabels[role] || '未识别').join(' / ')
                                : '未识别'}：</span>
                              <span className="font-medium text-slate-900">{formatPartyName(party.name)}｜{laborRoleLabels[party.laborRole] || '未识别'}</span>
                            </div>
                          )) : <div className="text-slate-400">未识别</div>}
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800 text-sm">
                          <Scale className="w-4 h-4 text-purple-600" />
                          裁判结果与要点
                        </div>
                        {selectedOutcomePresentations && <div className="bg-purple-50/50 p-3 rounded-xl border border-purple-100 text-xs space-y-2">
                          <div className="flex"><span className="text-slate-500 min-w-[6rem]">劳动者实体结果：</span><span className={`font-bold ${selectedOutcomePresentations.employee.textClassName}`}>{getCaseEntityOutcomeLabel(record.employeeOutcome)}</span></div>
                          <div className="flex"><span className="text-slate-500 min-w-[6rem]">用人单位实体结果：</span><span className={`font-bold ${selectedOutcomePresentations.employer.textClassName}`}>{getCaseEntityOutcomeLabel(record.employerOutcome)}</span></div>
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
                            诉求与裁判结果
                          </div>
                          {Array.isArray(record.claims) && record.claims.length > 0 ? (
                            <div className="space-y-2">
                              {record.claims.map((claim, idx) => {
                                const presentation = getOutcomePresentation(claim.supportStatus);
                                const ownership = getClaimOwnershipPresentation(claim, record);
                                const diagnostic = selectedDiagnostics.find((item) => item.claimId === claim.id);
                                const isFocused = selectedReviewItem?.claimId === claim.id && selectedReviewItem.caseId === record.caseId;
                                return (
                                  <div key={idx} className={`bg-white border p-2.5 rounded-lg text-xs flex justify-between items-start gap-2 ${isFocused ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'}`}>
                                    <div className="text-slate-800 leading-relaxed">
                                      {claim.claimName}
                                      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                                        <span>提出方：{ownership.claimantLabel}</span>
                                        {ownership.beneficiaryLabel && <span>实质受益方：{ownership.beneficiaryLabel}</span>}
                                        {ownership.relatedLabel && <span>关联权益：{ownership.relatedLabel}</span>}
                                        {diagnostic?.needsReview && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">待复核</span>}
                                      </div>
                                      {diagnostic?.reasonMessage ? <span className="block text-amber-700 mt-1">无法确定：{diagnostic.reasonMessage}{diagnostic.reasonCode ? <span className="text-amber-700/70">（{diagnostic.reasonCode}）</span> : null}</span> : null}
                                      {diagnostic?.needsReview ? (
                                        <details className="mt-1 text-[11px] text-slate-600">
                                          <summary className="cursor-pointer text-indigo-700">展开诊断证据片段</summary>
                                          <OutcomeEvidenceFields item={{
                                            ...diagnostic,
                                            caseId: record.caseId,
                                            title: record.title,
                                            caseNumber: record.caseNumber,
                                            employeeParty: record.employeeParty,
                                            employerParty: record.employerParty,
                                            applicantRole: record.applicantRole,
                                            parties: record.parties,
                                          }} />
                                        </details>
                                      ) : null}
                                    </div>
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
                                  <CollapsibleText text={def.matchedText || def.text} collapsedLines={4} className="text-slate-700 leading-relaxed" />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-xl border border-slate-100">未识别</div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <details className="mt-6 pt-6 border-t border-slate-100">
                      <summary className="flex cursor-pointer list-none items-center gap-1.5 font-bold text-slate-800 text-sm">
                        <FileText className="w-4 h-4 text-indigo-600" />
                        关键证据与法院认定：{(record.evidence || []).length} 条证据｜{record.courtReasoning?.trim() ? '1' : '0'} 条认定理由
                      </summary>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                        <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                          <div className="text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wider">关键证据</div>
                          {Array.isArray(record.evidence) && record.evidence.length > 0 ? (
                            <ul className="list-disc list-inside text-xs text-slate-700 space-y-1">
                              {record.evidence.map((ev: any, idx: number) => (
                                <li key={idx}>
                                  <span className="font-medium text-slate-900">【{evidenceProviderLabel(ev.provider)}】</span>
                                  <span className="ml-1">{ev.name || ev.type}：</span>
                                  <CollapsibleText text={ev.matchedText || ev.text} collapsedLines={4} className="mt-0.5" />
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
                              <CollapsibleText text={record.courtReasoning} collapsedLines={4} />
                            </div>
                          ) : (
                            <div className="text-xs text-slate-400">未识别</div>
                          )}
                        </div>
                      </div>
                    </details>
                    
                  </div>
              </div>
              );
            })()}
          </div>
        </main>
      </div>}
    </div>
  );
};
