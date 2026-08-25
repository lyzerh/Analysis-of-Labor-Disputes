const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');
code = code.replace(
  /const refreshSummaryStats \= useCallback[\s\S]*?\}, \[refreshSummaryStats\]\);/g,
  `const refreshSummaryStats = useCallback(async () => {
    try {
      const records = await LaborAnalysisPipeline.getAllAnalysisRecords(true);
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
  }, [refreshSummaryStats]);`
);
fs.writeFileSync('src/App.tsx', code);
