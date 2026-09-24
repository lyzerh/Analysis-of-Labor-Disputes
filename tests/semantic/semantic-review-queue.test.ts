import { describe, expect, it, vi } from 'vitest';
import {
  applySemanticReviewCorrection,
  createTechnicalManualReviewItem,
  createSemanticReviewItemFromAudit,
  enqueueSemanticReviewItem,
  getAuditReasonLabel,
  getCurrentSemanticReviewAudit,
  reviewSemanticReviewItem,
  saveReviewedSemanticReviewItem,
  type SemanticReviewItem,
} from '../../src/services/semantic/SemanticReviewQueue';
import { readSemanticReviewItems } from '../../src/services/semantic/SemanticReviewStorage';
import type { SemanticResolutionResult } from '../../src/services/semantic/SemanticResult';
import type { UnresolvedSemanticTask } from '../../src/services/semantic/SemanticResult';
import type { SemanticLocalAuditResult } from '../../src/services/semantic/SemanticResultAudit';
import {
  appendSemanticTechnicalFailure,
  readSemanticTechnicalFailures,
  semanticTechnicalFailureStorageKey,
} from '../../src/services/semantic/SemanticTechnicalFailureStorage';
import { resolveUnresolvedSemanticTaskWithReview } from '../../src/services/semantic/SemanticResolutionOrchestrator';
import type { SemanticResultResolver } from '../../src/services/semantic/SemanticResultResolver';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null { return this.values.get(key) || null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
  clear(): void { this.values.clear(); }
}

const result = (overrides: Partial<SemanticResolutionResult> = {}): SemanticResolutionResult => ({
  status: 'unresolved', resolver: 'llm', parties: [], claims: [], judgmentItems: [], claimResolutions: [],
  applicantRole: 'unknown', applicantOutcome: 'unclear', employeeOutcome: 'unclear', employerOutcome: 'unclear',
  confidence: 0, ...overrides,
});

const audit: SemanticLocalAuditResult = {
  decision: 'fail',
  reasonCodes: ['source_evidence_not_found', 'unresolved_result'],
  admissionConfidenceThreshold: 0.8,
};

const input = {
  caseId: 'case-1',
  caseTitle: '甲公司与乙某劳动争议',
  result: result(),
  audit,
  unresolvedTargets: [{ type: 'case_outcome' as const, reasonCode: 'outcome_unclear' as const }],
  context: '原告请求支付工资，裁判主文未明确。',
  createdAt: '2026-09-17T00:00:00.000Z',
};

const technicalTask: UnresolvedSemanticTask = {
  status: 'unresolved',
  caseId: 'case-technical',
  reasonCodes: ['claim_judgment_match_unclear'],
  rawText: '原始裁判文书：请求支付工资，判决主文未明确。',
  knownClaims: [{
    id: 'claim-1', claimantPartyIds: [], claimantRole: 'employee', claimType: 'unpaid_remuneration', claimText: '请求支付工资', claimLabel: '未支付劳动报酬',
  }],
  knownJudgmentItems: [{ id: 'judgment-1', text: '判决主文片段' }],
  unresolvedTargets: [{ type: 'claim_resolution', id: 'claim-1', reasonCode: 'claim_judgment_match_unclear' }],
};

