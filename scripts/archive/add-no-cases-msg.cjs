const fs = require('fs');
let code = fs.readFileSync('src/components/CaseAnalysisView.tsx', 'utf8');

code = code.replace(
  /<div className="flex-1 overflow-y-auto p-2 space-y-1">\n\s*\{filteredRecords\.map\(record => \{/,
  `<div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredRecords.length === 0 ? (
              <div className="p-4 text-center text-sm text-slate-400">暂无可分析案例</div>
            ) : filteredRecords.map(record => {`
);

fs.writeFileSync('src/components/CaseAnalysisView.tsx', code);
