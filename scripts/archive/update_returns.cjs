const fs = require('fs');

let code = fs.readFileSync('src/components/CaseAnalysisView.tsx', 'utf8');

const loadingCheckOld = `  if (loading) {
    return <div className="p-8 text-center text-slate-500">正在加载数据...</div>;
  }`;
  
const loadingCheckNew = `  if (loading) {
    return <div className="p-8 text-center text-slate-500">正在加载数据...</div>;
  }
  
  if (error) {
    return <div className="p-8 text-center text-rose-500">加载案例数据失败: {error.message}</div>;
  }`;

if (code.includes(loadingCheckOld)) {
  code = code.replace(loadingCheckOld, loadingCheckNew);
  fs.writeFileSync('src/components/CaseAnalysisView.tsx', code);
  console.log("Successfully updated return statements.");
} else {
  console.log("Could not find the old loading check.");
}
