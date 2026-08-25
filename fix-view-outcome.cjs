const fs = require('fs');
let code = fs.readFileSync('src/components/CaseAnalysisView.tsx', 'utf8');

// replace the incorrect outcome checks
code = code.replace(/record\.overallResult === 'employee_win'/g, "record.employeeOutcome === 'supported'");
code = code.replace(/record\.overallResult === 'employer_win'/g, "record.employerOutcome === 'supported'");
code = code.replace(/record\.overallResult === 'partial'/g, "record.overallResult === 'partially_supported'");

// also update the displayed text mapping
code = code.replace(/record\.employeeOutcome === 'supported' \? '用人单位全部胜诉' :/g, "record.employerOutcome === 'supported' ? '用人单位全部胜诉' :");
code = code.replace(/record\.employerOutcome === 'supported' \? '劳动者全部胜诉' :/g, "record.employeeOutcome === 'supported' ? '劳动者全部胜诉' :");
// wait, the old code was:
// record.overallResult === 'employer_win' ? '用人单位全部胜诉' : record.overallResult === 'employee_win' ? '劳动者全部胜诉' : record.overallResult === 'partial' ? '部分支持劳动者诉求' : '情况不明'
const oldMappingRegex = /\{record\.employerOutcome === 'supported' \? '用人单位全部胜诉' :\s*record\.employeeOutcome === 'supported' \? '劳动者全部胜诉' :\s*record\.overallResult === 'partially_supported' \? '部分支持劳动者诉求' : '情况不明'\}/;

code = code.replace(oldMappingRegex, `{record.employerOutcome === 'supported' ? '用人单位全部胜诉' : record.employeeOutcome === 'supported' ? '劳动者全部胜诉' : record.overallResult === 'partially_supported' ? '部分支持劳动者诉求' : '情况不明'}`);

fs.writeFileSync('src/components/CaseAnalysisView.tsx', code);
console.log('Fixed outcome in CaseAnalysisView');
