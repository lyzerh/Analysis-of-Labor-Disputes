import { describe, expect, it, vi } from 'vitest';
import {
  OrdinalReferenceResolver,
  runSemanticResolverWithFallback,
  SEMANTIC_CONFIDENCE_THRESHOLDS,
  SemanticResolutionValidator,
  shouldTriggerSemanticResolution,
  type SemanticResolutionCandidate,
  type SemanticResolutionInput,
} from '../../src/services/semantic';
import { ordinalFixtures, semanticInput } from './fixtures/semantic-resolution-fixtures';

const candidateFor = (
  input: SemanticResolutionInput,
  overrides: Partial<SemanticResolutionCandidate> = {},
): SemanticResolutionCandidate => {
  const sourceText = input.unresolvedFragments[0].sourceText;
  const confidence = overrides.confidence ?? 0.95;
  return {
    fragmentId: input.unresolvedFragments[0].id,
    referencedClaimIds: ['claim-1'],
    courtTreatment: 'rejected',
    confidence,
    sourceText,
    reasoningType: 'anaphora',
    resolutionMethod: 'llm',
    provenance: {
      provider: 'mock',
      modelName: 'mock-semantic-resolver',
      modelVersion: 'test-1',
      promptVersion: 'semantic-contract-v1',
      resolvedAt: '2026-09-09T00:00:00.000Z',
      confidence,
      sourceText,
    },
    ...overrides,
  };
};

describe('OrdinalReferenceResolver regression fixtures', () => {
  it.each(ordinalFixtures)('$name', ({
    input,
    expectedStatus,
    expectedRelations,
    expectedReason,
    expectedValidationDecision,
  }) => {
    const result = OrdinalReferenceResolver.resolveFragment(input, input.unresolvedFragments[0]);

    expect(result.status).toBe(expectedStatus);
    if (expectedReason) expect(result.reason).toBe(expectedReason);
    expect(result.candidates).toHaveLength(expectedRelations.length);
    expectedRelations.forEach((expected, index) => {
      expect(result.candidates[index]?.referencedClaimIds).toEqual(expected.ids);
      if (expected.treatment) expect(result.candidates[index]?.courtTreatment).toBe(expected.treatment);
      if (expected.action) expect(result.candidates[index]?.judgmentAction).toBe(expected.action);
      if (expected.reasoningType) expect(result.candidates[index]?.reasoningType).toBe(expected.reasoningType);
    });

    if (expectedValidationDecision === 'unresolved') {
      expect(result.candidates).toEqual([]);
    } else {
      result.candidates.forEach((relation) => {
        const semanticCandidate = candidateFor(input, {
          referencedClaimIds: relation.referencedClaimIds,
          courtTreatment: relation.courtTreatment,
          reasoningType: relation.reasoningType,
        });
        expect(SemanticResolutionValidator.validate(input, semanticCandidate).decision).toBe('accepted');
      });
    }
  });
});

