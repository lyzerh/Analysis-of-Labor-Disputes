import React, { useState, useEffect } from 'react';
import {
  CheckCircle,
  AlertTriangle,
  FileWarning,
  RefreshCw,
  Trash2,
  ExternalLink,
  RotateCcw,
  Scale,
  Sparkles,
  Layers,
} from 'lucide-react';
import { AnalyticsService } from '../services/analytics/analyticsService';
import { DataService } from '../services/data/dataService';
import { ArbitrationCase } from '../types';

interface DataQualityProps {
  onSelectCase: (c: ArbitrationCase) => void;
  onRefresh?: () => void;
}

export const DataQuality: React.FC<DataQualityProps> = ({ onSelectCase, onRefresh }) => {
  const [loading, setLoading] = useState(true);
  const [qualityStats, setQualityStats] = useState<any>(null);
  const [reparsing, setReparsing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadQualityData();
  }, []);

  const loadQualityData = async () => {
    setLoading(true);
    try {
      const stats = await AnalyticsService.getDataQualityStats();
      setQualityStats(stats);
    } catch (err) {
      console.error('Failed to load quality stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReparseAll = async () => {
    setReparsing(true);
    setMessage('正在按最新规则对全库原始文书进行全量重新解析...');
    try {
      const count = await DataService.reparseAllCases();
      setMessage(`全库 ${count} 份裁决文书全量重解析完毕！`);
      await loadQualityData();
      onRefresh?.();
    } catch (err: any) {
      setMessage(`重解析出错: ${err.message}`);
    } finally {
      setReparsing(false);
    }
  };

  if (loading || !qualityStats) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-2 text-slate-500 text-xs">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
          <span>正在诊断本地数据库文书质量...</span>
        </div>
      </div>
    );
  }

  const fields = [
    { label: '案号准确抽取率', rate: qualityStats.fieldAccuracy.caseNumber },
    { label: '裁决生效日期识别率', rate: qualityStats.fieldAccuracy.date },
    { label: '当事人信息抽取率', rate: qualityStats.fieldAccuracy.parties },
    { label: '仲裁请求识别率', rate: qualityStats.fieldAccuracy.claims },
    { label: '经审理查明事实提取率', rate: qualityStats.fieldAccuracy.facts },
    { label: '仲裁庭核心说理提取率', rate: qualityStats.fieldAccuracy.reasoning },
    { label: '裁决结果主文提取率', rate: qualityStats.fieldAccuracy.decision },
  ];

  return (
    <div className="min-h-full bg-slate-50/80 p-6 lg:p-8 max-w-6xl mx-auto space-y-8" data-testid="data-quality-view">
      {/* Page Header */}
      <div className="bg-white/80 backdrop-blur-xl border border-white/80 rounded-[28px] p-7 shadow-[0_12px_40px_rgba(15,23,42,0.06)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            数据质量
          </h2>
          <p className="text-sm text-slate-500 mt-2 max-w-2xl leading-6">
            监控裁决文书结构化要素提取完整度、识别低质/残缺案例、清理重复件并支持全库一键重新解析。
          </p>
        </div>

        <button
          id="btn-reparse-all"
          disabled={reparsing}
          onClick={handleReparseAll}
          className="lawlens-primary-button px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-1.5 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${reparsing ? 'animate-spin' : ''}`} />
          全库一键重解析
        </button>
      </div>

      {message && (
        <div className="p-3 bg-purple-50 border border-purple-200 text-purple-900 rounded-xl text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-purple-600 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white/80 border border-white/80 p-5 rounded-2xl shadow-sm">
          <span className="text-2xs text-slate-500 font-medium">文书总数</span>
          <div className="text-xl font-bold text-slate-900 font-mono mt-1">
            {qualityStats.totalDocs}
          </div>
        </div>

        <div className="bg-emerald-50/70 border border-emerald-100 p-5 rounded-2xl shadow-sm">
          <span className="text-2xs text-emerald-600 font-medium">高质量 (80分+)</span>
          <div className="text-xl font-bold text-emerald-600 font-mono mt-1">
            {qualityStats.perfectCases}
          </div>
        </div>

        <div className="bg-amber-50/70 border border-amber-100 p-5 rounded-2xl shadow-sm">
          <span className="text-2xs text-amber-600 font-medium">标准质量 (60-79)</span>
          <div className="text-xl font-bold text-amber-600 font-mono mt-1">
            {qualityStats.partialCases}
          </div>
        </div>

        <div className="bg-rose-50/70 border border-rose-100 p-5 rounded-2xl shadow-sm">
          <span className="text-2xs text-rose-600 font-medium">需补充 (&lt;60分)</span>
          <div className="text-xl font-bold text-rose-600 font-mono mt-1">
            {qualityStats.failedCases}
          </div>
        </div>

        <div className="bg-white/80 border border-white/80 p-5 rounded-2xl shadow-sm">
          <span className="text-2xs text-slate-500 font-medium">内容重复件</span>
          <div className="text-xl font-bold text-slate-700 font-mono mt-1">
            {qualityStats.duplicateDocs}
          </div>
        </div>

        <div className="bg-white/80 border border-white/80 p-5 rounded-2xl shadow-sm">
          <span className="text-2xs text-slate-500 font-medium">超短/空文书</span>
          <div className="text-xl font-bold text-slate-700 font-mono mt-1">
            {qualityStats.emptyDocs}
          </div>
        </div>
      </div>

      {/* Field Recognition Quality Bars */}
      <div className="bg-white/80 backdrop-blur-xl p-6 rounded-[24px] border border-white/80 shadow-[0_12px_40px_rgba(15,23,42,0.05)] space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h3 className="text-xs font-bold text-slate-900">核心法律事实与要素本地识别率</h3>
          <details className="text-2xs text-slate-400"><summary className="cursor-pointer">技术详情</summary><div className="mt-1 font-mono">基于深圳仲裁文书正则表达式规则引擎</div></details>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields.map((f, idx) => (
            <div key={idx} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">{f.label}</span>
                <span className="font-mono font-bold text-slate-900">{f.rate}%</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    f.rate >= 90
                      ? 'bg-emerald-500'
                      : f.rate >= 70
                      ? 'bg-blue-500'
                      : f.rate >= 50
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                  }`}
                  style={{ width: `${f.rate}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Issue Document Breakdown List */}
      <div className="bg-white/80 backdrop-blur-xl p-6 rounded-[24px] border border-white/80 shadow-[0_12px_40px_rgba(15,23,42,0.05)] space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h3 className="text-xs font-bold text-slate-900">
            低得分 / 待复核案例清单 ({qualityStats.issues.length} 个案例)
          </h3>
          <span className="text-2xs text-slate-500">点击可查看原文比对或重解析</span>
        </div>

        {qualityStats.issues.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            🎉 当前库内所有案例要素提取评分均在 80 分以上，数据质量极佳！
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {qualityStats.issues.map((item: any) => (
              <div
                key={item.case.id}
                onClick={() => onSelectCase(item.case)}
                className="py-3 flex items-center justify-between gap-3 text-xs hover:bg-slate-50 rounded-lg px-2 cursor-pointer transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-blue-700 font-mono">
                      {item.case.caseNumber}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-2xs font-mono font-bold bg-rose-50 text-rose-700 border border-rose-200">
                      {item.score}分
                    </span>
                  </div>
                  <p className="text-2xs text-slate-700 truncate mt-0.5">{item.case.title}</p>
                  {item.unrecognized.length > 0 && (
                    <div className="text-2xs text-amber-700 mt-1">
                      缺失要素: {item.unrecognized.join('、')}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-2xs text-slate-400">{item.case.arbitrationCommittee}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
