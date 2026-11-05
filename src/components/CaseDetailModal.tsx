import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { JudgmentTranslationReader } from './JudgmentTranslationReader';
import {
  X,
  FileText,
  ShieldCheck,
  Calendar,
  Building2,
  Users,
  Award,
  BookOpen,
  Tag,
  AlertCircle,
  Code,
  Layers,
  ChevronRight,
  ShieldAlert,
  Search,
} from 'lucide-react';
import { ArbitrationCase, RawDocument, SimilarCaseResult } from '../types';
import { DataService } from '../services/data/dataService';
import { LocalAnalysisService } from '../services/textEngine/LocalAnalysisService';
import { formatCaseDate, formatCaseNumber } from '../services/presentation/CaseMetadataPresentation';
import { getCaseLevelLabel, getDecisionOutcomeLabel, getDefenseTypeLabel, getDisputeTypeLabel, getEvidenceTypeLabel } from '../services/presentation/domainLabels';
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
  const { t } = useTranslation();
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
            {' '}{t('finalUi.caseDetail.copy001')}{' '}</span>
        );
      case '用人单位败诉':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            {' '}{t('finalUi.caseDetail.copy002')}{' '}</span>
        );
      case '部分支持':
        return (
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            {' '}{t('finalUi.caseDetail.copy003')}{' '}</span>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-xs" data-testid="case-detail-modal">
      <div className="bg-white rounded-[28px] w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-200 bg-white/95 flex items-center justify-between gap-4 shrink-0">
          <div className="overflow-hidden">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-blue-700 font-mono">
                {formatCaseNumber(currentCase.caseNumber)}
              </span>
              {getOutcomeBadge(currentCase.decisionOutcome)}
              {currentCase.parseQuality && (
                <span className="text-2xs font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded">
                  {' '}{t('finalUi.caseDetail.copy004')}{' '}{currentCase.parseQuality.overall}{' '}{t('finalUi.caseDetail.copy005')}{' '}</span>
              )}
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate mt-1">
              {currentCase.title}
            </h2>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-slate-500">
              <span>{currentCase.arbitrationCommittee || t('finalUi.caseDetailFallback.institutionUnknown')}</span>
              <span>{formatCaseDate(currentCase.publishedDate)}</span>
              <span>{currentCase.caseLevel ? getCaseLevelLabel(currentCase.caseLevel, t) : t('finalUi.caseDetailFallback.levelUnknown')}</span>
            </div>
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
            {' '}{t('finalUi.caseDetail.copy006')}{' '}</button>
          <button
            id="tab-btn-structured"
            onClick={() => setActiveTab('structured')}
            className={`py-3 flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'structured'
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {' '}{t('finalUi.caseDetail.copy007')}{' '}</button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-6 lg:p-7 overflow-y-auto flex-1 space-y-6 bg-slate-50/40">
          {/* TAB 1: 本地文本画像与研判 */}
          {activeTab === 'profile' && caseProfile && (
            <div className="space-y-6 text-xs text-slate-800">
              {/* Disclaimer */}
              <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 flex items-center justify-between text-2xs text-amber-900">
                <div className="flex items-center gap-1.5 font-medium">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>{' '}{t('finalUi.caseDetail.copy008')}{' '}</span>
                </div>
                <span className="bg-white/80 border border-amber-300/80 px-2 py-0.5 rounded font-mono font-bold text-amber-800">
                  {' '}{t('finalUi.caseDetail.copy009')}{' '}</span>
              </div>

              {/* 1. 章节结构完备性 */}
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <div className="font-bold text-slate-900 flex items-center gap-1.5 mb-2.5">
                  <Layers className="w-4 h-4 text-blue-600" />
                  {' '}{t('finalUi.caseDetail.copy010')}{' '}</div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-2xs">
                  <div
                    className={`p-2 rounded-lg border text-center font-medium ${
                      caseProfile.sectionsFound?.hasApplicantArguments
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-slate-100 border-slate-200 text-slate-400'
                    }`}
                  >
                    {' '}{t('finalUi.caseDetail.copy011')}{' '}</div>
                  <div
                    className={`p-2 rounded-lg border text-center font-medium ${
                      caseProfile.sectionsFound?.hasRespondentArguments
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-slate-100 border-slate-200 text-slate-400'
                    }`}
                  >
                    {' '}{t('finalUi.caseDetail.copy012')}{' '}</div>
                  <div
                    className={`p-2 rounded-lg border text-center font-medium ${
                      caseProfile.sectionsFound?.hasFacts
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-slate-100 border-slate-200 text-slate-400'
                    }`}
                  >
                    {' '}{t('finalUi.caseDetail.copy013')}{' '}</div>
                  <div
                    className={`p-2 rounded-lg border text-center font-medium ${
                      caseProfile.sectionsFound?.hasReasoning
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-slate-100 border-slate-200 text-slate-400'
                    }`}
                  >
                    {' '}{t('finalUi.caseDetail.copy014')}{' '}</div>
                  <div
                    className={`p-2 rounded-lg border text-center font-medium ${
                      caseProfile.sectionsFound?.hasDecision
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-slate-100 border-slate-200 text-slate-400'
                    }`}
                  >
                    {' '}{t('finalUi.caseDetail.copy015')}{' '}</div>
                </div>
              </div>

              {/* 2. 企业抗辩识别 */}
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  {' '}{t('finalUi.caseDetail.copy016')}{' '}<span className="text-2xs font-mono font-normal text-slate-400">
                    ({caseProfile.employerDefenses.length} {' '}{t('finalUi.caseDetail.copy017')}{' '}</span>
                </h3>
                {caseProfile.employerDefenses.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {caseProfile.employerDefenses.map((def, idx) => (
                      <div
                        key={idx}
                        className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-blue-900 text-xs">
                            {getDefenseTypeLabel(def.defenseType, t)}
                          </span>
                          <span className="text-2xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">
                            {' '}{t('finalUi.caseDetail.copy018')}{' '}{(def.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                        <p className="text-2xs text-slate-600 leading-relaxed italic bg-white/70 p-2 rounded border border-blue-100">
                          "...{def.matchedText}..."
                        </p>
                        {def.sourceSection && (
                          <div className="text-2xs text-slate-400">
                            {' '}{t('finalUi.caseDetail.copy019')}{' '}{def.sourceSection}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-slate-50 p-4 rounded-xl text-slate-400 text-center">
                    {' '}{t('finalUi.caseDetail.copy020')}{' '}</div>
                )}
              </div>

              {/* 3. 证据链条识别 */}
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  {' '}{t('finalUi.caseDetail.copy021')}{' '}<span className="text-2xs font-mono font-normal text-slate-400">
                    ({caseProfile.evidence.length} {' '}{t('finalUi.caseDetail.copy017')}{' '}</span>
                </h3>
                {caseProfile.evidence.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {caseProfile.evidence.map((ev, idx) => (
                      <div
                        key={idx}
                        className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-2"
                      >
                        <span className="font-bold">{getEvidenceTypeLabel(ev.name, t)}</span>
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
                    {' '}{t('finalUi.caseDetail.copy022')}{' '}</div>
                )}
              </div>

              {/* 4. 裁决说理与败诉归因 */}
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600" />
                  {' '}{t('finalUi.caseDetail.copy023')}{' '}<span className="text-2xs font-mono font-normal text-slate-400">
                    ({caseProfile.lossReasons.length} {' '}{t('finalUi.caseDetail.copy017')}{' '}</span>
                </h3>
                {caseProfile.lossReasons.length > 0 ? (
                  <div className="space-y-2">
                    {caseProfile.lossReasons.map((lr, idx) => (
                      <div
                        key={idx}
                        className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-rose-900 text-xs">
                            {' '}{t('finalUi.caseDetail.copy024')}{' '}{lr.reason}
                          </span>
                          <span className="text-2xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">
                            {' '}{t('finalUi.caseDetail.copy025')}{' '}{(lr.confidence * 100).toFixed(0)}%
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
                    {' '}{t('finalUi.caseDetail.copy026')}{' '}</div>
                )}
              </div>

              {/* 5. 相似案例推荐 (TOP 10) */}
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    {' '}{t('finalUi.caseDetail.copy027')}{' '}</h3>
                  <span className="text-2xs text-slate-400 font-mono">
                    {' '}{t('finalUi.caseDetail.copy028')}{' '}</span>
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
                              {' '}{t('finalUi.caseDetail.copy029')}{' '}{sim.similarity}%
                            </span>
                            <span
                              className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${
                                sim.outcome === '用人单位胜诉'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {getDecisionOutcomeLabel(sim.outcome, t)}
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
                              #{getDisputeTypeLabel(d, t)}
                            </span>
                          ))}
                          {sim.commonDefenses.map((def) => (
                            <span
                              key={def}
                              className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-medium"
                            >
                              {' '}{t('finalUi.caseDetail.copy030')}{' '}{getDefenseTypeLabel(def, t)}
                            </span>
                          ))}
                          {sim.commonEvidence.map((ev) => (
                            <span
                              key={ev}
                              className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-medium"
                            >
                              {' '}{t('finalUi.caseDetail.copy031')}{' '}{getEvidenceTypeLabel(ev, t)}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-2xs text-blue-600 font-semibold">
                        <span>{' '}{t('finalUi.caseDetail.copy032')}{' '}</span>
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
                <div className="p-3 bg-white rounded-lg border border-slate-200">
                  <span className="text-2xs text-slate-500 flex items-center gap-1">
                    <Building2 className="w-3 h-3 text-slate-400" /> {' '}{t('finalUi.caseDetail.copy033')}{' '}</span>
                  <div className="font-semibold text-slate-900 mt-1 truncate">
                    {currentCase.arbitrationCommittee}
                  </div>
                </div>

                <div className="p-3 bg-white rounded-lg border border-slate-200">
                  <span className="text-2xs text-slate-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-400" /> {' '}{t('finalUi.caseDetail.copy034')}{' '}</span>
                  <div className="font-semibold text-slate-900 mt-1 font-mono">
                    {formatCaseDate(currentCase.publishedDate)}
                  </div>
                </div>

                <div className="p-3 bg-white rounded-lg border border-slate-200">
                  <span className="text-2xs text-slate-500 flex items-center gap-1">
                    <Users className="w-3 h-3 text-slate-400" /> {' '}{t('finalUi.caseDetail.copy035')}{' '}</span>
                  <div className="font-semibold text-slate-900 mt-1 truncate">
                    {currentCase.applicant} vs {currentCase.respondent}
                  </div>
                </div>

                <div className="p-3 bg-white rounded-lg border border-slate-200">
                  <span className="text-2xs text-slate-500 flex items-center gap-1">
                    <Award className="w-3 h-3 text-slate-400" /> {' '}{t('finalUi.caseDetail.copy036')}{' '}</span>
                  <div className="font-bold text-slate-900 mt-1 font-mono text-sm">
                    {currentCase.compensationAmount
                      ? t('finalUi.caseDetailFallback.amount', { amount: currentCase.compensationAmount.toLocaleString() })
                      : t('finalUi.caseDetailFallback.noneOrRejected')}
                  </div>
                </div>
              </div>

              {/* Claims */}
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-blue-600 rounded-full inline-block" />
                  {' '}{t('finalUi.caseDetail.copy037')}{' '}</h3>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1.5">
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
                  {' '}{t('finalUi.caseDetail.copy038')}{' '}</h3>
                <div className="bg-white p-4 rounded-xl border border-slate-200 text-slate-700 leading-7 whitespace-pre-wrap font-sans">
                  {currentCase.facts}
                </div>
              </div>

              {/* Reasoning */}
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-purple-600 rounded-full inline-block" />
                  {' '}{t('finalUi.caseDetail.copy039')}{' '}</h3>
                <div className="bg-white p-4 rounded-xl border border-slate-200 text-slate-800 leading-7 whitespace-pre-wrap">
                  {currentCase.tribunalReasoning}
                </div>
              </div>

              {/* Decision */}
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-amber-600 rounded-full inline-block" />
                  {' '}{t('finalUi.caseDetail.copy040')}{' '}</h3>
                <div className="bg-white border border-slate-200 text-slate-800 p-4 rounded-xl leading-7 whitespace-pre-wrap">
                  {currentCase.decision}
                </div>
              </div>
            </div>
          )}

          {currentCase.rawDocumentId && <div key={currentCase.rawDocumentId}><JudgmentTranslationReader rawDocumentId={currentCase.rawDocumentId} /></div>}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-white flex items-center justify-between shrink-0 text-xs">
          <details className="text-2xs text-slate-400">
            <summary className="cursor-pointer">{' '}{t('finalUi.caseDetail.copy041')}{' '}</summary>
            <span className="mt-1 block font-mono">{' '}{t('finalUi.caseDetail.copy042')}{' '}{currentCase.id}</span>
          </details>
          <button
            id="btn-close-modal-bottom"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors cursor-pointer"
          >
            {' '}{t('finalUi.caseDetail.copy043')}{' '}</button>
        </div>
      </div>
    </div>
  );
};
