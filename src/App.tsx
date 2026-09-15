import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar, NavTab } from './components/Sidebar';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { CaseDatabase } from './components/CaseDatabase';
import { ImportCases } from './components/ImportCases';
import { SyncCenter } from './components/SyncCenter';
import { DataQuality } from './components/DataQuality';
import { AnalyticsView } from './components/AnalyticsView';
import { CaseAnalysisView } from './components/CaseAnalysisView';
import { LaborInfoCrawlerComponent } from './components/LaborInfoCrawler';
import { LaborInfoApiTest } from './components/LaborInfoApiTest';
import { LaborInfoParserTest } from './components/LaborInfoParserTest';
import { LaborInfoReview } from './components/LaborInfoReview';
import { DatasetBuilderTest } from './components/DatasetBuilderTest';
import { LaborAnalysisCaseLibrary } from './components/LaborAnalysisCaseLibrary';
import { LaborAnalyticsTest } from './components/LaborAnalyticsTest';
import { DefenseStrategyAnalysis } from './components/DefenseStrategyAnalysis';
import { ResearchWorkspace } from './components/ResearchWorkspace';
import { DataManagement } from './components/DataManagement';
import { SettingsView } from './components/SettingsView';
import { UserGuideView } from './components/UserGuideView';
import { CaseDetailModal } from './components/CaseDetailModal';
import { ArbitrationCase, CaseFilterOptions } from './types';
import { DataService } from './services/data/dataService';
import { AnalyticsService } from './services/analytics/analyticsService';
import { db } from './db';
import { LaborAnalysisPipeline } from './services/data/LaborAnalysisPipeline';
import {
  loadResearchNavigationContext,
  saveResearchNavigationContext,
} from './services/research/ResearchNavigationContext';

export function App() {
  const [initialNavigationContext] = useState(loadResearchNavigationContext);
  const [currentTab, setCurrentTab] = useState<NavTab>(initialNavigationContext.page);
  const [caseCount, setCaseCount] = useState(0);
  const [totalDocs, setTotalDocs] = useState(0);
  const [qualityAvg, setQualityAvg] = useState(0);
  const [isOpenMobile, setIsOpenMobile] = useState(false);
  const [selectedAnalysisRunId, setSelectedAnalysisRunId] = useState(initialNavigationContext.selectedAnalysisRunId);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState(initialNavigationContext.selectedSnapshotId);

  // Selected case for detail modal
  const [selectedCase, setSelectedCase] = useState<ArbitrationCase | null>(null);

  // Filter params passed to CaseDatabase when drilldown happens
  const [databaseFilter, setDatabaseFilter] = useState<Partial<CaseFilterOptions>>({});

  const refreshSummaryStats = useCallback(async () => {
    try {
      const records = await LaborAnalysisPipeline.getAllAnalysisRecords(false);
      const rawCount = await db.rawDocuments.filter((d) => d.source === 'laborinfo').count();
      setCaseCount(records.filter((r) => r.isIncludedInAnalysisSet).length);
      setTotalDocs(rawCount);
      const overview = await AnalyticsService.getDashboardOverview();
      setQualityAvg(overview.avgQualityScore);
    } catch (err) {
      console.error('Failed to load summary stats:', err);
    }
  }, []);

  useEffect(() => {
    const initApp = async () => {
      await refreshSummaryStats();
    };
    initApp();

    const handleDataUpdate = () => {
      refreshSummaryStats();
    };
    window.addEventListener('labor-data-updated', handleDataUpdate);
    return () => window.removeEventListener('labor-data-updated', handleDataUpdate);
  }, [refreshSummaryStats]);

  useEffect(() => {
    saveResearchNavigationContext(undefined, {
      page: currentTab,
      selectedSnapshotId,
      selectedAnalysisRunId,
    });
  }, [currentTab, selectedSnapshotId, selectedAnalysisRunId]);

  const handleGlobalSearch = (keyword: string) => {
    setDatabaseFilter({ keyword });
    setCurrentTab('caseLibrary');
  };

  const handleNavigateWithFilter = (tab: NavTab, params: any = {}) => {
    if (tab === 'caseLibrary') {
      setDatabaseFilter(params);
    }
    setCurrentTab(tab);
  };

  const handleSelectCase = (c: ArbitrationCase) => {
    setSelectedCase(c);
  };

  return (
    <div className="flex h-screen w-screen bg-slate-100/70 text-slate-800 overflow-hidden font-sans antialiased select-none">
      {/* PC Left Fixed Sidebar + Tablet Drawer */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={(tab) => {
          if (tab === 'caseLibrary') {
            setDatabaseFilter({});
          }
          setCurrentTab(tab);
        }}
        caseCount={caseCount}
        qualityAvg={qualityAvg}
        isOpenMobile={isOpenMobile}
        onCloseMobile={() => setIsOpenMobile(false)}
      />

      {/* Main Right Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* Global Header */}
        <Header
          onSearch={handleGlobalSearch}
          caseCount={caseCount}
          totalDocs={totalDocs}
          onOpenMobileMenu={() => setIsOpenMobile(true)}
        />

        {/* Scrollable Tab View Area */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden select-text">
          {currentTab === 'caseLibrary' && (
            <LaborAnalysisCaseLibrary
              onNavigateToCrawler={() => setCurrentTab('dataManagement')}
              onNavigateToReview={() => setCurrentTab('dataManagement')}
              onNavigateToAnalytics={() => setCurrentTab('caseResearch')}
              onNavigateToDefense={() => setCurrentTab('defenseReference')}
            />
          )}

          {currentTab === 'caseAnalysis' && (
            <CaseAnalysisView />
          )}

          {currentTab === 'caseResearch' && (
            <LaborAnalyticsTest
              initialAnalysisRunId={selectedAnalysisRunId}
              onAnalysisRunSelect={setSelectedAnalysisRunId}
            />
          )}

          {currentTab === 'defenseReference' && (
            <DefenseStrategyAnalysis
              initialAnalysisRunId={selectedAnalysisRunId}
              onAnalysisRunSelect={setSelectedAnalysisRunId}
            />
          )}

          {currentTab === 'researchWorkspace' && (
            <ResearchWorkspace
              initialSnapshotId={selectedSnapshotId}
              onSnapshotSelect={setSelectedSnapshotId}
              onOpenLaborAnalytics={(analysisRunId) => {
                setSelectedAnalysisRunId(analysisRunId);
                setCurrentTab('caseResearch');
              }}
              onOpenDefenseAnalysis={(analysisRunId) => {
                setSelectedAnalysisRunId(analysisRunId);
                setCurrentTab('defenseReference');
              }}
              onOpenDataManagement={() => setCurrentTab('dataManagement')}
            />
          )}

          {currentTab === 'dataManagement' && (
            <DataManagement onDataChanged={refreshSummaryStats} />
          )}

          {currentTab === 'settings' && <SettingsView onNavigateToGuide={() => setCurrentTab('userGuide')} />}
          {currentTab === 'userGuide' && <UserGuideView onNavigate={(tab) => setCurrentTab(tab)} />}
        </main>
      </div>

      {/* Case Detail Modal */}
      {selectedCase && (
        <CaseDetailModal
          caseItem={selectedCase}
          onClose={() => setSelectedCase(null)}
          onReparse={async (id) => {
            await DataService.reparseCase(id);
            const updated = await DataService.getCaseById(id);
            if (updated) setSelectedCase(updated);
            refreshSummaryStats();
          }}
        />
      )}
    </div>
  );
}

export default App;
