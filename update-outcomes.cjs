const fs = require('fs');
let code = fs.readFileSync('src/services/parser/LaborInfoParserAdapter.ts', 'utf8');

// replace the passed args
code = code.replace(/sections\.decision \|\| text/g, "sections.decision || ''");

fs.writeFileSync('src/services/parser/LaborInfoParserAdapter.ts', code);
console.log('Patched outcomes call');
