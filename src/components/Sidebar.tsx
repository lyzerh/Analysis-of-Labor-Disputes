import React from 'react';
import {
  LayoutDashboard,
  Database,
  UploadCloud,
  RefreshCw,
  ShieldCheck,
  BarChart3,
  HardDrive,
  Settings,
  Scale,
  Globe,
  Layers,
  ShieldAlert,
  DownloadCloud,
  FileCheck2,
  FolderKanban,
  CheckCircle2,
  FlaskConical,
} from 'lucide-react';
import { isLlmAvailable, useLlmRuntimeSettings } from '../services/semantic/LlmRuntimeSettings';
import { getConfiguredLlmProvider } from '../services/semantic/LlmRuntimeProvider';

export type NavTab =
  | 'caseLibrary'
  | 'caseAnalysis'
  | 'researchWorkspace'
  | 'caseResearch'
  | 'defenseReference'
  | 'goldAnnotation'
  | 'dataManagement'
  | 'settings'
  | 'userGuide';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  caseCount: number;
  qualityAvg: number;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

interface NavGroup {
  title: string;
  items: {
    id: NavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge: string | number | null;
  }[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  caseCount,
  qualityAvg,
  isOpenMobile,
  onCloseMobile,
}) => {
  const { settings: llmSettings } = useLlmRuntimeSettings();
  const llmEnabled = isLlmAvailable(llmSettings);
  const llmProvider = getConfiguredLlmProvider();

  const navGroups: NavGroup[] = [
    {
      title: '工作台',
      items: [
        { id: 'caseLibrary', label: '劳动争议案例库', icon: FolderKanban, badge: null },
        { id: 'caseAnalysis', label: '案例分析', icon: Scale, badge: null },
        { id: 'researchWorkspace', label: '研究工作区', icon: FlaskConical, badge: null },
        { id: 'caseResearch', label: '案例研究', icon: BarChart3, badge: null },
        { id: 'defenseReference', label: '应诉参考', icon: ShieldAlert, badge: null },
      ],
    },
    {
      title: '高级工具',
      items: [
        { id: 'dataManagement', label: '数据管理', icon: Database, badge: null },
        { id: 'goldAnnotation', label: 'Gold 标注', icon: FileCheck2, badge: null },
        { id: 'settings', label: '系统设置', icon: Settings, badge: null },
      ],
    },
  ];

  const content = (
    <div className="lawlens-sidebar flex flex-col h-full bg-slate-50/95 text-slate-700 w-64 select-none border-r border-slate-200/80">
      {/* Brand Header */}
      <div className="px-5 py-5 border-b border-slate-200 flex items-center gap-3">
        <div className="overflow-hidden">
          <h1 className="text-lg font-semibold text-slate-950 tracking-tight leading-snug truncate">
            LawLens
          </h1>
          <p className="text-xs text-slate-500 truncate flex items-center gap-1 mt-0.5">
            劳动争议研究工作台
          </p>
        </div>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto">
        {navGroups.map((group, gIdx) => (
          <div key={group.title || gIdx} className="space-y-1">
            <div className="px-3 text-2xs font-bold text-slate-400 uppercase tracking-wider">
              {group.title}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-item-${item.id}`}
                  onClick={() => {
                    onSelectTab(item.id);
                    onCloseMobile();
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer ${
                    isActive
                      ? 'bg-white text-slate-950 shadow-sm border border-slate-200'
                      : 'text-slate-600 hover:bg-white hover:text-slate-950'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-slate-700' : 'text-slate-400'}`} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.badge !== null && (
                    <span
                      className={`text-2xs px-2 py-0.5 rounded-full font-mono font-semibold shrink-0 ${
                        isActive
                          ? 'bg-slate-100 text-slate-700'
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer Info & Local Data Status */}
      <div className="p-3 border-t border-slate-200 bg-white/70">
        <div className="bg-white rounded-xl p-2.5 border border-slate-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-600 font-medium">本地数据存储</span>
          </div>
          <span className="text-2xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-mono">
            IndexedDB
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between px-1 text-2xs">
          <div className="flex items-center gap-1.5 text-slate-500">
            <span className={`h-1.5 w-1.5 rounded-full ${llmEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            <span>{llmEnabled ? `${llmProvider.providerLabel} 已启用` : 'AI 未启用'}</span>
          </div>
          <span className="text-slate-500">
            {llmEnabled ? 'BYOK' : '可选'}
          </span>
        </div>
        <div className="text-2xs text-slate-500 text-center mt-2">
          裁判文书事实与证据抗辩关联库
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* PC Fixed Sidebar */}
      <aside className="hidden lg:block h-screen shrink-0 sticky top-0 z-30">{content}</aside>

      {/* Mobile / Tablet Drawer */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-slate-50 z-10 shadow-2xl">
            {content}
          </div>
        </div>
      )}
    </>
  );
};
