const fs = require('fs');
let code = fs.readFileSync('src/components/LaborAnalysisCaseLibrary.tsx', 'utf-8');
code = code.replace(
  '  useEffect(() => {\n    const loadData = async () => {\n      setLoading(true);\n      try {\n        const recs = await LaborAnalysisPipeline.getAllAnalysisRecords(false);\n        setRecords(recs.filter(r => r.isIncludedInAnalysisSet));\n      } catch (err) {\n        console.error(err);\n      } finally {\n        setLoading(false);\n      }\n    };\n    loadData();\n  }, []);',
  `  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const recs = await LaborAnalysisPipeline.getAllAnalysisRecords(false);
        setRecords(recs.filter(r => r.isIncludedInAnalysisSet));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadData();

    window.addEventListener('labor-data-updated', loadData);
    return () => window.removeEventListener('labor-data-updated', loadData);
  }, []);`
);
fs.writeFileSync('src/components/LaborAnalysisCaseLibrary.tsx', code);
