import type { AnalysisCaseRecord, RegionSelectionRule } from '../../types';
import { CityResolver } from '../parser/CityResolver';

const GUANGDONG_CITIES = [
  ['guangzhou', '广州'], ['shenzhen', '深圳'], ['zhuhai', '珠海'], ['shantou', '汕头'],
  ['foshan', '佛山'], ['shaoguan', '韶关'], ['zhanjiang', '湛江'], ['zhaoqing', '肇庆'],
  ['jiangmen', '江门'], ['maoming', '茂名'], ['huizhou', '惠州'], ['meizhou', '梅州'],
  ['shanwei', '汕尾'], ['heyuan', '河源'], ['yangjiang', '阳江'], ['qingyuan', '清远'],
  ['dongguan', '东莞'], ['zhongshan', '中山'], ['chaozhou', '潮州'], ['jieyang', '揭阳'],
  ['yunfu', '云浮'],
] as const;

export const REGION_OPTIONS: RegionSelectionRule[] = [
  ...GUANGDONG_CITIES.map(([slug, city]) => ({
    id: `guangdong-${slug}`,
    label: `${city}市`,
    type: 'city' as const,
    province: '广东省',
    city,
  })),
  { id: 'beijing', label: '北京市', type: 'municipality', province: '北京市', city: '北京' },
  { id: 'shanghai', label: '上海市', type: 'municipality', province: '上海市', city: '上海' },
  { id: 'jiangsu', label: '江苏省（全省）', type: 'province', province: '江苏省' },
];

const REGION_BY_ID = new Map(REGION_OPTIONS.map((option) => [option.id, option]));

function normalizeCity(value?: string | null): string {
  return value?.trim().replace(/市$/, '') ?? '';
}

export function selectedRegionRules(regionIds: string[]): RegionSelectionRule[] {
  const selected = new Set(regionIds);
  return REGION_OPTIONS.filter((option) => selected.has(option.id));
}

export function deriveRegionFilters(regionIds: string[]): {
  provinces: string[];
  cities: string[];
  regions: RegionSelectionRule[];
} {
  const regions = selectedRegionRules(regionIds);
  return {
    provinces: [...new Set(regions.map((region) => region.province))],
    cities: regions.filter((region) => region.type === 'city').map((region) => normalizeCity(region.city)),
    regions,
  };
}

export function matchesRegionSelection(
  item: { city?: string; province?: string; court?: string; caseNumber?: string },
  regions: RegionSelectionRule[],
): boolean {
  if (regions.length === 0) return true;
  const resolved = CityResolver.resolveCity({
    province: item.province,
    court: item.court,
    caseNumber: item.caseNumber,
  });
  const province = resolved.province ?? item.province ?? null;
  const city = normalizeCity(resolved.city ?? item.city);

  return regions.some((region) => {
    if (region.type === 'province') return province === region.province;
    if (region.type === 'municipality') {
      return province === region.province || city === normalizeCity(region.city);
    }
    return city === normalizeCity(region.city)
      && (province === null || province === region.province);
  });
}

export function filterRecordsByRegions(
  records: AnalysisCaseRecord[],
  regionIds: string[],
): AnalysisCaseRecord[] {
  const regions = selectedRegionRules(regionIds);
  return records.filter((record) => matchesRegionSelection(record, regions));
}

export function regionLabel(regionId: string): string {
  return REGION_BY_ID.get(regionId)?.label ?? regionId;
}
