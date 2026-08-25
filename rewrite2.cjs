const fs = require('fs');

let code = fs.readFileSync('src/components/CaseAnalysisView.tsx', 'utf8');

const loadingBlockRegex = /  if \(loading\) \{\s*return <div className="p-8 text-center text-slate-500">正在加载数据\.\.\.<\/div>;\s*\}/;

if (code.match(loadingBlockRegex)) {
  code = code.replace(loadingBlockRegex, '');
  const returnRegex = /  return \(\s*<div className="flex flex-col/;
  code = code.replace(returnRegex, `  if (loading) {
    return <div className="p-8 text-center text-slate-500">正在加载数据...</div>;
  }

  return (
    <div className="flex flex-col`);
  fs.writeFileSync('src/components/CaseAnalysisView.tsx', code);
  console.log("Rewrote CaseAnalysisView.tsx successfully.");
} else {
  console.log("Could not find the loading block to remove.");
}
