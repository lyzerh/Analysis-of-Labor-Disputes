const fs = require('fs');
let code = fs.readFileSync('src/types.ts', 'utf8');
code = code.replace(/    disputeType\?: string\[\];\n    courtReasoning\?: string;/, "    disputeType?: string[];");
fs.writeFileSync('src/types.ts', code);
console.log('Fixed types.ts duplicates');
