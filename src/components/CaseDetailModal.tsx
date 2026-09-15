import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  FileText,
  Scale,
  ShieldCheck,
  Calendar,
  Building2,
  Users,
  Award,
  BookOpen,
  Tag,
  AlertCircle,
  Code,
  Sparkles,
  Brain,
  Layers,
  ChevronRight,
  ShieldAlert,
  Search,
} from 'lucide-react';
import { ArbitrationCase, RawDocument, SimilarCaseResult } from '../types';
import { DataService } from '../services/data/dataService';
import { LocalAnalysisService } from '../services/textEngine/LocalAnalysisService';
import { db } from '../db';

interface CaseDetailModalProps {
  caseItem: ArbitrationCase | null;
  onClose: () => void;
  onReparse?: (id: string) => void;
}

export const CaseDetailModal: React.FC<CaseDetailModalProps> = ({
  caseItem,
  onClose,
  onReparse,
}) => {
  const [activeTab, setActiveTab] = useState<'structured' | 'profile'>('profile');
  const [currentCase, setCurrentCase] = useState<ArbitrationCase | null>(caseItem);
  const [rawDoc, setRawDoc] = useState<RawDocument | null>(null);
  const [allCases, setAllCases] = useState<ArbitrationCase[]>([]);

  useEffect(() => {
    setCurrentCase(caseItem);
  }, [caseItem]);

  useEffect(() => {
    // 载入全库以支持相似案件计算
    db.arbitrationCases.toArray().then((cases) => setAllCases(cases));
  }, []);

  useEffect(() => {
    if (currentCase?.rawDocumentId) {
      DataService.getRawDocumentById(currentCase.rawDocumentId)
        .then((doc) => setRawDoc(doc || null));
    }
  }, [currentCase]);

  // 生成本地案件画像 (纯规则引擎，不使用任何外部LLM)
  const caseProfile = useMemo(() => {
    if (!currentCase) return null;
    return LocalAnalysisService.generateCaseProfile(currentCase, rawDoc?.rawText);
  }, [currentCase, rawDoc]);

  // 计算相似案件 TOP 10
  const similarCases: SimilarCaseResult[] = useMemo(() => {
    if (!currentCase || allCases.length <= 1) return [];
    return LocalAnalysisService.findSimilarCases(currentCase, allCases, 10);
  }, [currentCase, allCases]);

  if (!currentCase) return null;

  const getOutcomeBadge = (outcome: string) => {
    switch (outcome) {
      case '用人单位胜诉':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            用人单位胜诉 (全驳回)
          </span>
        );
      case '用人单位败诉':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            用人单位败诉 (全额裁付)
          </span>
        );
      case '部分支持':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            部分支持裁决
          </span>
        );
      default:
        return (
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            {outcome}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-xs">
      <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-4 shrink-0">
          <div className="overflow-hidden">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-blue-700 font-mono">
                {currentCase.caseNumber}
              </span>
              {getOutcomeBadge(currentCase.decisionOutcome)}
              {currentCase.parseQuality && (
                <span className="text-2xs font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded">
                  解析质量: {currentCase.parseQuality.overall}/100分
                </span>
              )}
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate mt-1">
              {currentCase.title}
            </h2>
          </div>

          <button
            id="btn-close-detail-modal"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Tabs Bar */}
        <div className="px-6 border-b border-slate-200 bg-white flex items-center gap-6 shrink-0 text-xs font-medium">
          <button
            id="tab-btn-profile"
            onClick={() => setActiveTab('profile')}
            className={`py-3 flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'profile'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Brain className="w-4 h-4 text-blue-600" />
            本地文本画像与研判 (CaseProfile)
          </button>
          <button
            id="tab-btn-structured"
            onClick={() => setActiveTab('structured')}
            className={`py-3 flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'structured'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Scale className="w-4 h-4" />
            结构化法务要素
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: 本地文本画像与研判 */}
          {activeTab === 'profile' && caseProfile && (
            <div className="space-y-6 text-xs text-slate-800">
              {/* Disclaimer */}
              <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 flex items-center justify-between text-2xs text-amber-900">
                <div className="flex items-center gap-1.5 font-medium">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>本地文本分析结果仅用于案例研究和统计，不构成法律意见。</span>
                </div>
                <span className="bg-white/80 border border-amber-300/80 px-2 py-0.5 rounded font-mono font-bold text-amber-800">
                  纯本地规则引擎
                </span>
              </div>

              {/* 1. 章节结构完备性 */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="font-bold text-slate-900 flex items-center gap-1.5 mb-2.5">
                  <Layers className="w-4 h-4 text-blue-600" />
                  文书章节结构识别
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-2xs">
                  <div
                    className={`p-2 rounded-lg border text-center font-medium ${
                      caseProfile.sectionsFound?.hasApplicantArguments
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-slate-100 border-slate-200 text-slate-400'
                    }`}
                  >
                    申请人诉求/主张
                  </div>
                  <div
                    className={`p-2 rounded-lg border text-center font-medium ${
                      caseProfile.sectionsFound?.hasRespondentArguments
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-slate-100 border-slate-200 text-slate-400'
                    }`}
                  >
                    被申请人答辩
                  </div>
                  <div
                    className={`p-2 rounded-lg border text-center font-medium ${
                      caseProfile.sectionsFound?.hasFacts
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-slate-100 border-slate-200 text-slate-400'
                    }`}
                  >
                    查明事实
                  </div>
                  <div
                    className={`p-2 rounded-lg border text-center font-medium ${
                      caseProfile.sectionsFound?.hasReasoning
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-slate-100 border-slate-200 text-slate-400'
                    }`}
                  >
                    裁决理由/说理
                  </div>
                  <div
                    className={`p-2 rounded-lg border text-center font-medium ${
                      caseProfile.sectionsFound?.hasDecision
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-slate-100 border-slate-200 text-slate-400'
                    }`}
                  >
                    裁决主文
                  </div>
                </div>
              </div>

              {/* 2. 企业抗辩识别 */}
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Scale className="w-4 h-4 text-blue-600" />
                  企业抗辩策略识别
                  <span className="text-2xs font-mono font-normal text-slate-400">
                    ({caseProfile.employerDefenses.length} 项)
                  </span>
                </h3>
                {caseProfile.employerDefenses.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {caseProfile.employerDefenses.map((def, idx) => (
                      <div
                        key={idx}
                        className="bg-blue-50/50 border border-blue-200 rounded-xl p-3.5 space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-blue-900 text-xs">
                            {def.defenseType}
                          </span>
                          <span className="text-2xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono">
                            置信度: {(def.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                        <p className="text-2xs text-slate-600 leading-relaxed italic bg-white/70 p-2 rounded border border-blue-100">
                          "...{def.matchedText}..."
                        </p>
                        {def.sourceSection && (
                          <div className="text-2xs text-slate-400">
                            来源区域: {def.sourceSection}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-slate-50 p-4 rounded-xl text-slate-400 text-center">
                    文书中未载明明确的企业抗辩策略
                  </div>
                )}
              </div>

              {/* 3. 证据链条识别 */}
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  采信证据类型识别
                  <span className="text-2xs font-mono font-normal text-slate-400">
                    ({caseProfile.evidence.length} 项)
                  </span>
                </h3>
                {caseProfile.evidence.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {caseProfile.evidence.map((ev, idx) => (
                      <div
                        key={idx}
                        className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-2"
                      >
                        <span className="font-bold">{ev.name}</span>
                        {ev.provider && (
                          <span className="text-2xs bg-emerald-200/60 text-emerald-800 px-1.5 py-0.2 rounded font-medium">
                            {ev.provider}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-slate-50 p-4 rounded-xl text-slate-400 text-center">
                    未单独载明证据清单
                  </div>
                )}
              </div>

              {/* 4. 裁决说理与败诉归因 */}
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600" />
                  裁判说理重点与败诉归因
                  <span className="text-2xs font-mono font-normal text-slate-400">
                    ({caseProfile.lossReasons.length} 项)
                  </span>
                </h3>
                {caseProfile.lossReasons.length > 0 ? (
                  <div className="space-y-2">
                    {caseProfile.lossReasons.map((lr, idx) => (
                      <div
                        key={idx}
                        className="bg-rose-50/50 border border-rose-200 rounded-xl p-3.5 space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-rose-900 text-xs">
                            归因特征：{lr.reason}
                          </span>
                          <span className="text-2xs bg-rose-100 text-rose-800 px-2 py-0.5 rounded font-mono">
                            匹配置信度: {(lr.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                        <p className="text-2xs text-slate-700 italic bg-white/80 p-2 rounded border border-rose-100">
                          "...{lr.reasoningSnippet || lr.matchedText}..."
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-slate-50 p-4 rounded-xl text-slate-400 text-center">
                    未检出典型败诉归因特征（或用人单位全案胜诉）
                  </div>
                )}
              </div>

              {/* 5. 相似案例推荐 (TOP 10) */}
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    本地相似案件智能推荐 (TOP 10)
                  </h3>
                  <span className="text-2xs text-slate-400 font-mono">
                    算法: TF-IDF Cosine Similarity + 争议/抗辩/证据多维加权
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {similarCases.map((sim) => (
                    <div
                      key={sim.caseItem.id}
                      onClick={() => setCurrentCase(sim.caseItem)}
                      className="border border-slate-200 rounded-xl p-3.5 hover:border-purple-400 hover:bg-purple-50/20 transition-all cursor-pointer flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-mono font-bold text-xs text-blue-700">
                            {sim.caseItem.caseNumber}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-2xs font-mono font-bold bg-purple-100 text-purple-800 px-2 py-0.5 rounded">
                              相似度 {sim.similarity}%
                            </span>
                            <span
                              className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${
                                sim.outcome === '用人单位胜诉'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {sim.outcome}
                            </span>
                          </div>
                        </div>

                        <div className="text-xs font-semibold text-slate-800 truncate mb-1.5">
                          {sim.caseItem.title}
                        </div>

                        <div className="flex flex-wrap gap-1 text-2xs">
                          {sim.commonDisputes.map((d) => (
                            <span
                              key={d}
                              className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium"
                            >
                              #{d}
                            </span>
                          ))}
                          {sim.commonDefenses.map((def) => (
                            <span
                              key={def}
                              className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-medium"
                            >
                              抗辩:{def}
                            </span>
                          ))}
                          {sim.commonEvidence.map((ev) => (
                            <span
                              key={ev}
                              className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-medium"
                            >
                              证据:{ev}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-2xs text-blue-600 font-semibold">
                        <span>点击切换并对比此案件</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: 结构化法务要素 */}
          {activeTab === 'structured' && (
            <div className="space-y-6 text-xs text-slate-800">
              {/* Meta Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-2xs text-slate-500 flex items-center gap-1">
                    <Building2 className="w-3 h-3 text-slate-400" /> 仲裁委员会
                  </span>
                  <div className="font-semibold text-slate-900 mt-1 truncate">
                    {currentCase.arbitrationCommittee}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-2xs text-slate-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-400" /> 裁决年份与日期
                  </span>
                  <div className="font-semibold text-slate-900 mt-1 font-mono">
                    {currentCase.publishedDate || `${currentCase.year}年`}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-2xs text-slate-500 flex items-center gap-1">
                    <Users className="w-3 h-3 text-slate-400" /> 申请人 vs 被申请人
                  </span>
                  <div className="font-semibold text-slate-900 mt-1 truncate">
                    {currentCase.applicant} vs {currentCase.respondent}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-2xs text-slate-500 flex items-center gap-1">
                    <Award className="w-3 h-3 text-slate-400" /> 裁决金额
                  </span>
                  <div className="font-bold text-slate-900 mt-1 font-mono text-sm">
                    {currentCase.compensationAmount
                      ? `¥${currentCase.compensationAmount.toLocaleString()} 元`
                      : '无 / 驳回'}
                  </div>
                </div>
              </div>

              {/* Claims */}
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-blue-600 rounded-full inline-block" />
                  仲裁请求
                </h3>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5">
                  {currentCase.claims.map((claim, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-slate-800 leading-relaxed">
                      <span className="text-blue-600 font-bold font-mono shrink-0">
                        {idx + 1}.
                      </span>
                      <span>{claim}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Facts */}
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-emerald-600 rounded-full inline-block" />
                  经审理查明事实
                </h3>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-slate-700 leading-relaxed whitespace-pre-wrap font-sans">
                  {currentCase.facts}
                </div>
              </div>

              {/* Reasoning */}
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-purple-600 rounded-full inline-block" />
                  仲裁庭认定与说理
                </h3>
                <div className="bg-purple-50/40 p-4 rounded-xl border border-purple-200/60 text-slate-800 leading-relaxed whitespace-pre-wrap">
                  {currentCase.tribunalReasoning}
                </div>
              </div>

              {/* Decision */}
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-amber-600 rounded-full inline-block" />
                  裁决结果主文
                </h3>
                <div className="bg-slate-900 text-slate-100 p-4 rounded-xl font-mono leading-relaxed whitespace-pre-wrap">
                  {currentCase.decision}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0 text-xs">
          <span className="text-slate-400 font-mono">ID: {currentCase.id}</span>
          <button
            id="btn-close-modal-bottom"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors cursor-pointer"
          >
            关闭窗口
          </button>
        </div>
      </div>
    </div>
  );
};
