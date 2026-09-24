import type { SemanticResolverErrorCode } from './types';
import type { SemanticResolverDiagnosticDetails } from './SemanticResultFallback';

export class SemanticResolverError extends Error {
  constructor(
    public readonly code: SemanticResolverErrorCode,
    message: string,
    public readonly status?: number,
    public readonly attemptCount?: number,
    public readonly diagnostics?: SemanticResolverDiagnosticDetails,
  ) {
    super(message);
    this.name = 'SemanticResolverError';
  }
}
