import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock,
  Database,
  Building,
  Calendar,
  ShieldAlert,
  FileCheck,
  Search,
  Scale,
  UserCheck,
  RefreshCw,
  Edit3,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  Check,
  X,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Info,
  Sliders,
  HelpCircle,
} from 'lucide-react';
import {
  RawDocument,
  LaborInfoParsedResult,
  ParserEvaluationReport,
  ParserReviewRecord,
  ReviewStatus,
  LaborInfoClaimItem,
  EmployerDefenseItem,
  EvidenceItem,
  LegalOutcomeType,
  ClaimSupportStatus,
} from '../types';
import { DataService } from '../services/data/dataService';
import { LaborInfoParserAdapter } from '../services/parser/LaborInfoParserAdapter';
import { ParserEvaluator } from '../services/parser/ParserEvaluator';
import { ReviewStorageService } from '../services/data/ReviewStorageService';

interface LaborInfoReviewProps {
  onDataChanged?: () => void;
}

export const LaborInfoReview: React.FC<LaborInfoReviewProps> = ({ onDataChanged }) => {
  const { t } = useTranslation();
  // 原始工劳网案例列表
  const [rawDocs, setRawDocs] = useState<RawDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDocIndex, setSelectedDocIndex] = useState<number>(0);

  // 解析与评估缓存
  const [parsedMap, setParsedMap] = useState<Record<string, LaborInfoParsedResult>>({});
  const [evalMap, setEvalMap] = useState<Record<string, ParserEvaluationReport>>({});
  const [reviewMap, setReviewMap] = useState<Record<string, ParserReviewRecord>>({});

  // 左侧文书全文搜索高亮
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [activeSectionAnchor, setActiveSectionAnchor] = useState<string | null>(null);

  // 右侧当前正在编辑的人工表单状态
  const [editEmployeeParty, setEditEmployeeParty] = useState<string>('');
  const [editEmployerParty, setEditEmployerParty] = useState<string>('');
  const [editOverallResult, setEditOverallResult] = useState<LegalOutcomeType>('unclear');
  const [editClaims, setEditClaims] = useState<LaborInfoClaimItem[]>([]);
  const [editDefenses, setEditDefenses] = useState<EmployerDefenseItem[]>([]);
  const [editEvidence, setEditEvidence] = useState<EvidenceItem[]>([]);
  const [editReviewStatus, setEditReviewStatus] = useState<ReviewStatus>('pending');
  const [editCustomNotes, setEditCustomNotes] = useState<string>('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [showReparseConfirm, setShowReparseConfirm] = useState(false);
  const [isReparsing, setIsReparsing] = useState(false);
  const [reparseProgress, setReparseProgress] = useState({ current: 0, total: 0 });
  const [reparseSummary, setReparseSummary] = useState<{ total: number; succeeded: number; failed: number; failures: Array<{ caseId: string; error: string }> } | null>(null);
  const [reparseError, setReparseError] = useState<string | null>(null);

  // 加载数据
  const loadData = async () => {
    setIsLoading(true);
    try {
      // 获取已入库工劳网原始案例，默认加载前 10 份进行审查与评估
      const docs = await DataService.getLaborInfoRawDocuments(20);
      setRawDocs(docs);

      const parsedObj: Record<string, LaborInfoParsedResult> = {};
      const evalObj: Record<string, ParserEvaluationReport> = {};

      for (const doc of docs) {
        const parsed = LaborInfoParserAdapter.parseDetailed(doc);
        const evalReport = ParserEvaluator.evaluate(parsed, doc.rawText);
        parsedObj[doc.id] = parsed;
        evalObj[doc.id] = evalReport;
      }

      setParsedMap(parsedObj);
      setEvalMap(evalObj);

      // 加载所有历史人工审核记录
      const reviews = ReviewStorageService.getAllReviews();
      setReviewMap(reviews);

      if (docs.length > 0) {
        setSelectedDocIndex(0);
        initializeForm(docs[0].id, parsedObj[docs[0].id], reviews[docs[0].id]);
      }
    } catch (err) {
      console.error('加载案例或执行解析评估失败:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleReparseLocalCases = async () => {
    setShowReparseConfirm(false);
    setIsReparsing(true);
    setReparseError(null);
    setReparseSummary(null);
    setReparseProgress({ current: 0, total: 0 });

    try {
      const result = await DataService.reparseAllCases((current, total) => {
        setReparseProgress({ current, total });
      });
      setReparseSummary(result);
      await loadData();
      onDataChanged?.();
    } catch (error) {
      setReparseError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsReparsing(false);
    }
  };

  // 当切换选中案例时，初始化表单状态
  const handleSelectDoc = (index: number) => {
    setSelectedDocIndex(index);
    const doc = rawDocs[index];
    if (doc) {
      const parsed = parsedMap[doc.id];
      const review = reviewMap[doc.id];
      initializeForm(doc.id, parsed, review);
      setSaveSuccessMsg(null);
    }
  };

  // 根据 Parser 解析结果或已有人工审核记录初始化编辑表单
  const initializeForm = (
    docId: string,
    parsed?: LaborInfoParsedResult,
    savedReview?: ParserReviewRecord
  ) => {
    if (!parsed) return;

    if (savedReview && savedReview.reviewerChanges) {
      const changes = savedReview.reviewerChanges;
      setEditEmployeeParty(changes.employeeParty ?? parsed.employeeParty ?? '');
      setEditEmployerParty(changes.employerParty ?? parsed.employerParty ?? '');
      setEditOverallResult(changes.applicantOutcome ?? changes.overallResult ?? parsed.applicantOutcome ?? parsed.overallResult);
      setEditClaims(changes.claims ? JSON.parse(JSON.stringify(changes.claims)) : JSON.parse(JSON.stringify(parsed.claims)));
      setEditDefenses(changes.employerDefenses ? JSON.parse(JSON.stringify(changes.employerDefenses)) : JSON.parse(JSON.stringify(parsed.employerDefenses)));
      setEditEvidence(changes.evidence ? JSON.parse(JSON.stringify(changes.evidence)) : JSON.parse(JSON.stringify(parsed.evidence)));
      setEditReviewStatus(savedReview.reviewStatus);
      setEditCustomNotes(changes.customNotes || '');
    } else {
      setEditEmployeeParty(parsed.employeeParty || '');
      setEditEmployerParty(parsed.employerParty || '');
      setEditOverallResult(parsed.applicantOutcome ?? parsed.overallResult);
      setEditClaims(JSON.parse(JSON.stringify(parsed.claims || [])));
      setEditDefenses(JSON.parse(JSON.stringify(parsed.employerDefenses || [])));
      setEditEvidence(JSON.parse(JSON.stringify(parsed.evidence || [])));
      setEditReviewStatus('pending');
      setEditCustomNotes('');
    }
  };

  // 重置回 Parser 初始提取状态
  const handleResetToParserDefault = () => {
    const currentDoc = rawDocs[selectedDocIndex];
    if (!currentDoc) return;
    const parsed = parsedMap[currentDoc.id];
    if (!parsed) return;

    setEditEmployeeParty(parsed.employeeParty || '');
    setEditEmployerParty(parsed.employerParty || '');
    setEditOverallResult(parsed.applicantOutcome ?? parsed.overallResult);
    setEditClaims(JSON.parse(JSON.stringify(parsed.claims || [])));
    setEditDefenses(JSON.parse(JSON.stringify(parsed.employerDefenses || [])));
    setEditEvidence(JSON.parse(JSON.stringify(parsed.evidence || [])));
    setEditReviewStatus('pending');
    setEditCustomNotes('');
    setSaveSuccessMsg(t('dataManagement.reviewUi.resetSuccess'));
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  // 保存人工反馈 (严格保持零污染：仅存 reviewerChanges，严禁覆盖 rawText)
  const handleSaveReview = (status: ReviewStatus = 'modified') => {
    const currentDoc = rawDocs[selectedDocIndex];
    if (!currentDoc) return;
    const parsed = parsedMap[currentDoc.id];
    const evaluation = evalMap[currentDoc.id];

    const reviewRecord: ParserReviewRecord = {
      id: `review_${currentDoc.id}`,
      rawDocumentId: currentDoc.id,
      caseTitle: currentDoc.title,
      reviewStatus: status,
      reviewerChanges: {
        employeeParty: editEmployeeParty.trim() || null,
        employerParty: editEmployerParty.trim() || null,
        applicantRole: parsed.applicantRole,
        applicantOutcome: editOverallResult,
        claims: editClaims,
        employerDefenses: editDefenses,
        evidence: editEvidence,
        // 兼容旧版本读取；语义与 applicantOutcome 相同。
        overallResult: editOverallResult,
        customNotes: editCustomNotes.trim() || undefined,
      },
      reviewerName: '人工质检员',
      reviewTime: new Date().toISOString(),
      evaluationSnapshot: evaluation
        ? {
            completenessScore: evaluation.completenessScore,
            issueCount: evaluation.consistency.issues.length,
            conflictCount: evaluation.consistency.conflictCount,
          }
        : undefined,
    };

    ReviewStorageService.saveReview(reviewRecord);
    setReviewMap((prev) => ({ ...prev, [currentDoc.id]: reviewRecord }));
    setEditReviewStatus(status);
    setSaveSuccessMsg(t('dataManagement.reviewUi.saveSuccess', { status: t(status === 'approved' ? 'dataManagement.reviewUi.statusApproved' : 'dataManagement.reviewUi.statusModified') }));
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  // 诉求列表操作
  const handleClaimChange = (index: number, field: keyof LaborInfoClaimItem, value: any) => {
    setEditClaims((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleAddClaim = () => {
    setEditClaims((prev) => [
      ...prev,
      {
        claimName: '新增诉求项目',
        claimant: 'employee',
        supportStatus: 'supported',
      },
    ]);
  };

  const handleDeleteClaim = (index: number) => {
    setEditClaims((prev) => prev.filter((_, i) => i !== index));
  };

  // 抗辩列表操作
  const handleAddDefense = () => {
    setEditDefenses((prev) => [
      ...prev,
      {
        defenseType: '严重违纪 / 违反规章制度',
        matchedText: '人工补充抗辩事由',
        confidence: 1.0,
        sourceSection: '人工校验',
      },
    ]);
  };

  const handleDeleteDefense = (index: number) => {
    setEditDefenses((prev) => prev.filter((_, i) => i !== index));
  };

  // 证据列表操作
  const handleAddEvidence = () => {
    setEditEvidence((prev) => [
      ...prev,
      {
        name: '考勤打卡记录',
        matchedText: '人工补充证据依据',
        confidence: 1.0,
      },
    ]);
  };

  const handleDeleteEvidence = (index: number) => {
    setEditEvidence((prev) => prev.filter((_, i) => i !== index));
  };

  // 当前激活的文档与报告
  const currentDoc: RawDocument | undefined = rawDocs[selectedDocIndex];
  const currentParsed: LaborInfoParsedResult | undefined = currentDoc ? parsedMap[currentDoc.id] : undefined;
  const currentEvaluation: ParserEvaluationReport | undefined = currentDoc ? evalMap[currentDoc.id] : undefined;
  const currentSavedReview: ParserReviewRecord | undefined = currentDoc ? reviewMap[currentDoc.id] : undefined;

  // 聚合统计指标 (默认 10 份或全部已入库工劳网案件)
  const batchSummary = useMemo(() => {
    const reports = Object.values(evalMap) as ParserEvaluationReport[];
    return ParserEvaluator.summarizeBatch(reports);
  }, [evalMap]);

  // 审核进度统计
  const reviewProgress = useMemo(() => {
    const total = rawDocs.length;
    const reviewList = Object.values(reviewMap) as ParserReviewRecord[];
    const reviewedCount = reviewList.filter(
      (r) => r.reviewStatus === 'approved' || r.reviewStatus === 'modified'
    ).length;
    return { total, reviewedCount, percentage: total > 0 ? Math.round((reviewedCount / total) * 100) : 0 };
  }, [rawDocs, reviewMap]);

  // 高亮渲染文书全文
  const renderHighlightedRawText = (text: string) => {
    if (!text) return <span className="text-slate-400">{t('dataManagement.reviewPanelUi.copy001')}</span>;
    if (!searchKeyword.trim()) {
      return text;
    }

    const kw = searchKeyword.trim();
    const regex = new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-amber-200 text-amber-950 font-semibold px-0.5 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* 顶部标题与质量评估看板 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">{t('dataManagement.reviewPanelUi.copy002')}{' '}<span className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">{t('dataManagement.reviewPanelUi.copy003')}{' '}</span>
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">{t('dataManagement.reviewPanelUi.copy004')}{' '}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            <button
              onClick={loadData}
              disabled={isLoading || isReparsing}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />{t('dataManagement.reviewPanelUi.copy005')}{' '}</button>
            <button
              id="btn-reparse-local-cases"
              onClick={() => setShowReparseConfirm(true)}
              disabled={isLoading || isReparsing}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isReparsing ? 'animate-spin' : ''}`} />{t('dataManagement.reviewPanelUi.copy006')}{' '}</button>
          </div>
        </div>

        {/* 隔离保护提示 */}
        <div className="mt-4 p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl flex items-start gap-2.5 text-xs text-indigo-950 leading-relaxed">
          <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">{t('dataManagement.reviewPanelUi.copy007')}</span>{t('dataManagement.reviewPanelUi.copy008')}<strong>{t('dataManagement.reviewPanelUi.copy009')}</strong>{t('dataManagement.reviewPanelUi.copy010')}<strong>{t('dataManagement.reviewPanelUi.copy011')}</strong>{t('dataManagement.reviewPanelUi.copy012')}<strong>{t('dataManagement.reviewPanelUi.copy013')}</strong>。
            <div className="mt-1 text-indigo-800">{t('dataManagement.reviewPanelUi.copy014')}</div>
          </div>
        </div>

        {isReparsing && (
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900" role="status">{t('dataManagement.reviewPanelUi.copy015')}{' '}{reparseProgress.current} / {reparseProgress.total || '…'}
          </div>
        )}
        {reparseSummary && (
          <div className={`mt-3 p-3 rounded-xl border text-xs ${reparseSummary.failed > 0 ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`} role="status">{t('dataManagement.reviewPanelUi.copy016')}{' '}{reparseSummary.succeeded}{t('dataManagement.reviewPanelUi.copy017')}{' '}{reparseSummary.failed}{t('dataManagement.reviewPanelUi.copy018')}{' '}{reparseSummary.total}）
            {reparseSummary.failures.length > 0 && (
              <div className="mt-1 text-2xs">{t('dataManagement.reviewPanelUi.copy019')}</div>
            )}
          </div>
        )}
        {reparseError && (
          <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900" role="alert">{t('dataManagement.reviewPanelUi.copy020')}{reparseError}
          </div>
        )}
      </div>

      {/* 批量概览指标看板 (基于前 10 份默认测试数据) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {/* 1. 平均完整率 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-2xs text-slate-500 font-semibold uppercase flex items-center gap-1">
            <FileCheck className="w-3.5 h-3.5 text-emerald-500" />{t('dataManagement.reviewPanelUi.copy021')}{' '}</div>
          <div className="text-2xl font-bold font-mono text-emerald-600 mt-1">
            {batchSummary.avgCompletenessScore}%
          </div>
          <div className="text-2xs text-slate-500 mt-0.5">{t('dataManagement.reviewPanelUi.copy022')}{' '}</div>
        </div>

        {/* 2. 冲突数量 (Conflict) */}
        <div className={`border rounded-2xl p-4 shadow-sm ${
          batchSummary.totalConflicts > 0 ? 'bg-rose-50/80 border-rose-200' : 'bg-white border-slate-200'
        }`}>
          <div className="text-2xs text-slate-500 font-semibold uppercase flex items-center gap-1">
            <AlertCircle className={`w-3.5 h-3.5 ${batchSummary.totalConflicts > 0 ? 'text-rose-600' : 'text-slate-400'}`} />{t('dataManagement.reviewPanelUi.copy023')}{' '}</div>
          <div className={`text-2xl font-bold font-mono mt-1 ${
            batchSummary.totalConflicts > 0 ? 'text-rose-600' : 'text-slate-700'
          }`}>
            {batchSummary.totalConflicts} <span className="text-xs font-normal text-slate-400">{t('dataManagement.reviewPanelUi.copy024')}</span>
          </div>
          <div className="text-2xs text-slate-500 mt-0.5">{t('dataManagement.reviewPanelUi.copy025')}</div>
        </div>

        {/* 3. 字段缺失 (Missing) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-2xs text-slate-500 font-semibold uppercase flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />{t('dataManagement.reviewPanelUi.copy026')}{' '}</div>
          <div className="text-2xl font-bold font-mono text-amber-600 mt-1">
            {batchSummary.totalMissing} <span className="text-xs font-normal text-slate-400">{t('dataManagement.reviewPanelUi.copy027')}</span>
          </div>
          <div className="text-2xs text-slate-500 mt-0.5">{t('dataManagement.reviewPanelUi.copy028')}</div>
        </div>

        {/* 4. 疑似误报 (False Positive) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-2xs text-slate-500 font-semibold uppercase flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5 text-purple-500" />{t('dataManagement.reviewPanelUi.copy029')}{' '}</div>
          <div className="text-2xl font-bold font-mono text-purple-600 mt-1">
            {batchSummary.totalFalsePositives} <span className="text-xs font-normal text-slate-400">{t('dataManagement.reviewPanelUi.copy030')}</span>
          </div>
          <div className="text-2xs text-slate-500 mt-0.5">{t('dataManagement.reviewPanelUi.copy031')}</div>
        </div>

        {/* 5. 人工校验进度 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-2xs text-slate-500 font-semibold uppercase flex items-center gap-1">
            <UserCheck className="w-3.5 h-3.5 text-blue-500" />{t('dataManagement.reviewPanelUi.copy032')}{' '}</div>
          <div className="text-2xl font-bold font-mono text-blue-600 mt-1">
            {reviewProgress.reviewedCount} / {reviewProgress.total}
          </div>
          <div className="text-2xs text-slate-500 mt-0.5">{t('dataManagement.reviewPanelUi.copy033')}{' '}{reviewProgress.percentage}{t('dataManagement.reviewPanelUi.copy034')}</div>
        </div>
      </div>

      {/* 案例快速选择横向条 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-2 font-semibold">
            <Database className="w-4 h-4 text-indigo-600" />
            <span>{t('dataManagement.reviewPanelUi.copy035')}{' '}{rawDocs.length}{t('dataManagement.reviewPanelUi.copy036')}</span>
          </div>
          <span className="text-2xs text-slate-400">{t('dataManagement.reviewPanelUi.copy037')}</span>
        </div>

        {isLoading ? (
          <div className="py-4 text-center text-xs text-slate-400">{t('dataManagement.reviewPanelUi.copy038')}</div>
        ) : rawDocs.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-500">{t('dataManagement.reviewPanelUi.copy039')}{' '}</div>
        ) : (
          <div className="flex items-center gap-2 overflow-x-auto py-1">
            {rawDocs.map((doc, idx) => {
              const evalRep = evalMap[doc.id];
              const reviewRec = reviewMap[doc.id];
              const isSelected = idx === selectedDocIndex;
              const hasConflict = evalRep?.consistency.conflictCount && evalRep.consistency.conflictCount > 0;

              return (
                <button
                  key={doc.id}
                  onClick={() => handleSelectDoc(idx)}
                  className={`px-3 py-2 rounded-xl text-left border text-xs min-w-[200px] max-w-[240px] shrink-0 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className={`text-2xs font-mono font-bold px-1.5 py-0.5 rounded ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                    }`}>
                      #{idx + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      {hasConflict && (
                        <span className="px-1.5 py-0.5 rounded text-2xs bg-rose-500 text-white font-bold">{t('dataManagement.reviewPanelUi.copy040')}{' '}</span>
                      )}
                      <span className={`text-2xs font-mono px-1.5 py-0.5 rounded ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {evalRep?.completenessScore ?? 0}%
                      </span>
                    </div>
                  </div>
                  <div className="font-semibold truncate text-xs" title={doc.title}>
                    {doc.title}
                  </div>
                  <div className={`text-2xs mt-1 flex items-center justify-between ${
                    isSelected ? 'text-indigo-100' : 'text-slate-500'
                  }`}>
                    <span>{doc.sourceId ? `ID:${doc.sourceId}` : t('dataManagement.reviewPanelUi.documentFallback')}</span>
                    <span>
                      {reviewRec?.reviewStatus === 'approved' ? t('dataManagement.reviewPanelUi.approved') : reviewRec?.reviewStatus === 'modified' ? t('dataManagement.reviewPanelUi.modified') : t('dataManagement.reviewPanelUi.pending')}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 主工作区：左侧原始文书 vs 右侧解析与人工校验 */}
      {currentDoc && currentParsed && currentEvaluation && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ============================================================ */}
          {/* 左侧：原始裁判文书正文 (只读保护，绝不覆盖 rawText) */}
          {/* ============================================================ */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col h-[820px]">
            {/* 顶栏：文书标题与快速搜索 */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <h2 className="text-sm font-bold text-slate-900">{t('dataManagement.reviewPanelUi.copy041')}</h2>
                </div>
                <span className="text-2xs font-mono px-2 py-0.5 bg-slate-200 text-slate-700 rounded-md">
                  {currentDoc.rawText?.length.toLocaleString()}{t('dataManagement.reviewPanelUi.copy042')}{' '}</span>
              </div>

              {/* 搜索高亮框 */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder={t('dataManagement.reviewPanelUi.copy043')}
                  className="w-full pl-8 pr-8 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
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

              {/* 快捷跳转标签 */}
              <div className="flex items-center gap-1.5 flex-wrap text-2xs">
                <span className="text-slate-400">{t('dataManagement.reviewPanelUi.copy044')}</span>
                {['原告', '被告', '经审理查明', '本院认为', '判决如下'].map((kw) => (
                  <button
                    key={kw}
                    onClick={() => setSearchKeyword(kw)}
                    className="px-2 py-0.5 bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-300 rounded-md transition-colors cursor-pointer"
                  >
                    {kw}
                  </button>
                ))}
              </div>
            </div>

            {/* 文书正文内容区 (带平滑滚动与高亮) */}
            <div className="flex-1 p-5 overflow-y-auto font-sans text-xs leading-relaxed text-slate-700 whitespace-pre-wrap select-text bg-white space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-2xs space-y-1 font-mono text-slate-600">
                <div><strong>{t('dataManagement.reviewPanelUi.copy045')}</strong>{currentDoc.title}</div>
                <div><strong>{t('dataManagement.reviewPanelUi.copy046')}</strong>{currentDoc.id} (SourceID: {currentDoc.sourceId || '-'})</div>
                {currentDoc.sourceUrl && (
                  <div className="truncate">
                    <strong>{t('dataManagement.reviewPanelUi.copy047')}</strong>
                    <a
                      href={currentDoc.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:underline inline-flex items-center gap-1"
                    >
                      {currentDoc.sourceUrl} <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 pt-3">
                {renderHighlightedRawText(currentDoc.rawText || '')}
              </div>
            </div>
          </div>

          {/* ============================================================ */}
          {/* 右侧：结构化质量评估 + 人工校验表单 (支持修改并保存) */}
          {/* ============================================================ */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col h-[820px] overflow-hidden">
            {/* 顶栏：质量评分与保存操作 */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-800">{t('dataManagement.reviewPanelUi.copy048')}</span>
                  <span className={`px-2 py-0.5 rounded-md font-mono text-xs font-bold ${
                    currentEvaluation.completenessScore >= 80
                      ? 'bg-emerald-100 text-emerald-800'
                      : currentEvaluation.completenessScore >= 60
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}>
                    {currentEvaluation.completenessScore}{t('dataManagement.reviewPanelUi.copy049')}{' '}</span>
                  <span className="text-2xs text-slate-400">
                    ({currentEvaluation.grade === 'excellent' ? t('dataManagement.reviewPanelUi.excellent') : currentEvaluation.grade === 'good' ? t('dataManagement.reviewPanelUi.good') : currentEvaluation.grade === 'fair' ? t('dataManagement.reviewPanelUi.fair') : t('dataManagement.reviewPanelUi.needsImprovement')})
                  </span>
                </div>

                <div className="h-4 w-px bg-slate-200" />

                {/* 审核状态标志 */}
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-slate-500">{t('dataManagement.reviewPanelUi.copy050')}</span>
                  <span className={`px-2 py-0.5 rounded-full text-2xs font-semibold ${
                    editReviewStatus === 'approved'
                      ? 'bg-emerald-100 text-emerald-800'
                      : editReviewStatus === 'modified'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {editReviewStatus === 'approved' ? t('dataManagement.reviewPanelUi.approvedPlain') : editReviewStatus === 'modified' ? t('dataManagement.reviewPanelUi.modifiedPlain') : t('dataManagement.reviewPanelUi.pendingPlain')}
                  </span>
                </div>
              </div>

              {/* 操作按钮区 */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleResetToParserDefault}
                  title={t('dataManagement.reviewPanelUi.copy051')}
                  className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />{t('dataManagement.reviewPanelUi.copy052')}{' '}</button>

                <button
                  onClick={() => handleSaveReview('approved')}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />{t('dataManagement.reviewPanelUi.copy053')}{' '}</button>

                <button
                  onClick={() => handleSaveReview('modified')}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />{t('dataManagement.reviewPanelUi.copy054')}{' '}</button>
              </div>
            </div>

            {/* 保存反馈成功提示条 */}
            {saveSuccessMsg && (
              <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 text-xs text-emerald-800 flex items-center gap-2 animate-in fade-in duration-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{saveSuccessMsg}</span>
              </div>
            )}

            {/* 表单内容可滚动区域 */}
            <div className="flex-1 p-5 overflow-y-auto space-y-5">
              {/* 1. 规则一致性告警与诊断 (Conflict / Missing / False Positive) */}
              {currentEvaluation.consistency.issues.length > 0 && (
                <div className="space-y-2 p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl">
                  <div className="flex items-center justify-between text-xs font-bold text-amber-950">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />{t('dataManagement.reviewPanelUi.copy055')}{currentEvaluation.consistency.issues.length}{t('dataManagement.reviewPanelUi.copy056')}{' '}</span>
                    <span className="text-2xs font-mono font-normal text-amber-800">{t('dataManagement.reviewPanelUi.copy057')}{currentEvaluation.consistency.conflictCount}{t('dataManagement.reviewPanelUi.copy058')}{currentEvaluation.consistency.missingCount}{t('dataManagement.reviewPanelUi.copy059')}{currentEvaluation.consistency.falsePositiveCount}
                    </span>
                  </div>

                  <div className="space-y-1.5 mt-2">
                    {currentEvaluation.consistency.issues.map((issue) => (
                      <div
                        key={issue.id}
                        className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                          issue.type === 'conflict'
                            ? 'bg-rose-50 border-rose-200 text-rose-950'
                            : issue.type === 'missing'
                            ? 'bg-amber-50 border-amber-200 text-amber-950'
                            : 'bg-purple-50 border-purple-200 text-purple-950'
                        }`}
                      >
                        <span className={`px-1.5 py-0.5 rounded text-2xs font-bold uppercase shrink-0 mt-0.5 ${
                          issue.type === 'conflict'
                            ? 'bg-rose-200 text-rose-900'
                            : issue.type === 'missing'
                            ? 'bg-amber-200 text-amber-900'
                            : 'bg-purple-200 text-purple-900'
                        }`}>
                          {issue.type === 'conflict' ? t('dataManagement.reviewPanelUi.conflict') : issue.type === 'missing' ? t('dataManagement.reviewPanelUi.missing') : t('dataManagement.reviewPanelUi.falsePositive')}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold">{issue.title}</div>
                          <div className="text-2xs opacity-90 mt-0.5">{issue.message}</div>
                          {issue.suggestion && (
                            <div className="text-2xs mt-1 font-semibold text-indigo-700 bg-white/70 p-1 rounded">{t('dataManagement.reviewPanelUi.copy060')}{' '}{issue.suggestion}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. 当事人主体核验 (支持人工修改 employeeParty & employerParty) */}
              <div className="space-y-2 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                  <span className="flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-blue-600" />{t('dataManagement.reviewPanelUi.copy061')}{' '}</span>
                  <span className="text-2xs text-slate-400 font-mono">{t('dataManagement.reviewPanelUi.copy062')}{' '}{(currentParsed.partyConfidence * 100).toFixed(0)}%
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                  <div>
                    <label className="text-2xs font-semibold text-slate-600 block mb-1">{t('dataManagement.reviewPanelUi.copy063')}{' '}</label>
                    <input
                      type="text"
                      value={editEmployeeParty}
                      onChange={(e) => setEditEmployeeParty(e.target.value)}
                      placeholder={t('dataManagement.reviewPanelUi.copy064')}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="text-2xs font-semibold text-slate-600 block mb-1">{t('dataManagement.reviewPanelUi.copy065')}{' '}</label>
                    <input
                      type="text"
                      value={editEmployerParty}
                      onChange={(e) => setEditEmployerParty(e.target.value)}
                      placeholder={t('dataManagement.reviewPanelUi.copy066')}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* 3. 申请人视角裁判结果核验 (applicantOutcome) */}
              <div className="space-y-2 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                  <span className="flex items-center gap-1.5">
                    <Scale className="w-4 h-4 text-purple-600" />{t('dataManagement.reviewPanelUi.copy067')}{' '}</span>
                  <span className="text-2xs text-slate-400">{t('dataManagement.reviewPanelUi.copy068')}</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                  {[
                    { val: 'supported' as LegalOutcomeType, label: t('dataManagement.reviewPanelUi.supported'), color: 'border-emerald-300 text-emerald-900 bg-emerald-50/60' },
                    { val: 'partially_supported' as LegalOutcomeType, label: t('dataManagement.reviewPanelUi.partiallySupported'), color: 'border-amber-300 text-amber-900 bg-amber-50/60' },
                    { val: 'not_supported' as LegalOutcomeType, label: t('dataManagement.reviewPanelUi.notSupported'), color: 'border-rose-300 text-rose-900 bg-rose-50/60' },
                    { val: 'unclear' as LegalOutcomeType, label: t('dataManagement.reviewPanelUi.unclear'), color: 'border-slate-300 text-slate-800 bg-slate-100' },
                  ].map((item) => (
                    <button
                      key={item.val}
                      type="button"
                      onClick={() => setEditOverallResult(item.val)}
                      className={`p-2.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer text-center ${
                        editOverallResult === item.val
                          ? `${item.color} ring-2 ring-indigo-500 shadow-2xs font-bold`
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. 诉求列表与判定状态核验 (claims & supportStatus) */}
              <div className="space-y-2 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                  <span className="flex items-center gap-1.5">
                    <FileCheck className="w-4 h-4 text-emerald-600" />{t('dataManagement.reviewPanelUi.copy069')}{' '}</span>
                  <button
                    onClick={handleAddClaim}
                    className="text-2xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-200 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />{t('dataManagement.reviewPanelUi.copy070')}{' '}</button>
                </div>

                <div className="space-y-2 mt-2">
                  {editClaims.map((claim, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-white border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center gap-2 text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={claim.claimName}
                          onChange={(e) => handleClaimChange(idx, 'claimName', e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                          placeholder={t('dataManagement.reviewPanelUi.copy071')}
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        {/* 提出方 */}
                        <select
                          value={claim.claimant}
                          onChange={(e) => handleClaimChange(idx, 'claimant', e.target.value)}
                          className="px-2 py-1.5 text-2xs bg-slate-50 border border-slate-200 rounded-md text-slate-700"
                        >
                          <option value="employee">{t('dataManagement.reviewPanelUi.copy072')}</option>
                          <option value="employer">{t('dataManagement.reviewPanelUi.copy073')}</option>
                        </select>

                        {/* 支持状态选择 */}
                        <select
                          value={claim.supportStatus}
                          onChange={(e) => handleClaimChange(idx, 'supportStatus', e.target.value as ClaimSupportStatus)}
                          className={`px-2.5 py-1.5 text-2xs font-semibold rounded-md border ${
                            claim.supportStatus === 'supported'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : claim.supportStatus === 'partially_supported'
                              ? 'bg-amber-50 text-amber-800 border-amber-300'
                              : claim.supportStatus === 'not_supported'
                              ? 'bg-rose-50 text-rose-800 border-rose-300'
                              : 'bg-slate-100 text-slate-700 border-slate-300'
                          }`}
                        >
                          <option value="supported">{t('dataManagement.reviewPanelUi.copy074')}</option>
                          <option value="partially_supported">{t('dataManagement.reviewPanelUi.copy075')}</option>
                          <option value="not_supported">{t('dataManagement.reviewPanelUi.copy076')}</option>
                          <option value="unclear">{t('dataManagement.reviewPanelUi.copy077')}</option>
                        </select>

                        {/* 删除按钮 */}
                        <button
                          onClick={() => handleDeleteClaim(idx)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                          title={t('dataManagement.reviewPanelUi.copy078')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {editClaims.length === 0 && (
                    <div className="py-4 text-center text-xs text-slate-400 bg-white rounded-lg border border-dashed border-slate-200">{t('dataManagement.reviewPanelUi.copy079')}{' '}</div>
                  )}
                </div>
              </div>

              {/* 5. 企业抗辩核验 (employerDefenses) */}
              <div className="space-y-2 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                  <span className="flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-rose-600" />{t('dataManagement.reviewPanelUi.copy080')}{' '}</span>
                  <button
                    onClick={handleAddDefense}
                    className="text-2xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-200 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />{t('dataManagement.reviewPanelUi.copy081')}{' '}</button>
                </div>

                <div className="space-y-2 mt-2">
                  {editDefenses.map((def, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={def.defenseType}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditDefenses((prev) => {
                              const updated = [...prev];
                              updated[idx] = { ...updated[idx], defenseType: val };
                              return updated;
                            });
                          }}
                          className="w-full px-2 py-1 text-xs border border-slate-200 rounded-md font-semibold text-rose-900"
                        />
                        <div className="text-2xs text-slate-400 font-mono mt-1 truncate">{t('dataManagement.reviewPanelUi.copy082')}{def.matchedText}"
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteDefense(idx)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                        title={t('dataManagement.reviewPanelUi.copy083')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {editDefenses.length === 0 && (
                    <div className="py-3 text-center text-xs text-slate-400 bg-white rounded-lg border border-dashed border-slate-200">{t('dataManagement.reviewPanelUi.copy084')}{' '}</div>
                  )}
                </div>
              </div>

              {/* 6. 关键证据核验 (evidence) */}
              <div className="space-y-2 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-indigo-600" />{t('dataManagement.reviewPanelUi.copy085')}{' '}</span>
                  <button
                    onClick={handleAddEvidence}
                    className="text-2xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-200 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />{t('dataManagement.reviewPanelUi.copy086')}{' '}</button>
                </div>

                <div className="space-y-2 mt-2">
                  {editEvidence.map((evi, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={evi.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditEvidence((prev) => {
                              const updated = [...prev];
                              updated[idx] = { ...updated[idx], name: val };
                              return updated;
                            });
                          }}
                          className="w-full px-2 py-1 text-xs border border-slate-200 rounded-md font-semibold text-indigo-950"
                        />
                        <div className="text-2xs text-slate-400 font-mono mt-1 truncate">{t('dataManagement.reviewPanelUi.copy087')}{evi.matchedText}"
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteEvidence(idx)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                        title={t('dataManagement.reviewPanelUi.copy088')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {editEvidence.length === 0 && (
                    <div className="py-3 text-center text-xs text-slate-400 bg-white rounded-lg border border-dashed border-slate-200">{t('dataManagement.reviewPanelUi.copy089')}{' '}</div>
                  )}
                </div>
              </div>

              {/* 7. 审核员备注批注 (customNotes) */}
              <div className="space-y-2 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Edit3 className="w-3.5 h-3.5 text-indigo-600" />{t('dataManagement.reviewPanelUi.copy090')}{' '}</label>
                <textarea
                  value={editCustomNotes}
                  onChange={(e) => setEditCustomNotes(e.target.value)}
                  placeholder={t('dataManagement.reviewPanelUi.copy091')}
                  rows={2}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 leading-relaxed"
                />
              </div>
            </div>
          </div>
        </div>
      )}
      {showReparseConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="reparse-confirm-title">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-5 space-y-4">
            <div>
              <h2 id="reparse-confirm-title" className="text-base font-bold text-slate-900">{t('dataManagement.reviewPanelUi.copy006')}</h2>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">{t('dataManagement.reviewPanelUi.copy092')}{' '}</p>
              <p className="mt-2 text-xs text-indigo-700 leading-relaxed">{t('dataManagement.reviewPanelUi.copy093')}{' '}</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowReparseConfirm(false)}
                className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >{t('dataManagement.reviewPanelUi.copy094')}{' '}</button>
              <button
                type="button"
                onClick={handleReparseLocalCases}
                className="px-3 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
              >{t('dataManagement.reviewPanelUi.copy095')}{' '}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
