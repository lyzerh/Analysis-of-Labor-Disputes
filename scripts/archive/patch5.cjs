const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');
code = code.replace(
  'const records = await LaborAnalysisPipeline.getAllAnalysisRecords(true);',
  'const records = await LaborAnalysisPipeline.getAllAnalysisRecords(false);'
);
fs.writeFileSync('src/App.tsx', code);
