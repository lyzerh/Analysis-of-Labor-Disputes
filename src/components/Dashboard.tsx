import React, { useEffect, useState } from 'react';
import {
  FileText,
  Building2,
  Calendar,
  Tag,
  TrendingUp,
  ShieldCheck,
  ArrowRight,
  Upload,
  Search,
  Activity,
  AlertCircle,
  Brain,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import { AnalyticsService } from '../services/analytics/analyticsService';
import { ArbitrationCase } from '../types';
import { NavTab } from './Sidebar';

interface DashboardProps {
  onNavigate: (tab: NavTab, params?: any) => void;
  onSelectCase: (caseItem: ArbitrationCase) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, onSelectCase }) => {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any>(null);
  const [decisionDist, setDecisionDist] = useState<any[]>([]);
  const [yearTrends, setYearTrends] = useState<any[]>([]);
  const [committeeDist, setCommitteeDist] = useState<any[]>([]);
  const [keywords, setKeywords] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ov, dec, yr, com, kw] = await Promise.all([
        AnalyticsService.getDashboardOverview(),
        AnalyticsService.getDecisionDistribution(),
        AnalyticsService.getCasesByYear(),
        AnalyticsService.getCasesByCommittee(),
        AnalyticsService.getKeywordFrequency(),
      ]);
      setOverview(ov);
      setDecisionDist(dec);
      setYearTrends(yr);
      setCommitteeDist(com.slice(0, 6));
      setKeywords(kw.slice(0, 8));
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !overview) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-slate-500">
          <Activity className="w-5 h-5 animate-spin text-blue-600" />
          <span>正在计算本地案例统计指标...</span>
        </div>
      </div>
    );
  }

  const kpis = [
    {
      title: '案例总数',
      value: overview.totalCases,
      unit: '件',
      sub: `原始文书 ${overview.totalDocs} 篇`,
      icon: FileText,
      color: 'blue',
      onClick: () => onNavigate('database'),
    },
    {
      title: '覆盖仲裁委员会',
      value: overview.totalCommittees,
      unit: '家',
      sub: '覆盖深圳各主要辖区',
      icon: Building2,
      color: 'indigo',
      onClick: () => onNavigate('database'),
    },
    {
      title: '文书年份范围',
      value: overview.yearRange,
      unit: '',
      sub: '按裁决生效日期归档',
      icon: Calendar,
      color: 'slate',
      onClick: () => onNavigate('database'),
    },
    {
      title: '最高频争议类型',
      value: overview.topDisputeTag,
      unit: '',
      sub: '企业重点合规防范领域',
      icon: Tag,
      color: 'amber',
      onClick: () => onNavigate('database', { disputeTag: overview.topDisputeTag }),
    },
    {
      title: '用人单位整体胜诉率',
      value: `${overview.companyWinRate}%`,
      unit: '',
      sub: `胜诉 ${overview.companyWinCount} | 败诉 ${overview.companyLossCount} | 部分 ${overview.partialWinCount}`,
      icon: TrendingUp,
      color: 'emerald',
      onClick: () => onNavigate('analytics'),
    },
    {
      title: '平均解析质量评分',
      value: `${overview.avgQualityScore}`,
      unit: '分',
      sub: '本地要素识别率良好',
      icon: ShieldCheck,
      color: 'purple',
      onClick: () => onNavigate('quality'),
    },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-6 shadow-sm border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-2xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-400/30">
              PC桌面端本地分析系统
            </span>
            <span className="text-2xs text-slate-400">深圳市人力资源和社会保障局数据规范</span>
          </div>
          <h2 className="text-xl lg:text-2xl font-bold tracking-tight mt-1.5">
            深圳劳动人事争议仲裁文书本地研究库
          </h2>
          <p className="text-sm text-slate-300 mt-1 max-w-2xl">
            提供离线裁判文书解析、当事人与法条要素结构化提取、多维法务检索、胜诉率与高频争议关键词统计。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            id="btn-dash-analysis"
            onClick={() => onNavigate('localAnalysis')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
          >
            <Brain className="w-4 h-4" />
            本地研判引擎
          </button>
          <button
            id="btn-dash-import"
            onClick={() => onNavigate('import')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            导入新文书
          </button>
          <button
            id="btn-dash-database"
            onClick={() => onNavigate('database')}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg flex items-center gap-2 border border-slate-700 transition-colors"
          >
            <Search className="w-4 h-4" />
            检索案例库
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div
              key={idx}
              onClick={kpi.onClick}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs hover:shadow-md hover:border-slate-300 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">{kpi.title}</span>
                <div className="p-2 rounded-lg bg-slate-50 group-hover:bg-blue-50 text-slate-600 group-hover:text-blue-600 transition-colors">
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-2xl font-bold text-slate-900 font-mono tracking-tight">
                  {kpi.value}
                </span>
                {kpi.unit && <span className="text-xs text-slate-500 font-medium">{kpi.unit}</span>}
              </div>
              <p className="text-xs text-slate-500 mt-1 truncate">{kpi.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Decision Distribution (4 cols) */}
        <div className="lg:col-span-4 bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900">裁决结果倾向分布</h3>
            <button
              onClick={() => onNavigate('analytics')}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-medium"
            >
              详情 <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={decisionDist}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={78}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {decisionDist.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any, name: any) => [`${value} 件`, name]}
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
          <div className="grid grid-cols-2 gap-2 mt-2 pt-3 border-t border-slate-100 text-xs">
            {decisionDist.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-1.5 rounded bg-slate-50 hover:bg-slate-100 cursor-pointer"
                onClick={() => onNavigate('database', { decisionOutcome: item.name })}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-slate-700 truncate">{item.name}</span>
                </div>
                <span className="font-semibold text-slate-900 font-mono">{item.value}件</span>
              </div>
            ))}
          </div>
        </div>

        {/* Year & Committee Trends (8 cols) */}
        <div className="lg:col-span-8 bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900">年度案件数量与胜负变化趋势</h3>
            <span className="text-xs text-slate-400 font-mono">单位: 件</span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={yearTrends} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                <Bar dataKey="win" name="用人单位胜诉" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="partial" name="部分支持" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="loss" name="用人单位败诉" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Keywords & Recent Cases Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Keywords Top 8 (5 cols) */}
        <div className="lg:col-span-5 bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900">高频合规与抗辩关键词</h3>
            <span className="text-xs text-slate-500">点击可下钻检索</span>
          </div>
          <div className="space-y-2">
            {keywords.map((kw, idx) => (
              <div
                key={idx}
                onClick={() => onNavigate('database', { keyword: kw.keyword })}
                className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:border-blue-200 hover:bg-blue-50/50 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-2xs font-bold flex items-center justify-center font-mono">
                    {idx + 1}
                  </span>
                  <span className="text-xs font-semibold text-slate-800">{kw.keyword}</span>
                  <span className="text-2xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                    {kw.category}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden hidden sm:block">
                    <div
                      className="bg-blue-600 h-full rounded-full"
                      style={{ width: `${Math.min(100, kw.percent * 1.5)}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-700">{kw.count} 篇</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Cases (7 cols) */}
        <div className="lg:col-span-7 bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900">最新入库与解析案例</h3>
            <button
              onClick={() => onNavigate('database')}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-medium"
            >
              进入案例库 <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 flex-1">
            {overview.recentCases.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">暂无入库案例</div>
            ) : (
              overview.recentCases.map((c: ArbitrationCase) => (
                <div
                  key={c.id}
                  onClick={() => onSelectCase(c)}
                  className="py-3 px-1 hover:bg-slate-50 rounded-lg flex items-center justify-between gap-3 cursor-pointer transition-colors"
                >
                  <div className="overflow-hidden">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-blue-700 font-mono shrink-0">
                        {c.caseNumber}
                      </span>
                      <span
                        className={`text-2xs px-2 py-0.5 rounded font-medium shrink-0 ${
                          c.decisionOutcome === '用人单位胜诉'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : c.decisionOutcome === '用人单位败诉'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}
                      >
                        {c.decisionOutcome}
                      </span>
                    </div>
                    <p className="text-xs text-slate-800 font-medium truncate mt-0.5">{c.title}</p>
                    <div className="flex items-center gap-2 text-2xs text-slate-400 mt-1">
                      <span>{c.arbitrationCommittee}</span>
                      <span>•</span>
                      <span>{c.publishedDate}</span>
                      {c.disputeTags.length > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-slate-600">#{c.disputeTags[0]}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs font-mono font-bold text-slate-700">
                      {c.parseQuality ? `${c.parseQuality.overall}分` : '已解析'}
                    </span>
                    <div className="text-2xs text-slate-400">质量得分</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
