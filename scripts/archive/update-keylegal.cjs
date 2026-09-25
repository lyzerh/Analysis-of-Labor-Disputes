const fs = require('fs');
let code = fs.readFileSync('src/components/CaseAnalysisView.tsx', 'utf8');

code = code.replace(/record\.legalOutcomeSummary/g, 'record.keyLegalPoints');
code = code.replace(/\{record\.keyLegalPoints && \([\s\S]*?\{record\.keyLegalPoints\}<\/span>[\s\S]*?\)[\s\S]*?\)/, 
`{record.keyLegalPoints && record.keyLegalPoints.length > 0 && (
                        <div className="flex flex-col mt-2">
                          <span className="text-slate-500 mb-1">关键裁判要点：</span>
                          <span className="font-medium text-slate-900 leading-relaxed bg-white p-2 rounded border border-purple-100">{record.keyLegalPoints.join('；')}</span>
                        </div>
)}`);

fs.writeFileSync('src/components/CaseAnalysisView.tsx', code);
console.log('Fixed keyLegalPoints');
