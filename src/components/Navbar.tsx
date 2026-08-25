import React from 'react';
import {
  Scale,
  LayoutDashboard,
  UploadCloud,
  BookOpen,
  GitCompare,
  TrendingUp,
  ShieldAlert,
  Database,
  RotateCcw,
} from 'lucide-react';

interface NavbarProps {
  activeTab: 'dashboard' | 'import' | 'library' | 'similar' | 'deep-analysis' | 'assessment';
  setActiveTab: (tab: 'dashboard' | 'import' | 'library' | 'similar' | 'deep-analysis' | 'assessment') => void;
  caseCount: number;
  onResetSeedData: () => void;
}

interface NavItem {
  id: 'dashboard' | 'import' | 'library' | 'similar' | 'deep-analysis' | 'assessment';
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  countBadge?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  caseCount,
  onResetSeedData,
}) => {
  const navItems: NavItem[] = [
    { id: 'dashboard', label: '首页看板', icon: LayoutDashboard },
    { id: 'import', label: '导入文书', icon: UploadCloud },
    { id: 'library', label: '案例库', icon: BookOpen, countBadge: caseCount },
    { id: 'similar', label: '相似案例比对', icon: GitCompare },
    { id: 'deep-analysis', label: '深度实证分析', icon: TrendingUp },
    { id: 'assessment', label: '本案风险诊断', icon: ShieldAlert },
  ];

  return (
    <header className="sticky top-0 z-40 bg-slate-900 text-slate-100 border-b border-slate-800 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center shadow-inner text-white font-bold">
              <Scale className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-white tracking-tight">
                  劳动争议裁判分析助手
                </span>
                <span className="hidden md:inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  企业法务版 · 移动/平板端
                </span>
              </div>
              <p className="hidden sm:block text-xs text-slate-400">
                广东核心制造业 · 近五年裁判规则与风控研判
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <div className="hidden lg:flex items-center gap-1 text-xs text-slate-400 bg-slate-800/80 px-3 py-1.5 rounded-md border border-slate-700">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span>本地 IndexedDB:</span>
              <span className="font-semibold text-white">{caseCount} 篇文书</span>
            </div>

            <button
              id="btn-reset-seed-data"
              onClick={onResetSeedData}
              title="重置并载入精选精选判例库"
              className="px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700 flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">恢复精选判例</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation (Horizontal Scrollable for Tablet/Mobile touch) */}
        <div className="flex overflow-x-auto no-scrollbar border-t border-slate-800/80 -mx-4 px-4 sm:mx-0 sm:px-0">
          <nav className="flex space-x-1 py-1.5 min-w-max">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-tab-${item.id}`}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm font-semibold'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                  {item.countBadge !== undefined && (
                    <span
                      className={`text-xs px-1.5 py-0.2 rounded-full ${
                        isActive
                          ? 'bg-blue-800 text-blue-100'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {item.countBadge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
};
