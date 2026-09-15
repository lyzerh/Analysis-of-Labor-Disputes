import type { AnalysisCaseRecord, OutcomeReviewItem } from '../../types';

/**
 * Derive a read-only review queue from parsed analysis records.
 * No queue item is persisted and no research provenance is changed.
 */
export function buildOutcomeReviewQueue(records: AnalysisCaseRecord[]): OutcomeReviewItem[] {
  return records.flatMap((record) => (record.outcomeDiagnostics || [])
    .filter((diagnostic) => diagnostic.needsReview)
    .map((diagnostic) => ({
      ...diagnostic,
      caseId: record.caseId,
      title: record.title,
      caseNumber: record.caseNumber,
      employeeParty: record.employeeParty,
      employerParty: record.employerParty,
      applicantRole: record.applicantRole,
      parties: record.parties,
    })));
}
