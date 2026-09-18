import type { AnalysisCaseRecord, ClaimReferenceCandidate } from '../../types';

/**
 * Shared eligibility predicate for the Pipeline stage and single-case runner.
 * Legacy persisted references may omit newer flags; explicit non-unresolved
 * and non-semantic values are the only values excluded here.
 */
export const isExecutableUnresolvedReference = (
  reference: Partial<ClaimReferenceCandidate> | null | undefined,
): boolean => {
  if (!reference || typeof reference.sourceText !== 'string' || !reference.sourceText.trim()) return false;
  if (reference.resolutionMethod !== undefined && reference.resolutionMethod !== 'unresolved') return false;
  return reference.needsSemanticResolution !== false;
};

export const hasExecutableSemanticTask = (
  record: Pick<AnalysisCaseRecord, 'unresolvedReferences'>,
): boolean => record.unresolvedReferences.some(isExecutableUnresolvedReference);

export const executableUnresolvedReferences = (
  record: Pick<AnalysisCaseRecord, 'unresolvedReferences'>,
): ClaimReferenceCandidate[] => record.unresolvedReferences.filter(isExecutableUnresolvedReference);
