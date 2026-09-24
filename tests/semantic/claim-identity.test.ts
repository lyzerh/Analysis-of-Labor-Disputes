import { describe, expect, it } from 'vitest';
import type { AnalysisCaseRecord } from '../../src/types';
import { buildClaimIdentity, claimIdentityPayload, claimIdentityStatus, normalizeClaimText } from '../../src/services/gold/ClaimIdentity';
import { freezeGoldClaimIdentity, getGoldClaimIdentityStatusForRecord, rebindGoldClaimIdentity, type GoldCaseAnnotation } from '../../src/services/gold/GoldAnnotationStorage';
import { buildBenchmarkMetrics, type BenchmarkClaimResult } from '../../src/services/gold/GoldBenchmarkStorage';

const record = (claimOverrides: Record<string, unknown> = {}, claimId = 'claim-1'): AnalysisCaseRecord => ({
  caseId: 'case-identity', rawDocumentId: 'raw-identity', title: '身份测试', source: 'laborinfo', city: '', isPRD: false,
  court: '', caseNumber: null, date: '', year: null, caseLevel: '一审', disputeType: [], employeeParty: '员工', employerParty: '公司',
  applicantRole: 'employee', parties: [
    { id: 'party-employee', name: '员工', laborRole: 'employee', proceduralRoles: ['plaintiff'] },
    { id: 'party-employer', name: '公司', laborRole: 'employer', proceduralRoles: ['defendant'] },
  ], courtReasoning: '', keyLegalPoints: [], employerDefenses: [], evidence: [], claims: [{
    id: claimId, claimName: '双倍工资差额', claimType: 'double_wage_difference', claimant: 'employee', claimantRole: 'employee', claimantPartyId: 'party-employee',
    proceduralBasis: 'original_claim', supportStatus: 'unclear', sourceText: '', ...claimOverrides,
  }], unresolvedReferences: [], applicantOutcome: 'unclear', employeeOutcome: 'unclear', employerOutcome: 'unclear', overallResult: 'unclear',
  parserScore: 0, reviewStatus: 'pending', confidence: 0, isIncludedInAnalysisSet: false, filterReason: '', hasReviewerChanges: false,
});

const result = (comparison: BenchmarkClaimResult['comparison'], identityStatus?: BenchmarkClaimResult['identityStatus']): BenchmarkClaimResult => ({
  caseId: 'case-identity', caseName: '身份测试', claimId: 'claim-1', claimType: 'double_wage_difference', goldOutcome: 'supported',
  aiInvocationStatus: 'success', candidateStatus: 'candidate', aiOutcome: 'supported', schemaValid: true, contractValid: true,
  auditDecision: 'pass', latencyMs: 1, comparison, attempt: 1, ...(identityStatus ? { identityStatus } : {}),
});

