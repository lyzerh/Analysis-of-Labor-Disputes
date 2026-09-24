import type {
  ResolvedSemanticResult,
  SemanticResolutionResult,
  SemanticRuleResult,
  UnresolvedSemanticTask,
} from './SemanticResult';
import { createTechnicalUnresolvedResult } from './SemanticResultFallback';
import {
  auditSemanticResolutionResult,
  type SemanticLocalAuditResult,
} from './SemanticResultAudit';
import {
  createSemanticReviewItemFromAudit,
  enqueueSemanticReviewItem,
  type SemanticReviewAuditContext,
  type SemanticReviewItem,
} from './SemanticReviewQueue';
import { parseSemanticResolutionResult } from './SemanticResultSchema';
import { SemanticSchemaError } from './SemanticResolutionSchema';
import {
  collectSemanticSchemaValidationErrors,
  ensureSemanticSchemaValidationErrors,
} from './SemanticSchemaDiagnostics';
import { validateSemanticTaskContract } from './SemanticTaskContract';
import type { SemanticResultResolver } from './SemanticResultResolver';
import type { SemanticResolverErrorCode } from './types';
import { traceSemantic } from './SemanticTracing';

export type SemanticPipelineResult = ResolvedSemanticResult | SemanticResolutionResult;

export interface AuditedSemanticResolution {
  result: SemanticResolutionResult;
  audit: SemanticLocalAuditResult;
}

export interface SemanticResolutionReviewPipelineResult extends AuditedSemanticResolution {
  reviewItem?: SemanticReviewItem;
}

const RESOLVER_ERROR_CODES: readonly SemanticResolverErrorCode[] = [
  'timeout', 'network_error', 'rate_limited', 'provider_error', 'output_truncated', 'invalid_json',
  'schema_invalid', 'empty_response', 'validation_rejected',
];

const resolverErrorCode = (error: unknown): SemanticResolverErrorCode => {
  const code = (error as { code?: unknown })?.code;
  return typeof code === 'string' && RESOLVER_ERROR_CODES.includes(code as SemanticResolverErrorCode)
    ? code as SemanticResolverErrorCode
    : 'provider_error';
};

const resolveAndValidate = async (
  task: UnresolvedSemanticTask,
  resolver: SemanticResultResolver,
): Promise<SemanticResolutionResult> => {
  const result = await resolver.resolve(task);
  // Resolver-level technical diagnostics (including bounded schema previews)
  // must survive the orchestration boundary.  They are non-contract metadata
  // and are never persisted to production review/technical-failure stores by
  // the benchmark path.
  if (result.resolverErrorCode) return result;
  let parsed: SemanticResolutionResult;
  try {
    parsed = parseSemanticResolutionResult(result);
  } catch (error) {
    const validatorIssues = error instanceof SemanticSchemaError ? error.issues : [];
    const schemaValidationErrors = ensureSemanticSchemaValidationErrors(
      collectSemanticSchemaValidationErrors(result),
      validatorIssues,
    );
    const hasValidatorErrors = validatorIssues.length > 0 || schemaValidationErrors.length > 0;
    const failureCode = hasValidatorErrors ? 'schema_invalid' : 'unknown_schema_failure';
    const resolverCode: SemanticResolverErrorCode = hasValidatorErrors ? 'schema_invalid' : 'provider_error';
    traceSemantic('schemaValidation', {
      caseId: task.caseId,
      passed: false,
      errorCode: failureCode,
      schemaFailureOrigin: 'semantic_result_schema',
      validatorName: 'parseSemanticResolutionResult',
      validatorPassed: false,
      validatorErrorCount: validatorIssues.length,
      errorCount: schemaValidationErrors.length,
    });
    return createTechnicalUnresolvedResult(task, resolverCode, 'semantic result failed the local schema validator', undefined, {
      failureStage: 'schema',
      failureCode,
      schemaFailureOrigin: 'semantic_result_schema',
      validatorName: 'parseSemanticResolutionResult',
      validatorPassed: false,
      validatorErrors: validatorIssues,
      providerRawParsed: true,
      semanticSchemaPassed: false,
      normalizationPassed: false,
      contractPassed: false,
      auditRan: false,
      schemaValidationErrors,
    });
  }

  const taskContract = validateSemanticTaskContract(task, parsed);
  traceSemantic('taskContract', {
    caseId: task.caseId,
    passed: taskContract.valid,
    reasonCodes: taskContract.reasonCodes,
    targetCount: taskContract.targetCount,
    resolutionCount: taskContract.resolutionCount,
    duplicateTargetCount: taskContract.duplicateTargetCount,
    extraResolutionCount: taskContract.extraResolutionCount,
  });
  return taskContract.valid
    ? parsed
    : createTechnicalUnresolvedResult(task, 'validation_rejected', 'semantic task contract validation failed', undefined, {
      failureStage: 'contract',
      failureCode: 'contract_mismatch',
      schemaFailureOrigin: 'contract_bridge',
      providerRawParsed: true,
      semanticSchemaPassed: true,
      normalizationPassed: true,
      contractPassed: false,
      auditRan: false,
      contractReasonCodes: taskContract.reasonCodes,
    });
};

