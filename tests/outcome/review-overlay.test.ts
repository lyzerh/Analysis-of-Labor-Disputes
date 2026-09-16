import { describe, expect, it } from 'vitest';
import type { AnalysisCaseRecord, ReviewOverlay } from '../../src/types';
import { analysisRecord } from './helpers/record-factories';
import {
  applyAcceptedReviewOverlays,
  buildLlmReviewCandidateInput,
  buildReviewOverlayDraft,
  computeReviewedStats,
  computeRuleOnlyStats,
  getReviewedOutcomeForClaim,
  readReviewOverlays,
  reviewOverlaySchemaVersion,
  reviewOverlayStorageKey,
  saveReviewOverlay,
  summarizeReviewOverlayImpact,
  validateReviewOverlay,
  writeReviewOverlays,
} from '../../src/services/review/ReviewOverlayService';
import { buildOutcomeReviewQueue } from '../../src/services/outcome/OutcomeReviewQueue';

function recordWithClaim(): AnalysisCaseRecord {
  return analysisRecord('overlay-case', 'unclear', {
    applicantRole: 'employee',
    employeeOutcome: 'unclear',
    employerOutcome: 'unclear',
    applicantOutcome: 'unclear',
    overallResult: 'unclear',
    claims: [{
      id: 'claim-1',
      claimName: '经济补偿金',
      claimType: 'economic_compensation',
      claimant: 'employee',
      claimantRole: 'employee',
      supportStatus: 'unclear',
      sourceText: '请求经济补偿金',
    }],
  });
}

function draft(overrides: Partial<ReviewOverlay> = {}): ReviewOverlay {
  return buildReviewOverlayDraft({
    id: 'overlay-1',
    analysisRunId: 'run-1',
    caseId: 'overlay-case',
    reviewItemId: 'review-1',
    claimId: 'claim-1',
    target: 'claim',
    original: { outcome: 'unclear', claimantRole: 'employee' },
    reviewed: { outcome: 'supported', claimantRole: 'employee' },
    evidence: {
      claimText: '请求经济补偿金',
      dispositionText: '判令支付经济补偿金',
      diagnosticText: '复核确认裁判主文支持该诉求',
    },
    source: 'human',
    createdAt: '2026-09-16T10:00:00.000Z',
    updatedAt: '2026-09-16T10:00:00.000Z',
    ...overrides,
  });
}

function accepted(overrides: Partial<ReviewOverlay> = {}): ReviewOverlay {
  return { ...draft(overrides), status: 'accepted' };
}

