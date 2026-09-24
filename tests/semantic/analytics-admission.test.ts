import { describe, expect, it, vi } from 'vitest';
import { DefenseStrategyAnalyzer } from '../../src/services/analytics/DefenseStrategyAnalyzer';
import { LaborDisputeAnalyticsEngine } from '../../src/services/analytics/LaborDisputeAnalyticsEngine';
import {
  evaluateAnalyticsAdmission,
  filterAnalyticsEligibleRecords,
  resolveAcceptedSemanticResult,
} from '../../src/services/analytics/AnalyticsAdmission';
import { analysisRecord } from '../outcome/helpers/record-factories';
import type {
  ResolvedSemanticResult,
  SemanticResolutionResult,
} from '../../src/services/semantic/SemanticResult';
import type { SemanticLocalAuditResult } from '../../src/services/semantic/SemanticResultAudit';
import {
  createSemanticReviewItemFromAudit,
  reviewSemanticReviewItem,
  type SemanticReviewItem,
} from '../../src/services/semantic/SemanticReviewQueue';
import { writeSemanticReviewItems } from '../../src/services/semantic/SemanticReviewStorage';

const semanticResult = (
  overrides: Partial<SemanticResolutionResult> = {},
): SemanticResolutionResult => ({
  status: 'resolved',
  resolver: 'llm',
  parties: [
    { id: 'employee-1', name: '乙某', laborRole: 'employee', proceduralRoles: ['plaintiff'] },
    { id: 'employer-1', name: '甲公司', laborRole: 'employer', proceduralRoles: ['defendant'] },
  ],
  claims: [{
    id: 'claim-1', claimantPartyIds: ['employee-1'], claimantRole: 'employee',
    claimType: '工资', claimText: '乙某请求支付工资',
  }],
  judgmentItems: [{ id: 'judgment-1', text: '判决甲公司支付乙某工资' }],
  claimResolutions: [{
    claimId: 'claim-1', judgmentItemIds: ['judgment-1'], outcome: 'supported', confidence: 0.95,
  }],
  applicantRole: 'employee',
  applicantOutcome: 'supported',
  employeeOutcome: 'supported',
  employerOutcome: 'not_supported',
  confidence: 0.95,
  ...overrides,
});

const ruleResult = (): ResolvedSemanticResult => {
  const { resolver: _resolver, ...result } = semanticResult();
  return { ...result, status: 'resolved' };
};

const unresolvedReference = {
  sourceText: '待解析裁判片段',
  referencedClaimIds: [],
  confidence: 0,
  resolutionMethod: 'unresolved' as const,
  needsSemanticResolution: true as const,
};

const audit = (decision: SemanticLocalAuditResult['decision']): SemanticLocalAuditResult => ({
  decision,
  reasonCodes: decision === 'pass' ? [] : ['source_evidence_not_found'],
  admissionConfidenceThreshold: 0.8,
});

const reviewItem = (result: SemanticResolutionResult): SemanticReviewItem => ({
  id: 'review-1',
  caseId: 'case-human',
  status: 'pending',
  semanticResult: result,
  audit: audit('fail'),
  createdAt: '2026-09-17T00:00:00.000Z',
});

const currentAuditContext = (result: SemanticResolutionResult) => ({
  rawText: '乙某请求支付工资。判决甲公司支付乙某工资。',
  knownParties: result.parties,
  knownClaims: result.claims,
  knownJudgmentItems: result.judgmentItems,
  requiredClaimResolutionIds: ['claim-1'],
});

const createReviewItemWithContext = (result: SemanticResolutionResult): SemanticReviewItem => {
  const item = createSemanticReviewItemFromAudit({
    caseId: 'case-human-current-audit',
    result,
    audit: {
      decision: 'fail',
      reasonCodes: ['confidence_below_admission_threshold'],
      admissionConfidenceThreshold: 0.9,
    },
    auditContext: currentAuditContext(result),
    createdAt: '2026-09-17T00:00:00.000Z',
  });
  if (!item) throw new Error('expected review item');
  return item;
};

