import React, { useState, useEffect } from 'react';
import {
  HardDrive,
  Cpu,
  Shield,
  Layers,
  Sparkles,
  WifiOff,
  CheckCircle,
  Info,
  BookOpen,
  Trash2,
  Loader2,
} from 'lucide-react';
import { db } from '../db';
import {
  getConfiguredLlmProvider,
  testConfiguredLlmConnection,
  type LlmConnectionStatus,
} from '../services/semantic/LlmRuntimeProvider';
import { useLlmRuntimeSettings } from '../services/semantic/LlmRuntimeSettings';

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
  const { settings, setSettings, clearSettings } = useLlmRuntimeSettings();
  const [connectionStatus, setConnectionStatus] = useState<LlmConnectionStatus>('unknown');
  const provider = getConfiguredLlmProvider();

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

  const connectionStatusLabels: Record<LlmConnectionStatus, string> = {
    unknown: '尚未测试',
    testing: '测试连接中…',
    available: '连接成功',
    invalid_key: '连接失败：API Key 无效或无权限',
    permission: '连接失败：API Key 无权限',
    model_unavailable: '连接失败：当前模型不可用',
    rate_limited: '连接失败：额度不足或已限流',
    provider_unavailable: '连接失败：xAI 服务暂时不可用',
    network_error: '连接失败：网络错误',
    timeout: '连接失败：请求超时',
    output_truncated: '连接失败：模型输出被截断，请重试',
    unknown_error: '连接失败：未知连接错误',
  };
  const connectionStatusText = connectionStatus === 'available'
    ? `连接成功｜服务：${provider.providerLabel}｜模型：${provider.model}`
    : connectionStatusLabels[connectionStatus];

  const handleTestConnection = async () => {
    if (!settings.apiKey?.trim()) {
      setConnectionStatus('invalid_key');
      return;
    }
    setConnectionStatus('testing');
    setConnectionStatus(await testConfiguredLlmConnection());
  };

  const persistApiKeyInput = (value: string) => {
    setSettings({ ...settings, apiKey: value || null });
    setConnectionStatus('unknown');
  };

  const handleClearKey = () => {
    clearSettings();
    setConnectionStatus('unknown');
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-xl border border-white/80 rounded-[28px] p-7 shadow-[0_12px_40px_rgba(15,23,42,0.05)]">
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
          设置
        </h2>
        <p className="text-sm text-slate-500 mt-2">
          查看本地 IndexedDB 存储资源占用、规则解析引擎运行状态以及离线运行策略。
        </p>
      </div>

      
      {/* User Guide Card */}
      <div className="bg-white/80 border border-white/80 p-6 rounded-[24px] shadow-sm space-y-4">
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
            className="lawlens-primary-button px-4 py-2 text-xs font-semibold rounded-lg flex items-center justify-center shrink-0"
          >
            查看教程
          </button>
        </div>
      </div>

      {/* Architecture Card */}
      <div className="bg-white/80 border border-white/80 p-6 rounded-[24px] shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-blue-600" />
            数据处理与 AI 设置
          </h3>
          <span className="text-2xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-semibold">
            本地数据与可选 AI
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-700">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <WifiOff className="w-3.5 h-3.5 text-emerald-600" />
              本地数据存储
            </div>
            <p className="text-2xs text-slate-500 leading-relaxed">
              原始文书与结构化案例默认保存在浏览器 IndexedDB。本地规则解析与统计可在本机执行；启用 AI 语义分析后，相关文本会按配置发送至所选 AI 服务。
            </p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              本地规则解析
            </div>
            <p className="text-2xs text-slate-500 leading-relaxed">
              基于深圳各区劳动人事争议裁决文书结构特征定制正则表达式抽取器，支持案号、日期、当事人、查明事实与裁判说理秒级提取。
            </p>
          </div>
        </div>
      </div>

      {/* BYOK AI Runtime Card */}
      <div className="bg-white/80 border border-white/80 p-6 rounded-[24px] shadow-sm space-y-4" data-testid="llm-runtime-settings">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-purple-600" />
            AI 语义分析
          </h3>
          <div className="flex items-center gap-1.5">
            <span className="text-2xs bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded font-semibold">{provider.providerLabel}</span>
            <span className={`text-2xs px-2 py-0.5 rounded font-semibold ${settings.enabled && settings.apiKey ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
              {settings.enabled && settings.apiKey ? '已启用' : '未启用'}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-purple-200/60 bg-purple-50/40 p-4 text-xs text-slate-700 space-y-3">
          <p className="leading-relaxed">使用您自己的 xAI API Key 启用复杂语义分析。密钥仅保存在当前浏览器会话中，并直接用于调用 xAI API；浏览器端 BYOK 不代表绝对安全，请仅使用您愿意在本机浏览器中使用的 Key。</p>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-white/80 bg-white/70 px-3 py-2">
            <span className="font-semibold text-slate-800">启用 AI 语义分析</span>
            <input
              type="checkbox"
              aria-label="启用 AI 语义分析"
              checked={settings.enabled}
              onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })}
              className="h-4 w-4 accent-indigo-600"
            />
          </label>
          <div>
            <label htmlFor="ai-api-key" className="font-semibold text-slate-800">xAI API Key</label>
            <input
              id="ai-api-key"
              type="password"
              autoComplete="off"
              value={settings.apiKey || ''}
              onChange={(event) => persistApiKeyInput(event.target.value)}
              onBlur={(event) => persistApiKeyInput(event.currentTarget.value)}
              placeholder="输入您的 xAI API Key"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={handleTestConnection} disabled={!settings.apiKey || connectionStatus === 'testing'} className="lawlens-primary-button inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed">
              {connectionStatus === 'testing' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}测试连接
            </button>
            <button type="button" onClick={handleClearKey} disabled={!settings.apiKey} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
              <Trash2 className="h-3.5 w-3.5" />清除 Key
            </button>
            <span role="status" className={`text-xs ${connectionStatus === 'available' ? 'text-emerald-700' : connectionStatus === 'unknown' ? 'text-slate-500' : 'text-amber-700'}`}>
              {connectionStatusText}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-2xs text-slate-500">
            <CheckCircle className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <span>服务提供商：{provider.providerLabel}｜当前模型：{provider.modelLabel}（{provider.model}）</span>
          </div>
        </div>
      </div>

      {/* Storage Quota Card */}
      <div className="bg-white/80 border border-white/80 p-6 rounded-[24px] shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
            <HardDrive className="w-4 h-4 text-emerald-600" />
            浏览器 IndexedDB 存储资源
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
            <span className="text-2xs text-slate-500">已入库案例数</span>
            <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">{counts.cases} 个案例</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
            <span className="text-2xs text-slate-500">原始文书(RawDocument)</span>
            <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">{counts.raw} 份文书</div>
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
