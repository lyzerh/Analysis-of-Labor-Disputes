import React, { useState, useEffect } from 'react';
import {
  Settings,
  HardDrive,
  Cpu,
  Shield,
  Layers,
  Sparkles,
  WifiOff,
  CheckCircle,
  Database,
  Info,
  BookOpen,
} from 'lucide-react';
import { db } from '../db';

interface SettingsViewProps {
  onNavigateToGuide?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onNavigateToGuide }) => {
  const [storageInfo, setStorageInfo] = useState<{ used: string; quota: string; percent: number }>({
    used: '计算中...',
    quota: '计算中...',
    percent: 0,
  });
  const [counts, setCounts] = useState<{ cases: number; raw: number; tasks: number }>({
    cases: 0,
    raw: 0,
    tasks: 0,
  });

  useEffect(() => {
    loadStorageStats();
  }, []);

  const loadStorageStats = async () => {
    const [c, r, t] = await Promise.all([
      db.arbitrationCases.count(),
      db.rawDocuments.count(),
      db.syncTasks.count(),
    ]);
    setCounts({ cases: c, raw: r, tasks: t });

    if (navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        const usedMb = ((estimate.usage || 0) / (1024 * 1024)).toFixed(2);
        const quotaMb = ((estimate.quota || 0) / (1024 * 1024 * 1024)).toFixed(1);
        const percent = Math.min(
          100,
          Math.round(((estimate.usage || 0) / (estimate.quota || 1)) * 100)
        );
        setStorageInfo({
          used: `${usedMb} MB`,
          quota: `${quotaMb} GB`,
          percent,
        });
      } catch (_) {}
    }
  };

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Settings className="w-5 h-5 text-blue-600" />
          系统环境与运行配置
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          查看本地 IndexedDB 存储资源占用、规则解析引擎运行状态以及离线运行策略。
        </p>
      </div>

      
      {/* User Guide Card */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-5 rounded-xl border border-blue-100 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-blue-200/50">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-600" />
            使用教程
          </h3>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
            提供从案例采集到案例分析的完整使用流程。对于第一次使用系统的用户，建议点击右侧按钮查看，快速了解如何使用各项法务工具。
          </p>
          <button 
            onClick={() => onNavigateToGuide && onNavigateToGuide()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center shrink-0"
          >
            查看教程
          </button>
        </div>
      </div>

      {/* Architecture Card */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-blue-600" />
            技术架构与阶段规范
          </h3>
          <span className="text-2xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-semibold">
            Stage 1 离线极速版
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-700">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <WifiOff className="w-3.5 h-3.5 text-emerald-600" />
              本地数据层 (Local Data Layer)
            </div>
            <p className="text-2xs text-slate-500 leading-relaxed">
              采用 Dexie.js + 浏览器 IndexedDB 存储原始文书与结构化案例，保障企业法务数据绝对私密，不上传任何外部服务器。
            </p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              本地规则解析引擎 (Rule-based Parser)
            </div>
            <p className="text-2xs text-slate-500 leading-relaxed">
              基于深圳各区劳动人事争议裁决文书结构特征定制正则表达式抽取器，支持案号、日期、当事人、查明事实与裁判说理秒级提取。
            </p>
          </div>
        </div>
      </div>

      {/* AI Module Status Card */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-purple-600" />
            AI 法律分析接口状态
          </h3>
          <span className="text-2xs bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded font-mono font-semibold">
            Standby (已就绪/默认关闭)
          </span>
        </div>

        <div className="p-4 bg-purple-50/40 rounded-xl border border-purple-200/60 text-xs text-slate-700 space-y-2">
          <p className="leading-relaxed">
            按照当前阶段明确要求，系统<strong>不调用 Gemini API</strong>、
            <strong>不要求 GEMINI_API_KEY</strong>、<strong>不开启外部分析服务</strong>。
          </p>
          <div className="text-2xs text-slate-500 flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>AI 分析接口已按工厂模式（MockLegalAIService）完成预留，后续升级可随时无缝启用。</span>
          </div>
        </div>
      </div>

      {/* Storage Quota Card */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
            <HardDrive className="w-4 h-4 text-emerald-600" />
            浏览器 IndexedDB 存储资源
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
            <span className="text-2xs text-slate-500">已入库案例数</span>
            <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">{counts.cases} 篇</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
            <span className="text-2xs text-slate-500">原始文书(RawDocument)</span>
            <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">{counts.raw} 篇</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
            <span className="text-2xs text-slate-500">已使用存储空间</span>
            <div className="text-lg font-bold font-mono text-blue-600 mt-0.5">{storageInfo.used}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