describe('SemanticResolutionValidator contract', () => {
  const unresolvedInput = semanticInput('该项请求缺乏事实依据，本院不予支持');

  it('accepts a valid relationship candidate at the accepted threshold', () => {
    const candidate = candidateFor(unresolvedInput, { confidence: SEMANTIC_CONFIDENCE_THRESHOLDS.accepted });
    candidate.provenance.confidence = candidate.confidence;
    const result = SemanticResolutionValidator.validate(unresolvedInput, candidate);
    expect(result.decision).toBe('accepted');
    expect(result.reviewableCandidate?.provenance.validatorDecision).toBe('accepted');
  });

  it('routes a valid medium-confidence candidate to human review', () => {
    const result = SemanticResolutionValidator.validate(
      unresolvedInput,
      candidateFor(unresolvedInput, { confidence: 0.75, provenance: {
        ...candidateFor(unresolvedInput).provenance,
        confidence: 0.75,
      } }),
    );
    expect(result.decision).toBe('human_review');
  });

  it('rejects a candidate below the confidence threshold', () => {
    const result = SemanticResolutionValidator.validate(
      unresolvedInput,
      candidateFor(unresolvedInput, { confidence: 0.69, provenance: {
        ...candidateFor(unresolvedInput).provenance,
        confidence: 0.69,
      } }),
    );
    expect(result.decision).toBe('rejected');
    expect(result.reasons).toContain('confidence_below_rejection_threshold');
  });

  it('rejects an unknown claim id', () => {
    const result = SemanticResolutionValidator.validate(
      unresolvedInput,
      candidateFor(unresolvedInput, { referencedClaimIds: ['missing-claim'] }),
    );
    expect(result.decision).toBe('rejected');
    expect(result.reasons).toContain('claim_id_not_found');
  });

  it('rejects an empty claim id collection', () => {
    const result = SemanticResolutionValidator.validate(
      unresolvedInput,
      candidateFor(unresolvedInput, { referencedClaimIds: [] }),
    );
    expect(result.decision).toBe('rejected');
    expect(result.reasons).toContain('empty_referenced_claim_ids');
  });

  it('rejects source text that is not the exact unresolved fragment', () => {
    const result = SemanticResolutionValidator.validate(
      unresolvedInput,
      candidateFor(unresolvedInput, { sourceText: '摘要文本' }),
    );
    expect(result.decision).toBe('rejected');
    expect(result.reasons).toContain('source_text_not_exact');
  });

  it('rejects an attempted amount or outcome mutation even from untyped model output', () => {
    const candidate = {
      ...candidateFor(unresolvedInput),
      awardedAmount: 100000,
      nested: { employerOutcome: 'supported' },
    };
    const result = SemanticResolutionValidator.validate(unresolvedInput, candidate);
    expect(result.decision).toBe('rejected');
    expect(result.reasons).toContain('candidate_attempts_outcome_or_amount_mutation');
  });

  it('rejects an unrelated claimant party', () => {
    const result = SemanticResolutionValidator.validate(
      unresolvedInput,
      candidateFor(unresolvedInput, { claimantPartyId: 'employer-1' }),
    );
    expect(result.decision).toBe('rejected');
    expect(result.reasons).toContain('unrelated_claimant_party');
  });

  it('rejects a candidate that conflicts with deterministic ordinal mapping', () => {
    const input = semanticInput('第一项请求予以支持');
    const result = SemanticResolutionValidator.validate(
      input,
      candidateFor(input, { referencedClaimIds: ['claim-2'], courtTreatment: 'accepted' }),
    );
    expect(result.decision).toBe('rejected');
    expect(result.reasons).toContain('conflicts_with_deterministic_ordinal_resolution');
  });

  it('rejects treatment conflicts with an existing candidate for the same claim', () => {
    const existing = candidateFor(unresolvedInput, { courtTreatment: 'accepted' });
    const result = SemanticResolutionValidator.validate(
      unresolvedInput,
      candidateFor(unresolvedInput, { courtTreatment: 'rejected' }),
      [existing],
    );
    expect(result.decision).toBe('rejected');
    expect(result.reasons).toContain('conflicts_with_existing_candidate');
  });

  it('rejects confidence outside zero-to-one', () => {
    const result = SemanticResolutionValidator.validate(
      unresolvedInput,
      candidateFor(unresolvedInput, { confidence: 1.1, provenance: {
        ...candidateFor(unresolvedInput).provenance,
        confidence: 1.1,
      } }),
    );
    expect(result.decision).toBe('rejected');
    expect(result.reasons).toContain('confidence_out_of_range');
  });
});

describe('SemanticResolver trigger and fallback contract', () => {
  it('triggers only for unresolved fragments explicitly marked for semantic resolution', () => {
    expect(shouldTriggerSemanticResolution({
      resolutionMethod: 'unresolved',
      needsSemanticResolution: true,
    })).toBe(true);
    expect(shouldTriggerSemanticResolution({
      resolutionMethod: 'ordinal',
      needsSemanticResolution: true,
    })).toBe(false);
    expect(shouldTriggerSemanticResolution({
      resolutionMethod: 'unresolved',
      needsSemanticResolution: false,
    })).toBe(false);
  });

  it('does not invoke a resolver when there are no unresolved fragments', async () => {
    const resolve = vi.fn();
    const input = { ...semanticInput(''), unresolvedFragments: [] };
    const result = await runSemanticResolverWithFallback({ resolve }, input);
    expect(resolve).not.toHaveBeenCalled();
    expect(result.status).toBe('not_needed');
  });

  it('preserves unresolved fragments when an injected resolver fails', async () => {
    const input = semanticInput('该项请求不予支持');
    const result = await runSemanticResolverWithFallback({
      resolve: vi.fn().mockRejectedValue(new Error('resolver unavailable')),
    }, input);
    expect(result.status).toBe('fallback_unresolved');
    expect(result.candidates).toEqual([]);
    expect(result.unresolvedFragments).toEqual(input.unresolvedFragments);
  });
});
