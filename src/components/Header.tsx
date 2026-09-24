import React, { useEffect, useState } from 'react';
import { Menu, Database, Clock } from 'lucide-react';

interface HeaderProps {
  caseCount: number;
  totalDocs: number;
  onOpenMobileMenu: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  caseCount,
  totalDocs,
  onOpenMobileMenu,
}) => {
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleDateString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          weekday: 'short',
        }) +
          ' ' +
          now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 30000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="lawlens-global-header h-16 px-4 lg:px-8 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center flex-1">
        <button
          id="btn-mobile-menu"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
          aria-label="打开菜单"
        >
          <Menu className="w-5 h-5" />
        </button>

      </div>

      {/* Right utility cluster */}
      <div className="flex items-center gap-4 lg:gap-6 shrink-0">
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
          <Database className="w-3.5 h-3.5 text-blue-600" />
          <span>库内案例：</span>
          <span className="font-semibold text-slate-900 font-mono">{caseCount}</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-500">原始文书：{totalDocs}</span>
        </div>

        <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-mono">{currentTime}</span>
        </div>

      </div>
    </header>
  );
};
