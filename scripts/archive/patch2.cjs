const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');
code = code.replace(
  "import { db } from './db';",
  "import { db } from './db';\nimport { LaborAnalysisPipeline } from './services/data/LaborAnalysisPipeline';"
);
fs.writeFileSync('src/App.tsx', code);
