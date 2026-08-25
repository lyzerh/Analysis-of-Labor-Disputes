const fs = require('fs');
let code = fs.readFileSync('src/services/dataset/LaborCaseDatasetBuilder.ts', 'utf8');

code = code.replace(/evidence,\n      claims,/g, 'evidence,\n      claims,\n      courtReasoning,\n      keyLegalPoints,');
fs.writeFileSync('src/services/dataset/LaborCaseDatasetBuilder.ts', code);
console.log('Fixed LaborCaseDatasetBuilder return');
