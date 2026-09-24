import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  PieChart as PieIcon,
  Tag,
  Building2,
  BookOpen,
  ArrowRight,
  RefreshCw,
  Scale,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { AnalyticsService } from '../services/analytics/analyticsService';
import { NavTab } from './Sidebar';

interface AnalyticsViewProps {
  onDrilldown: (tab: NavTab, params: any) => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ onDrilldown }) => {
  const [loading, setLoading] = useState(true);
  const [yearTrends, setYearTrends] = useState<any[]>([]);
  const [committeeDist, setCommitteeDist] = useState<any[]>([]);
  const [tagDist, setTagDist] = useState<any[]>([]);
  const [decisionDist, setDecisionDist] = useState<any[]>([]);
  const [keywords, setKeywords] = useState<any[]>([]);
  const [laws, setLaws] = useState<any[]>([]);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const [yr, com, tag, dec, kw, lw] = await Promise.all([
        AnalyticsService.getCasesByYear(),
        AnalyticsService.getCasesByCommittee(),
        AnalyticsService.getDisputeTagDistribution(),
        AnalyticsService.getDecisionDistribution(),
        AnalyticsService.getKeywordFrequency(),
        AnalyticsService.getLegalBasisFrequency(),
      ]);
      setYearTrends(yr);
      setCommitteeDist(com);
      setTagDist(tag);
      setDecisionDist(dec);
      setKeywords(kw);
      setLaws(lw.slice(0, 10));
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-2 text-slate-500 text-xs">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
          <span>正在计算全库法务统计图表...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50/80 p-6 lg:p-8 max-w-7xl mx-auto space-y-8" data-testid="analytics-view">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-xl border border-white/80 rounded-[28px] p-7 shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            基础统计分析
          </h2>
          <p className="text-sm text-slate-500 mt-2 max-w-2xl leading-6">
            聚合深圳各区劳动人事争议仲裁裁决倾向、年度案件趋势、高频抗辩要点与法条援引排行榜，支持点击图表项下钻检索。
          </p>
        </div>
      </div>

      {/* Row 1: Year Trends + Decision Outcomes */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Year Trends (7 cols) */}
        <div className="lg:col-span-7 bg-white/80 backdrop-blur-xl p-6 rounded-[24px] border border-white/80 shadow-[0_12px_40px_rgba(15,23,42,0.05)] flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              年度仲裁结果分布趋势
            </h3>
            <span className="text-2xs text-slate-400 font-mono">单位：个案例</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={yearTrends} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
                <Bar dataKey="win" name="用人单位结果偏有利" fill="#10b981" radius={[3, 3, 0, 0]} />
                <Bar dataKey="partial" name="部分支持" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="loss" name="用人单位结果偏不利" fill="#ef4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Decision Breakdown (5 cols) */}
        <div className="lg:col-span-5 bg-white/80 backdrop-blur-xl p-6 rounded-[24px] border border-white/80 shadow-[0_12px_40px_rgba(15,23,42,0.05)] flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <PieIcon className="w-4 h-4 text-emerald-600" />
              用人单位结果分布与裁判倾向
            </h3>
          </div>

          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={decisionDist}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {decisionDist.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: any, name: any) => [`${val} 个案例`, name]}
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-100 text-xs">
            {decisionDist.map((item, idx) => (
              <button
                key={idx}
                onClick={() => onDrilldown('database', { decisionOutcome: item.name })}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-blue-50/50 border border-slate-100 text-left transition-colors"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-slate-700 truncate">{item.name}</span>
                </div>
                <span className="font-bold text-slate-900 font-mono text-2xs">{item.value} 个案例</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Committees Distribution + Dispute Tags */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Committee Distribution (6 cols) */}
        <div className="lg:col-span-6 bg-white/80 backdrop-blur-xl p-6 rounded-[24px] border border-white/80 shadow-[0_12px_40px_rgba(15,23,42,0.05)] flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-indigo-600" />
              各区仲裁委案例量与结果偏有利比例
            </h3>
            <span className="text-2xs text-slate-400">点击下钻</span>
          </div>

          <div className="space-y-2.5 overflow-y-auto max-h-72">
            {committeeDist.map((com, idx) => (
              <div
                key={idx}
                onClick={() => onDrilldown('database', { committee: com.committee })}
                className="p-2.5 rounded-lg border border-slate-100 hover:border-blue-300 hover:bg-blue-50/40 transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-slate-800">{com.committee}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-2xs text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                      结果偏有利比例: {com.winRate}%
                    </span>
                    <span className="font-mono font-bold text-slate-700">{com.count} 个案例</span>
                  </div>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden flex">
                  <div className="bg-emerald-500 h-full" style={{ width: `${(com.win / (com.count || 1)) * 100}%` }} />
                  <div className="bg-blue-500 h-full" style={{ width: `${(com.partial / (com.count || 1)) * 100}%` }} />
                  <div className="bg-rose-500 h-full" style={{ width: `${(com.loss / (com.count || 1)) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Dispute Tag Frequency (6 cols) */}
        <div className="lg:col-span-6 bg-white/80 backdrop-blur-xl p-6 rounded-[24px] border border-white/80 shadow-[0_12px_40px_rgba(15,23,42,0.05)] flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Tag className="w-4 h-4 text-amber-600" />
              争议焦点类型分布
            </h3>
            <span className="text-2xs text-slate-400">点击下钻</span>
          </div>

          <div className="space-y-2 overflow-y-auto max-h-72">
            {tagDist.map((t, idx) => (
              <div
                key={idx}
                onClick={() => onDrilldown('database', { disputeTag: t.tag })}
                className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:border-amber-300 hover:bg-amber-50/40 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-800 text-2xs font-bold flex items-center justify-center font-mono">
                    {idx + 1}
                  </span>
                  <span className="text-xs font-semibold text-slate-800">{t.tag}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-24 bg-slate-100 h-1.5 rounded-full overflow-hidden hidden sm:block">
                    <div className="bg-amber-500 h-full rounded-full" style={{ width: `${t.percent}%` }} />
                  </div>
                   <span className="text-xs font-mono font-bold text-slate-900">{t.count} 个案例涉及</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3: Keywords & Legal Basis Citations */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Keywords Top 14 (6 cols) */}
        <div className="lg:col-span-6 bg-white/80 backdrop-blur-xl p-6 rounded-[24px] border border-white/80 shadow-[0_12px_40px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-slate-900">核心合规抗辩关键词排行榜</h3>
            <span className="text-2xs text-slate-400">点击关键词直接精准筛选</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {keywords.slice(0, 14).map((kw, idx) => (
              <button
                key={idx}
                onClick={() => onDrilldown('database', { keyword: kw.keyword })}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-blue-50 border border-slate-100 hover:border-blue-200 text-left transition-all"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span className="text-2xs font-mono text-slate-400 font-bold">#{idx + 1}</span>
                  <span className="text-xs font-bold text-slate-800 truncate">{kw.keyword}</span>
                </div>
                <span className="text-2xs font-mono font-semibold text-blue-600 shrink-0">
                   {kw.count} 个案例
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Legal Basis Citations (6 cols) */}
        <div className="lg:col-span-6 bg-white/80 backdrop-blur-xl p-6 rounded-[24px] border border-white/80 shadow-[0_12px_40px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-emerald-600" />
              仲裁裁判高频援引法律法规
            </h3>
            <span className="text-2xs text-slate-400">点击下钻</span>
          </div>

          <div className="space-y-2">
            {laws.map((lw, idx) => (
              <button
                key={idx}
                onClick={() => onDrilldown('database', { keyword: lw.law })}
                className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-emerald-50 border border-slate-100 hover:border-emerald-200 text-left transition-all"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-800 text-2xs font-bold flex items-center justify-center font-mono shrink-0">
                    {idx + 1}
                  </span>
                  <span className="text-xs font-semibold text-slate-800 truncate">{lw.law}</span>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-700 shrink-0 ml-2">
                  {lw.count} 次
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