describe('ReviewOverlay foundation', () => {
  it('builds a draft without changing the original outcome', () => {
    const original = recordWithClaim();
    const overlay = draft();
    expect(overlay.status).toBe('draft');
    expect(overlay.schemaVersion).toBe(reviewOverlaySchemaVersion);
    expect(original.claims[0].supportStatus).toBe('unclear');
    expect(validateReviewOverlay(overlay)).toBe(true);
  });

  it('ignores draft and rejected overlays in the reviewed projection', () => {
    const record = recordWithClaim();
    const rejected = { ...draft(), status: 'rejected' as const };
    expect(applyAcceptedReviewOverlays([record], [draft(), rejected], 'run-1')).toEqual(
      applyAcceptedReviewOverlays([record], [], 'run-1'),
    );
    expect(getReviewedOutcomeForClaim(record.claims[0], [draft(), rejected])).toBe('unclear');
  });

  it('applies an accepted claim outcome while preserving the source record', () => {
    const record = recordWithClaim();
    const original = structuredClone(record);
    const [reviewed] = applyAcceptedReviewOverlays([record], [accepted()], 'run-1');
    expect(reviewed.claims[0].supportStatus).toBe('supported');
    expect(reviewed.employeeOutcome).toBe('supported');
    expect(record).toEqual(original);
    expect(reviewed).not.toBe(record);
    expect(reviewed.claims).not.toBe(record.claims);
  });

  it('uses deterministic latest-wins ordering for multiple accepted overlays', () => {
    const older = accepted({ id: 'older', updatedAt: '2026-09-16T10:00:00.000Z', reviewed: { outcome: 'supported' } });
    const newer = accepted({ id: 'newer', updatedAt: '2026-09-16T11:00:00.000Z', reviewed: { outcome: 'not_supported' } });
    const [reviewed] = applyAcceptedReviewOverlays([recordWithClaim()], [newer, older], 'run-1');
    expect(reviewed.claims[0].supportStatus).toBe('not_supported');
    expect(getReviewedOutcomeForClaim(recordWithClaim().claims[0], [older, newer])).toBe('not_supported');
  });

  it('does not apply overlays from a different AnalysisRun', () => {
    const [reviewed] = applyAcceptedReviewOverlays([recordWithClaim()], [accepted({ analysisRunId: 'other-run' })], 'run-1');
    expect(reviewed.claims[0].supportStatus).toBe('unclear');
  });

  it('preserves typed evidence when building an LLM candidate boundary', () => {
    const [item] = buildOutcomeReviewQueue([analysisRecord('candidate-case', 'unclear', {
      outcomeDiagnostics: [{
        claimId: 'candidate-claim',
        claimType: 'economic_compensation',
        target: 'employee',
        outcome: 'unclear',
        reasonCode: 'amount_conflict',
        needsReview: true,
        evidence: {
          claimText: '请求金额 10,000 元',
          dispositionText: '判令支付 6,000 元',
          amountText: '请求 10,000；裁判 6,000',
        },
      }],
    })]);
    const candidate = buildLlmReviewCandidateInput(item);
    expect(candidate).toMatchObject({
      caseId: 'candidate-case',
      claimId: 'candidate-claim',
      currentOutcome: 'unclear',
      reasonCode: 'amount_conflict',
      evidence: {
        claimText: '请求金额 10,000 元',
        dispositionText: '判令支付 6,000 元',
        amountText: '请求 10,000；裁判 6,000',
      },
    });
  });

  it('keeps rule-only statistics unchanged and requires reviewed mode explicitly', () => {
    const record = recordWithClaim();
    const ruleOnly = computeRuleOnlyStats([record]);
    const reviewed = computeReviewedStats([record], [accepted()], 'run-1');
    expect(ruleOnly.byOutcome.unclear).toBe(1);
    expect(ruleOnly.byOutcome.supported).toBe(0);
    expect(reviewed.byOutcome.supported).toBe(1);
    expect(record.claims[0].supportStatus).toBe('unclear');
  });

  it('summarizes draft, accepted, and rejected impact without changing records', () => {
    const record = recordWithClaim();
    const overlays = [
      draft(),
      accepted({ id: 'accepted', updatedAt: '2026-09-16T11:00:00.000Z' }),
      { ...draft({ id: 'rejected' }), status: 'rejected' as const },
    ];
    expect(summarizeReviewOverlayImpact([record], overlays, 'run-1')).toEqual({
      totalOverlays: 3,
      draftCount: 1,
      acceptedCount: 1,
      rejectedCount: 1,
      affectedCaseCount: 1,
      affectedClaimCount: 1,
      outcomeChangeCount: 1,
    });
    expect(record.claims[0].supportStatus).toBe('unclear');
  });
});

describe('ReviewOverlay localStorage safety', () => {
  class MemoryStorage implements Storage {
    private values = new Map<string, string>();
    get length() { return this.values.size; }
    clear() { this.values.clear(); }
    getItem(key: string) { return this.values.get(key) ?? null; }
    key(index: number) { return [...this.values.keys()][index] ?? null; }
    removeItem(key: string) { this.values.delete(key); }
    setItem(key: string, value: string) { this.values.set(key, value); }
  }

  it('ignores corrupted, invalid, and wrong-version persisted overlays', () => {
    const storage = new MemoryStorage();
    storage.setItem(reviewOverlayStorageKey, JSON.stringify([
      { ...draft(), schemaVersion: 'review-overlay-v0' },
      { ...draft({ id: 'invalid' }), reviewed: 'not-an-object' },
      draft(),
    ]));
    expect(readReviewOverlays(storage)).toHaveLength(1);
    storage.setItem(reviewOverlayStorageKey, '{broken');
    expect(readReviewOverlays(storage)).toEqual([]);
  });

  it('persists only valid overlays and safely handles unavailable storage', () => {
    const storage = new MemoryStorage();
    writeReviewOverlays([draft(), { ...draft({ id: 'invalid' }), target: 'bad' as never }], storage);
    expect(readReviewOverlays(storage)).toHaveLength(1);
    expect(saveReviewOverlay(draft({ id: 'saved' }), storage)).toBe(true);
    expect(readReviewOverlays(storage).map((item) => item.id)).toEqual(['overlay-1', 'saved']);
    expect(saveReviewOverlay({} as ReviewOverlay, undefined)).toBe(false);
    expect(() => writeReviewOverlays([draft()], undefined)).not.toThrow();
  });
});
