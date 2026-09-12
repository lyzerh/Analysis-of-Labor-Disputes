export const EXCLUDED_LABORINFO_TEST_CASE_IDS = new Set<string>([
  '276057',
  '276056',
  '276055',
  '271694',
  '276061',
]);

export function isExcludedLaborInfoTestCase(caseId: string | number): boolean {
  return EXCLUDED_LABORINFO_TEST_CASE_IDS.has(String(caseId).trim());
}
