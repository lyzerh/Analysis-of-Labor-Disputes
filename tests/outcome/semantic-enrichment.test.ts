import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LaborInfoParsedResult } from '../../src/types';
import {
  MockSemanticResolver,
  SemanticEnrichmentService,
  type SemanticResolutionCandidate,
} from '../../src/services/semantic';
import { parsedResult } from './helpers/record-factories';
import { LaborAnalysisPipeline } from '../../src/services/data/LaborAnalysisPipeline';
import { LaborInfoParserAdapter } from '../../src/services/parser/LaborInfoParserAdapter';
import { ParserEvaluator } from '../../src/services/parser/ParserEvaluator';
import { rawDocument } from './fixtures/outcome-fixtures';

const rejectText = '关于加班工资问题，双方对此存在争议。劳动者未能完成相应举证责任。故该项请求本院不予支持';

const fixture = (unresolvedTexts: string[] = [rejectText]): LaborInfoParsedResult => parsedResult({
  applicantRole: 'employee',
  applicantOutcome: 'unclear',
  employeeOutcome: 'unclear',
  employerOutcome: 'unclear',
  overallResult: 'unclear',
  claims: [
    {
      id: 'claim_1', claimName: '加班工资', claimType: 'overtime_pay',
      claimant: 'employee', claimantRole: 'employee', supportStatus: 'unclear',
      sourceText: '要求支付加班工资', judgmentItems: [],
    },
    {
      id: 'claim_2', claimName: '经济补偿金', claimType: 'economic_compensation',
      claimant: 'employee', claimantRole: 'employee', supportStatus: 'unclear',
      sourceText: '要求支付经济补偿金', judgmentItems: [],
    },
    {
      id: 'claim_3', claimName: '未休年休假工资', claimType: 'annual_leave_pay',
      claimant: 'employee', claimantRole: 'employee', supportStatus: 'unclear',
      sourceText: '要求支付未休年休假工资', judgmentItems: [],
    },
  ],
  unresolvedReferences: unresolvedTexts.map((sourceText) => ({
    sourceText,
    referencedClaimIds: [],
    confidence: 0,
    resolutionMethod: 'unresolved',
    needsSemanticResolution: true,
  })),
  arbitrationCase: {
    ...parsedResult().arbitrationCase,
    id: 'semantic-pipeline-case',
    decision: unresolvedTexts.join('。'),
  },
});

const candidate = (
  fragmentId: string,
  referencedClaimIds: string[],
  sourceText = rejectText,
  confidence = 0.95,
  courtTreatment: SemanticResolutionCandidate['courtTreatment'] = 'rejected',
): SemanticResolutionCandidate => ({
  fragmentId,
  referencedClaimIds,
  courtTreatment,
  confidence,
  sourceText,
  reasoningType: 'cross_sentence',
  resolutionMethod: 'llm',
  provenance: {
    provider: 'mock',
    modelName: 'mock-semantic',
    modelVersion: 'mock-semantic-v1',
    promptVersion: 'semantic-reference-v1',
    resolvedAt: '2026-09-10T00:00:00.000Z',
    confidence,
    sourceText,
  },
});

