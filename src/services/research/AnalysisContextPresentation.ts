import type { AnalysisMode, AnalysisRun, AnalysisRunStatus } from '../../types';

/** Keep research identifiers useful for debugging without letting UUIDs dominate the UI. */
export function shortResearchId(value: string | undefined | null): string {
  if (!value) return '—';
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

export function researchModeLabel(mode: AnalysisMode | undefined): string {
  if (mode === 'exhaustive') return '全量';
  if (mode === 'sampled') return '抽样';
  return '未选择';
}

export function researchStatusLabel(status: AnalysisRunStatus | undefined): string {
  if (status === 'pending') return '待运行';
  if (status === 'running') return '运行中';
  if (status === 'completed') return '已完成';
  if (status === 'failed') return '失败';
  return '未加载';
}

