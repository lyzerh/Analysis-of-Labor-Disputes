import React from 'react';
import { BookOpen, Database, FolderKanban, Scale, ShieldAlert, FileText, ArrowRight, Info, AlertTriangle, HardDrive } from 'lucide-react';
import { NavTab } from './Sidebar';

interface UserGuideViewProps {
  onNavigate: (tab: NavTab) => void;
}

export const UserGuideView: React.FC<UserGuideViewProps> = ({ onNavigate }) => {
  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6 h-full overflow-y-auto pb-24">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-600" />
          使用教程
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          从案例采集到案例分析的完整使用流程
        </p>
      </div>

      {/* Recommended Flow */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-100 flex items-center justify-between text-xs font-bold text-slate-700 shadow-sm">
        <span className="flex items-center gap-1.5"><Database className="w-4 h-4 text-blue-600" /> 采集案例</span>
        <ArrowRight className="w-4 h-4 text-slate-300" />
        <span className="flex items-center gap-1.5"><FolderKanban className="w-4 h-4 text-indigo-600" /> 案例库</span>
        <ArrowRight className="w-4 h-4 text-slate-300" />
        <span className="flex items-center gap-1.5"><FileText className="w-4 h-4 text-slate-600" /> 检查案例</span>
        <ArrowRight className="w-4 h-4 text-slate-300" />
        <span className="flex items-center gap-1.5"><Scale className="w-4 h-4 text-emerald-600" /> 案例分析</span>
        <ArrowRight className="w-4 h-4 text-slate-300" />
        <span className="flex items-center gap-1.5"><ShieldAlert className="w-4 h-4 text-amber-600" /> 应诉参考</span>
      </div>

      <div className="space-y-4">
        {/* Step 1 */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <span className="bg-blue-100 text-blue-700 w-5 h-5 rounded-full flex items-center justify-center text-xs">1</span>
              采集案例
            </h3>
            <button 
              onClick={() => onNavigate('dataManagement')}
              className="text-2xs bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1"
            >
              去采集案例 <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="text-xs text-slate-600 space-y-2">
            <p>进入「高级工具」&gt;「数据管理」&gt;「工劳网采集」：</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>选择省份、审级和裁判日期。</li>
              <li>设置采集数量。</li>
              <li>点击开始采集，等待任务完成。</li>
            </ul>
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-slate-500 text-2xs flex items-start gap-1.5 mt-2">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-500" />
              <p>系统会自动分页采集、跳过重复案例，并支持暂停、继续和断点恢复。</p>
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <span className="bg-indigo-100 text-indigo-700 w-5 h-5 rounded-full flex items-center justify-center text-xs">2</span>
              查看案例库
            </h3>
            <button 
              onClick={() => onNavigate('caseLibrary')}
              className="text-2xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1"
            >
              查看案例库 <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="text-xs text-slate-600 space-y-2">
            <p>采集完成后进入「劳动争议案例库」。您可以：</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>按关键词搜索。</li>
              <li>按城市、年份、审级筛选。</li>
              <li>点击案件查看详情。</li>
            </ul>
            <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 text-amber-800 text-2xs mt-2 space-y-1">
              <p className="font-bold flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> 明确说明：</p>
              <p>「原始文书」表示已经从数据源获取并保存的裁判文书。</p>
              <p>「案例库」表示已经完成结构化处理并进入分析体系的案例。因此两者数量可能不同。</p>
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <span className="bg-slate-100 text-slate-700 w-5 h-5 rounded-full flex items-center justify-center text-xs">3</span>
              查看案例详情
            </h3>
          </div>
          <div className="text-xs text-slate-600 space-y-2">
            <p>进入具体案件后，可以查看：</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="bg-slate-100 px-2 py-1 rounded text-2xs font-medium">基本信息</span>
              <span className="bg-slate-100 px-2 py-1 rounded text-2xs font-medium">诉求与裁判结果</span>
              <span className="bg-slate-100 px-2 py-1 rounded text-2xs font-medium">企业抗辩</span>
              <span className="bg-slate-100 px-2 py-1 rounded text-2xs font-medium">关键证据</span>
              <span className="bg-slate-100 px-2 py-1 rounded text-2xs font-medium">法院裁判理由</span>
              <span className="bg-slate-100 px-2 py-1 rounded text-2xs font-medium">裁判结果</span>
              <span className="bg-slate-100 px-2 py-1 rounded text-2xs font-medium">原始裁判文书</span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-slate-500 text-2xs mt-2">
              对于无法从文书中可靠识别的信息，统一显示「未识别」，不会自行推断。
            </div>
          </div>
        </div>

        {/* Step 4 */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <span className="bg-emerald-100 text-emerald-700 w-5 h-5 rounded-full flex items-center justify-center text-xs">4</span>
              案例分析
            </h3>
            <button 
              onClick={() => onNavigate('caseAnalysis')}
              className="text-2xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1"
            >
              进入案例分析 <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="text-xs text-slate-600 space-y-2">
            <p>进入「案例分析」后，可以从案例列表选择案件，查看结构化分析结果。重点关注：</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>企业抗辩是否获得支持</li>
              <li>法院为什么支持或否定相关主张</li>
              <li>企业提交了哪些证据</li>
              <li>不同争议类型下的裁判情况</li>
            </ul>
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-slate-500 text-2xs flex items-start gap-1.5 mt-2">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <p>注意：企业作为原告的诉讼请求获得支持，与企业作为被告时抗辩获得支持，是两种不同情况，系统会分别处理。</p>
            </div>
          </div>
        </div>

        {/* Step 5 */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <span className="bg-amber-100 text-amber-700 w-5 h-5 rounded-full flex items-center justify-center text-xs">5</span>
              应诉参考
            </h3>
            <button 
              onClick={() => onNavigate('defenseReference')}
              className="text-2xs bg-amber-50 text-amber-700 hover:bg-amber-100 px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1"
            >
              查看应诉参考 <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="text-xs text-slate-600 space-y-2">
            <p>进入「应诉参考」后，可以查看历史案例中的：</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>企业抗辩支持情况</li>
              <li>法院否定依据高频词</li>
              <li>高频关键证据</li>
              <li>2项、3项证据组合</li>
            </ul>
            <div className="bg-rose-50 p-3 rounded-lg border border-rose-100 text-rose-800 text-2xs mt-3 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="font-medium leading-relaxed">
                必须明确提示：这些数据反映的是历史案例中的统计关联，不代表某项证据或抗辩必然导致胜诉，也不构成法律意见。
              </p>
            </div>
          </div>
        </div>

        {/* Data Disclaimer */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-500 space-y-2">
          <div className="font-bold text-slate-700 flex items-center gap-1.5 mb-2">
            <HardDrive className="w-4 h-4" /> 数据说明
          </div>
          <ul className="list-disc pl-5 space-y-1.5 text-2xs">
            <li>数据默认保存在当前浏览器本地。</li>
            <li>原始裁判文书不会被分析过程直接修改。</li>
            <li>结构化分析数据可以根据最新解析规则重新构建。</li>
            <li>清除浏览器网站数据、更换浏览器或设备可能导致本地数据无法继续访问。</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
