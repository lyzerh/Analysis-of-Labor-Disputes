import React, { useEffect, useState } from 'react';
import { Menu, Database, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { changeLocale } from '../i18n';
import type { SupportedLocale } from '../i18n/locales';

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
  const { t, i18n } = useTranslation();
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'zh-CN', {
          month: '2-digit',
          day: '2-digit',
          weekday: 'short',
        }) +
          ' ' +
          now.toLocaleTimeString(i18n.language === 'en' ? 'en-US' : 'zh-CN', { hour: '2-digit', minute: '2-digit' })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 30000);
    return () => clearInterval(timer);
  }, [i18n.language]);

  return (
    <header className="lawlens-global-header h-16 px-4 lg:px-8 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center flex-1">
        <button
          id="btn-mobile-menu"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
          aria-label={t('finalUi.header.openMenu')}
        >
          <Menu className="w-5 h-5" />
        </button>

      </div>

      {/* Right utility cluster */}
      <div className="flex items-center gap-4 lg:gap-6 shrink-0">
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <span className="sr-only">{t('language.label')}</span>
          <select aria-label={t('language.label')} value={i18n.language} onChange={(event) => void changeLocale(event.target.value as SupportedLocale)} className="bg-transparent border border-slate-200 rounded-md px-2 py-1.5">
            <option value="zh-CN">{t('language.chinese')}</option>
            <option value="en">{t('language.english')}</option>
          </select>
        </label>
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
          <Database className="w-3.5 h-3.5 text-blue-600" />
          <span>{t('finalUi.header.casesInLibrary')}</span>
          <span className="font-semibold text-slate-900 font-mono">{caseCount}</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-500">{t('finalUi.header.rawDocuments', { count: totalDocs })}</span>
        </div>

        <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-mono">{currentTime}</span>
        </div>

      </div>
    </header>
  );
};
