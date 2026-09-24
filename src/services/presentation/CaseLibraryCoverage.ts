import type { AnalysisCaseRecord } from '../../types';
import { normalizeResearchCity } from '../research/ResearchGeographicScope';

export interface CaseLibraryCoverage {
  total: number;
  yearLabel: string;
  cityCount: number;
}

/**
 * Builds the case-library-wide coverage summary. This intentionally accepts
 * the unfiltered library records so the summary does not change when a user
 * changes the browsing filters below it.
 */
export function createCaseLibraryCoverage(records: AnalysisCaseRecord[]): CaseLibraryCoverage {
  const years = records
    .map((record) => record.year)
    .filter((year): year is number => Number.isInteger(year) && year > 0)
    .sort((left, right) => left - right);
  const distinctYears = [...new Set(years)];
  const yearLabel = distinctYears.length === 0
    ? '—'
    : distinctYears.length === 1
      ? String(distinctYears[0])
      : `${distinctYears[0]} – ${distinctYears[distinctYears.length - 1]}`;

  const cities = new Set(
    records
      .map((record) => normalizeResearchCity(record.city))
      .filter(Boolean),
  );

  return {
    total: records.length,
    yearLabel,
    cityCount: cities.size,
  };
}