describe('Semantic human review queue', () => {
  it('does not create a review item when the audit passes', () => {
    expect(createSemanticReviewItemFromAudit({ ...input, audit: { ...audit, decision: 'pass', reasonCodes: [] } })).toBeNull();
  });

  it('creates a pending item with case, target, reason, result, evidence context', () => {
    const item = createSemanticReviewItemFromAudit(input);
    expect(item).toMatchObject({
      id: 'case-1::case_outcome::source_evidence_not_found|unresolved_result',
      caseId: 'case-1', caseTitle: '甲公司与乙某劳动争议', status: 'pending',
      context: input.context, semanticResult: input.result, audit,
    });
    expect(item?.unresolvedTargets).toHaveLength(1);
  });

  it('keeps historical audit provenance while exposing a current-rule audit', () => {
    const resolved = result({
      status: 'resolved',
      confidence: 0.85,
      parties: [{ id: 'party-1', name: '乙某', laborRole: 'employee', proceduralRoles: ['plaintiff'] }],
      claims: [{ id: 'claim-1', claimantPartyIds: ['party-1'], claimantRole: 'employee', claimType: '工资', claimText: '乙某请求支付工资' }],
      judgmentItems: [{ id: 'judgment-1', text: '判决甲公司支付乙某工资' }],
      claimResolutions: [{ claimId: 'claim-1', judgmentItemIds: ['judgment-1'], outcome: 'supported', confidence: 0.85 }],
      applicantRole: 'employee', applicantOutcome: 'supported', employeeOutcome: 'supported', employerOutcome: 'not_supported',
    });
    const item = createSemanticReviewItemFromAudit({
      ...input,
      result: resolved,
      audit: { ...audit, reasonCodes: ['confidence_below_admission_threshold'], admissionConfidenceThreshold: 0.9 },
      auditContext: {
        rawText: '乙某请求支付工资。判决甲公司支付乙某工资。',
        knownParties: resolved.parties,
        knownClaims: resolved.claims,
        knownJudgmentItems: resolved.judgmentItems,
        requiredClaimResolutionIds: ['claim-1'],
      },
    });
    expect(item?.audit.admissionConfidenceThreshold).toBe(0.9);
    expect(item && getCurrentSemanticReviewAudit(item)).toMatchObject({
      decision: 'pass', reasonCodes: [], admissionConfidenceThreshold: 0.8,
    });
  });

  it('re-evaluates a legacy item from its stored context without mutating history', () => {
    const resolved = result({
      status: 'resolved',
      confidence: 0.85,
      parties: [{ id: 'party-1', name: '乙某', laborRole: 'employee', proceduralRoles: ['plaintiff'] }],
      claims: [{ id: 'claim-1', claimantPartyIds: ['party-1'], claimantRole: 'employee', claimType: '工资', claimText: '乙某请求支付工资' }],
      judgmentItems: [{ id: 'judgment-1', text: '判决甲公司支付乙某工资' }],
      claimResolutions: [{ claimId: 'claim-1', judgmentItemIds: ['judgment-1'], outcome: 'supported', confidence: 0.85 }],
      applicantRole: 'employee', applicantOutcome: 'supported', employeeOutcome: 'supported', employerOutcome: 'not_supported',
    });
    const item = createSemanticReviewItemFromAudit({
      ...input,
      result: resolved,
      audit: { ...audit, reasonCodes: ['confidence_below_admission_threshold'], admissionConfidenceThreshold: 0.9 },
      context: '乙某请求支付工资。判决甲公司支付乙某工资。',
    });
    expect(item).toBeTruthy();
    expect(item && getCurrentSemanticReviewAudit(item)).toMatchObject({ decision: 'pass', admissionConfidenceThreshold: 0.8 });
    expect(item?.audit).toMatchObject({ decision: 'fail', admissionConfidenceThreshold: 0.9 });
  });

  it('routes a valid but low-confidence candidate to Needs Review', () => {
    const item = createSemanticReviewItemFromAudit({
      ...input,
      result: result({ status: 'resolved', confidence: 0.72 }),
      audit: { ...audit, reasonCodes: ['confidence_below_admission_threshold'] },
    });
    expect(item).toMatchObject({ status: 'pending', semanticResult: { status: 'resolved', confidence: 0.72 } });
  });

  it('technical failure does not create a misleading human-review item', () => {
    const technical = createSemanticReviewItemFromAudit({
      ...input,
      result: result({ resolverErrorCode: 'timeout' }),
      audit: { ...audit, reasonCodes: ['technical_resolution_failure', 'unresolved_result'] },
    });
    expect(technical).toBeNull();
    expect(getAuditReasonLabel('technical_resolution_failure')).toBe('技术失败');
    expect(getAuditReasonLabel('unresolved_result')).toBe('当前结果尚未明确');
    expect(createSemanticReviewItemFromAudit({
      ...input,
      audit: { ...audit, reasonCodes: ['technical_resolution_failure'] },
    })).toBeNull();
  });

  it('persists pending and reviewed items with a stable local storage contract', () => {
    const storage = new MemoryStorage() as unknown as Storage;
    const item = createSemanticReviewItemFromAudit(input)!;
    enqueueSemanticReviewItem(item, storage);
    expect(readSemanticReviewItems(storage)).toHaveLength(1);
    const reviewed = saveReviewedSemanticReviewItem(item, {
      applicantRole: 'employer', applicantOutcome: 'not_supported',
    }, '2026-09-17T01:00:00.000Z', storage);
    expect(reviewed.status).toBe('reviewed');
    expect(readSemanticReviewItems(storage)[0]).toMatchObject({ status: 'reviewed', reviewedAt: '2026-09-17T01:00:00.000Z' });
  });

  it('applies party, claimant, outcome, and relation corrections without mutating the source result', () => {
    const source = result({
      status: 'resolved', confidence: 0.95,
      parties: [{ id: 'party-1', name: '甲公司', laborRole: 'unknown', proceduralRoles: ['plaintiff'] }],
      claims: [{ id: 'claim-1', claimantPartyIds: ['party-1'], claimantRole: 'unknown', claimType: '工资', claimText: '请求支付工资' }],
      judgmentItems: [{ id: 'judgment-1', text: '判决支付工资' }],
      claimResolutions: [{ claimId: 'claim-1', judgmentItemIds: [], outcome: 'unclear', confidence: 0.95 }],
      applicantRole: 'unknown', applicantOutcome: 'unclear', employeeOutcome: 'unclear', employerOutcome: 'unclear',
    });
    const corrected = applySemanticReviewCorrection(source, {
      partyRoles: { 'party-1': { laborRole: 'employer' } },
      claimOwners: { 'claim-1': { claimantPartyIds: ['party-1'], claimantRole: 'employer' } },
      claimOutcomes: { 'claim-1': { outcome: 'supported', judgmentItemIds: ['judgment-1'] } },
      applicantRole: 'employer', applicantOutcome: 'supported', employerOutcome: 'supported', employeeOutcome: 'not_supported',
    });
    expect(source.parties[0].laborRole).toBe('unknown');
    expect(corrected.parties[0].laborRole).toBe('employer');
    expect(corrected.claimResolutions[0]).toMatchObject({ outcome: 'supported', judgmentItemIds: ['judgment-1'] });
  });

  it('allows a human claim outcome without requiring an evidence selection', () => {
    const source = result({
      status: 'resolved', confidence: 0.91,
      claims: [{ id: 'claim-1', claimantPartyIds: [], claimantRole: 'employee', claimType: '工资', claimText: '请求支付工资' }],
      judgmentItems: [{ id: 'judgment-1', text: '判决支付工资' }, { id: 'judgment-2', text: '驳回其他请求' }],
      claimResolutions: [{ claimId: 'claim-1', judgmentItemIds: ['judgment-1'], outcome: 'unclear', confidence: 0.91 }],
    });
    const corrected = applySemanticReviewCorrection(source, { claimOutcomes: { 'claim-1': { outcome: 'supported' } } });
    expect(corrected.claimResolutions[0]).toMatchObject({ outcome: 'supported', judgmentItemIds: ['judgment-1'] });
    expect(source.claimResolutions[0].judgmentItemIds).toEqual(['judgment-1']);
  });

  it.each([
    ['supported', '支持'],
    ['partially_supported', '部分支持'],
    ['not_supported', '不支持'],
    ['unclear', '无法判断'],
  ] as const)('persists the human claim outcome %s independently of evidence mapping', (outcome, _label) => {
    const source = result({
      status: 'resolved', confidence: 0.91,
      claims: [{ id: 'claim-1', claimantPartyIds: [], claimantRole: 'employee', claimType: '工资', claimText: '请求支付工资' }],
      judgmentItems: [{ id: 'judgment-1', text: '判决支付工资' }],
      claimResolutions: [{ claimId: 'claim-1', judgmentItemIds: ['judgment-1'], outcome: 'supported', confidence: 0.91 }],
    });
    const corrected = applySemanticReviewCorrection(source, { claimOutcomes: { 'claim-1': { outcome } } });
    expect(corrected.claimResolutions[0]).toMatchObject({ outcome, judgmentItemIds: ['judgment-1'] });
  });

  it('updates evidence IDs only when the reviewer explicitly changes the evidence mapping', () => {
    const source = result({
      status: 'resolved', confidence: 0.91,
      claims: [{ id: 'claim-1', claimantPartyIds: [], claimantRole: 'employee', claimType: '工资', claimText: '请求支付工资' }],
      judgmentItems: [{ id: 'judgment-1', text: '判决支付工资' }, { id: 'judgment-2', text: '驳回其他请求' }],
      claimResolutions: [{ claimId: 'claim-1', judgmentItemIds: ['judgment-1'], outcome: 'supported', confidence: 0.91 }],
    });
    const corrected = applySemanticReviewCorrection(source, { claimOutcomes: { 'claim-1': { outcome: 'partially_supported', judgmentItemIds: ['judgment-2'] } } });
    expect(corrected.claimResolutions[0]).toMatchObject({ outcome: 'partially_supported', judgmentItemIds: ['judgment-2'] });
  });

  it('preserves the original AI candidate when saving a human outcome', () => {
    const item = createSemanticReviewItemFromAudit({
      ...input,
      result: result({
        status: 'resolved', confidence: 0.91,
        claims: [{ id: 'claim-1', claimantPartyIds: [], claimantRole: 'employee', claimType: '工资', claimText: '请求支付工资' }],
        claimResolutions: [{ claimId: 'claim-1', judgmentItemIds: [], outcome: 'unclear', confidence: 0.91 }],
      }),
    })!;
    const reviewed = reviewSemanticReviewItem(item, { claimOutcomes: { 'claim-1': { outcome: 'not_supported' } } }, '2026-09-17T02:30:00.000Z');
    expect(reviewed.reviewedResult?.originalCandidate).toEqual(item.semanticResult);
    expect(reviewed.reviewedResult?.reviewedResult.claimResolutions[0].outcome).toBe('not_supported');
  });

  it('marks a review item reviewed without sending it back to a resolver', () => {
    const item = createSemanticReviewItemFromAudit(input)!;
    const reviewed = reviewSemanticReviewItem(item, { employeeOutcome: 'supported' }, '2026-09-17T02:00:00.000Z');
    expect(reviewed).toMatchObject({ status: 'reviewed', reviewedResult: { source: 'human_review', reviewStatus: 'approved' } });
    expect(reviewed.reviewedResult?.reviewedAt).toBe('2026-09-17T02:00:00.000Z');
    expect(reviewed.reviewedResult?.reviewAction).toBe('edit');
    expect(reviewed.reviewedResult?.originalCandidate).toEqual(item.semanticResult);
    expect(reviewed.reviewedResult?.finalValue).toEqual(reviewed.reviewedResult?.reviewedResult);
  });

  it('preserves the AI candidate on accept and keeps unresolved action blocked', () => {
    const item = createSemanticReviewItemFromAudit({ ...input, result: result({ status: 'resolved', confidence: 0.72 }) })!;
    const accepted = reviewSemanticReviewItem(item, {}, '2026-09-17T05:00:00.000Z', { reviewAction: 'accept' });
    expect(accepted.reviewedResult?.reviewAction).toBe('accept');
    expect(accepted.reviewedResult?.originalCandidate).toEqual(item.semanticResult);
    expect(accepted.reviewedResult?.reviewedResult.status).toBe('resolved');
    const unresolved = reviewSemanticReviewItem(item, {}, '2026-09-17T06:00:00.000Z', { reviewAction: 'unresolved' });
    expect(unresolved.reviewedResult?.reviewAction).toBe('unresolved');
    expect(unresolved.reviewedResult?.reviewedResult.status).toBe('unresolved');
    expect(unresolved.reviewedResult?.reviewedResult.unresolvedReasonCodes).toContain('outcome_unclear');
  });

  it('automatically enqueues only audit failures in the orchestration wrapper', async () => {
    const storage = new MemoryStorage() as unknown as Storage;
    const resolver: SemanticResultResolver = { resolve: vi.fn().mockResolvedValue(result()) };
    const audited = await resolveUnresolvedSemanticTaskWithReview({
      status: 'unresolved', caseId: 'case-queue', rawText: '原文', reasonCodes: ['outcome_unclear'], unresolvedTargets: [],
    }, resolver, { storage, createdAt: '2026-09-17T03:00:00.000Z' });
    expect(audited.reviewItem?.status).toBe('pending');
    expect(audited.reviewItem?.auditContext).toMatchObject({ rawText: '原文', requiredClaimResolutionIds: [] });
    expect(readSemanticReviewItems(storage)).toHaveLength(1);
    expect(resolver.resolve).toHaveBeenCalledTimes(1);
  });

  it('keeps the pending/reviewed status boundary explicit', () => {
    const item = createSemanticReviewItemFromAudit(input)!;
    expect(item.status).toBe('pending');
    const reviewed = reviewSemanticReviewItem(item, {}, '2026-09-17T04:00:00.000Z');
    expect(reviewed.status).toBe('reviewed');
    expect(reviewed.reviewedResult?.source).toBe('human_review');
  });

  it('creates a distinct no-candidate manual item and preserves technical history', () => {
    const failure = appendSemanticTechnicalFailure({
      caseId: technicalTask.caseId,
      failureStage: 'provider',
      failureCode: 'timeout',
      errorSummary: 'request timed out',
      timestamp: '2026-09-17T05:00:00.000Z',
    }, new MemoryStorage() as unknown as Storage);
    const item = createTechnicalManualReviewItem({
      task: technicalTask,
      caseTitle: '技术失败案件',
      technicalFailureHistory: [failure],
      createdAt: '2026-09-17T05:01:00.000Z',
    });
    expect(item).toMatchObject({ status: 'pending', candidateStatus: 'no_candidate', caseId: technicalTask.caseId });
    expect(item.technicalFailureHistory).toEqual([failure]);
    const storage = new MemoryStorage() as unknown as Storage;
    enqueueSemanticReviewItem(item, storage);
    expect(readSemanticReviewItems(storage)[0]).toMatchObject({ candidateStatus: 'no_candidate', technicalFailureHistory: [failure] });
    const reviewed = reviewSemanticReviewItem(item, { claimOutcomes: { 'claim-1': { outcome: 'supported' } } }, '2026-09-17T05:02:00.000Z');
    expect(reviewed.reviewedResult?.originalCandidate).toBeNull();
    expect(reviewed.reviewedResult?.reviewedResult.claimResolutions[0].outcome).toBe('supported');
    expect(reviewed.technicalFailureHistory).toEqual([failure]);
  });

  it('keeps technical history and human finalValue across a persisted manual-review reload', () => {
    const storage = new MemoryStorage() as unknown as Storage;
    const failure = appendSemanticTechnicalFailure({
      caseId: technicalTask.caseId,
      failureStage: 'validation',
      failureCode: 'schema_invalid',
      httpStatus: 200,
      errorSummary: 'provider JSON failed the semantic schema',
      timestamp: '2026-09-17T05:10:00.000Z',
    }, storage);
    const item = createTechnicalManualReviewItem({
      task: technicalTask,
      technicalFailureHistory: [failure],
      createdAt: '2026-09-17T05:10:01.000Z',
    });
    enqueueSemanticReviewItem(item, storage);
    saveReviewedSemanticReviewItem(item, { claimOutcomes: { 'claim-1': { outcome: 'supported' } } }, '2026-09-17T05:10:02.000Z', storage);

    const reloaded = readSemanticReviewItems(storage)[0];
    expect(reloaded).toMatchObject({
      status: 'reviewed',
      candidateStatus: 'no_candidate',
      technicalFailureHistory: [{ failureCode: 'schema_invalid', httpStatus: 200, attempt: 1 }],
      reviewedResult: {
        originalCandidate: null,
        finalValue: { claimResolutions: [{ claimId: 'claim-1', outcome: 'supported' }] },
      },
    });
    expect(readSemanticTechnicalFailures(storage)).toEqual([failure]);
  });

  it('keeps a no-candidate manual result unresolved when the human chooses unclear', () => {
    const item = createTechnicalManualReviewItem({
      task: technicalTask,
      technicalFailureHistory: [],
      createdAt: '2026-09-17T05:03:00.000Z',
    });
    const reviewed = reviewSemanticReviewItem(item, { claimOutcomes: { 'claim-1': { outcome: 'unclear' } } }, '2026-09-17T05:04:00.000Z');
    expect(reviewed.reviewedResult?.originalCandidate).toBeNull();
    expect(reviewed.reviewedResult?.reviewedResult.status).toBe('unresolved');
    expect(reviewed.reviewedResult?.reviewedResult.claimResolutions[0].outcome).toBe('unclear');
  });

  it('uses an explicit request-text fallback for manual review when provenance is unavailable', () => {
    const item = createTechnicalManualReviewItem({
      task: { ...technicalTask, knownClaims: technicalTask.knownClaims?.map((claim) => ({ ...claim, claimText: '' })) },
      technicalFailureHistory: [],
      createdAt: '2026-09-17T05:04:30.000Z',
    });
    expect(item.candidateStatus).toBe('no_candidate');
    expect(item.semanticResult.claims[0].claimText).toBe('暂未定位到明确的请求原文');
  });

  it('stores technical failures with safe redaction and no authorization material', () => {
    const storage = new MemoryStorage() as unknown as Storage;
    appendSemanticTechnicalFailure({
      caseId: 'case-secret',
      failureStage: 'provider',
      failureCode: 'provider_error',
      httpStatus: 401,
      errorSummary: 'Authorization: Bearer sk-or-v1-secret-value',
      timestamp: '2026-09-17T05:05:00.000Z',
    }, storage);
    const raw = storage.getItem(semanticTechnicalFailureStorageKey) || '';
    expect(raw).not.toContain('sk-or-v1-secret-value');
    expect(raw).not.toContain('Bearer sk-or-v1-secret-value');
    expect(readSemanticTechnicalFailures(storage)[0]).toMatchObject({ caseId: 'case-secret', failureCode: 'provider_error', httpStatus: 401 });
  });
});
