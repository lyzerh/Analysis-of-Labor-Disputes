import type { SemanticResolverErrorCode } from './types';
import type {
  SemanticResolutionResult,
  SemanticSchemaValidationError,
  SemanticSchemaFailureOrigin,
  UnresolvedSemanticTask,
} from './SemanticResult';

export interface SemanticResolverDiagnosticDetails {
  failureStage?: 'provider' | 'json_parse' | 'schema' | 'contract' | 'audit';
  failureCode?: string;
  schemaFailureOrigin?: SemanticSchemaFailureOrigin;
  validatorName?: string;
  validatorPassed?: boolean;
  validatorErrors?: string[];
  contractReasonCodes?: string[];
  providerRawParsed?: boolean;
  semanticSchemaPassed?: boolean;
  normalizationPassed?: boolean;
  contractPassed?: boolean;
  auditRan?: boolean;
  rawResponseAvailable?: boolean;
  rawResponsePreview?: string;
  parsedJsonCandidate?: unknown;
  schemaValidationErrors?: SemanticSchemaValidationError[];
}

/** Safe result used for provider, timeout, JSON, and schema failures. */
export const createTechnicalUnresolvedResult = (
  task: UnresolvedSemanticTask,
  resolverErrorCode: SemanticResolverErrorCode,
  diagnosticMessage?: string,
  httpStatus?: number,
  diagnostics?: SemanticResolverDiagnosticDetails,
): SemanticResolutionResult => {
  // `claimLabel` is task-only context and must not leak into the strict
  // SemanticResolutionResult claim objects used by the fallback result.
  const claims = (task.knownClaims ?? []).map(({ claimLabel: _claimLabel, ...claim }) => claim);
  const result: SemanticResolutionResult = {
    status: 'unresolved',
    resolver: 'llm',
    parties: task.knownParties ?? [],
    claims,
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
  };
  // Keep provider diagnostics out of the strict JSON contract and serialized
  // candidate payload.  The non-enumerable side channel is available to the
  // local runtime for safe failure-history recording only.
  if (diagnosticMessage || httpStatus !== undefined || diagnostics) {
    Object.defineProperty(result, 'resolverErrorDetails', {
      value: {
        ...(httpStatus !== undefined ? { httpStatus } : {}),
        ...(diagnosticMessage ? { message: diagnosticMessage } : {}),
        ...(diagnostics || {}),
      },
      enumerable: false,
      configurable: true,
    });
  }
  return result;
};
