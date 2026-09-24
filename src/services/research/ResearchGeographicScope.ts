import type { CandidateMetadata } from '../../types';
import { CityResolver } from '../parser/CityResolver';

export type ResearchGeographicScopeMode = 'all' | 'province' | 'pearl_river_delta' | 'custom_cities';

export interface ResearchGeographicScope {
  mode: ResearchGeographicScopeMode;
  provinces?: string[];
  cities?: string[];
}

export const PEARL_RIVER_DELTA_CITIES = [
  '广州', '深圳', '珠海', '佛山', '惠州', '东莞', '中山', '江门', '肇庆',
] as const;

export interface ResearchGeographicOptions {
  provinces: string[];
  cities: string[];
  cityCounts: Record<string, number>;
  provinceCounts: Record<string, number>;
}

type GeographicRecord = {
  city?: string | null;
  court?: string | null;
  caseNumber?: string | null;
  province?: string;
};

export function normalizeResearchCity(value?: string | null): string {
  return value?.trim().replace(/市$/, '') ?? '';
}

export function normalizeResearchProvince(value?: string | null): string {
  return value?.trim() ?? '';
}

export function normalizeResearchGeographicScope(scope?: ResearchGeographicScope): ResearchGeographicScope | undefined {
  if (!scope) return undefined;
  if (scope.mode === 'all') return { mode: 'all' };
  const provinces = [...new Set((scope.provinces ?? []).map(normalizeResearchProvince).filter(Boolean))].sort();
  const cities = [...new Set((scope.cities ?? []).map(normalizeResearchCity).filter(Boolean))].sort();
  if (scope.mode === 'province') return { mode: 'province', ...(provinces.length ? { provinces } : {}) };
  if (scope.mode === 'custom_cities') return { mode: 'custom_cities', ...(cities.length ? { cities } : {}) };
  return { mode: 'pearl_river_delta' };
}

export function resolveResearchGeography(item: GeographicRecord): { province: string; city: string } {
  const resolved = CityResolver.resolveCity({
    province: item.province,
    court: item.court,
    caseNumber: item.caseNumber,
  });
  return {
    province: normalizeResearchProvince(resolved.province ?? item.province),
    city: normalizeResearchCity(resolved.city ?? item.city),
  };
}

export function matchesResearchGeographicScope(item: GeographicRecord, scope?: ResearchGeographicScope): boolean {
  const normalized = normalizeResearchGeographicScope(scope);
  if (!normalized || normalized.mode === 'all') return true;
  const { province, city } = resolveResearchGeography(item);
  if (normalized.mode === 'province') {
    return Boolean(province) && (normalized.provinces ?? []).includes(province);
  }
  if (normalized.mode === 'pearl_river_delta') {
    return PEARL_RIVER_DELTA_CITIES.includes(city as (typeof PEARL_RIVER_DELTA_CITIES)[number])
      && (!province || province === '广东省');
  }
  return Boolean(city) && (normalized.cities ?? []).includes(city);
}

export function filterRecordsByResearchGeographicScope<T extends GeographicRecord>(
  records: T[],
  scope?: ResearchGeographicScope,
): T[] {
  return records.filter((record) => matchesResearchGeographicScope(record, scope));
}

export function getResearchGeographicOptions(records: GeographicRecord[]): ResearchGeographicOptions {
  const provinces = new Set<string>();
  const cities = new Set<string>();
  const cityCounts: Record<string, number> = {};
  const provinceCounts: Record<string, number> = {};
  for (const record of records) {
    const { province, city } = resolveResearchGeography(record);
    if (province) {
      provinces.add(province);
      provinceCounts[province] = (provinceCounts[province] ?? 0) + 1;
    }
    if (city) {
      cities.add(city);
      cityCounts[city] = (cityCounts[city] ?? 0) + 1;
    }
  }
  return {
    provinces: [...provinces].sort(),
    cities: [...cities].sort(),
    cityCounts,
    provinceCounts,
  };
}

export function geographicScopeLabel(scope?: ResearchGeographicScope): string {
  const normalized = normalizeResearchGeographicScope(scope);
  if (!normalized || normalized.mode === 'all') return '全部已采集地区';
  if (normalized.mode === 'province') return normalized.provinces?.join('、') || '按省份（未选择）';
  if (normalized.mode === 'pearl_river_delta') return '珠三角（9市）';
  return normalized.cities?.join('、') || '自定义城市（未选择）';
}

export function candidateGeographicScope(candidate: CandidateMetadata): GeographicRecord {
  return candidate;
}
