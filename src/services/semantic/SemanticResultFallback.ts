import type { SemanticResolverErrorCode } from './types';
import type {
  SemanticResolutionResult,
  UnresolvedSemanticTask,
} from './SemanticResult';

/** Safe result used for provider, timeout, JSON, and schema failures. */
export const createTechnicalUnresolvedResult = (
  task: UnresolvedSemanticTask,
  resolverErrorCode: SemanticResolverErrorCode,
  _diagnosticMessage?: string,
): SemanticResolutionResult => ({
  status: 'unresolved',
  resolver: 'llm',
  parties: task.knownParties ?? [],
  claims: task.knownClaims ?? [],
  judgmentItems: task.knownJudgmentItems ?? [],
  claimResolutions: [],
  applicantRole: 'unknown',
  applicantOutcome: 'unclear',
  employeeOutcome: 'unclear',
  employerOutcome: 'unclear',
  confidence: 0,
  unresolvedReasonCodes: task.reasonCodes.length > 0
    ? [...new Set(task.reasonCodes)]
    : ['insufficient_context'],
  resolverErrorCode,
});
