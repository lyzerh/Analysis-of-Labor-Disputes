import type {
  SemanticResolutionResult,
  UnresolvedSemanticTask,
} from './SemanticResult';

/** Provider-neutral interface for the formal unresolved semantic path. */
export interface SemanticResultResolver {
  resolve(task: UnresolvedSemanticTask): Promise<SemanticResolutionResult>;
}
