import React, { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { JudgmentTranslationReader } from './JudgmentTranslationReader';
import { AnalysisCaseRecord, OutcomeResolutionDiagnostic, OutcomeReviewItem } from '../types';
import { Search, FileText, AlertCircle, X } from 'lucide-react';
import { LaborAnalysisPipeline } from '../services/data/LaborAnalysisPipeline';
import { getClaimOwnershipPresentation, getOutcomePresentation, getPartyOutcomePresentations } from '../services/outcome/OutcomePresentation';
import { evidenceProviderLabel } from '../services/evidence/EvidenceProvider';
import { getCaseLevelLabel, getClaimTypeLabel, getDefenseTypeLabel, getDisputeTypeLabel, getEvidenceTypeLabel, getOutcomeLabel } from '../services/presentation/domainLabels';
import { createCaseSummaryPresentation, formatCaseDate, formatCaseNumber, formatPartyName } from '../services/presentation/CaseMetadataPresentation';
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
import { applyPersistedSemanticTechnicalFailure, applySingleCaseSemanticRunState, buildSemanticTask, runSingleCaseSemanticAnalysis, type SingleCaseSemanticRunResult } from '../services/semantic/LlmRuntimeService';
import { readSemanticReviewItems } from '../services/semantic/SemanticReviewStorage';
import {
  createTechnicalManualReviewItem,
  enqueueSemanticReviewItem,
  type SemanticReviewItem,
} from '../services/semantic/SemanticReviewQueue';
import { appendSemanticTechnicalFailure, failureStageForCode, latestSemanticTechnicalFailure, readSemanticTechnicalFailures, semanticTechnicalFailureHistory } from '../services/semantic/SemanticTechnicalFailureStorage';
import { AnalysisRunService } from '../services/analysis/AnalysisRunService';
import { db } from '../db';
import { exportCompetitionValidationSnapshot } from '../services/validation/CompetitionValidationSnapshot';
import { addCaseToGoldSet, getActiveGoldSet } from '../services/gold/GoldAnnotationStorage';

interface CaseAnalysisViewProps {
  records?: AnalysisCaseRecord[];
  initialAnalysisRunId?: string;
}

type CaseAnalysisSubview = 'browse' | 'pipeline';

const researchAnalysisService = new ResearchAnalysisService();

const rehydrateTechnicalFailureStates = (nextRecords: AnalysisCaseRecord[]): AnalysisCaseRecord[] => {
  const latestByCaseId = new Map<string, ReturnType<typeof latestSemanticTechnicalFailure>>();
  readSemanticTechnicalFailures().forEach((failure) => {
    const previous = latestByCaseId.get(failure.caseId);
    if (!previous || previous.timestamp.localeCompare(failure.timestamp) <= 0) latestByCaseId.set(failure.caseId, failure);
  });
  return nextRecords.map((record) => {
    const failure = latestByCaseId.get(record.caseId);
    return failure ? applyPersistedSemanticTechnicalFailure(record, failure) : record;
  });
};

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
  const { t } = useTranslation();
  // ① 所有 state
  const [records, setRecords] = useState<AnalysisCaseRecord[]>(Array.isArray(initialRecords) ? initialRecords : []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const [keyword, setKeyword] = useState('');
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [analysisContext, setAnalysisContext] = useState<ResearchAnalysisContext | null>(null);
  const [activeSubview, setActiveSubview] = useState<CaseAnalysisSubview>('browse');
  const [selectedReviewItem, setSelectedReviewItem] = useState<OutcomeReviewItem | null>(null);
  const [semanticReviewItems, setSemanticReviewItems] = useState<SemanticReviewItem[]>(() => readSemanticReviewItems());
  const [goldMessage, setGoldMessage] = useState('');

  // ② 所有 effect
  useEffect(() => {
    let cancelled = false;

    if (Array.isArray(initialRecords) && initialRecords.length > 0) {
      setRecords(rehydrateTechnicalFailureStates(initialRecords));
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
            setRecords(rehydrateTechnicalFailureStates(context.records.filter((record) => record && record.isIncludedInAnalysisSet)));
          }
          return;
        }
        setAnalysisContext(null);
        const recs = await LaborAnalysisPipeline.getAllAnalysisRecords(false);
        if (!cancelled) {
          setRecords(rehydrateTechnicalFailureStates((Array.isArray(recs) ? recs : []).filter(r => r && r.isIncludedInAnalysisSet)));
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

  const addSelectedCaseToGoldSet = (caseId: string) => {
    const activeGoldSet = getActiveGoldSet();
    setGoldMessage(activeGoldSet
      ? (addCaseToGoldSet(activeGoldSet.id, caseId) ? t('finalUi.caseAnalysisExtras.addedToGold') : t('finalUi.caseAnalysisExtras.alreadyInGold'))
      : t('finalUi.caseAnalysisExtras.createGoldFirst'));
  };

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

  const handlePipelineRecordClick = (record: AnalysisCaseRecord) => {
    setKeyword('');
    setSelectedCaseId(record.caseId);
    setSelectedReviewItem(null);
    setActiveSubview('browse');
  };

  const handleRunSingleCase = async (record: AnalysisCaseRecord): Promise<SingleCaseSemanticRunResult> => {
    const rawDocument = await LaborAnalysisPipeline.getRawDocumentForRecord(record);
    const result = await runSingleCaseSemanticAnalysis(record, rawDocument);
    setRecords((current) => current.map((currentRecord) => (
      currentRecord.caseId === record.caseId
        ? applySingleCaseSemanticRunState(currentRecord, result)
        : currentRecord
    )));
    setSemanticReviewItems(readSemanticReviewItems());
    return result;
  };

  const handleOpenManualReview = async (record: AnalysisCaseRecord): Promise<void> => {
    const rawDocument = await LaborAnalysisPipeline.getRawDocumentForRecord(record);
    if (!rawDocument) return;
    let failure = latestSemanticTechnicalFailure(record.caseId);
    if (!failure && record.semanticResolutionErrorCode) {
      failure = appendSemanticTechnicalFailure({
        caseId: record.caseId,
        failureStage: failureStageForCode(record.semanticResolutionErrorCode),
        failureCode: record.semanticResolutionErrorCode,
        errorSummary: '历史技术失败记录未提供详细摘要。',
        timestamp: new Date().toISOString(),
      });
    }
    if (!failure) return;
    const item = createTechnicalManualReviewItem({
      task: buildSemanticTask(record, rawDocument),
      caseTitle: record.title,
      court: record.court,
      date: record.date,
      technicalFailureHistory: semanticTechnicalFailureHistory(record.caseId),
      createdAt: new Date().toISOString(),
    });
    enqueueSemanticReviewItem(item);
    setSemanticReviewItems(readSemanticReviewItems());
    setActiveSubview('pipeline');
  };

  const handleExportValidationSnapshot = async () => {
    const [allRecords, rawDocuments, analysisRuns] = await Promise.all([
      LaborAnalysisPipeline.getAllAnalysisRecords(false),
      db.rawDocuments.count(),
      new AnalysisRunService().listAnalysisRuns(),
    ]);
    return exportCompetitionValidationSnapshot({
      records,
      allRecords,
      reviewItems: readSemanticReviewItems(),
      analysisRuns,
      selectedAnalysisRunId: analysisContext?.analysisRun.id,
      librarySummary: {
        totalCases: allRecords.length,
        rawDocuments,
      },
    });
  };


  const clearSearch = () => {
    setKeyword('');
  };

  // ④ 最后才允许根据状态 return UI
  if (loading) {
    return <div className="p-8 text-center text-slate-500 flex flex-col items-center justify-center h-full"><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>{t('common.loading')}</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-rose-500 flex flex-col items-center justify-center h-full"><AlertCircle className="w-10 h-10 mb-4" />{' '}{t('finalUi.caseAnalysis.copy001')}{' '}{error.message}</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-slate-100/60 shadow-sm" data-testid="case-analysis-workspace">
      <div className="mx-4 mt-4 shrink-0 space-y-2">
        <div role="tablist" aria-label={t('finalUi.caseAnalysis.copy002')} className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
          <button
            type="button"
            role="tab"
            aria-selected={activeSubview === 'browse'}
            onClick={() => setActiveSubview('browse')}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${activeSubview === 'browse' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            {' '}{t('finalUi.caseAnalysis.copy003')}{' '}</button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSubview === 'pipeline'}
            onClick={() => setActiveSubview('pipeline')}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${activeSubview === 'pipeline' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            {' '}{t('finalUi.caseAnalysis.copy004')}{' '}</button>
        </div>
        {analysisContext?.analysisRun && (
          <AnalysisContextBar
            run={analysisContext.analysisRun}
            snapshotId={analysisContext.snapshot.id}
            scopeLabel={analysisContext.statisticalScope === 'corpus' ? t('finalUi.caseAnalysisExtras.corpus') : t('finalUi.caseAnalysisExtras.sample')}
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
        <PipelineWorkspace records={records} reviewItems={reviewQueue} onSelectCase={handleReviewItemClick} onSelectRecord={handlePipelineRecordClick} hasAnalysisRun={hasAnalysisRun} onRunSingleCase={handleRunSingleCase} onOpenManualReview={handleOpenManualReview} semanticReviewItems={semanticReviewItems} onSemanticReviewItemsChange={setSemanticReviewItems} onExportValidationSnapshot={handleExportValidationSnapshot} />
      )}

      {activeSubview === 'browse' && selectedReviewItem && selectedCase && selectedReviewItem.caseId === selectedCase.caseId && (
        <div className="mx-4 mt-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-950">
          <div className="font-semibold">{' '}{t('finalUi.caseAnalysis.copy005')}{' '}</div>
          <div className="mt-1">{' '}{t('finalUi.caseAnalysis.copy006')}{' '}{cleanPipelineDiagnosticMessage(selectedReviewItem.reasonMessage, (selectedReviewItem.reasonCode && outcomeReviewReasonLabels[selectedReviewItem.reasonCode]) || t('finalUi.caseAnalysis.copy033'))}</div>
          <details className="mt-1">
            <summary className="cursor-pointer text-indigo-700">{' '}{t('finalUi.caseAnalysis.copy007')}{' '}</summary>
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
                  placeholder={t('finalUi.caseAnalysis.copy008')}
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
                <button onClick={clearSearch} className="text-indigo-600 hover:text-indigo-700 font-medium">{' '}{t('finalUi.caseAnalysis.copy009')}{' '}</button>
              )}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-1 min-h-0">
            {filteredRecords.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400 flex flex-col items-center">
                <Search className="w-8 h-8 text-slate-300 mb-2" />
                <p>{' '}{t('finalUi.caseAnalysis.copy010')}{' '}</p>
                {keyword.trim() !== '' && (
                  <button onClick={clearSearch} className="mt-4 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg font-medium hover:bg-indigo-100 transition-colors">
                    {' '}{t('finalUi.caseAnalysis.copy011')}{' '}</button>
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
                    {record.title || record.caseNumber || t('finalUi.caseAnalysisExtras.unknownCase')}
                  </h4>
                  <div className="text-xs text-slate-500 mt-1 flex gap-2">
                    <span>{record.city}</span>
                    <span>{record.arbitrationCommittee || record.court}</span>
                    <span>{record.year}</span>
                  </div>
                  <div className="flex gap-1 flex-wrap mt-1.5">
                    {Array.isArray(record.disputeType) ? record.disputeType.slice(0, 2).map((dt: any, i: number) => (
                      <span key={i} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]">
                        {getDisputeTypeLabel(dt, t)}
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
                <p>{filteredRecords.length === 0 ? t('finalUi.caseAnalysisExtras.noMatches') : t('finalUi.caseAnalysisExtras.selectCase')}</p>
              </div>
            ) : (() => {
              const record = selectedCase;
              return (
              <div className="space-y-6 h-full">
                  <div className="bg-white border border-slate-200 rounded-[24px] p-6 shadow-sm mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-1 bg-indigo-100 text-indigo-700 text-[10px] rounded font-bold">{' '}{t('finalUi.caseAnalysis.copy012')}{' '}</span>
                      <button type="button" onClick={() => addSelectedCaseToGoldSet(record.caseId)} className="px-2 py-1 border border-indigo-200 text-indigo-700 text-[10px] rounded font-semibold hover:bg-indigo-50">{' '}{t('finalUi.caseAnalysis.copy013')}{' '}</button>
                      {goldMessage && <span className="text-[10px] text-emerald-700">{goldMessage}</span>}
                    </div>
                    <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 mb-4">
                      {record.title || record.caseNumber}
                    </h3>
                    {(() => {
                      const summary = createCaseSummaryPresentation(record, t);
                      return (summary.primary || summary.secondary) ? (
                        <div aria-label={t('finalUi.caseAnalysis.copy014')} className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs text-indigo-950">
                          {summary.primary && <div className="font-medium">{summary.primary}</div>}
                          {summary.secondary && <div className="mt-0.5 text-[11px] text-indigo-800/80">{summary.secondary}</div>}
                        </div>
                      ) : null;
                    })()}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800 text-sm">
                          {' '}{t('finalUi.caseAnalysis.copy015')}{' '}</div>
                        <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs space-y-2">
                          <div className="flex"><span className="text-slate-500 min-w-[5rem]">{' '}{t('finalUi.caseAnalysis.copy016')}{' '}</span><span className="font-medium text-slate-900">{formatCaseNumber(record.caseNumber)}</span></div>
                          <div className="flex"><span className="text-slate-500 min-w-[5rem]">{' '}{t('finalUi.caseAnalysis.copy017')}{' '}</span><span className="font-medium text-slate-900">{formatCaseDate(record.date)}</span></div>
                          <div className="flex"><span className="text-slate-500 min-w-[5rem]">{' '}{t('finalUi.caseAnalysis.copy018')}{' '}</span><span className="font-medium text-slate-900">{record.arbitrationCommittee || record.court || t('finalUi.caseAnalysisExtras.unknown')}</span></div>
                          <div className="flex"><span className="text-slate-500 min-w-[5rem]">{' '}{t('finalUi.caseAnalysis.copy019')}{' '}</span><span className="font-medium text-slate-900">{formatPartyName(record.employeeParty)}</span></div>
                          <div className="flex"><span className="text-slate-500 min-w-[5rem]">{' '}{t('finalUi.caseAnalysis.copy020')}{' '}</span><span className="font-medium text-slate-900">{formatPartyName(record.employerParty)}</span></div>
                          <div className="flex"><span className="text-slate-500 min-w-[5rem]">{' '}{t('finalUi.caseAnalysis.copy021')}{' '}</span><span className="font-medium text-slate-900">{getCaseLevelLabel(record.caseLevel, t)}</span></div>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs space-y-2">
                          <div className="font-bold text-slate-800">{' '}{t('finalUi.caseAnalysis.copy022')}{' '}</div>
                          {record.parties?.length ? record.parties.map((party) => (
                            <div key={party.id} className="flex items-start gap-2">
                              <span className="text-slate-500 min-w-[4.5rem]">{party.proceduralRoles.length
                                ? party.proceduralRoles.map((role) => t(`finalUi.caseAnalysisRoles.procedural.${role}`)).join(' / ')
                                : t('finalUi.caseAnalysisExtras.unknown')}：</span>
                              <span className="font-medium text-slate-900">{formatPartyName(party.name)}｜{t(`finalUi.caseAnalysisRoles.labor.${party.laborRole}`)}</span>
                            </div>
                          )) : <div className="text-slate-400">{' '}{t('finalUi.caseAnalysis.copy023')}{' '}</div>}
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800 text-sm">
                          {' '}{t('finalUi.caseAnalysis.copy024')}{' '}</div>
                        {selectedOutcomePresentations && <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs space-y-2">
                          <div className="flex"><span className="text-slate-500 min-w-[6rem]">{' '}{t('finalUi.caseAnalysis.copy025')}{' '}</span><span className={`font-bold ${selectedOutcomePresentations.employee.textClassName}`}>{getOutcomeLabel(record.employeeOutcome, t)}</span></div>
                          <div className="flex"><span className="text-slate-500 min-w-[6rem]">{' '}{t('finalUi.caseAnalysis.copy026')}{' '}</span><span className={`font-bold ${selectedOutcomePresentations.employer.textClassName}`}>{getOutcomeLabel(record.employerOutcome, t)}</span></div>
                          <div className="flex"><span className="text-slate-500 min-w-[5rem]">{' '}{t('finalUi.caseAnalysis.copy027')}{' '}</span><span className="font-medium text-slate-900">{Array.isArray(record.disputeType) ? record.disputeType.map((value) => getDisputeTypeLabel(value, t)).join('、') : (record.disputeType || t('finalUi.caseAnalysisExtras.unknown'))}</span></div>
                          {Array.isArray(record.keyLegalPoints) && record.keyLegalPoints.length > 0 && (
                            <div className="flex flex-col mt-2">
                              <span className="text-slate-500 mb-1">{' '}{t('finalUi.caseAnalysis.copy028')}{' '}</span>
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
                            {' '}{t('finalUi.caseAnalysis.copy029')}{' '}</div>
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
                                      {getClaimTypeLabel(claim.claimName, t)}
                                      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                                        <span>{' '}{t('finalUi.caseAnalysis.copy030')}{' '}{ownership.claimantLabel}</span>
                                        {ownership.beneficiaryLabel && <span>{' '}{t('finalUi.caseAnalysis.copy031')}{' '}{ownership.beneficiaryLabel}</span>}
                                        {ownership.relatedLabel && <span>{' '}{t('finalUi.caseAnalysis.copy032')}{' '}{ownership.relatedLabel}</span>}
                                        {diagnostic?.needsReview && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">{' '}{t('finalUi.caseAnalysis.copy033')}{' '}</span>}
                                      </div>
                                      {diagnostic?.reasonMessage ? <span className="block text-amber-700 mt-1">{' '}{t('finalUi.caseAnalysis.copy034')}{' '}{diagnostic.reasonMessage}</span> : null}
                                      {diagnostic?.needsReview ? (
                                        <details className="mt-1 text-[11px] text-slate-600">
                                          <summary className="cursor-pointer text-indigo-700">{' '}{t('finalUi.caseAnalysis.copy007')}{' '}</summary>
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
                                      {getOutcomeLabel(claim.supportStatus, t)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-xl border border-slate-100">{' '}{t('finalUi.caseAnalysis.copy023')}{' '}</div>
                          )}
                        </div>
                        
                        <div className="space-y-3">
                          <div className="flex items-center gap-1.5 font-bold text-slate-800 text-sm">
                            {' '}{t('finalUi.caseAnalysis.copy035')}{' '}</div>
                          {Array.isArray(record.employerDefenses) && record.employerDefenses.length > 0 ? (
                            <div className="space-y-2">
                              {record.employerDefenses.map((def: any, idx: number) => (
                                <div key={idx} className="bg-emerald-50 border border-emerald-100 p-2.5 rounded-lg text-xs space-y-1">
                                  <div className="font-bold text-emerald-900">{getDefenseTypeLabel(def.defenseType || def.type, t)}</div>
                                  <CollapsibleText text={def.matchedText || def.text} collapsedLines={4} className="text-slate-700 leading-relaxed" />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-xl border border-slate-100">{' '}{t('finalUi.caseAnalysis.copy023')}{' '}</div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <details className="mt-6 pt-6 border-t border-slate-100">
                      <summary className="flex cursor-pointer list-none items-center gap-1.5 font-bold text-slate-800 text-sm">
                        {' '}{t('finalUi.caseAnalysis.copy036')}{' '}{(record.evidence || []).length} {' '}{t('finalUi.caseAnalysis.copy037')}{' '}{record.courtReasoning?.trim() ? '1' : '0'} {' '}{t('finalUi.caseAnalysis.copy038')}{' '}</summary>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                        <div className="bg-white border border-slate-200 p-3 rounded-xl">
                          <div className="text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wider">{' '}{t('finalUi.caseAnalysis.copy039')}{' '}</div>
                          {Array.isArray(record.evidence) && record.evidence.length > 0 ? (
                            <ul className="list-disc list-inside text-xs text-slate-700 space-y-1">
                              {record.evidence.map((ev: any, idx: number) => (
                                <li key={idx}>
                                  <span className="font-medium text-slate-900">【{evidenceProviderLabel(ev.provider)}】</span>
                                  <span className="ml-1">{getEvidenceTypeLabel(ev.name || ev.type, t)}：</span>
                                  <CollapsibleText text={ev.matchedText || ev.text} collapsedLines={4} className="mt-0.5" />
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="text-xs text-slate-400">{' '}{t('finalUi.caseAnalysis.copy023')}{' '}</div>
                          )}
                        </div>
                        <div className="bg-white border border-slate-200 p-3 rounded-xl">
                          <div className="text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wider">{' '}{t('finalUi.caseAnalysis.copy040')}{' '}</div>
                          {typeof record.courtReasoning === 'string' && record.courtReasoning.trim().length > 0 ? (
                            <div className="text-xs text-slate-700 bg-white p-2 border border-slate-100 rounded leading-relaxed">
                              <CollapsibleText text={record.courtReasoning} collapsedLines={4} />
                            </div>
                          ) : (
                            <div className="text-xs text-slate-400">{' '}{t('finalUi.caseAnalysis.copy023')}{' '}</div>
                          )}
                        </div>
                      </div>
                    </details>
                    
                  </div>
                  {record.rawDocumentId && <div key={record.rawDocumentId}><JudgmentTranslationReader rawDocumentId={record.rawDocumentId} /></div>}
              </div>
              );
            })()}
          </div>
        </main>
      </div>}
    </div>
  );
};
