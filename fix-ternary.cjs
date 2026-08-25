const fs = require('fs');
let code = fs.readFileSync('src/components/CaseAnalysisView.tsx', 'utf8');

code = code.replace(
  /\{Array\.isArray\(record\.disputeType\) \? record\.disputeType\.slice\(0, 2\)\.map\(\(dt: any, i: number\) => \(\n\s*<span key=\{i\} className="px-1\.5 py-0\.5 rounded bg-slate-100 text-slate-600 text-2xs">\n\s*\{dt\}\n\s*<\/span>\n\s*\)\)\}/,
  `{Array.isArray(record.disputeType) ? record.disputeType.slice(0, 2).map((dt: any, i: number) => (
                      <span key={i} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-2xs">
                        {dt}
                      </span>
                    )) : null}`
);

fs.writeFileSync('src/components/CaseAnalysisView.tsx', code);