describe('ClaimIdentity v1', () => {
  it('is stable across claimId drift and normalizes only formatting', () => {
    const first = buildClaimIdentity(record(), record().claims[0]);
    const drifted = buildClaimIdentity(record({}, 'claim-99'), record({}, 'claim-99').claims[0]);
    expect(first.claimIdentityHash).toBe(drifted.claimIdentityHash);
    expect(normalizeClaimText('  请求\n支付  工资  ')).toBe('请求 支付 工资');
  });

  it('distinguishes employee and employer claims with the same claim type', () => {
    const employee = buildClaimIdentity(record(), record().claims[0]);
    const employerRecord = record({ claimant: 'employer', claimantRole: 'employer', claimantPartyId: 'party-employer' });
    const employer = buildClaimIdentity(employerRecord, employerRecord.claims[0]);
    expect(employee.claimIdentityHash).not.toBe(employer.claimIdentityHash);
    expect(employee.claimantPartyIds).toEqual(['party-employee']);
    expect(employer.claimantPartyIds).toEqual(['party-employer']);
  });

  it('keeps original-claim and counterclaim procedural context distinct', () => {
    const original = record({ claimType: 'unlawful_termination_compensation', proceduralBasis: 'original_claim', claimant: 'employer', claimantRole: 'employer', claimantPartyId: 'party-employer' });
    const counterclaim = record({ claimType: 'unlawful_termination_compensation', proceduralBasis: 'counterclaim', claimant: 'employee', claimantRole: 'employee', claimantPartyId: 'party-employee' });
    const originalIdentity = buildClaimIdentity(original, original.claims[0]);
    const counterclaimIdentity = buildClaimIdentity(counterclaim, counterclaim.claims[0]);
    expect(originalIdentity.claimantPartyIds).toEqual(['party-employer']);
    expect(counterclaimIdentity.claimantPartyIds).toEqual(['party-employee']);
    expect(originalIdentity.proceduralRoleContext).toContain('basis:original_claim');
    expect(counterclaimIdentity.proceduralRoleContext).toContain('basis:counterclaim');
    expect(originalIdentity.claimIdentityHash).not.toBe(counterclaimIdentity.claimIdentityHash);
  });

  it('does not treat a missing frozen Gold identity as verified', () => {
    const current = record();
    const legacy: GoldCaseAnnotation = { id: 'gold::case-identity', goldSetId: 'gold', caseId: current.caseId, updatedAt: '2026-09-22', claimAnnotations: [{ claimId: 'claim-1', claimExtractionStatus: 'correct', goldOutcome: 'supported' }] };
    expect(getGoldClaimIdentityStatusForRecord(current, legacy.claimAnnotations[0])).toBe('legacy_unverified');
    expect(claimIdentityStatus(buildClaimIdentity(current, current.claims[0]).claimIdentityHash, buildClaimIdentity(current, current.claims[0]))).toBe('verified');
  });

  it('requires explicit confirmation to freeze legacy identity and preserves Gold values', () => {
    const current = record();
    const legacy: GoldCaseAnnotation = { id: 'gold::case-identity', goldSetId: 'gold', caseId: current.caseId, updatedAt: '2026-09-22', claimAnnotations: [{ claimId: 'claim-1', claimExtractionStatus: 'correct', goldOutcome: 'partially_supported', notes: '保留备注' }] };
    const frozen = freezeGoldClaimIdentity(current, legacy.claimAnnotations[0], 'claim-1');
    expect(frozen).toMatchObject({ identityStatus: 'verified', claimId: 'claim-1', claimExtractionStatus: 'correct', goldOutcome: 'partially_supported', notes: '保留备注' });
    expect(frozen?.claimIdentityHash).toBe(buildClaimIdentity(current, current.claims[0]).claimIdentityHash);
    expect(frozen?.claimantPartyIds).toEqual(['party-employee']);
  });

  it('does not overwrite an identity mismatch during confirmation', () => {
    const current = record();
    const frozenHash = buildClaimIdentity(record({ claimantPartyId: 'party-employer', claimantRole: 'employer', claimant: 'employer' }), record({ claimantPartyId: 'party-employer', claimantRole: 'employer', claimant: 'employer' }).claims[0]).claimIdentityHash;
    const mismatched: GoldCaseAnnotation['claimAnnotations'][number] = { claimId: 'claim-1', claimIdentityHash: frozenHash, identityStatus: 'verified', goldOutcome: 'supported' };
    expect(freezeGoldClaimIdentity(current, mismatched, 'claim-1')).toBe(mismatched);
  });

  it('can explicitly confirm a claim without an existing annotation', () => {
    const current = record();
    const frozen = freezeGoldClaimIdentity(current, undefined, 'claim-1');
    expect(frozen?.identityStatus).toBe('verified');
    expect(frozen?.goldOutcome).toBeUndefined();
  });

  it('does not confirm extraction-invalid Gold claims', () => {
    const current = record();
    const invalid: GoldCaseAnnotation['claimAnnotations'][number] = { claimId: 'claim-1', claimExtractionStatus: 'wrong_type', goldOutcome: 'supported' };
    expect(freezeGoldClaimIdentity(current, invalid, 'claim-1')).toBe(invalid);
  });

  it('rebinds Gold explicitly while preserving the old identity and outcome', () => {
    const current = record({ claimType: 'economic_compensation' });
    current.claims.push({ ...current.claims[0], id: 'claim-2', claimType: 'overtime_pay', claimName: '加班工资' });
    const legacy: GoldCaseAnnotation['claimAnnotations'][number] = { claimId: 'claim-1', claimIdentityHash: 'old-hash', identityStatus: 'legacy_unverified', goldOutcome: 'partially_supported', notes: '历史绑定' };
    const rebound = rebindGoldClaimIdentity(current, legacy, 'claim-2', '历史 Gold 指向另一条真实诉求');
    expect(rebound).toMatchObject({ claimId: 'claim-2', identityStatus: 'legacy_unverified', repairStatus: 'repaired_ready_for_confirmation', goldBindingStatus: 'repaired_ready_for_confirmation', previousClaimId: 'claim-1', previousClaimIdentityHash: 'old-hash', goldOutcome: 'partially_supported', notes: '历史绑定' });
    expect(rebound?.previousGoldIdentity?.claimId).toBe('claim-1');
  });

  it('marks a requested Gold rebind target_missing without fabricating a claim', () => {
    const current = record();
    const legacy: GoldCaseAnnotation['claimAnnotations'][number] = { claimId: 'claim-old', goldOutcome: 'not_supported' };
    const result = rebindGoldClaimIdentity(current, legacy, 'claim-missing', '当前解析未找到对应诉求');
    expect(result).toMatchObject({ claimId: 'claim-old', goldBindingStatus: 'target_missing', repairStatus: 'target_missing', goldOutcome: 'not_supported' });
  });

  it('confirmation after rebind verifies only the selected target and keeps history', () => {
    const current = record();
    current.claims.push({ ...current.claims[0], id: 'claim-2', claimType: 'overtime_pay', claimName: '加班工资' });
    const rebound = rebindGoldClaimIdentity(current, { claimId: 'claim-1', goldOutcome: 'supported' }, 'claim-2', '人工选择目标');
    const confirmed = freezeGoldClaimIdentity(current, rebound, 'claim-2');
    expect(confirmed).toMatchObject({ claimId: 'claim-2', identityStatus: 'verified', goldBindingStatus: 'bound', goldOutcome: 'supported' });
    expect(confirmed?.previousClaimId).toBe('claim-1');
    expect(confirmed?.previousGoldIdentity?.claimId).toBe('claim-1');
  });

  it('detects a frozen identity mismatch without fuzzy rebinding', () => {
    const current = record();
    const changed = record({ claimantPartyId: 'party-employer' });
    const stored = buildClaimIdentity(current, current.claims[0]).claimIdentityHash;
    expect(getGoldClaimIdentityStatusForRecord(changed, { claimId: 'claim-1', claimIdentityHash: stored })).toBe('identity_mismatch');
  });

  it('accepts a deterministic claimId drift only when the frozen identity hash matches exactly', () => {
    const previous = record({}, 'claim-old');
    const reparsed = record({}, 'claim-new');
    const stored = buildClaimIdentity(previous, previous.claims[0]).claimIdentityHash;
    expect(getGoldClaimIdentityStatusForRecord(reparsed, { claimId: 'claim-old', claimIdentityHash: stored })).toBe('verified');
  });

  it('excludes identity mismatch from outcome accuracy while retaining it in the run denominator', () => {
    const metrics = buildBenchmarkMetrics([result('correct', 'verified'), result('incorrect', 'identity_mismatch')]);
    expect(metrics.correct).toBe(1);
    expect(metrics.incorrect).toBe(0);
    expect(metrics.identityMismatchClaims).toBe(1);
    expect(metrics.outcomeAccuracy).toBe(1);
    expect(metrics.identityVerificationRate).toBe(0.5);
  });

  it('keeps identity serialization independent of claimId', () => {
    const identity = buildClaimIdentity(record(), record().claims[0]);
    expect(claimIdentityPayload(identity)).not.toContain('claim-1');
  });
});
