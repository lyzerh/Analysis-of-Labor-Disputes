import type { AnalysisCaseRecord, RawDocument } from '../../types';
import { createBrowserXaiSemanticClient } from './BrowserXaiSemanticClient';
import { GeminiSemanticResultResolver } from './GeminiSemanticResultResolver';
import { readLlmRuntimeSettings, isLlmAvailable, type LlmRuntimeSettings } from './LlmRuntimeSettings';
import {
  enqueueSemanticReviewItem,
  createSemanticReviewItemFromAudit,
  type SemanticReviewItem,
} from './SemanticReviewQueue';
import {
  appendSemanticTechnicalFailure,
  failureStageForCode,
  type SemanticTechnicalFailure,
} from './SemanticTechnicalFailureStorage';
import {
  resolveUnresolvedSemanticTaskWithAudit,
} from './SemanticResolutionOrchestrator';
import type {
  SemanticJudgmentItem,
  SemanticParty,
  SemanticTaskClaim,
  UnresolvedSemanticTask,
} from './SemanticResult';
import { SEMANTIC_LLM_MODEL, SEMANTIC_LLM_TIMEOUT_MS, SEMANTIC_MAX_OUTPUT_TOKENS } from './SemanticPrompt';
import { executableUnresolvedReferences, hasExecutableSemanticTask } from './SemanticTaskEligibility';
import { traceSemantic } from './SemanticTracing';
import { TECHNICAL_RESOLVER_ERROR_CODES } from './SemanticWorkflowState';

export type SingleCaseSemanticRunStatus = 'safe' | 'review' | 'technical_failure' | 'awaiting_llm' | 'blocked';

export interface SingleCaseSemanticRunResult {
  status: SingleCaseSemanticRunStatus;
  message: string;
  auditReasonCodes?: string[];
  technicalFailure?: SemanticTechnicalFailure;
  reviewItem?: SemanticReviewItem;
}

/**
 * Runs the current production semantic resolver without applying workflow
 * side effects.  Gold benchmark and other read-only experiments use this
 * boundary so they still share the active provider, prompt, schema, contract
 * validation, and audit path without creating review items or technical
 * failure records.
 */
export const resolveSemanticTaskForBenchmark = async (
  task: UnresolvedSemanticTask,
  settings: LlmRuntimeSettings = readLlmRuntimeSettings(),
): Promise<Awaited<ReturnType<typeof resolveUnresolvedSemanticTaskWithAudit>>> => {
  if (!isLlmAvailable(settings)) {
    throw new Error('当前 AI 服务 API Key 未配置或 AI 未启用');
  }
  const resolver = new GeminiSemanticResultResolver({
    apiKey: settings.apiKey!,
    modelName: SEMANTIC_LLM_MODEL,
    timeoutMs: SEMANTIC_LLM_TIMEOUT_MS,
    maxOutputTokens: SEMANTIC_MAX_OUTPUT_TOKENS,
    client: createBrowserXaiSemanticClient(settings.apiKey),
  });
  return resolveUnresolvedSemanticTaskWithAudit(task, resolver);
};

/**
 * Projects only the semantic workflow state of a case after a single run.
 * Parser facts, outcomes, provenance, and analysis-set membership remain
 * untouched; this closes the gap between the AI job result and the pipeline
 * stage cards shown in Case Analysis.
 */
export const applySingleCaseSemanticRunState = (
  record: AnalysisCaseRecord,
  result: SingleCaseSemanticRunResult,
): AnalysisCaseRecord => {
  if (result.status === 'technical_failure' && result.technicalFailure) {
    return {
      ...record,
      semanticResolutionStatus: 'technical_failure',
      semanticResolutionErrorCode: result.technicalFailure.failureCode,
    };
  }
  if (result.status === 'review') {
    return {
      ...record,
      semanticResolutionStatus: 'needs_review',
      semanticResolutionErrorCode: undefined,
    };
  }
  return record;
};

/** Rehydrates a persisted technical failure for a freshly loaded case list. */
export const applyPersistedSemanticTechnicalFailure = (
  record: AnalysisCaseRecord,
  failure: SemanticTechnicalFailure,
): AnalysisCaseRecord => {
  // A later semantic review/result is authoritative; an old failure record
  // must not regress it back to a retryable technical stage.
  if (record.semanticResolutionStatus === 'resolved' || record.semanticResolutionStatus === 'needs_review') {
    return record;
  }
  return {
    ...record,
    semanticResolutionStatus: 'technical_failure',
    semanticResolutionErrorCode: failure.failureCode,
  };
};

const claimIdOf = (claim: AnalysisCaseRecord['claims'][number], index: number): string =>
  claim.id || `${claim.claimName || 'claim'}-${index + 1}`;

