import React, { useState, useEffect, useMemo } from 'react';
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
    setSaveSuccessMsg('已还原为 Parser 初始提取值');
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
    setSaveSuccessMsg(`已成功保存人工校验记录 (状态: ${status === 'approved' ? '已核准通过' : '已修正保存'})`);
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
    if (!text) return <span className="text-slate-400">无文书正文</span>;
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
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                数据质量监控与人工审核
                <span className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                  数据质量
                </span>
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                双栏比对审查：左侧原始裁判文书与右侧解析结果对照校验，支持字段提取评分、一致性冲突检测与人工修正
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            <button
              onClick={loadData}
              disabled={isLoading || isReparsing}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              重新评估全部案例
            </button>
            <button
              id="btn-reparse-local-cases"
              onClick={() => setShowReparseConfirm(true)}
              disabled={isLoading || isReparsing}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isReparsing ? 'animate-spin' : ''}`} />
              重新解析本地案例
            </button>
          </div>
        </div>

        {/* 隔离保护提示 */}
        <div className="mt-4 p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl flex items-start gap-2.5 text-xs text-indigo-950 leading-relaxed">
          <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">零污染与数据安全原则：</span>
            本模块用于<strong>评估解析准确度与录入人工校验反馈</strong>。人工修改保存在独立的质检结构中，<strong>绝不覆盖原始文书</strong>，且<strong>不干扰后续多维统计与研判</strong>。
            <div className="mt-1 text-indigo-800">重新解析本地案例只读取 IndexedDB 中已保存的 RawDocument，不会联网、不会重新下载文书，也不会调用 AI。</div>
          </div>
        </div>

        {isReparsing && (
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900" role="status">
            正在重新解析 {reparseProgress.current} / {reparseProgress.total || '…'}
          </div>
        )}
        {reparseSummary && (
          <div className={`mt-3 p-3 rounded-xl border text-xs ${reparseSummary.failed > 0 ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`} role="status">
            重新解析完成：成功 {reparseSummary.succeeded}，失败 {reparseSummary.failed}（共 {reparseSummary.total}）
            {reparseSummary.failures.length > 0 && (
              <div className="mt-1 text-2xs">处理失败的案例已跳过并记录，不会中止其他案例。</div>
            )}
          </div>
        )}
        {reparseError && (
          <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900" role="alert">
            重新解析失败：{reparseError}
          </div>
        )}
      </div>

      {/* 批量概览指标看板 (基于前 10 份默认测试数据) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {/* 1. 平均完整率 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-2xs text-slate-500 font-semibold uppercase flex items-center gap-1">
            <FileCheck className="w-3.5 h-3.5 text-emerald-500" />
            平均字段完整率
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600 mt-1">
            {batchSummary.avgCompletenessScore}%
          </div>
          <div className="text-2xs text-slate-500 mt-0.5">
            基础/主体/争议/诉求/抗辩
          </div>
        </div>

        {/* 2. 冲突数量 (Conflict) */}
        <div className={`border rounded-2xl p-4 shadow-sm ${
          batchSummary.totalConflicts > 0 ? 'bg-rose-50/80 border-rose-200' : 'bg-white border-slate-200'
        }`}>
          <div className="text-2xs text-slate-500 font-semibold uppercase flex items-center gap-1">
            <AlertCircle className={`w-3.5 h-3.5 ${batchSummary.totalConflicts > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
            规则冲突数量 (Conflict)
          </div>
          <div className={`text-2xl font-bold font-mono mt-1 ${
            batchSummary.totalConflicts > 0 ? 'text-rose-600' : 'text-slate-700'
          }`}>
            {batchSummary.totalConflicts} <span className="text-xs font-normal text-slate-400">处矛盾</span>
          </div>
          <div className="text-2xs text-slate-500 mt-0.5">裁决结果 vs 诉求支持状态</div>
        </div>

        {/* 3. 字段缺失 (Missing) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-2xs text-slate-500 font-semibold uppercase flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            字段缺失/未决 (Missing)
          </div>
          <div className="text-2xl font-bold font-mono text-amber-600 mt-1">
            {batchSummary.totalMissing} <span className="text-xs font-normal text-slate-400">项待定</span>
          </div>
          <div className="text-2xs text-slate-500 mt-0.5">诉求未明确或主体缺失</div>
        </div>

        {/* 4. 疑似误报 (False Positive) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-2xs text-slate-500 font-semibold uppercase flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5 text-purple-500" />
            疑似抗辩误报
          </div>
          <div className="text-2xl font-bold font-mono text-purple-600 mt-1">
            {batchSummary.totalFalsePositives} <span className="text-xs font-normal text-slate-400">项提示</span>
          </div>
          <div className="text-2xs text-slate-500 mt-0.5">说理中未见抗辩关键词</div>
        </div>

        {/* 5. 人工校验进度 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-2xs text-slate-500 font-semibold uppercase flex items-center gap-1">
            <UserCheck className="w-3.5 h-3.5 text-blue-500" />
            人工核验进度
          </div>
          <div className="text-2xl font-bold font-mono text-blue-600 mt-1">
            {reviewProgress.reviewedCount} / {reviewProgress.total}
          </div>
          <div className="text-2xs text-slate-500 mt-0.5">已完成 {reviewProgress.percentage}% 审查</div>
        </div>
      </div>

      {/* 案例快速选择横向条 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-2 font-semibold">
            <Database className="w-4 h-4 text-indigo-600" />
            <span>选择待审核工劳网文书 (共 {rawDocs.length} 份)</span>
          </div>
          <span className="text-2xs text-slate-400">点击卡片切换当前比对案件</span>
        </div>

        {isLoading ? (
          <div className="py-4 text-center text-xs text-slate-400">正在加载并评估案例...</div>
        ) : rawDocs.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-500">
            暂无已入库案例，请先在「工劳网API测试」页导入案例。
          </div>
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
                        <span className="px-1.5 py-0.5 rounded text-2xs bg-rose-500 text-white font-bold">
                          冲突
                        </span>
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
                    <span>{doc.sourceId ? `ID:${doc.sourceId}` : '工劳文书'}</span>
                    <span>
                      {reviewRec?.reviewStatus === 'approved' ? '✅ 已核准' : reviewRec?.reviewStatus === 'modified' ? '✏️ 已修改' : '⏳ 待审核'}
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
                  <h2 className="text-sm font-bold text-slate-900">原始裁判文书全文 (只读)</h2>
                </div>
                <span className="text-2xs font-mono px-2 py-0.5 bg-slate-200 text-slate-700 rounded-md">
                  {currentDoc.rawText?.length.toLocaleString()} 字
                </span>
              </div>

              {/* 搜索高亮框 */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder="文书正文关键词搜索 (例如: 旷工、解除、赔偿金、判决如下)..."
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
                <span className="text-slate-400">快速定位词:</span>
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
                <div><strong>案例文书：</strong>{currentDoc.title}</div>
                <div><strong>文书标识：</strong>{currentDoc.id} (SourceID: {currentDoc.sourceId || '-'})</div>
                {currentDoc.sourceUrl && (
                  <div className="truncate">
                    <strong>源链接：</strong>
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
                  <span className="text-xs font-bold text-slate-800">评估得分:</span>
                  <span className={`px-2 py-0.5 rounded-md font-mono text-xs font-bold ${
                    currentEvaluation.completenessScore >= 80
                      ? 'bg-emerald-100 text-emerald-800'
                      : currentEvaluation.completenessScore >= 60
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}>
                    {currentEvaluation.completenessScore} 分
                  </span>
                  <span className="text-2xs text-slate-400">
                    ({currentEvaluation.grade === 'excellent' ? '极佳' : currentEvaluation.grade === 'good' ? '良好' : currentEvaluation.grade === 'fair' ? '及格' : '待优化'})
                  </span>
                </div>

                <div className="h-4 w-px bg-slate-200" />

                {/* 审核状态标志 */}
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-slate-500">当前状态:</span>
                  <span className={`px-2 py-0.5 rounded-full text-2xs font-semibold ${
                    editReviewStatus === 'approved'
                      ? 'bg-emerald-100 text-emerald-800'
                      : editReviewStatus === 'modified'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {editReviewStatus === 'approved' ? '已核准' : editReviewStatus === 'modified' ? '已修改' : '待核验'}
                  </span>
                </div>
              </div>

              {/* 操作按钮区 */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleResetToParserDefault}
                  title="还原为自动提取的初始值"
                  className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  还原
                </button>

                <button
                  onClick={() => handleSaveReview('approved')}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  核准无误 (Approved)
                </button>

                <button
                  onClick={() => handleSaveReview('modified')}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  保存修改 (Save)
                </button>
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
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      规则一致性检测 ({currentEvaluation.consistency.issues.length} 处待审)
                    </span>
                    <span className="text-2xs font-mono font-normal text-amber-800">
                      冲突:{currentEvaluation.consistency.conflictCount} / 缺失:{currentEvaluation.consistency.missingCount} / 疑似误报:{currentEvaluation.consistency.falsePositiveCount}
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
                          {issue.type === 'conflict' ? '冲突 (Conflict)' : issue.type === 'missing' ? '缺失 (Missing)' : '疑似误报'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold">{issue.title}</div>
                          <div className="text-2xs opacity-90 mt-0.5">{issue.message}</div>
                          {issue.suggestion && (
                            <div className="text-2xs mt-1 font-semibold text-indigo-700 bg-white/70 p-1 rounded">
                              💡 修复建议: {issue.suggestion}
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
                    <UserCheck className="w-4 h-4 text-blue-600" />
                    一、当事人识别校验 (Parties)
                  </span>
                  <span className="text-2xs text-slate-400 font-mono">
                    提取置信度: {(currentParsed.partyConfidence * 100).toFixed(0)}%
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                  <div>
                    <label className="text-2xs font-semibold text-slate-600 block mb-1">
                      劳动者方姓名 (employeeParty)
                    </label>
                    <input
                      type="text"
                      value={editEmployeeParty}
                      onChange={(e) => setEditEmployeeParty(e.target.value)}
                      placeholder="录入劳动者姓名，如: 张三"
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="text-2xs font-semibold text-slate-600 block mb-1">
                      用人单位名称 (employerParty)
                    </label>
                    <input
                      type="text"
                      value={editEmployerParty}
                      onChange={(e) => setEditEmployerParty(e.target.value)}
                      placeholder="录入用人单位全称，如: 某某科技有限公司"
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* 3. 申请人视角裁判结果核验 (applicantOutcome) */}
              <div className="space-y-2 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                  <span className="flex items-center gap-1.5">
                    <Scale className="w-4 h-4 text-purple-600" />
                    二、申请人请求结果校验 (Applicant Outcome)
                  </span>
                  <span className="text-2xs text-slate-400">以申请人身份为视角，必须对照主文</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                  {[
                    { val: 'supported' as LegalOutcomeType, label: '获得支持', color: 'border-emerald-300 text-emerald-900 bg-emerald-50/60' },
                    { val: 'partially_supported' as LegalOutcomeType, label: '部分支持', color: 'border-amber-300 text-amber-900 bg-amber-50/60' },
                    { val: 'not_supported' as LegalOutcomeType, label: '未获支持', color: 'border-rose-300 text-rose-900 bg-rose-50/60' },
                    { val: 'unclear' as LegalOutcomeType, label: '结果不明确', color: 'border-slate-300 text-slate-800 bg-slate-100' },
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
                    <FileCheck className="w-4 h-4 text-emerald-600" />
                    三、诉求清单与判定核验 (claims & supportStatus)
                  </span>
                  <button
                    onClick={handleAddClaim}
                    className="text-2xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-200 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    添加诉求
                  </button>
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
                          placeholder="诉求名称..."
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        {/* 提出方 */}
                        <select
                          value={claim.claimant}
                          onChange={(e) => handleClaimChange(idx, 'claimant', e.target.value)}
                          className="px-2 py-1.5 text-2xs bg-slate-50 border border-slate-200 rounded-md text-slate-700"
                        >
                          <option value="employee">劳动者提出</option>
                          <option value="employer">用人单位提出</option>
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
                          <option value="supported">✅ 获得支持</option>
                          <option value="partially_supported">⚖️ 部分支持</option>
                          <option value="not_supported">❌ 未获支持</option>
                          <option value="unclear">❓ 结果不明确</option>
                        </select>

                        {/* 删除按钮 */}
                        <button
                          onClick={() => handleDeleteClaim(idx)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                          title="删除该诉求项"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {editClaims.length === 0 && (
                    <div className="py-4 text-center text-xs text-slate-400 bg-white rounded-lg border border-dashed border-slate-200">
                      暂无诉求条目，请点击上方「添加诉求」补充
                    </div>
                  )}
                </div>
              </div>

              {/* 5. 企业抗辩核验 (employerDefenses) */}
              <div className="space-y-2 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                  <span className="flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                    四、企业抗辩事由核验 (employerDefenses)
                  </span>
                  <button
                    onClick={handleAddDefense}
                    className="text-2xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-200 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    添加抗辩
                  </button>
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
                        <div className="text-2xs text-slate-400 font-mono mt-1 truncate">
                          原文依据: "{def.matchedText}"
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteDefense(idx)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                        title="删除抗辩项"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {editDefenses.length === 0 && (
                    <div className="py-3 text-center text-xs text-slate-400 bg-white rounded-lg border border-dashed border-slate-200">
                      本案无企业抗辩事由
                    </div>
                  )}
                </div>
              </div>

              {/* 6. 关键证据核验 (evidence) */}
              <div className="space-y-2 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    五、关键证据清单核验 (evidence)
                  </span>
                  <button
                    onClick={handleAddEvidence}
                    className="text-2xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-200 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    添加证据
                  </button>
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
                        <div className="text-2xs text-slate-400 font-mono mt-1 truncate">
                          依据片段: "{evi.matchedText}"
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteEvidence(idx)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                        title="删除证据项"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {editEvidence.length === 0 && (
                    <div className="py-3 text-center text-xs text-slate-400 bg-white rounded-lg border border-dashed border-slate-200">
                      暂无提取到的证据条目
                    </div>
                  )}
                </div>
              </div>

              {/* 7. 审核员备注批注 (customNotes) */}
              <div className="space-y-2 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                  六、质检审核员备注 (customNotes)
                </label>
                <textarea
                  value={editCustomNotes}
                  onChange={(e) => setEditCustomNotes(e.target.value)}
                  placeholder="可记录该案例的疑难特征、特殊裁判逻辑或后续改进建议..."
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
              <h2 id="reparse-confirm-title" className="text-base font-bold text-slate-900">重新解析本地案例</h2>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                将使用当前版本解析器重新生成本地结构化案例。不会重新下载原始文书，已有原始文书不会被修改。
              </p>
              <p className="mt-2 text-xs text-indigo-700 leading-relaxed">
                仅读取 IndexedDB RawDocument；不会调用远程 API、不会发起网络请求、不会调用 LLM。已有人工复核记录和冻结 AnalysisRun 不会被改写。
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowReparseConfirm(false)}
                className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleReparseLocalCases}
                className="px-3 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
              >
                开始重新解析
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
