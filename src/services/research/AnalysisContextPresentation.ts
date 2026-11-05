import type { AnalysisRun } from '../../types';

/** Keep research identifiers useful for debugging without letting UUIDs dominate the UI. */
export function shortResearchId(value: string | undefined | null): string {
  if (!value) return '—';
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

