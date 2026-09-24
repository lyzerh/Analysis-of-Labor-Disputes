import type { SemanticReviewItem } from './SemanticReviewQueue';
import { SEMANTIC_AUDIT_REASON_CODES } from './SemanticResultAudit';
import { parseSemanticResolutionResult } from './SemanticResultSchema';

export const semanticReviewStorageKey = 'labor-analysis-semantic-review-items-v1';

function isPersistedSemanticReviewItem(value: unknown): value is SemanticReviewItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<SemanticReviewItem>;
  if (typeof item.id !== 'string' || !item.id.trim()
    || typeof item.caseId !== 'string' || !item.caseId.trim()
    || (item.status !== 'pending' && item.status !== 'reviewed')
    || typeof item.createdAt !== 'string' || !item.createdAt.trim()
    || !item.audit || item.audit.decision !== 'fail'
    || !Array.isArray(item.audit.reasonCodes)
    || item.audit.reasonCodes.some((code) => !SEMANTIC_AUDIT_REASON_CODES.includes(code))) return false;
  try {
    parseSemanticResolutionResult(item.semanticResult);
    if (item.status === 'reviewed') {
      if (!item.reviewedAt || !item.reviewedResult
        || item.reviewedResult.source !== 'human_review'
        || item.reviewedResult.reviewStatus !== 'approved') return false;
      parseSemanticResolutionResult(item.reviewedResult.reviewedResult);
      if (item.reviewedResult.reviewAction
        && !['accept', 'edit', 'unresolved'].includes(item.reviewedResult.reviewAction)) return false;
      if (item.reviewedResult.originalCandidate) parseSemanticResolutionResult(item.reviewedResult.originalCandidate);
      if (item.reviewedResult.finalValue) parseSemanticResolutionResult(item.reviewedResult.finalValue);
    }
  } catch {
    return false;
  }
  if (item.candidateStatus !== undefined
    && item.candidateStatus !== 'ai_candidate'
    && item.candidateStatus !== 'no_candidate') return false;
  if (item.technicalFailureHistory !== undefined && !Array.isArray(item.technicalFailureHistory)) return false;
  return item.context === undefined || typeof item.context === 'string';
}

function defaultStorage(): Storage | undefined {
  try {
    return typeof globalThis !== 'undefined' ? globalThis.localStorage : undefined;
  } catch {
    return undefined;
  }
}

export function readSemanticReviewItems(
  storage: Storage | undefined = defaultStorage(),
): SemanticReviewItem[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(semanticReviewStorageKey) || '[]');
    return Array.isArray(parsed) ? parsed.filter(isPersistedSemanticReviewItem) : [];
  } catch {
    return [];
  }
}

export function writeSemanticReviewItems(
  items: SemanticReviewItem[],
  storage: Storage | undefined = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(semanticReviewStorageKey, JSON.stringify(items.filter(isPersistedSemanticReviewItem)));
  } catch {
    // Review persistence is best effort and must not break case analysis.
  }
}

export function saveSemanticReviewItem(
  item: SemanticReviewItem,
  storage: Storage | undefined = defaultStorage(),
): void {
  const existing = readSemanticReviewItems(storage);
  writeSemanticReviewItems([
    ...existing.filter((candidate) => candidate.id !== item.id),
    item,
  ], storage);
}

export function getSemanticReviewItem(
  itemId: string,
  storage: Storage | undefined = defaultStorage(),
): SemanticReviewItem | undefined {
  return readSemanticReviewItems(storage).find((item) => item.id === itemId);
}
