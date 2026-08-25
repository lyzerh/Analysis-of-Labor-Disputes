const fs = require('fs');
let code = fs.readFileSync('src/services/dataset/LaborCaseDatasetBuilder.ts', 'utf8');

const regex = /const evidence = \(hasReviewerChanges && changes\?\.evidence\)[\s\S]*?\: \(parsed\.evidence \|\| \[\]\);/;

const newFields = `const evidence = (hasReviewerChanges && changes?.evidence)
      ? changes.evidence
      : (parsed.evidence || []);
      
    const courtReasoning = (hasReviewerChanges && changes?.courtReasoning)
      ? changes.courtReasoning
      : (parsed.courtReasoning || '');
      
    const keyLegalPoints = (hasReviewerChanges && changes?.keyLegalPoints)
      ? changes.keyLegalPoints
      : (parsed.keyLegalPoints || []);`;
      
code = code.replace(regex, newFields);

const regex2 = /evidence,[\s\S]*?\/\/ 5\. 判断是否为主张方/;
const newAssigns = `evidence,
      courtReasoning,
      keyLegalPoints,

      // 5. 判断是否为主张方`;
code = code.replace(regex2, newAssigns);

fs.writeFileSync('src/services/dataset/LaborCaseDatasetBuilder.ts', code);
console.log('Fixed builder fields');