const partyIdForClaim = (
  claim: AnalysisCaseRecord['claims'][number],
  parties: SemanticParty[],
): string[] => {
  if (claim.claimantPartyId) return [claim.claimantPartyId];
  return parties
    .filter((party) => party.laborRole === (claim.claimantRole || claim.claimant))
    .map((party) => party.id);
};

const collectKnownJudgmentItems = (record: AnalysisCaseRecord): SemanticJudgmentItem[] => {
  const candidates = [
    ...(record.judgmentItems ?? []).map((item, itemIndex) => ({ item, id: item.id || `judgment-case-${itemIndex + 1}` })),
    ...record.claims.flatMap((claim, claimIndex) =>
      (claim.judgmentItems || []).map((item, itemIndex) => ({
        item,
        id: item.id || `judgment-claim-${claimIndex + 1}-${itemIndex + 1}`,
      }))
    ),
  ];
  const seen = new Set<string>();
  return candidates.flatMap(({ item, id }) => {
    if (seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      text: item.sourceText,
      ...(item.awardedAmount !== undefined ? { awardedAmount: item.awardedAmount, currency: 'CNY' as const } : {}),
    }];
  });
};

export const buildSemanticTask = (record: AnalysisCaseRecord, rawDocument: RawDocument): UnresolvedSemanticTask => {
  const parties: SemanticParty[] = record.parties.map((party) => ({
    id: party.id,
    name: party.name,
    laborRole: party.laborRole,
    proceduralRoles: party.proceduralRoles,
  }));
  const claims: SemanticTaskClaim[] = record.claims.map((claim, index) => ({
    id: claimIdOf(claim, index),
    claimantPartyIds: partyIdForClaim(claim, parties),
    claimantRole: claim.claimantRole || claim.claimant,
    claimType: claim.claimType || claim.claimName,
    claimLabel: claim.claimName,
    // Keep an unavailable request text empty; claimLabel remains the stable
    // semantic label and must not be presented as fabricated request prose.
    claimText: claim.sourceText || '',
    ...(claim.requestedAmount !== undefined ? { requestedAmount: claim.requestedAmount, currency: 'CNY' as const } : {}),
  }));
  const judgmentItems = collectKnownJudgmentItems(record);
  const unresolvedTargets = [...new Set(executableUnresolvedReferences(record)
    .flatMap((reference) => reference.referencedClaimIds
      .filter((claimId): claimId is string => typeof claimId === 'string' && claimId.trim().length > 0)))]
    .map((claimId) => ({
      type: 'claim_resolution' as const,
      id: claimId,
      reasonCode: 'claim_judgment_match_unclear' as const,
    }));

  const judgmentDispositionText = record.judgmentDispositionText
    ?? rawDocument.judgmentDispositionText
    ?? (typeof rawDocument.sourceMetadata?.cpjg === 'string' ? rawDocument.sourceMetadata.cpjg : undefined);
  const judgmentReasoningText = record.judgmentReasoningText
    ?? rawDocument.judgmentReasoningText
    ?? (typeof rawDocument.sourceMetadata?.fxgc === 'string' ? rawDocument.sourceMetadata.fxgc : undefined);

  return {
    status: 'unresolved',
    caseId: record.caseId,
    reasonCodes: ['claim_judgment_match_unclear'],
    rawText: rawDocument.rawText,
    context: record.courtReasoning || rawDocument.rawText,
    knownParties: parties,
    knownClaims: claims,
    knownJudgmentItems: judgmentItems,
    ...(judgmentDispositionText ? { judgmentDispositionText } : {}),
    ...(judgmentReasoningText ? { judgmentReasoningText } : {}),
    proceduralMetadata: {
      ...(record.caseLevel ? { caseLevel: record.caseLevel } : {}),
      ...(record.court ? { court: record.court } : {}),
      ...(record.date ? { date: record.date } : {}),
    },
    unresolvedTargets,
  };
};

