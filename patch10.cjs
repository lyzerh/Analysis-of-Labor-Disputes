const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');
code = code.replace(
  "import { LaborAnalysisPipeline } from './services/data/LaborAnalysisPipeline';\nimport { LaborAnalysisPipeline } from './services/data/LaborAnalysisPipeline';",
  "import { LaborAnalysisPipeline } from './services/data/LaborAnalysisPipeline';"
);
fs.writeFileSync('src/App.tsx', code);
