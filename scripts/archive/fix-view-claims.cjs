const fs = require('fs');
let code = fs.readFileSync('src/components/CaseAnalysisView.tsx', 'utf8');

const regex = /\{record\.keyLegalPoints && record\.keyLegalPoints\.length > 0 && \([\s\S]*?\}\) => \(/;

const newCode = `{record.keyLegalPoints && record.keyLegalPoints.length > 0 && (
                        <div className="flex flex-col mt-2">
                          <span className="text-slate-500 mb-1">关键裁判要点：</span>
                          <span className="font-medium text-slate-900 leading-relaxed bg-white p-2 rounded border border-purple-100">{record.keyLegalPoints.join('；')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                    {/* 左列：诉求与抗辩 */}
                    <div className="space-y-6">
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Target className="w-4 h-4 text-rose-500" />
                      劳动者诉求清单
                    </h3>
                    {record.claims && record.claims.length > 0 ? (
                      <div className="space-y-2">
                        {record.claims.map((claim, idx) => (`

code = code.replace(regex, newCode);

fs.writeFileSync('src/components/CaseAnalysisView.tsx', code);
console.log('Fixed syntax error');