export const runSingleCaseSemanticAnalysis = async (
  record: AnalysisCaseRecord,
  rawDocument: RawDocument | null,
  settings: LlmRuntimeSettings = readLlmRuntimeSettings(),
): Promise<SingleCaseSemanticRunResult> => {
  if (!hasExecutableSemanticTask(record)) {
    return { status: 'blocked', message: '当前案例没有可执行的待分析语义任务。' };
  }
  if (!rawDocument) {
    return { status: 'blocked', message: '未找到对应原始文书，无法生成可执行的语义任务。' };
  }
  if (!settings.enabled) {
    return { status: 'awaiting_llm', message: 'AI 语义分析未启用，案例保持待 AI 语义分析。' };
  }
  if (!settings.apiKey?.trim()) {
    return { status: 'awaiting_llm', message: '当前 AI 服务 API Key 未配置，案例保持待 AI 语义分析。' };
  }
  if (!isLlmAvailable(settings)) {
    return { status: 'awaiting_llm', message: '当前 AI 服务 API Key 未配置，案例保持待 AI 语义分析。' };
  }

  const task = buildSemanticTask(record, rawDocument);
  traceSemantic('taskContext', {
    caseId: record.caseId,
    targetCount: task.unresolvedTargets.length,
    targets: task.unresolvedTargets.map((target) => ({ type: target.type, id: target.id, reasonCode: target.reasonCode })),
    claims: (task.knownClaims ?? []).map((claim) => ({
      id: claim.id,
      claimType: claim.claimType,
      claimLabelPresent: Boolean(claim.claimLabel?.trim()),
      claimTextPresent: Boolean(claim.claimText?.trim()),
    })),
    candidateJudgmentCount: task.knownJudgmentItems?.length ?? 0,
    candidateJudgmentTextPresent: (task.knownJudgmentItems ?? []).every((item) => Boolean(item.text.trim())),
    rawTextLength: task.rawText.length,
  });
  const resolver = new GeminiSemanticResultResolver({
    apiKey: settings.apiKey,
    modelName: SEMANTIC_LLM_MODEL,
    timeoutMs: SEMANTIC_LLM_TIMEOUT_MS,
    maxOutputTokens: SEMANTIC_MAX_OUTPUT_TOKENS,
    client: createBrowserXaiSemanticClient(settings.apiKey, { caseId: record.caseId }),
  });
  const audited = await resolveUnresolvedSemanticTaskWithAudit(task, resolver);

  if (audited.result.resolverErrorCode && TECHNICAL_RESOLVER_ERROR_CODES.includes(audited.result.resolverErrorCode)) {
    const technicalFailure = appendSemanticTechnicalFailure({
      caseId: record.caseId,
      failureStage: failureStageForCode(audited.result.resolverErrorCode),
      failureCode: audited.result.resolverErrorCode,
      ...(audited.result.resolverErrorDetails?.httpStatus !== undefined ? { httpStatus: audited.result.resolverErrorDetails.httpStatus } : {}),
      errorSummary: audited.result.resolverErrorDetails?.message || `语义解析失败：${audited.result.resolverErrorCode}`,
      timestamp: new Date().toISOString(),
    });
    traceSemantic('finalRouting', {
      caseId: record.caseId,
      status: 'technical_failure',
      resolverErrorCode: audited.result.resolverErrorCode,
      failureStage: technicalFailure.failureStage,
      failureCode: technicalFailure.failureCode,
      auditDecision: audited.audit.decision,
      auditReasonCodes: audited.audit.reasonCodes,
    });
    return {
      status: 'technical_failure',
      message: `语义分析技术失败（${technicalFailure.failureCode}），可重试 AI 或直接人工复核。`,
      auditReasonCodes: audited.audit.reasonCodes,
      technicalFailure,
    };
  }

  if (audited.audit.decision === 'pass') {
    traceSemantic('finalRouting', {
      caseId: record.caseId,
      status: 'safe',
      auditDecision: audited.audit.decision,
      auditReasonCodes: audited.audit.reasonCodes,
    });
    return {
      status: 'safe',
      message: '单案例语义解析通过 Strict Schema 与 Minimal Audit，可安全进入语义准入。',
      auditReasonCodes: [],
    };
  }

  const reviewItem = createSemanticReviewItemFromAudit({
    caseId: record.caseId,
    caseTitle: record.title,
    court: record.court,
    date: record.date,
    result: audited.result,
    audit: audited.audit,
    auditContext: {
      rawText: task.rawText,
      ...(task.knownParties ? { knownParties: task.knownParties } : {}),
      ...(task.knownClaims ? { knownClaims: task.knownClaims } : {}),
      ...(task.knownJudgmentItems ? { knownJudgmentItems: task.knownJudgmentItems } : {}),
      requiredClaimResolutionIds: task.unresolvedTargets
        .filter((target) => target.type === 'claim_resolution' && Boolean(target.id))
        .map((target) => target.id as string),
    },
    unresolvedTargets: task.unresolvedTargets,
    context: rawDocument.rawText.slice(0, 8_000),
    createdAt: new Date().toISOString(),
  });
  if (reviewItem) enqueueSemanticReviewItem(reviewItem);
  traceSemantic('finalRouting', {
    caseId: record.caseId,
    status: 'review',
    resolverErrorCode: audited.result.resolverErrorCode ?? null,
    auditDecision: audited.audit.decision,
    auditReasonCodes: audited.audit.reasonCodes,
  });
  return {
    status: 'review',
    message: '单案例语义解析完成，但 Audit 未通过，已进入人工复核。',
    auditReasonCodes: audited.audit.reasonCodes,
    ...(reviewItem ? { reviewItem } : {}),
  };
};
