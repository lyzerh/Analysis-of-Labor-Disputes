import { describe, expect, it } from 'vitest';
import { GeminiSemanticResultResolver } from '../../src/services/semantic/GeminiSemanticResultResolver';
import { collectSemanticSchemaValidationErrors, boundedRawResponsePreview } from '../../src/services/semantic/SemanticSchemaDiagnostics';
import { buildAuditFailureReasons, buildSchemaFailureReasons, type BenchmarkClaimResult } from '../../src/services/gold/GoldBenchmarkStorage';

const task = { caseId: 'diagnostic-case', status: 'unresolved', reasonCodes: ['claim_judgment_match_unclear'], rawText: '原文', knownParties: [], knownClaims: [], knownJudgmentItems: [], unresolvedTargets: [{ type: 'claim_resolution', id: 'claim-1', reasonCode: 'claim_judgment_match_unclear' }] } as any;

describe('Gold benchmark schema diagnostics', () => {
  it('captures invalid enum path, expected values, type, and bounded actual preview', async () => {
    const text = JSON.stringify({ status: 'resolved', resolver: 'llm', parties: [], claims: [], judgmentItems: [], claimResolutions: [{ claimId: 'claim-1', judgmentItemIds: [], outcome: 'rejected', confidence: 0.8 }], applicantRole: 'unknown', applicantOutcome: 'unclear', employeeOutcome: 'unclear', employerOutcome: 'unclear', confidence: 0.8 });
    const resolver = new GeminiSemanticResultResolver({ apiKey: '', client: { models: { generateContent: async () => ({ text }) } } });
    const result = await resolver.resolve(task);
    expect(result.resolverErrorCode).toBe('schema_invalid');
    expect(result.resolverErrorDetails?.rawResponseAvailable).toBe(true);
    expect(result.resolverErrorDetails?.parsedJsonCandidate).toBeDefined();
    expect(result.resolverErrorDetails).toMatchObject({
      schemaFailureOrigin: 'semantic_result_schema',
      validatorName: 'parseSemanticResolutionResult',
      validatorPassed: false,
      providerRawParsed: true,
      semanticSchemaPassed: false,
      contractPassed: false,
      auditRan: false,
    });
    expect(result.resolverErrorDetails?.validatorErrors).toContain('result_claimResolutions');
    expect(result.resolverErrorDetails?.schemaValidationErrors).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'claimResolutions[0].outcome', errorCode: 'invalid_enum', expected: expect.stringContaining('supported') })]));
  });

  it('never swallows handwritten validator issues when the generic walker has no matching path', async () => {
    const text = JSON.stringify({ status: 'resolved', resolver: 'llm', parties: [], claims: [], judgmentItems: [], claimResolutions: [{ claimId: 'claim-1', judgmentItemIds: [], outcome: 'supported', confidence: 0.8 }], applicantRole: 'unknown', applicantOutcome: 'unclear', employeeOutcome: 'unclear', employerOutcome: 'unclear', confidence: 0.8, unresolvedReasonCodes: ['not-a-real-reason'] });
    const resolver = new GeminiSemanticResultResolver({ apiKey: '', client: { models: { generateContent: async () => ({ text }) } } });
    const result = await resolver.resolve(task);
    expect(result.resolverErrorDetails?.validatorErrors).toContain('result_unresolvedReasonCodes');
    expect(result.resolverErrorDetails?.schemaValidationErrors?.length).toBeGreaterThan(0);
    expect(result.resolverErrorDetails?.failureCode).toBe('schema_invalid');
  });

  it('captures missing fields and wrong types without changing the strict schema', () => {
    const errors = collectSemanticSchemaValidationErrors({ status: 'resolved', resolver: 'llm', parties: [], claims: null, judgmentItems: [], claimResolutions: [], applicantRole: 'unknown', applicantOutcome: 'unclear', employeeOutcome: 'unclear', employerOutcome: 'unclear' });
    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'confidence', errorCode: 'missing_required_field' }),
      expect.objectContaining({ path: 'claims', errorCode: 'null_not_allowed' }),
    ]));
  });

  it('redacts authorization-like values from raw previews', () => {
    expect(boundedRawResponsePreview('{"authorization":"Bearer secret-key","apiKey":"secret"}')).not.toContain('secret-key');
    expect(boundedRawResponsePreview('{"authorization":"Bearer secret-key","apiKey":"secret"}')).not.toContain('secret');
  });

  it('aggregates schema, contract, enum, and unknown-id failure categories separately', () => {
    const base = { caseId: 'c', caseName: 'c', claimId: 'q', claimType: 'wage', goldOutcome: 'supported' as const, aiInvocationStatus: 'technical_failure' as const, candidateStatus: 'no_candidate' as const, aiOutcome: null, schemaValid: false, contractValid: false, auditDecision: null, latencyMs: 1, comparison: 'technical_failure' as const, attempt: 1 };
    const rows: BenchmarkClaimResult[] = [
      { ...base, failureStage: 'schema', failureCode: 'schema_invalid', schemaValidationErrors: [{ path: 'claims[0].id', errorCode: 'invalid_enum' }] },
      { ...base, failureStage: 'schema', failureCode: 'schema_invalid', schemaValidationErrors: [{ path: 'claimResolutions', errorCode: 'missing_required_field' }] },
      { ...base, failureStage: 'contract', failureCode: 'contract_mismatch' },
      { ...base, failureStage: 'contract', failureCode: 'unknown_claim_id', auditReasonCodes: ['claim_resolution_claim_id_not_found', 'judgment_item_id_not_found'] },
    ];
    expect(buildSchemaFailureReasons(rows)).toEqual({ invalid_enum: 1, missing_required_field: 1, contract_mismatch: 1, unknown_claim_id: 1 });
    expect(buildAuditFailureReasons(rows)).toEqual({ claim_resolution_claim_id_not_found: 1, judgment_item_id_not_found: 1 });
  });
});
