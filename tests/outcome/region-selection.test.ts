import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analysisRecord } from './helpers/record-factories';
import {
  REGION_OPTIONS,
  deriveRegionFilters,
  filterRecordsByRegions,
} from '../../src/services/research/RegionSelection';

describe('research region selection contract', () => {
  it('derives Guangdong province and Guangzhou city eligibility', () => {
    expect(deriveRegionFilters(['guangdong-guangzhou'])).toEqual({
      provinces: ['广东省'],
      cities: ['广州'],
      regions: [expect.objectContaining({ id: 'guangdong-guangzhou', type: 'city' })],
    });
  });

  it('deduplicates Guangdong when several cities are selected', () => {
    expect(deriveRegionFilters(['guangdong-guangzhou', 'guangdong-shenzhen']).provinces).toEqual(['广东省']);
  });

  it('treats Shanghai as a municipality without retaining Guangdong eligibility', () => {
    expect(deriveRegionFilters(['shanghai'])).toMatchObject({ provinces: ['上海市'], cities: [] });
  });

  it('treats Jiangsu as a province-wide selection without a city restriction', () => {
    expect(deriveRegionFilters(['jiangsu'])).toMatchObject({ provinces: ['江苏省'], cities: [] });
  });

  it('matches Guangzhou and Shanghai without admitting unselected Shenzhen', () => {
    const records = [
      analysisRecord('gz', 'supported', { city: '广州', court: '广东省广州市中级人民法院' }),
      analysisRecord('sz', 'supported', { city: '深圳', court: '广东省深圳市中级人民法院' }),
      analysisRecord('sh', 'supported', { city: '上海', court: '上海市第一中级人民法院' }),
    ];
    expect(filterRecordsByRegions(records, ['guangdong-guangzhou', 'shanghai']).map((record) => record.caseId)).toEqual(['gz', 'sh']);
  });

  it('matches Guangzhou plus every Jiangsu city', () => {
    const records = [
      analysisRecord('gz', 'supported', { city: '广州', court: '广东省广州市中级人民法院' }),
      analysisRecord('sz', 'supported', { city: '深圳', court: '广东省深圳市中级人民法院' }),
      analysisRecord('nj', 'supported', { city: '南京', court: '江苏省南京市中级人民法院' }),
      analysisRecord('sz-js', 'supported', { city: '苏州', court: '江苏省苏州市中级人民法院' }),
    ];
    expect(filterRecordsByRegions(records, ['guangdong-guangzhou', 'jiangsu']).map((record) => record.caseId)).toEqual(['gz', 'nj', 'sz-js']);
  });

  it('does not preserve Guangzhou rules after switching to Shanghai', () => {
    expect(deriveRegionFilters(['shanghai']).regions.map((region) => region.id)).toEqual(['shanghai']);
  });

  it('defines empty selection as unrestricted', () => {
    const records = [analysisRecord('gz', 'supported'), analysisRecord('sh', 'supported')];
    expect(filterRecordsByRegions(records, [])).toEqual(records);
  });

  it('contains all 21 Guangdong prefecture-level cities plus Beijing, Shanghai, and Jiangsu', () => {
    expect(REGION_OPTIONS.filter((option) => option.province === '广东省')).toHaveLength(21);
    expect(REGION_OPTIONS.map((option) => option.label)).toEqual(expect.arrayContaining([
      '广州市', '深圳市', '珠海市', '汕头市', '佛山市', '韶关市', '湛江市',
      '肇庆市', '江门市', '茂名市', '惠州市', '梅州市', '汕尾市', '河源市',
      '阳江市', '清远市', '东莞市', '中山市', '潮州市', '揭阳市', '云浮市',
      '北京市', '上海市', '江苏省（全省）',
    ]));
  });

  it('renders a bounded scrollable region list with one combined summary', () => {
    const source = readFileSync(new URL('../../src/components/ResearchWorkspace.tsx', import.meta.url), 'utf8');
    expect(source).toMatch(/地区范围/);
    expect(source).toMatch(/h-64 overflow-y-auto/);
    expect(source).toMatch(/已选择 \{snapshotRegionIds\.length\} 个地区/);
    expect(source).not.toMatch(/snapshotProvinces|snapshotCities/);
  });
});
