import React from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Database, FolderKanban, Scale, ShieldAlert, FileText, ArrowRight, Info, AlertTriangle, HardDrive } from 'lucide-react';
import { NavTab } from './Sidebar';

interface UserGuideViewProps {
  onNavigate: (tab: NavTab) => void;
}

export const UserGuideView: React.FC<UserGuideViewProps> = ({ onNavigate }) => {
  const { t } = useTranslation();
  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6 h-full overflow-y-auto pb-24">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-600" />
          {t('guide.title')}
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          {t('guide.subtitle')}
        </p>
      </div>

      {/* Recommended Flow */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-100 flex items-center justify-between text-xs font-bold text-slate-700 shadow-sm">
        <span className="flex items-center gap-1.5"><Database className="w-4 h-4 text-blue-600" /> {t('guide.collect')}</span>
        <ArrowRight className="w-4 h-4 text-slate-300" />
        <span className="flex items-center gap-1.5"><FolderKanban className="w-4 h-4 text-indigo-600" /> {t('guide.library')}</span>
        <ArrowRight className="w-4 h-4 text-slate-300" />
        <span className="flex items-center gap-1.5"><FileText className="w-4 h-4 text-slate-600" /> {t('guide.inspectCase')}</span>
        <ArrowRight className="w-4 h-4 text-slate-300" />
        <span className="flex items-center gap-1.5"><Scale className="w-4 h-4 text-emerald-600" /> {t('guide.research')}</span>
        <ArrowRight className="w-4 h-4 text-slate-300" />
        <span className="flex items-center gap-1.5"><ShieldAlert className="w-4 h-4 text-amber-600" /> {t('guide.defense')}</span>
      </div>

      <div className="space-y-4">
        {/* Step 1 */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <span className="bg-blue-100 text-blue-700 w-5 h-5 rounded-full flex items-center justify-center text-xs">1</span>
              {t('guide.collect')}
            </h3>
            <button 
              onClick={() => onNavigate('dataManagement')}
              className="text-2xs bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1"
            >
              {t('guide.goCollect')} <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="text-xs text-slate-600 space-y-2">
            <p>{t('guide.collectionIntro')}</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>{t('guide.selectFilters')}</li>
              <li>{t('guide.setCount')}</li>
              <li>{t('guide.startCollection')}</li>
            </ul>
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-slate-500 text-2xs flex items-start gap-1.5 mt-2">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-500" />
              <p>{t('guide.autoPaging')}</p>
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <span className="bg-indigo-100 text-indigo-700 w-5 h-5 rounded-full flex items-center justify-center text-xs">2</span>
              {t('guide.viewLibrary')}
            </h3>
            <button 
              onClick={() => onNavigate('caseLibrary')}
              className="text-2xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1"
            >
              {t('guide.viewLibrary')} <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="text-xs text-slate-600 space-y-2">
            <p>{t('guide.afterCollect')}</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>{t('guide.keywordSearch')}</li>
              <li>{t('guide.filterCases')}</li>
              <li>{t('guide.openCase')}</li>
            </ul>
            <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 text-amber-800 text-2xs mt-2 space-y-1">
              <p className="font-bold flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {t('guide.closure.clearNotice')}</p>
              <p>{t('guide.rawDocMeaning')}</p>
              <p>{t('guide.libraryMeaning')}</p>
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <span className="bg-slate-100 text-slate-700 w-5 h-5 rounded-full flex items-center justify-center text-xs">3</span>
              {t('guide.inspectCase')}
            </h3>
          </div>
          <div className="text-xs text-slate-600 space-y-2">
            <p>{t('guide.caseDetailsIntro')}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="bg-slate-100 px-2 py-1 rounded text-2xs font-medium">{t('guide.caseInfo')}</span>
              <span className="bg-slate-100 px-2 py-1 rounded text-2xs font-medium">{t('guide.claimsOutcomes')}</span>
              <span className="bg-slate-100 px-2 py-1 rounded text-2xs font-medium">{t('guide.employerDefense')}</span>
              <span className="bg-slate-100 px-2 py-1 rounded text-2xs font-medium">{t('guide.keyEvidence')}</span>
              <span className="bg-slate-100 px-2 py-1 rounded text-2xs font-medium">{t('guide.courtReasoning')}</span>
              <span className="bg-slate-100 px-2 py-1 rounded text-2xs font-medium">{t('guide.outcome')}</span>
              <span className="bg-slate-100 px-2 py-1 rounded text-2xs font-medium">{t('guide.originalDocument')}</span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-slate-500 text-2xs mt-2">
              {t('guide.closure.unavailableInfo')}
            </div>
          </div>
        </div>

        {/* Step 4 */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <span className="bg-emerald-100 text-emerald-700 w-5 h-5 rounded-full flex items-center justify-center text-xs">4</span>
              {t('guide.research')}
            </h3>
            <button 
              onClick={() => onNavigate('caseAnalysis')}
              className="text-2xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1"
            >
              {t('guide.enterResearch')} <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="text-xs text-slate-600 space-y-2">
            <p>{t('guide.closure.researchFocusIntro', { page: t('guide.research') })}</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>{t('guide.defenseSupport')}</li>
              <li>{t('guide.rejectionReasons')}</li>
              <li>{t('guide.submittedEvidence')}</li>
              <li>{t('guide.outcomeByType')}</li>
            </ul>
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-slate-500 text-2xs flex items-start gap-1.5 mt-2">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <p>{t('guide.perspectiveNote')}</p>
            </div>
          </div>
        </div>

        {/* Step 5 */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <span className="bg-amber-100 text-amber-700 w-5 h-5 rounded-full flex items-center justify-center text-xs">5</span>
              {t('guide.defense')}
            </h3>
            <button 
              onClick={() => onNavigate('defenseReference')}
              className="text-2xs bg-amber-50 text-amber-700 hover:bg-amber-100 px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1"
            >
              {t('guide.viewDefense')} <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="text-xs text-slate-600 space-y-2">
            <p>{t('guide.closure.defenseFocusIntro', { page: t('guide.defense') })}</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>{t('guide.defenseSupport')}</li>
              <li>{t('guide.rejectionReasons')}</li>
              <li>{t('guide.keyEvidence')}</li>
              <li>{t('guide.closure.evidenceCombinations')}</li>
            </ul>
            <div className="bg-rose-50 p-3 rounded-lg border border-rose-100 text-rose-800 text-2xs mt-3 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="font-medium leading-relaxed">
                {t('guide.closure.associationWarning')}
              </p>
            </div>
          </div>
        </div>

        {/* Data Disclaimer */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-500 space-y-2">
          <div className="font-bold text-slate-700 flex items-center gap-1.5 mb-2">
            <HardDrive className="w-4 h-4" /> {t('guide.closure.dataDescription')}
          </div>
          <ul className="list-disc pl-5 space-y-1.5 text-2xs">
            <li>{t('guide.localStorageNote')}</li>
            <li>{t('guide.rawImmutableNote')}</li>
            <li>{t('guide.closure.rebuildNote')}</li>
            <li>{t('guide.closure.localDataWarning')}</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
