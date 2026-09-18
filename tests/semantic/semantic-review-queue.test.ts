import { describe, expect, it, vi } from 'vitest';
import {
  applySemanticReviewCorrection,
  createSemanticReviewItemFromAudit,
  enqueueSemanticReviewItem,
  getAuditReasonLabel,
  reviewSemanticReviewItem,
  saveReviewedSemanticReviewItem,
  type SemanticReviewItem,
} from '../../src/services/semantic/SemanticReviewQueue';
import { readSemanticReviewItems } from '../../src/services/semantic/SemanticReviewStorage';
import type { SemanticResolutionResult } from '../../src/services/semantic/SemanticResult';
import type { SemanticLocalAuditResult } from '../../src/services/semantic/SemanticResultAudit';
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
  admissionConfidenceThreshold: 0.9,
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

  it('technical failure remains reviewable without inventing a conclusion', () => {
    const technical = createSemanticReviewItemFromAudit({
      ...input,
      result: result({ resolverErrorCode: 'timeout' }),
      audit: { ...audit, reasonCodes: ['technical_resolution_failure', 'unresolved_result'] },
    });
    expect(technical?.status).toBe('pending');
    expect(technical?.semanticResult.employeeOutcome).toBe('unclear');
    expect(getAuditReasonLabel('technical_resolution_failure')).toContain('未能可靠');
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

  it('marks a review item reviewed without sending it back to a resolver', () => {
    const item = createSemanticReviewItemFromAudit(input)!;
    const reviewed = reviewSemanticReviewItem(item, { employeeOutcome: 'supported' }, '2026-09-17T02:00:00.000Z');
    expect(reviewed).toMatchObject({ status: 'reviewed', reviewedResult: { source: 'human_review', reviewStatus: 'approved' } });
    expect(reviewed.reviewedResult?.reviewedAt).toBe('2026-09-17T02:00:00.000Z');
  });

  it('automatically enqueues only audit failures in the orchestration wrapper', async () => {
    const storage = new MemoryStorage() as unknown as Storage;
    const resolver: SemanticResultResolver = { resolve: vi.fn().mockResolvedValue(result()) };
    const audited = await resolveUnresolvedSemanticTaskWithReview({
      status: 'unresolved', caseId: 'case-queue', rawText: '原文', reasonCodes: ['outcome_unclear'], unresolvedTargets: [],
    }, resolver, { storage, createdAt: '2026-09-17T03:00:00.000Z' });
    expect(audited.reviewItem?.status).toBe('pending');
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
});
