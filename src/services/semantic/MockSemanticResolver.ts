import type { SemanticResolver } from './SemanticResolver';
import { SemanticResolverError } from './SemanticResolverError';
import type {
  SemanticResolutionCandidate,
  SemanticResolutionInput,
  SemanticResolverErrorCode,
} from './types';

export interface MockSemanticResolverOptions {
  candidates?: SemanticResolutionCandidate[];
  errorCode?: SemanticResolverErrorCode;
  delayMs?: number;
}

export class MockSemanticResolver implements SemanticResolver {
  public callCount = 0;
  public lastInput?: SemanticResolutionInput;

  constructor(private readonly options: MockSemanticResolverOptions = {}) {}

  public async resolve(input: SemanticResolutionInput): Promise<SemanticResolutionCandidate[]> {
    this.callCount++;
    this.lastInput = input;
    if (this.options.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, this.options.delayMs));
    }
    if (this.options.errorCode) {
      throw new SemanticResolverError(this.options.errorCode, `Mock ${this.options.errorCode}`);
    }
    return this.options.candidates ?? [];
  }
}
