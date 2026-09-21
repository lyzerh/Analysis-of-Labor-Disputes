import type { SemanticResolverErrorCode, SemanticResolutionStatus } from './types';

/** Product-level outcome of the semantic candidate pipeline. */
export type SemanticWorkflowState = 'accepted' | 'needs_review' | 'technical_failure' | 'blocked';

/** Technical failures never represent a legal conclusion for human review. */
export const TECHNICAL_RESOLVER_ERROR_CODES: readonly SemanticResolverErrorCode[] = [
  'timeout',
  'network_error',
  'rate_limited',
  'provider_error',
  'output_truncated',
  'invalid_json',
  'schema_invalid',
  'empty_response',
  'validation_rejected',
];

export const isTechnicalResolverError = (value: string | null | undefined): value is SemanticResolverErrorCode => (
  typeof value === 'string'
  && TECHNICAL_RESOLVER_ERROR_CODES.includes(value as SemanticResolverErrorCode)
);

export const isTechnicalSemanticStatus = (status: SemanticResolutionStatus | string | undefined): boolean => (
  status === 'provider_unavailable' || status === 'technical_failure'
);
