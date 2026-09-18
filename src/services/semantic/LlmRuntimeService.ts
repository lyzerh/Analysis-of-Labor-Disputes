import type { AnalysisCaseRecord, RawDocument } from '../../types';
import { createBrowserOpenRouterSemanticClient } from './BrowserOpenRouterSemanticClient';
import { GeminiSemanticResultResolver } from './GeminiSemanticResultResolver';
import { readLlmRuntimeSettings, isLlmAvailable, type LlmRuntimeSettings } from './LlmRuntimeSettings';
import {
  enqueueSemanticReviewItem,
  createSemanticReviewItemFromAudit,
} from './SemanticReviewQueue';
import {
  resolveUnresolvedSemanticTaskWithAudit,
} from './SemanticResolutionOrchestrator';
import type {
  SemanticClaim,
  SemanticJudgmentItem,
  SemanticParty,
  UnresolvedSemanticTask,
} from './SemanticResult';
import { SEMANTIC_LLM_MODEL } from './SemanticPrompt';
import { executableUnresolvedReferences, hasExecutableSemanticTask } from './SemanticTaskEligibility';

export type SingleCaseSemanticRunStatus = 'safe' | 'review' | 'awaiting_llm' | 'blocked';

export interface SingleCaseSemanticRunResult {
  status: SingleCaseSemanticRunStatus;
  message: string;
  auditReasonCodes?: string[];
}

const TRANSIENT_PROVIDER_ERROR_CODES = new Set([
  'timeout',
  'network_error',
  'rate_limited',
  'provider_error',
  'output_truncated',
]);

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

const buildSemanticTask = (record: AnalysisCaseRecord, rawDocument: RawDocument): UnresolvedSemanticTask => {
  const parties: SemanticParty[] = record.parties.map((party) => ({
    id: party.id,
    name: party.name,
    laborRole: party.laborRole,
    proceduralRoles: party.proceduralRoles,
  }));
  const claims: SemanticClaim[] = record.claims.map((claim, index) => ({
    id: claimIdOf(claim, index),
    claimantPartyIds: partyIdForClaim(claim, parties),
    claimantRole: claim.claimantRole || claim.claimant,
    claimType: claim.claimType || claim.claimName,
    claimText: claim.sourceText || claim.claimName,
    ...(claim.requestedAmount !== undefined ? { requestedAmount: claim.requestedAmount, currency: 'CNY' as const } : {}),
  }));
  const judgmentItems: SemanticJudgmentItem[] = record.claims.flatMap((claim, claimIndex) =>
    (claim.judgmentItems || []).map((item, itemIndex) => ({
      id: item.id || `judgment-${claimIndex + 1}-${itemIndex + 1}`,
      text: item.sourceText,
      ...(item.awardedAmount !== undefined ? { awardedAmount: item.awardedAmount, currency: 'CNY' as const } : {}),
    }))
  );
  const unresolvedTargets = executableUnresolvedReferences(record).map((reference) => ({
    type: 'claim_resolution' as const,
    ...(reference.referencedClaimIds[0] ? { id: reference.referencedClaimIds[0] } : {}),
    reasonCode: 'claim_judgment_match_unclear' as const,
  }));

  return {
    status: 'unresolved',
    caseId: record.caseId,
    reasonCodes: ['claim_judgment_match_unclear'],
    rawText: rawDocument.rawText,
    context: record.courtReasoning || rawDocument.rawText,
    knownParties: parties,
    knownClaims: claims,
    knownJudgmentItems: judgmentItems,
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
    return { status: 'awaiting_llm', message: 'OpenRouter API Key 未配置，案例保持待 AI 语义分析。' };
  }
  if (!isLlmAvailable(settings)) {
    return { status: 'awaiting_llm', message: 'OpenRouter API Key 未配置，案例保持待 AI 语义分析。' };
  }

  const task = buildSemanticTask(record, rawDocument);
  const resolver = new GeminiSemanticResultResolver({
    apiKey: settings.apiKey,
    modelName: SEMANTIC_LLM_MODEL,
    client: createBrowserOpenRouterSemanticClient(settings.apiKey),
  });
  const audited = await resolveUnresolvedSemanticTaskWithAudit(task, resolver);

  if (audited.result.resolverErrorCode && TRANSIENT_PROVIDER_ERROR_CODES.has(audited.result.resolverErrorCode)) {
    return {
      status: 'awaiting_llm',
      message: 'OpenRouter 调用失败，案例保持待 AI 语义分析；未创建人工复核项。',
      auditReasonCodes: audited.audit.reasonCodes,
    };
  }

  if (audited.audit.decision === 'pass') {
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
    unresolvedTargets: task.unresolvedTargets,
    context: rawDocument.rawText.slice(0, 8_000),
    createdAt: new Date().toISOString(),
  });
  if (reviewItem) enqueueSemanticReviewItem(reviewItem);
  return {
    status: 'review',
    message: '单案例语义解析完成，但 Audit 未通过，已进入人工复核。',
    auditReasonCodes: audited.audit.reasonCodes,
  };
};
