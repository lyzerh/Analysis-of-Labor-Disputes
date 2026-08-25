const fs = require('fs');
let code = fs.readFileSync('src/types.ts', 'utf8');

code = code.replace(/evidence\?: EvidenceItem\[\];/g, 'evidence?: EvidenceItem[];\n    courtReasoning?: string;\n    keyLegalPoints?: string[];');
fs.writeFileSync('src/types.ts', code);
console.log('Fixed ParserReviewRecord');
