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
  type SemanticReviewItem,
} from './SemanticReviewQueue';
import { parseSemanticResolutionResult } from './SemanticResultSchema';
import type { SemanticResultResolver } from './SemanticResultResolver';
import type { SemanticResolverErrorCode } from './types';

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
  try {
    return parseSemanticResolutionResult(result);
  } catch {
    return createTechnicalUnresolvedResult(task, 'schema_invalid');
  }
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
  const audit = auditSemanticResolutionResult(result, {
    rawText: task.rawText,
    knownParties: task.knownParties,
    knownClaims: task.knownClaims,
    knownJudgmentItems: task.knownJudgmentItems,
  });
  return { result, audit };
};

/**
 * Adds the mandatory human-review handoff to the schema/audit path. Passing
 * results never create a queue item; failures are persisted as pending items.
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
  const reviewItem = createSemanticReviewItemFromAudit({
    caseId: task.caseId,
    caseTitle: options.caseTitle,
    court: options.court,
    date: options.date,
    result: audited.result,
    audit: audited.audit,
    unresolvedTargets: task.unresolvedTargets,
    context: task.context || task.rawText,
    createdAt: options.createdAt,
  });
  if (reviewItem) enqueueSemanticReviewItem(reviewItem, options.storage);
  return { ...audited, ...(reviewItem ? { reviewItem } : {}) };
};