describe('SemanticEnrichmentService pipeline', () => {
  afterEach(() => vi.restoreAllMocks());

  it('runs fully offline without a resolver and preserves deterministic data', async () => {
    const original = fixture();
    const enriched = await SemanticEnrichmentService.enrich(original);
    expect(enriched.semanticResolutionStatus).toBe('pending');
    expect(enriched.unresolvedReferences).toEqual(original.unresolvedReferences);
    expect(enriched.claims).toEqual(original.claims);
    expect(enriched.applicantOutcome).toBe('unclear');
  });

  it('applies an accepted relation before deterministic claim and case outcome calculation', async () => {
    const resolver = new MockSemanticResolver({
      candidates: [candidate('semantic_fragment_1', ['claim_1'])],
    });
    const enriched = await SemanticEnrichmentService.enrich(fixture(), { semanticResolver: resolver });

    expect(enriched.semanticRelations).toHaveLength(1);
    expect(enriched.claims[0].judgmentItems?.[0]).toMatchObject({
      action: 'reject',
      referenceResolution: { referencedClaimIds: ['claim_1'], resolutionMethod: 'llm' },
    });
    expect(enriched.claims[0].supportStatus).toBe('not_supported');
    expect(enriched.claims[1].supportStatus).toBe('unclear');
    expect(enriched.applicantOutcome).toBe('unclear');
    expect(enriched.unresolvedReferences).toHaveLength(0);
    expect(enriched.semanticResolutionStatus).toBe('resolved');
  });

  it('retains human review without applying a claim relationship or outcome', async () => {
    const original = fixture();
    const resolver = new MockSemanticResolver({
      candidates: [candidate('semantic_fragment_1', ['claim_1'], rejectText, 0.8)],
    });
    const enriched = await SemanticEnrichmentService.enrich(original, { semanticResolver: resolver });

    expect(enriched.humanReviewCandidates).toHaveLength(1);
    expect(enriched.semanticRelations ?? []).toHaveLength(0);
    expect(enriched.unresolvedReferences).toEqual(original.unresolvedReferences);
    expect(enriched.claims[0].judgmentItems).toEqual([]);
    expect(enriched.claims[0].supportStatus).toBe('unclear');
    expect(enriched.semanticResolutionStatus).toBe('needs_review');
  });

  it('preserves deterministic data for rejected candidates and provider fallback', async () => {
    const original = fixture();
    const rejected = await SemanticEnrichmentService.enrich(original, {
      semanticResolver: new MockSemanticResolver({
        candidates: [candidate('semantic_fragment_1', ['invented_claim'], rejectText, 0.5)],
      }),
    });
    expect(rejected.claims).toEqual(original.claims);
    expect(rejected.unresolvedReferences).toEqual(original.unresolvedReferences);

    const fallback = await SemanticEnrichmentService.enrich(original, {
      semanticResolver: new MockSemanticResolver({ errorCode: 'provider_error' }),
    });
    expect(fallback.semanticResolutionStatus).toBe('provider_unavailable');
    expect(fallback.semanticResolutionErrorCode).toBe('provider_error');
    expect(fallback.claims).toEqual(original.claims);
    expect(fallback.unresolvedReferences).toEqual(original.unresolvedReferences);
  });

  it('does not let a semantic treatment conflict override a deterministic action', async () => {
    const original = fixture();
    const enriched = await SemanticEnrichmentService.enrich(original, {
      semanticResolver: new MockSemanticResolver({
        candidates: [candidate('semantic_fragment_1', ['claim_1'], rejectText, 0.95, 'accepted')],
      }),
    });
    expect(enriched.semanticRelations ?? []).toHaveLength(0);
    expect(enriched.claims).toEqual(original.claims);
    expect(enriched.unresolvedReferences).toEqual(original.unresolvedReferences);
  });

  it('isolates a relation to its single target in a multi-claim case', async () => {
    const enriched = await SemanticEnrichmentService.enrich(fixture(), {
      semanticResolver: new MockSemanticResolver({
        candidates: [candidate('semantic_fragment_1', ['claim_2'])],
      }),
    });
    expect(enriched.claims.map((claim) => claim.supportStatus)).toEqual([
      'unclear', 'not_supported', 'unclear',
    ]);
    expect(enriched.claims[0].judgmentItems).toEqual([]);
    expect(enriched.claims[2].judgmentItems).toEqual([]);
  });

  it('applies valid fragments independently and leaves human-review fragments unresolved', async () => {
    const supportText = '故该项经济补偿金请求本院予以支持';
    const reviewText = '对于上述争议，本院结合全案情况予以处理';
    const original = fixture([rejectText, supportText, reviewText]);
    const resolver = new MockSemanticResolver({ candidates: [
      candidate('semantic_fragment_1', ['claim_1']),
      candidate('semantic_fragment_2', ['claim_3'], supportText, 0.95, 'accepted'),
      candidate('semantic_fragment_3', ['claim_2'], reviewText, 0.8, 'unclear'),
    ] });
    const enriched = await SemanticEnrichmentService.enrich(original, { semanticResolver: resolver });

    expect(enriched.semanticRelations).toHaveLength(2);
    expect(enriched.humanReviewCandidates).toHaveLength(1);
    expect(enriched.unresolvedReferences).toEqual([original.unresolvedReferences[2]]);
    expect(enriched.claims.map((claim) => claim.supportStatus)).toEqual([
      'not_supported', 'unclear', 'supported',
    ]);
    expect(enriched.semanticResolutionStatus).toBe('needs_review');
  });

  it('is idempotent and does not duplicate applied relations or judgment items', async () => {
    const resolver = new MockSemanticResolver({
      candidates: [candidate('semantic_fragment_1', ['claim_1'])],
    });
    const once = await SemanticEnrichmentService.enrich(fixture(), { semanticResolver: resolver });
    const twice = await SemanticEnrichmentService.enrich(once, { semanticResolver: resolver });
    expect(twice.semanticRelations).toHaveLength(1);
    expect(twice.claims[0].judgmentItems).toHaveLength(1);
    expect(resolver.callCount).toBe(1);
    expect(twice.semanticResolutionStatus).toBe('resolved');
  });

  it('connects explicit one-case pipeline enrichment to the assembled analysis record', async () => {
    const deterministic = fixture();
    vi.spyOn(LaborInfoParserAdapter, 'parseDetailed').mockReturnValue(deterministic);
    vi.spyOn(ParserEvaluator, 'evaluate').mockReturnValue({
      completenessScore: 100,
    } as ReturnType<typeof ParserEvaluator.evaluate>);
    const resolver = new MockSemanticResolver({
      candidates: [candidate('semantic_fragment_1', ['claim_1'])],
    });

    const result = await LaborAnalysisPipeline.processRawDocumentWithSemantic(
      rawDocument('semantic-pipeline', rejectText),
      { enableSemanticResolution: true, semanticResolver: resolver },
      null,
    );

    expect(result.error).toBeUndefined();
    expect(result.record).not.toBeNull();
    expect(result.record?.semanticResolutionStatus).toBe('resolved');
    expect(result.record?.semanticRelations).toHaveLength(1);
    expect(result.record?.claims[0].supportStatus).toBe('not_supported');
    expect(result.record?.claims[1].supportStatus).toBe('unclear');
    expect(resolver.callCount).toBe(1);
  });

  it('never reads outcome or amount fields from a semantic candidate', () => {
    const source = readFileSync(resolve(
      process.cwd(), 'src/services/semantic/SemanticEnrichmentService.ts',
    ), 'utf8');
    expect(source).not.toMatch(
      /candidate\.(?:outcome|claimOutcome|employeeOutcome|employerOutcome|overallResult|amount|requestedAmount|awardedAmount)/,
    );
  });
});
