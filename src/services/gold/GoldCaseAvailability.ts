import type { AnalysisCaseRecord } from '../../types';

export type GoldCaseAvailabilityState = 'available' | 'no_local_cases' | 'all_cases_added';

/**
 * Returns local cases that are not already part of the selected Gold Set.
 * This is read-only presentation support; Gold Set persistence remains in
 * GoldAnnotationStorage.
 */
export function getAvailableGoldCaseRecords(
  localCases: AnalysisCaseRecord[],
  goldCaseIds: string[],
): AnalysisCaseRecord[] {
  const existingIds = new Set(goldCaseIds);
  return localCases.filter((record) => !existingIds.has(record.caseId));
}

export function getGoldCaseAvailabilityState(
  localCaseCount: number,
  availableCaseCount: number,
): GoldCaseAvailabilityState {
  if (localCaseCount === 0) return 'no_local_cases';
  if (availableCaseCount === 0) return 'all_cases_added';
  return 'available';
}
