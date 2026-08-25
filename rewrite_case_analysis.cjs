const fs = require('fs');

let code = fs.readFileSync('src/components/CaseAnalysisView.tsx', 'utf8');

// We will use regular expressions to move the `if (loading)` block below the hooks.

// 1. Remove the existing `if (loading) { ... }`
const loadingBlockRegex = /  if \(loading\) \{\s*return <div className="p-8 text-center text-slate-500">正在加载数据\.\.\.<\/div>;\s*\}/;
code = code.replace(loadingBlockRegex, '');

// 2. Insert it just before `return (`
const returnRegex = /  return \(/;
code = code.replace(returnRegex, `  if (loading) {
    return <div className="p-8 text-center text-slate-500">正在加载数据...</div>;
  }

  return (`);

fs.writeFileSync('src/components/CaseAnalysisView.tsx', code);
