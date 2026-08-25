const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');
code = code.replace(
  'useEffect(() => {\n    const initApp = async () => {\n      await refreshSummaryStats();\n    };\n    initApp();\n  }, [refreshSummaryStats]);',
  `useEffect(() => {
    const initApp = async () => {
      await refreshSummaryStats();
    };
    initApp();

    const handleDataUpdate = () => {
      refreshSummaryStats();
    };
    window.addEventListener('labor-data-updated', handleDataUpdate);
    return () => window.removeEventListener('labor-data-updated', handleDataUpdate);
  }, [refreshSummaryStats]);`
);
fs.writeFileSync('src/App.tsx', code);
