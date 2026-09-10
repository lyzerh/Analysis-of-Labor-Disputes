import type { SemanticResolverErrorCode } from './types';

export class SemanticResolverError extends Error {
  constructor(
    public readonly code: SemanticResolverErrorCode,
    message: string,
    public readonly status?: number,
    public readonly attemptCount?: number,
  ) {
    super(message);
    this.name = 'SemanticResolverError';
  }
}
