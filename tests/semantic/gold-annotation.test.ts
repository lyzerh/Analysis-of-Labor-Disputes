import { describe, expect, it } from 'vitest';
import { addCaseToGoldSet, buildGoldCsv, buildGoldMetrics, buildGoldExportPayload, claimAnalysisScopeForType, comparisonForClaim, createGoldSet, getGoldCaseAnnotation, goldCaseStatus, readGoldState, removeCaseFromGoldSet, saveGoldCaseAnnotation, type GoldSetRecord } from '../../src/services/gold/GoldAnnotationStorage';
import { buildClaimIdentity } from '../../src/services/gold/ClaimIdentity';
import { getAvailableGoldCaseRecords, getGoldCaseAvailabilityState } from '../../src/services/gold/GoldCaseAvailability';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) || null; }
  key(index: number) { return [...this.data.keys()][index] || null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

const record = (claims: Array<{ id?: string; claimType?: string }> = [{ id: 'claim-1' }]) => ({ caseId: 'case-1', claims: claims.map((claim) => ({ claimName: claim.claimType || '经济补偿金', claimType: claim.claimType || 'economic_compensation', claimant: 'employee', claimantRole: 'employee', claimantPartyId: 'party-employee', ...claim })), parties: [{ id: 'party-employee', name: '员工', laborRole: 'employee', proceduralRoles: ['plaintiff'] }] } as any);
const identityHash = (claimId: string, claimType = 'economic_compensation') => { const current = record([{ id: claimId, claimType }]); return buildClaimIdentity(current, current.claims[0]).claimIdentityHash; };

describe('independent Gold annotation storage', () => {
  it('shows a disabled all-added state instead of an empty add-case dropdown', () => {
    const localCases = Array.from({ length: 10 }, (_, index) => ({ caseId: `case-${index + 1}` })) as any[];
    const available = getAvailableGoldCaseRecords(localCases as any, localCases.map((item) => item.caseId));
    expect(available).toHaveLength(0);
    expect(getGoldCaseAvailabilityState(localCases.length, available.length)).toBe('all_cases_added');
  });

  it('keeps only the remaining local cases available and prevents duplicates', () => {
    const localCases = Array.from({ length: 10 }, (_, index) => ({ caseId: `case-${index + 1}` })) as any[];
    const available = getAvailableGoldCaseRecords(localCases as any, localCases.slice(0, 8).map((item) => item.caseId));
    expect(available.map((item) => item.caseId)).toEqual(['case-9', 'case-10']);
    expect(new Set(available.map((item) => item.caseId)).size).toBe(2);
    expect(getGoldCaseAvailabilityState(localCases.length, available.length)).toBe('available');
  });

  it('distinguishes an empty local case library from an all-added Gold Set', () => {
    expect(getGoldCaseAvailabilityState(0, 0)).toBe('no_local_cases');
  });

  it('creates a set, prevents duplicate cases, saves outcomes and survives reload', () => {
    const storage = new MemoryStorage(); const set = createGoldSet('Gold', '', storage);
    expect(addCaseToGoldSet(set.id, 'case-1', storage)).toBe(true);
    expect(addCaseToGoldSet(set.id, 'case-1', storage)).toBe(false);
    saveGoldCaseAnnotation(set.id, 'case-1', [{ claimId: 'claim-1', claimExtractionStatus: 'correct', goldOutcome: 'supported', notes: '人工确认' }], storage);
    const reloaded = getGoldCaseAnnotation(set.id, 'case-1', storage);
    expect(reloaded?.claimAnnotations[0].goldOutcome).toBe('supported');
    expect(goldCaseStatus(record(), reloaded)).toBe('completed');
  });

  it('keeps Gold values independent from the source record and supports unclear', () => {
    const storage = new MemoryStorage(); const set = createGoldSet('Gold', '', storage); addCaseToGoldSet(set.id, 'case-1', storage);
    const source = record(); saveGoldCaseAnnotation(set.id, 'case-1', [{ claimId: 'claim-1', claimExtractionStatus: 'correct', goldOutcome: 'unclear' }], storage);
    expect(source.claims[0].supportStatus).toBeUndefined(); expect(goldCaseStatus(source, getGoldCaseAnnotation(set.id, 'case-1', storage))).toBe('completed');
    expect(comparisonForClaim('supported', 'unclear')).toBe('unclear_gold');
  });

  it('removes only the Gold annotation and leaves source cases untouched', () => {
    const storage = new MemoryStorage(); const set = createGoldSet('Gold', '', storage); addCaseToGoldSet(set.id, 'case-1', storage); saveGoldCaseAnnotation(set.id, 'case-1', [], storage);
    expect(removeCaseFromGoldSet(set.id, 'case-1', storage)).toBe(true); expect(readGoldState(storage).sets[0].caseIds).toEqual([]); expect(record().caseId).toBe('case-1');
  });

  it('exports UTF-8 BOM CSV and no secret fields', () => {
    const set: GoldSetRecord = { id: 'gold-1', name: 'Gold', createdAt: '2026-01-01', updatedAt: '2026-01-01', caseIds: ['case-1'] };
    const payload = { goldSet: set, cases: [{ caseId: 'case-1', title: '案', caseNumber: '1', claims: [{ claimId: 'claim-1', claimType: 'wage', goldOutcome: 'supported', notes: '' }] }] } as any;
    const csv = buildGoldCsv(payload); expect(csv.startsWith('\uFEFF')).toBe(true); expect(csv).not.toContain('Authorization'); expect(csv).not.toContain('apiKey');
  });

  it('keeps extraction quality independent from Gold outcome and applies completion rules', () => {
    const storage = new MemoryStorage(); const set = createGoldSet('Gold', '', storage); addCaseToGoldSet(set.id, 'case-1', storage);
    saveGoldCaseAnnotation(set.id, 'case-1', [{ claimId: 'claim-1', claimExtractionStatus: 'wrong_type', goldOutcome: 'partially_supported' }], storage);
    expect(getGoldCaseAnnotation(set.id, 'case-1', storage)?.claimAnnotations[0]).toMatchObject({ claimExtractionStatus: 'wrong_type', goldOutcome: 'partially_supported' });
    expect(goldCaseStatus(record(), getGoldCaseAnnotation(set.id, 'case-1', storage))).toBe('completed');
    saveGoldCaseAnnotation(set.id, 'case-1', [{ claimId: 'claim-1', claimExtractionStatus: 'spurious', goldOutcome: 'supported' }], storage);
    expect(getGoldCaseAnnotation(set.id, 'case-1', storage)?.claimAnnotations[0].goldOutcome).toBeUndefined();
  });

  it('excludes uncertain and extraction-invalid claims from formal outcome accuracy', () => {
    const storage = new MemoryStorage(); const set = createGoldSet('Gold', '', storage); addCaseToGoldSet(set.id, 'case-1', storage);
    const annotations = saveGoldCaseAnnotation(set.id, 'case-1', [
      { claimId: 'correct', claimIdentityHash: identityHash('correct'), claimExtractionStatus: 'correct', goldOutcome: 'supported' },
      { claimId: 'wrong', claimIdentityHash: identityHash('wrong'), claimExtractionStatus: 'wrong_type', goldOutcome: 'supported' },
      { claimId: 'spurious', claimIdentityHash: identityHash('spurious'), claimExtractionStatus: 'spurious' },
      { claimId: 'uncertain', claimIdentityHash: identityHash('uncertain'), claimExtractionStatus: 'uncertain', goldOutcome: 'supported' },
    ], storage);
    const metrics = buildGoldMetrics([record([{ id: 'correct' }, { id: 'wrong' }, { id: 'spurious' }, { id: 'uncertain' }])], [annotations], { 'case-1::correct': { outcome: 'supported' }, 'case-1::wrong': { outcome: 'not_supported' } });
    expect(metrics.extractionAccuracy).toBe(1 / 3); expect(metrics.wrongTypeRate).toBe(1 / 3); expect(metrics.spuriousRate).toBe(1 / 3); expect(metrics.aiAccuracy).toBe(1); expect(metrics.validClaimCoverage).toBe(1);
  });

  it('exports extraction status and comparison fields in JSON and CSV', () => {
    const set: GoldSetRecord = { id: 'gold-1', name: 'Gold', createdAt: '2026-01-01', updatedAt: '2026-01-01', caseIds: ['case-1'] };
    const payload = buildGoldExportPayload(set, [record([{ id: 'claim-1' }])], [{ id: 'gold-1::case-1', goldSetId: 'gold-1', caseId: 'case-1', updatedAt: '2026-01-01', claimAnnotations: [{ claimId: 'claim-1', claimIdentityHash: identityHash('claim-1'), claimExtractionStatus: 'wrong_type', goldOutcome: 'partially_supported' }] }], { 'case-1::claim-1': { outcome: 'supported', confidence: 0.7 } });
    expect(payload.cases[0].claims[0]).toMatchObject({ claimExtractionStatus: 'wrong_type', aiCandidate: 'supported', aiConfidence: 0.7, comparison: 'incorrect' });
    expect(buildGoldCsv(payload)).toContain('claimExtractionStatus');
  });

  it('derives procedural scope without changing the stored claim type', () => {
    expect(claimAnalysisScopeForType('procedural_appeal')).toBe('procedural');
    expect(claimAnalysisScopeForType('economic_compensation')).toBe('substantive');
  });

  it('does not require a Gold outcome for a procedural claim', () => {
    const storage = new MemoryStorage(); const set = createGoldSet('Gold', '', storage); addCaseToGoldSet(set.id, 'case-1', storage);
    const source = { caseId: 'case-1', claims: [{ id: 'claim-1', claimType: 'procedural_appeal' }] } as any;
    const annotation = saveGoldCaseAnnotation(set.id, 'case-1', [{ claimId: 'claim-1', claimExtractionStatus: 'correct' }], storage);
    expect(goldCaseStatus(source, annotation)).toBe('completed');
    const payload = buildGoldExportPayload(readGoldState(storage).sets[0], [source], [annotation]);
    expect(payload.cases[0].claims[0]).toMatchObject({ claimType: 'procedural_appeal', claimAnalysisScope: 'procedural', claimExtractionStatus: 'correct' });
    expect(payload.cases[0].claims[0].goldOutcome).toBeUndefined();
    expect(buildGoldCsv(payload)).toContain('claimAnalysisScope');
    expect(buildGoldCsv(payload)).toContain('"procedural"');
  });

  it('excludes procedural outcomes from substantive outcome metrics', () => {
    const annotations = [{
      id: 'gold-1::case-1', goldSetId: 'gold-1', caseId: 'case-1', updatedAt: '2026-01-01',
      claimAnnotations: [{ claimId: 'appeal-1', claimExtractionStatus: 'correct' as const, goldOutcome: 'supported' as const }],
    }];
    const metrics = buildGoldMetrics([record([{ id: 'appeal-1', claimType: 'procedural_appeal' }])], annotations, {
      'case-1::appeal-1': { outcome: 'supported' },
    });
    expect(metrics.proceduralClaims).toBe(1);
    expect(metrics.claims).toBe(0);
    expect(metrics.labeledClaims).toBe(0);
    expect(metrics.aiAccuracy).toBe(0);
  });

  it('excludes procedural claims from substantive extraction metrics while retaining their annotation', () => {
    const annotations = [{
      id: 'gold-1::case-1', goldSetId: 'gold-1', caseId: 'case-1', updatedAt: '2026-01-01',
      claimAnnotations: [
        { claimId: 'claim-1', claimIdentityHash: identityHash('claim-1'), claimExtractionStatus: 'correct' as const, goldOutcome: 'supported' as const },
        { claimId: 'appeal-1', claimExtractionStatus: 'wrong_type' as const },
      ],
    }];
    const metrics = buildGoldMetrics([record([{ id: 'claim-1', claimType: 'economic_compensation' }, { id: 'appeal-1', claimType: 'procedural_appeal' }])], annotations, {
      'case-1::claim-1': { outcome: 'supported' },
    });
    expect(metrics.proceduralClaims).toBe(1);
    expect(metrics.extractionLabeledClaims).toBe(1);
    expect(metrics.extractionAccuracy).toBe(1);
    expect(metrics.wrongTypeRate).toBe(0);
  });
});
