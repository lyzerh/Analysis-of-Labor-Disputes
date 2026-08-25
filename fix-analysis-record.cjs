const fs = require('fs');
let code = fs.readFileSync('src/types.ts', 'utf8');

const regex = /\/\/ 企业策略与抗辩 \(Employer Strategy\)/;
code = code.replace(regex, `// 裁判理由与核心要点\n  courtReasoning: string;\n  keyLegalPoints: string[];\n\n  // 企业策略与抗辩 (Employer Strategy)`);
fs.writeFileSync('src/types.ts', code);
console.log('Fixed types.ts');
