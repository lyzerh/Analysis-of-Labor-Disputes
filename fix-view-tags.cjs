const fs = require('fs');
let code = fs.readFileSync('src/components/CaseAnalysisView.tsx', 'utf8');

const regex = /未识别<\/div>\n                    \)}\n                  <\/div>\n                <\/div>\n                <div className="mt-6 pt-6 border-t border-slate-100 space-y-3">/;
const replacement = `未识别</div>
                    )}
                  </div>
                  </div>
                </div>
                <div className="mt-6 pt-6 border-t border-slate-100 space-y-3">`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/components/CaseAnalysisView.tsx', code);
console.log('Fixed tags');
