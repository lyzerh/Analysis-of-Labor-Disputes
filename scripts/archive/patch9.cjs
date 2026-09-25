const fs = require('fs');
let code = fs.readFileSync('src/components/DefenseStrategyAnalysis.tsx', 'utf-8');
code = code.replace(
  'const records = await LaborAnalysisPipeline.getAllAnalysisRecords(true);',
  'const records = await LaborAnalysisPipeline.getAllAnalysisRecords(false);'
);
fs.writeFileSync('src/components/DefenseStrategyAnalysis.tsx', code);
