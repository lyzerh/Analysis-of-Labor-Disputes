import { normalizeCaseLevel } from '../case/CaseLibraryFilter';

const UNKNOWN_VALUES = new Set(['', '-', '未知', '未识别', '未载明案号', '未载明日期']);
const INVALID_PARTY_FRAGMENTS = /^(?:为其成员|系.+|依法.+|应当.+|可以.+|不得.+)$/;

function hasValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function formatCaseNumber(value: string | null | undefined): string {
  const normalized = value?.trim() || '';
  return UNKNOWN_VALUES.has(normalized) ? '未识别' : normalized;
}

export function formatCaseDate(value: string | null | undefined): string {
  const normalized = value?.trim() || '';
  return hasValidCalendarDate(normalized) ? normalized : '未识别';
}

export function formatCaseLevel(value: string | null | undefined): string {
  const labels = {
    first: '一审/初裁',
    second: '二审',
    retrial: '再审',
    unknown: '未识别',
  } as const;
  return labels[normalizeCaseLevel(value)];
}

export function formatPartyName(value: string | null | undefined): string {
  const normalized = value?.trim() || '';
  if (UNKNOWN_VALUES.has(normalized) || INVALID_PARTY_FRAGMENTS.test(normalized)) return '未识别';
  return normalized;
}
