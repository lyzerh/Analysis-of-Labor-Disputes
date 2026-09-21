import type { AnalysisCaseRecord, RawDocument } from '../../types';
import { createBrowserDeepSeekSemanticClient } from './BrowserDeepSeekSemanticClient';
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
}

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
    claimText: claim.sourceText || claim.claimName,
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
    return { status: 'awaiting_llm', message: 'DeepSeek API Key 未配置，案例保持待 AI 语义分析。' };
  }
  if (!isLlmAvailable(settings)) {
    return { status: 'awaiting_llm', message: 'DeepSeek API Key 未配置，案例保持待 AI 语义分析。' };
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
    client: createBrowserDeepSeekSemanticClient(settings.apiKey, { caseId: record.caseId }),
  });
  const audited = await resolveUnresolvedSemanticTaskWithAudit(task, resolver);

  if (audited.result.resolverErrorCode && TECHNICAL_RESOLVER_ERROR_CODES.includes(audited.result.resolverErrorCode)) {
    traceSemantic('finalRouting', {
      caseId: record.caseId,
      status: 'technical_failure',
      resolverErrorCode: audited.result.resolverErrorCode,
      auditDecision: audited.audit.decision,
      auditReasonCodes: audited.audit.reasonCodes,
    });
    return {
      status: 'technical_failure',
      message: '语义分析技术失败，未生成可供人工判断的候选结果；未创建人工复核项。',
      auditReasonCodes: audited.audit.reasonCodes,
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
  };
};