/**
 * Routes only unresolved rule results to the provider. A resolved rule result
 * is returned unchanged and never causes an LLM call.
 */
export const resolveSemanticRuleResult = async (
  ruleResult: SemanticRuleResult,
  resolver: SemanticResultResolver,
): Promise<SemanticPipelineResult> => {
  if (ruleResult.status === 'resolved') return ruleResult;

  try {
    return await resolveAndValidate(ruleResult, resolver);
  } catch (error) {
    return createTechnicalUnresolvedResult(
      ruleResult,
      resolverErrorCode(error),
      error instanceof Error ? error.message : undefined,
      typeof (error as { status?: unknown })?.status === 'number' ? (error as { status: number }).status : undefined,
    );
  }
};

export const resolveUnresolvedSemanticTask = async (
  task: UnresolvedSemanticTask,
  resolver: SemanticResultResolver,
): Promise<SemanticResolutionResult> => {
  try {
    return await resolveAndValidate(task, resolver);
  } catch (error) {
    return createTechnicalUnresolvedResult(
      task,
      resolverErrorCode(error),
      error instanceof Error ? error.message : undefined,
      typeof (error as { status?: unknown })?.status === 'number' ? (error as { status: number }).status : undefined,
    );
  }
};

/**
 * Formal unresolved path including the post-schema local audit. The original
 * resolver function remains available for callers that only need the strict
 * SemanticResolutionResult contract.
 */
export const resolveUnresolvedSemanticTaskWithAudit = async (
  task: UnresolvedSemanticTask,
  resolver: SemanticResultResolver,
): Promise<AuditedSemanticResolution> => {
  const result = await resolveUnresolvedSemanticTask(task, resolver);
  const requiredClaimResolutionIds = task.unresolvedTargets
    .filter((target) => target.type === 'claim_resolution' && Boolean(target.id))
    .map((target) => target.id as string);
  const audit = auditSemanticResolutionResult(result, {
    rawText: task.rawText,
    knownParties: task.knownParties,
    knownClaims: task.knownClaims,
    knownJudgmentItems: task.knownJudgmentItems,
    requiredClaimResolutionIds,
  });
  if (result.resolverErrorDetails) {
    Object.defineProperty(result, 'resolverErrorDetails', {
      value: { ...result.resolverErrorDetails, auditRan: true },
      enumerable: false,
      configurable: true,
    });
  }
  traceSemantic('audit', {
    caseId: task.caseId,
    decision: audit.decision,
    reasonCodes: audit.reasonCodes,
  });
  return { result, audit };
};

/**
 * Adds the human-review handoff to the schema/audit path. Passing results and
 * technical failures never create a queue item; only valid-but-uncertain
 * semantic candidates are persisted for human review.
 */
export const resolveUnresolvedSemanticTaskWithReview = async (
  task: UnresolvedSemanticTask,
  resolver: SemanticResultResolver,
  options: {
    storage?: Storage;
    createdAt: string;
    caseTitle?: string;
    court?: string;
    date?: string;
  },
): Promise<SemanticResolutionReviewPipelineResult> => {
  const audited = await resolveUnresolvedSemanticTaskWithAudit(task, resolver);
  const requiredClaimResolutionIds = task.unresolvedTargets
    .filter((target) => target.type === 'claim_resolution' && Boolean(target.id))
    .map((target) => target.id as string);
  const reviewItem = createSemanticReviewItemFromAudit({
    caseId: task.caseId,
    caseTitle: options.caseTitle,
    court: options.court,
    date: options.date,
    result: audited.result,
    audit: audited.audit,
    auditContext: {
      rawText: task.rawText,
      ...(task.knownParties ? { knownParties: task.knownParties } : {}),
      ...(task.knownClaims ? { knownClaims: task.knownClaims } : {}),
      ...(task.knownJudgmentItems ? { knownJudgmentItems: task.knownJudgmentItems } : {}),
      requiredClaimResolutionIds,
    } satisfies SemanticReviewAuditContext,
    unresolvedTargets: task.unresolvedTargets,
    context: task.context || task.rawText,
    createdAt: options.createdAt,
  });
  if (reviewItem) enqueueSemanticReviewItem(reviewItem, options.storage);
  return { ...audited, ...(reviewItem ? { reviewItem } : {}) };
};
