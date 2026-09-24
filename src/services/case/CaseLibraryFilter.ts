import type { AnalysisCaseRecord } from '../../types';
import { filterRecordsByRegions } from '../research/RegionSelection';

export type CanonicalCaseLevel = 'first' | 'second' | 'retrial' | 'unknown';

export interface CaseLibraryFilters {
  city?: string | string[];
  year?: string | number | null;
  caseLevel?: string | string[] | null;
  dispute?: string;
  keyword?: string;
  regionIds?: string[];
}

export function normalizeYearFilter(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? value : null;
  if (typeof value !== 'string' || value === 'all' || !/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  return Number.isInteger(year) && year > 0 ? year : null;
}

export function normalizeCaseLevel(value: unknown): CanonicalCaseLevel {
  if (typeof value !== 'string') return 'unknown';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'first' || /一审|初裁|仲裁/.test(normalized)) return 'first';
  if (normalized === 'second' || /二审/.test(normalized)) return 'second';
  if (normalized === 'retrial' || /再审/.test(normalized)) return 'retrial';
  return 'unknown';
}

function normalizeCaseLevelFilter(value: unknown): Exclude<CanonicalCaseLevel, 'unknown'> | null {
  if (value === 'all' || value === null || value === undefined || value === '') return null;
  const normalized = normalizeCaseLevel(value);
  return normalized === 'unknown' ? null : normalized;
}

function normalizeFilterValues(value: string | string[] | null | undefined): string[] {
  if (value === null || value === undefined || value === '' || value === 'all') return [];
  return Array.isArray(value) ? value.filter((item) => item && item !== 'all') : [value];
}

/**
 * Build the dispute-type selector from the records actually loaded into the
 * case library. Older records used `disputeTypes`; current records use the
 * canonical `disputeType` array. Empty values are ignored and labels are
 * de-duplicated without changing the stored record.
 */
export function getAvailableDisputeTypes(records: AnalysisCaseRecord[]): string[] {
  const available = new Set<string>();
  records.forEach((record) => {
    const legacyRecord = record as AnalysisCaseRecord & { disputeTypes?: string[] };
    const values = Array.isArray(record.disputeType) && record.disputeType.length > 0
      ? record.disputeType
      : legacyRecord.disputeTypes;
    (values ?? []).forEach((value) => {
      if (typeof value === 'string' && value.trim()) available.add(value.trim());
    });
  });
  return Array.from(available).sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

export function filterAnalysisCaseRecords(
  records: AnalysisCaseRecord[],
  filters: CaseLibraryFilters,
): AnalysisCaseRecord[] {
  const year = normalizeYearFilter(filters.year);
  const cities = new Set(normalizeFilterValues(filters.city));
  const caseLevels = new Set(
    normalizeFilterValues(filters.caseLevel)
      .map(normalizeCaseLevelFilter)
      .filter((value): value is Exclude<CanonicalCaseLevel, 'unknown'> => value !== null),
  );
  const keyword = filters.keyword?.trim().toLowerCase() || '';

  const regionFilteredRecords = filters.regionIds
    ? filterRecordsByRegions(records, filters.regionIds)
    : records;

  return regionFilteredRecords.filter((record) => {
    const legacyRecord = record as AnalysisCaseRecord & { caseNumber?: string; disputeTypes?: string[] };
    const disputeTypes = Array.isArray(record.disputeType) && record.disputeType.length > 0
      ? record.disputeType
      : (legacyRecord.disputeTypes || []);
    const partyNames = [
      record.employeeParty,
      record.employerParty,
      ...(record.parties || []).map((party) => party.name),
    ].filter((name): name is string => Boolean(name));
    if (cities.size > 0 && !cities.has(record.city)) return false;
    if (year !== null && record.year !== year) return false;
    if (caseLevels.size > 0 && !caseLevels.has(normalizeCaseLevel(record.caseLevel) as Exclude<CanonicalCaseLevel, 'unknown'>)) return false;
    if (filters.dispute && filters.dispute !== 'all' && !disputeTypes.includes(filters.dispute)) return false;
    if (keyword
      && !legacyRecord.caseNumber?.toLowerCase().includes(keyword)
      && !record.title?.toLowerCase().includes(keyword)
      && !record.court?.toLowerCase().includes(keyword)
      && !record.caseId.toLowerCase().includes(keyword)
      && !partyNames.some((name) => name.toLowerCase().includes(keyword))) return false;
    return true;
  });
}