describe('Analytics Gate admission contract', () => {
  it('admits a resolved deterministic rule result', () => {
    const result = evaluateAnalyticsAdmission({
      record: analysisRecord('rule-case', 'supported'),
      ruleResult: ruleResult(),
    });
    expect(result).toMatchObject({ status: 'eligible', source: 'rule', reasonCodes: [] });
  });

  it('admits an LLM result only after a passing local audit', () => {
    const result = evaluateAnalyticsAdmission({
      record: analysisRecord('llm-case', 'supported'),
      semanticResult: semanticResult(),
      audit: audit('pass'),
    });
    expect(result).toMatchObject({ status: 'eligible', source: 'llm', reasonCodes: [] });
  });

  it('recomputes a historical .90 audit with the current .80 threshold', () => {
    const result = semanticResult({
      confidence: 0.85,
      claimResolutions: [{ ...semanticResult().claimResolutions[0], confidence: 0.85 }],
    });
    const historicalAudit: SemanticLocalAuditResult = {
      decision: 'fail',
      reasonCodes: ['confidence_below_admission_threshold'],
      admissionConfidenceThreshold: 0.9,
    };
    const admission = evaluateAnalyticsAdmission({
      record: analysisRecord('stale-threshold', 'supported'),
      semanticResult: result,
      audit: historicalAudit,
      semanticAuditContext: currentAuditContext(result),
    });
    expect(admission).toMatchObject({ status: 'eligible', source: 'llm', reasonCodes: [] });
    expect(historicalAudit.admissionConfidenceThreshold).toBe(0.9);
  });

  it('keeps a result below the current .80 threshold blocked', () => {
    const result = semanticResult({
      confidence: 0.75,
      claimResolutions: [{ ...semanticResult().claimResolutions[0], confidence: 0.75 }],
    });
    const admission = evaluateAnalyticsAdmission({
      record: analysisRecord('current-threshold-fail', 'supported'),
      semanticResult: result,
      audit: { decision: 'pass', reasonCodes: [], admissionConfidenceThreshold: 0.9 },
      semanticAuditContext: currentAuditContext(result),
    });
    expect(admission.status).toBe('blocked');
    expect(admission.reasonCodes).toContain('audit_failed');
  });

  it('keeps an unresolved result blocked after current-rule recomputation', () => {
    const result = semanticResult({ status: 'unresolved', confidence: 0.85 });
    const admission = evaluateAnalyticsAdmission({
      record: analysisRecord('stale-unresolved', 'supported'),
      semanticResult: result,
      audit: { decision: 'pass', reasonCodes: [], admissionConfidenceThreshold: 0.9 },
      semanticAuditContext: currentAuditContext(result),
    });
    expect(admission.status).toBe('blocked');
    expect(admission.reasonCodes).toContain('semantic_unresolved');
  });

  it('keeps invalid evidence blocked even when historical audit passed', () => {
    const base = semanticResult();
    const result = semanticResult({
      claims: [{ ...base.claims[0], sourceEvidence: { text: '不存在于原文的证据' } }],
    });
    const admission = evaluateAnalyticsAdmission({
      record: analysisRecord('stale-evidence', 'supported'),
      semanticResult: result,
      audit: { decision: 'pass', reasonCodes: [], admissionConfidenceThreshold: 0.9 },
      semanticAuditContext: currentAuditContext(result),
    });
    expect(admission.status).toBe('blocked');
    expect(admission.reasonCodes).toContain('audit_failed');
  });

  it('keeps a current structural relationship error blocked despite an old pass', () => {
    const result = semanticResult({
      claimResolutions: [{ ...semanticResult().claimResolutions[0], judgmentItemIds: [] }],
    });
    const admission = evaluateAnalyticsAdmission({
      record: analysisRecord('stale-structure', 'supported'),
      semanticResult: result,
      audit: { decision: 'pass', reasonCodes: [], admissionConfidenceThreshold: 0.9 },
      semanticAuditContext: currentAuditContext(result),
    });
    expect(admission.status).toBe('blocked');
    expect(admission.reasonCodes).toContain('audit_failed');
  });

  it('re-audits a human-approved result with current source context', () => {
    const candidate = semanticResult({ confidence: 0.85 });
    const pending = createReviewItemWithContext(candidate);
    const reviewed = reviewSemanticReviewItem(pending, {}, '2026-09-17T01:00:00.000Z', { reviewAction: 'accept' });
    const admission = evaluateAnalyticsAdmission({
      record: analysisRecord('case-human-current-audit', 'supported', { isIncludedInAnalysisSet: false }),
      reviewItems: [reviewed],
    });
    expect(admission).toMatchObject({ status: 'eligible', source: 'human_review', reasonCodes: [] });
  });

  it('blocks an LLM result when the audit fails', () => {
    const result = evaluateAnalyticsAdmission({
      record: analysisRecord('audit-case', 'supported'),
      semanticResult: semanticResult(),
      audit: audit('fail'),
    });
    expect(result.status).toBe('blocked');
    expect(result.reasonCodes).toContain('audit_failed');
  });

  it('blocks a pending human review even when a draft semantic result is present', () => {
    const result = evaluateAnalyticsAdmission({
      record: analysisRecord('case-human', 'supported'),
      semanticResult: semanticResult(),
      audit: audit('pass'),
      reviewItems: [reviewItem(semanticResult())],
    });
    expect(result.status).toBe('blocked');
    expect(result.reasonCodes).toContain('review_pending');
  });

  it('reads a persisted pending review when the Pipeline calls the Gate without explicit review items', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
      removeItem: (key: string) => { data.delete(key); },
      clear: () => { data.clear(); },
      key: (index: number) => [...data.keys()][index] ?? null,
      get length() { return data.size; },
    } as unknown as Storage;
    const pending = reviewItem(semanticResult());
    pending.caseId = 'persisted-review';
    vi.stubGlobal('localStorage', storage);
    try {
      writeSemanticReviewItems([pending]);
      const result = evaluateAnalyticsAdmission({
        record: analysisRecord('persisted-review', 'supported'),
      });
      expect(result.status).toBe('blocked');
      expect(result.reasonCodes).toContain('review_pending');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('gives an approved human result priority over a failed LLM result', () => {
    const pending = reviewItem(semanticResult({ employerOutcome: 'supported' }));
    pending.status = 'reviewed';
    pending.reviewedAt = '2026-09-17T01:00:00.000Z';
    pending.reviewedResult = {
      source: 'human_review',
      reviewStatus: 'approved',
      reviewedAt: pending.reviewedAt,
      reviewedResult: semanticResult({ employerOutcome: 'not_supported' }),
    };
    const input = {
      record: analysisRecord('case-human', 'supported', { isIncludedInAnalysisSet: false }),
      semanticResult: semanticResult({ employerOutcome: 'supported' }),
      audit: audit('fail'),
      reviewItems: [pending],
    };
    expect(resolveAcceptedSemanticResult(input)).toMatchObject({
      source: 'human_review', result: { employerOutcome: 'not_supported' },
    });
    expect(evaluateAnalyticsAdmission(input)).toMatchObject({
      status: 'eligible', source: 'human_review', reasonCodes: [],
    });
  });

  it('projects the accepted human semantic value into the analytics view without mutating the source record', () => {
    const pending = reviewItem(semanticResult({
      applicantOutcome: 'supported',
      employeeOutcome: 'supported',
      employerOutcome: 'not_supported',
    }));
    pending.status = 'reviewed';
    pending.reviewedAt = '2026-09-17T01:30:00.000Z';
    pending.reviewedResult = {
      source: 'human_review',
      reviewStatus: 'approved',
      reviewedAt: pending.reviewedAt,
      reviewAction: 'edit',
      originalCandidate: semanticResult({ employerOutcome: 'supported' }),
      finalValue: semanticResult({ employerOutcome: 'not_supported' }),
      reviewedResult: semanticResult({ employerOutcome: 'not_supported' }),
    };
    const source = analysisRecord('case-human', 'supported', {
      applicantOutcome: 'not_supported',
      employeeOutcome: 'not_supported',
      overallResult: 'not_supported',
      claims: [{ id: 'claim-1', claimName: '工资', claimant: 'employee', supportStatus: 'not_supported' }],
    });
    const filtered = filterAnalyticsEligibleRecords([source], { reviewItems: [pending] });
    expect(filtered.eligibleRecords).toHaveLength(1);
    const projected = filtered.eligibleRecords[0];
    expect(projected).toMatchObject({
      caseId: 'case-human',
      rawDocumentId: source.rawDocumentId,
      employeeOutcome: 'supported',
      employerOutcome: 'not_supported',
      applicantOutcome: 'supported',
      overallResult: 'supported',
    });
    expect(projected.claims[0]).toMatchObject({ id: 'claim-1', supportStatus: 'supported' });
    expect(source.employeeOutcome).toBe('not_supported');
    expect(source.claims[0].supportStatus).toBe('not_supported');
    const report = LaborDisputeAnalyticsEngine.generateReport([source], { reviewItems: [pending] });
    expect(report.overall.includedCases).toBe(1);
    expect(report.targetCities.find((city) => city.city === '深圳')?.employeeOutcome.supported).toBe(1);
  });

  it('keeps a human-marked unresolved result blocked after review is completed', () => {
    const pending = reviewItem(semanticResult());
    pending.status = 'reviewed';
    pending.reviewedAt = '2026-09-17T01:40:00.000Z';
    pending.reviewedResult = {
      source: 'human_review',
      reviewStatus: 'approved',
      reviewedAt: pending.reviewedAt,
      reviewAction: 'unresolved',
      originalCandidate: semanticResult(),
      finalValue: semanticResult({ status: 'unresolved', unresolvedReasonCodes: ['outcome_unclear'] }),
      reviewedResult: semanticResult({ status: 'unresolved', unresolvedReasonCodes: ['outcome_unclear'] }),
    };
    const admission = evaluateAnalyticsAdmission({
      record: analysisRecord('case-human', 'supported'),
      semanticResult: semanticResult({ employerOutcome: 'supported' }),
      audit: audit('pass'),
      reviewItems: [pending],
    });
    expect(admission.status).toBe('blocked');
    expect(admission.reasonCodes).toContain('semantic_unresolved');
    expect(filterAnalyticsEligibleRecords([analysisRecord('case-human', 'supported')], { reviewItems: [pending] }).eligibleRecords).toHaveLength(0);
  });

  it('blocks technical resolver failures', () => {
    const result = evaluateAnalyticsAdmission({
      record: analysisRecord('technical-case', 'supported'),
      semanticResult: semanticResult({ status: 'unresolved', resolverErrorCode: 'timeout' }),
      audit: audit('fail'),
    });
    expect(result.reasonCodes).toContain('technical_failure');
  });

  it('keeps output-truncated resolver results out of Analytics', () => {
    const result = evaluateAnalyticsAdmission({
      record: analysisRecord('truncated-case', 'supported'),
      semanticResult: semanticResult({ status: 'unresolved', resolverErrorCode: 'output_truncated' }),
      audit: audit('fail'),
    });
    expect(result.status).toBe('blocked');
    expect(result.reasonCodes).toContain('technical_failure');
  });

  it('blocks unresolved semantic results', () => {
    const result = evaluateAnalyticsAdmission({
      record: analysisRecord('unresolved-case', 'supported'),
      semanticResult: semanticResult({ status: 'unresolved' }),
      audit: audit('fail'),
    });
    expect(result.reasonCodes).toContain('semantic_unresolved');
  });

  it('blocks resolved results that still contain a critical unclear outcome', () => {
    const result = evaluateAnalyticsAdmission({
      record: analysisRecord('unclear-case', 'supported'),
      semanticResult: semanticResult({ employerOutcome: 'unclear' }),
      audit: audit('pass'),
    });
    expect(result.reasonCodes).toContain('critical_outcome_unclear');
  });

  it('does not admit a record with unclear outcomes when an external result is supplied', () => {
    const result = evaluateAnalyticsAdmission({
      record: analysisRecord('record-unclear', 'unclear'),
      semanticResult: semanticResult(),
      audit: audit('pass'),
    });
    expect(result.reasonCodes).toContain('critical_outcome_unclear');
  });

  it('does not let an included record bypass an unresolved claim diagnostic', () => {
    const result = evaluateAnalyticsAdmission({
      record: analysisRecord('claim-diagnostic-unclear', 'supported', {
        isIncludedInAnalysisSet: true,
        claims: [{ claimName: '工资', claimant: 'employee', supportStatus: 'unclear' }],
        outcomeDiagnostics: [{
          target: 'claim',
          claimId: 'claim-1',
          outcome: 'unclear',
          reasonCode: 'disposition_not_matched',
          needsReview: true,
        }],
      }),
    });
    expect(result.status).toBe('blocked');
    expect(result.reasonCodes).toContain('critical_outcome_unclear');
  });

  it('blocks a claim whose reference resolution still requires semantic work', () => {
    const result = evaluateAnalyticsAdmission({
      record: analysisRecord('claim-reference-pending', 'supported', {
        isIncludedInAnalysisSet: true,
        claims: [{
          claimName: '工资',
          claimant: 'employee',
          supportStatus: 'supported',
          referenceResolution: {
            sourceText: '上述请求',
            referencedClaimIds: [],
            confidence: 0.2,
            resolutionMethod: 'unresolved',
            needsSemanticResolution: true,
          },
        }],
      }),
    });
    expect(result.status).toBe('blocked');
    expect(result.reasonCodes).toContain('critical_outcome_unclear');
  });

  it('admits an approved human result even when the immutable rule record was unclear', () => {
    const pending = reviewItem(semanticResult());
    pending.caseId = 'approved-human-unclear-record';
    pending.status = 'reviewed';
    pending.reviewedAt = '2026-09-17T03:00:00.000Z';
    pending.reviewedResult = {
      source: 'human_review',
      reviewStatus: 'approved',
      reviewedAt: pending.reviewedAt,
      reviewedResult: semanticResult(),
    };
    const result = evaluateAnalyticsAdmission({
      record: analysisRecord('approved-human-unclear-record', 'unclear', {
        isIncludedInAnalysisSet: false,
        claims: [{ claimName: '工资', claimant: 'employee', supportStatus: 'unclear' }],
        outcomeDiagnostics: [{ outcome: 'unclear', needsReview: true, reasonCode: 'unknown' }],
      }),
      reviewItems: [pending],
    });
    expect(result).toMatchObject({ status: 'eligible', source: 'human_review', reasonCodes: [] });
  });

  it('blocks provider-unavailable records as technical failures', () => {
    const result = evaluateAnalyticsAdmission({
      record: analysisRecord('provider-unavailable', 'supported', {
        semanticResolutionStatus: 'provider_unavailable',
      }),
    });
    expect(result.reasonCodes).toContain('technical_failure');
  });

  it('blocks explicit technical-failure records without treating them as review conclusions', () => {
    const result = evaluateAnalyticsAdmission({
      record: analysisRecord('technical-state', 'supported', {
        semanticResolutionStatus: 'technical_failure',
      }),
    });
    expect(result.status).toBe('blocked');
    expect(result.reasonCodes).toContain('technical_failure');
  });

  it('does not let legacy inclusion, score, or review fields bypass unresolved state', () => {
    const result = evaluateAnalyticsAdmission({
      record: analysisRecord('legacy-bypass', 'supported', {
        parserScore: 100,
        reviewStatus: 'approved',
        isIncludedInAnalysisSet: true,
        semanticResolutionStatus: 'pending',
        unresolvedReferences: [unresolvedReference],
      }),
    });
    expect(result.status).toBe('blocked');
    expect(result.reasonCodes).toContain('semantic_unresolved');
  });

  it('blocks a record marked resolved when the accepted semantic result is missing', () => {
    const result = evaluateAnalyticsAdmission({
      record: analysisRecord('missing-result', 'supported', { semanticResolutionStatus: 'resolved' }),
    });
    expect(result.reasonCodes).toContain('missing_accepted_semantic_result');
  });

  it('formal Defense analytics consumes only eligible records', () => {
    const eligible = analysisRecord('eligible', 'supported', {
      employerDefenses: [{ defenseType: '严重违纪', matchedText: '提出严重违纪抗辩', confidence: 1 }],
      claims: [{ claimName: '违法解除', claimant: 'employee', supportStatus: 'not_supported' }],
    });
    const blocked = analysisRecord('blocked', 'supported', {
      semanticResolutionStatus: 'pending',
      unresolvedReferences: [unresolvedReference],
      employerDefenses: [{ defenseType: '严重违纪', matchedText: '提出严重违纪抗辩', confidence: 1 }],
      claims: [{ claimName: '违法解除', claimant: 'employee', supportStatus: 'not_supported' }],
    });
    const filtered = filterAnalyticsEligibleRecords([eligible, blocked]);
    expect(filtered.eligibleRecords.map((record) => record.caseId)).toEqual(['eligible']);
    expect(LaborDisputeAnalyticsEngine.generateReport([eligible, blocked]).overall.includedCases).toBe(1);
    expect(DefenseStrategyAnalyzer.analyze([eligible, blocked]).analyzedCaseCount).toBe(1);
  });
});
