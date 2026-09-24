import { describe, expect, it } from 'vitest';
import { analysisRecord } from '../outcome/helpers/record-factories';
import type { AnalysisRun } from '../../src/types';
import type { SemanticReviewItem } from '../../src/services/semantic/SemanticReviewQueue';
import type { SemanticResolutionResult } from '../../src/services/semantic/SemanticResult';
import { buildCompetitionValidationSnapshot, validationSnapshotFilename } from '../../src/services/validation/CompetitionValidationSnapshot';

const result = (overrides: Partial<SemanticResolutionResult> = {}): SemanticResolutionResult => ({
  status: 'resolved',
  resolver: 'llm',
  parties: [
    { id: 'employee-1', name: '张某', laborRole: 'employee', proceduralRoles: ['plaintiff'], sourceEvidence: { text: '张某' } },
    { id: 'employer-1', name: '甲公司', laborRole: 'employer', proceduralRoles: ['defendant'], sourceEvidence: { text: '甲公司' } },
  ],
  claims: [{
    id: 'claim-1', claimantPartyIds: ['employee-1'], claimantRole: 'employee', claimType: '工资', claimText: '张某请求支付工资', sourceEvidence: { text: '张某请求支付工资' },
  }],
  judgmentItems: [{ id: 'judgment-1', text: '甲公司支付工资', sourceEvidence: { text: '甲公司支付工资' } }],
  claimResolutions: [{
    claimId: 'claim-1', judgmentItemIds: ['judgment-1'], outcome: 'supported', confidence: 0.95, sourceEvidence: { text: '甲公司支付工资' },
  }],
  applicantRole: 'employee',
  applicantOutcome: 'supported',
  employeeOutcome: 'supported',
  employerOutcome: 'not_supported',
  confidence: 0.95,
  ...overrides,
});

const reviewItem = (caseId: string, semanticResult: SemanticResolutionResult): SemanticReviewItem => ({
  id: `review-${caseId}`,
  caseId,
  status: 'reviewed',
  semanticResult,
  audit: {
    decision: 'fail',
    reasonCodes: ['confidence_below_admission_threshold'],
    admissionConfidenceThreshold: 0.9,
  },
  auditContext: {
    rawText: '张某 甲公司 张某请求支付工资 甲公司支付工资',
    knownParties: semanticResult.parties,
    knownClaims: semanticResult.claims,
    knownJudgmentItems: semanticResult.judgmentItems,
    requiredClaimResolutionIds: ['claim-1'],
  },
  unresolvedTargets: [{ type: 'claim_resolution', id: 'claim-1', reasonCode: 'claim_judgment_match_unclear' }],
  createdAt: '2026-09-20T00:00:00.000Z',
  reviewedAt: '2026-09-20T01:00:00.000Z',
  reviewedResult: {
    source: 'human_review',
    reviewStatus: 'approved',
    reviewAction: 'edit',
    reviewedAt: '2026-09-20T01:00:00.000Z',
    originalCandidate: semanticResult,
    finalValue: result({ confidence: 0.99 }),
    reviewedResult: result({ confidence: 0.99 }),
  },
});

const run = (id: string, caseIds: string[]): AnalysisRun => ({
  id,
  analysisContractVersion: 'analysis-provenance-v1',
  mode: 'exhaustive',
  snapshotId: 'snapshot-1',
  snapshotFingerprint: 'fingerprint-1',
  candidateHash: 'candidate-hash',
  inputCaseIds: caseIds,
  inputCaseCount: caseIds.length,
  engineVersions: { parserVersion: 'parser-v1', rulesetVersion: 'rules-v1' },
  semantic: { enabled: true, promptVersion: 'semantic-result-contract-v2', provider: 'xai', model: 'grok-4.20-0309-reasoning' },
  status: 'completed',
  createdAt: '2026-09-20T00:00:00.000Z',
  provenanceHash: 'provenance-hash',
});

describe('competition validation snapshot', () => {
  it('exports a secret-free, current-threshold snapshot with separate library and run counts', () => {
    const first = analysisRecord('case-1', 'not_supported', {
      claims: [{ id: 'claim-1', claimName: '工资', claimant: 'employee', supportStatus: 'not_supported', sourceText: '张某请求支付工资' }],
      employeeOutcome: 'supported', employerOutcome: 'not_supported', applicantOutcome: 'supported', overallResult: 'supported',
    });
    const second = analysisRecord('case-2', 'supported');
    const snapshot = buildCompetitionValidationSnapshot({
      records: [first],
      allRecords: [first, second],
      reviewItems: [reviewItem('case-1', result())],
      analysisRuns: [run('run-1', ['case-1']), run('run-2', ['case-1', 'case-2'])],
      selectedAnalysisRunId: 'run-2',
      librarySummary: { totalCases: 2, rawDocuments: 3 },
      exportedAt: '2026-09-20T12:00:00.000Z',
      appVersionOrGitHead: 'test-head',
    });
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toMatch(/api.?key|authorization|bearer|sessionStorage/i);
    expect(snapshot.provider).toBe('xai');
    expect(snapshot.model).toBe('grok-4.20-0309-reasoning');
    expect(snapshot.semanticAutoAcceptThreshold).toBe(0.8);
    expect(snapshot.validationMeta).toEqual({
      currentThreshold: 0.8,
      auditRecomputed: true,
      humanReviewAuthoritative: true,
      analyticsGateApplied: true,
    });
    expect(snapshot.librarySummary).toEqual({ totalCases: 2, rawDocuments: 3 });
    expect(Object.values(snapshot.workflowSummary).reduce((sum, value) => sum + value, 0)).toBe(snapshot.cases.length);
    expect(snapshot.cases).toHaveLength(1);
    expect(snapshot.analysisRuns[0]).toMatchObject({ analysisRunId: 'run-1', total: 1, selected: false });
    expect(snapshot.analysisRuns[1]).toMatchObject({ analysisRunId: 'run-2', total: 2, selected: true });
  });

  it('keeps historical audit and human original/final values while recomputing current audit', () => {
    const record = analysisRecord('case-human', 'not_supported', {
      claims: [{ id: 'claim-1', claimName: '工资', claimant: 'employee', supportStatus: 'not_supported', sourceText: '张某请求支付工资' }],
    });
    const item = reviewItem('case-human', result());
    const snapshot = buildCompetitionValidationSnapshot({
      records: [record],
      reviewItems: [item],
      librarySummary: { totalCases: 1, rawDocuments: 1 },
    });
    const exported = snapshot.reviewItems[0];
    expect(exported.historicalAudit.threshold).toBe(0.9);
    expect(exported.currentAudit.threshold).toBe(0.8);
    expect(exported.reviewAction).toBe('edit');
    expect(exported.originalCandidate.confidence).toBe(0.95);
    expect(exported.finalValue?.confidence).toBe(0.99);
    expect(snapshot.cases[0].semantic.confidence).toBe(0.99);
  });

  it('uses the required filename format', () => {
    expect(validationSnapshotFilename('2026-09-20T12:00:00.000Z')).toBe('lawlens-validation-snapshot-2026-09-20.json');
  });
});
