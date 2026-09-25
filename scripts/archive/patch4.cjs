const fs = require('fs');
let code = fs.readFileSync('src/services/data/LaborAnalysisPipeline.ts', 'utf-8');
code = code.replace(
  'public static clearCache(): void {\n    this.cachedRecords = null;\n    this.cachedFailedItems = [];\n    this.lastRunTimestamp = 0;\n  }',
  `public static clearCache(): void {\n    this.cachedRecords = null;\n    this.cachedFailedItems = [];\n    this.lastRunTimestamp = 0;\n    if (typeof window !== 'undefined') {\n      window.dispatchEvent(new Event('labor-data-updated'));\n    }\n  }`
);
fs.writeFileSync('src/services/data/LaborAnalysisPipeline.ts', code);
