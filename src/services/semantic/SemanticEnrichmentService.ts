import type {
  ClaimReferenceCandidate,
  JudgmentAction,
  JudgmentActionItem,
  LaborInfoParsedResult,
} from '../../types';
import { aggregateClaimOutcomes, resolveClaimOutcome } from '../outcome/ClaimOutcomeResolver';
import { resolvePartyOutcomes } from '../outcome/OutcomeResolver';
import { resolveAndValidateSemanticReferences, type SemanticResolver } from './SemanticResolver';
import type {
  AppliedSemanticRelation,
  ReviewableSemanticResolutionCandidate,
  SemanticResolutionInput,
  SemanticResolutionStatus,
} from './types';

export interface SemanticEnrichmentOptions {
  semanticResolver?: SemanticResolver;
}

const fragmentId = (index: number): string => `semantic_fragment_${index + 1}`;

const deterministicActionFrom = (sourceText: string): JudgmentAction | undefined => {
  if (/驳回|不予支持|无需支付|不予处理|不属于(?:人民法院|民事诉讼|劳动争议)/.test(sourceText)) {
    return 'reject';
  }
  if (/予以支持|支持/.test(sourceText)) return 'support';
  if (/支付|补缴|补发/.test(sourceText)) return 'pay';
  if (/维持(?:原判|原裁决)/.test(sourceText)) return 'maintain';
  if (/撤销/.test(sourceText)) return 'revoke';
  return undefined;
};

const relationKey = (item: ReviewableSemanticResolutionCandidate): string => [
  item.candidate.fragmentId,
  [...item.candidate.referencedClaimIds].sort().join(','),
  item.candidate.provenance.modelName,
  item.candidate.provenance.promptVersion,
].join('|');

const mergeUnique = <T extends ReviewableSemanticResolutionCandidate>(
  existing: T[] = [],
  incoming: T[] = [],
): T[] => {
  const byKey = new Map(existing.map((item) => [relationKey(item), item]));
  incoming.forEach((item) => byKey.set(relationKey(item), item));
  return [...byKey.values()];
};

const buildInput = (
  parsed: LaborInfoParsedResult,
  eligible: Array<{ reference: ClaimReferenceCandidate; originalIndex: number }>,
): SemanticResolutionInput => ({
  caseId: parsed.arbitrationCase.id,
  claims: parsed.claims.map((claim, index) => ({
    id: claim.id ?? `claim_${index + 1}`,
    order: index + 1,
    claimType: claim.claimType,
    claimantRole: claim.claimantRole ?? claim.claimant,
    claimantPartyId: claim.claimantPartyId,
    proceduralBasis: claim.proceduralBasis,
    sourceText: claim.sourceText,
  })),
  unresolvedFragments: eligible.map(({ reference, originalIndex }) => ({
    id: fragmentId(originalIndex),
    sourceText: reference.sourceText,
    surroundingText: parsed.arbitrationCase.decision || reference.sourceText,
    candidateClaimIds: reference.referencedClaimIds.length > 0
      ? reference.referencedClaimIds
      : undefined,
    resolutionMethod: 'unresolved',
    needsSemanticResolution: true,
  })),
  judgmentItems: [
    ...parsed.claims.flatMap((claim, claimIndex) =>
      (claim.judgmentItems ?? []).map((item, itemIndex) => ({
        id: item.id ?? `claim_${claimIndex + 1}_judgment_${itemIndex + 1}`,
        action: item.action,
        sourceText: item.sourceText,
        targetClaimType: item.targetClaimType,
        referencedClaimIds: item.referenceResolution?.referencedClaimIds
          ?? (claim.id ? [claim.id] : []),
      }))
    ),
    ...eligible.flatMap(({ reference, originalIndex }) => {
      const action = deterministicActionFrom(reference.sourceText);
      return action ? [{
        id: `semantic_judgment_${originalIndex + 1}`,
        action,
        sourceText: reference.sourceText,
        referencedClaimIds: [],
      }] : [];
    }),
  ],
});

const semanticStatus = (
  unresolvedCount: number,
  appliedCount: number,
  humanReviewCount: number,
): SemanticResolutionStatus => {
  if (humanReviewCount > 0) return 'needs_review';
  if (unresolvedCount === 0) return 'resolved';
  if (appliedCount > 0) return 'partially_resolved';
  return 'pending';
};

/** Optional post-parser enrichment. Only Validator-accepted relations are applied. */
export class SemanticEnrichmentService {
  public static async enrich(
    parsed: LaborInfoParsedResult,
    options: SemanticEnrichmentOptions = {},
  ): Promise<LaborInfoParsedResult> {
    const eligible = parsed.unresolvedReferences
      .map((reference, originalIndex) => ({ reference, originalIndex }))
      .filter(({ reference }) =>
        reference.resolutionMethod === 'unresolved' && reference.needsSemanticResolution === true
      );

    if (eligible.length === 0) {
      return {
        ...parsed,
        semanticResolutionStatus: parsed.semanticResolutionStatus ?? 'not_needed',
      };
    }
    if (!options.semanticResolver) {
      return { ...parsed, semanticResolutionStatus: parsed.semanticResolutionStatus ?? 'pending' };
    }

    const result = await resolveAndValidateSemanticReferences(
      options.semanticResolver,
      buildInput(parsed, eligible),
    );
    if (result.status === 'fallback_unresolved') {
      return {
        ...parsed,
        semanticResolutionStatus: 'provider_unavailable',
        semanticResolutionErrorCode: result.errorCode,
      };
    }

    const acceptedByFragment = new Map(
      result.accepted.map((item) => [item.candidate.fragmentId, item]),
    );
    const appliedRelations = mergeUnique<AppliedSemanticRelation>(
      parsed.semanticRelations,
      result.accepted,
    );
    const humanReviewCandidates = mergeUnique(
      parsed.humanReviewCandidates,
      result.humanReview,
    );
    const targetClaimIds = new Set<string>();
    let appliedJudgmentCount = 0;

    const claims = parsed.claims.map((claim, index) => {
      const claimId = claim.id ?? `claim_${index + 1}`;
      const matchingRelations = result.accepted.filter((item) =>
        item.candidate.referencedClaimIds.includes(claimId)
      );
      if (matchingRelations.length === 0) return { ...claim };

      const judgmentItems = [...(claim.judgmentItems ?? [])];
      matchingRelations.forEach((item) => {
        const action = deterministicActionFrom(item.candidate.sourceText);
        if (!action) return;
        const itemId = `semantic:${item.candidate.fragmentId}:${claimId}`;
        if (judgmentItems.some((existing) => existing.id === itemId)) return;
        const judgmentItem: JudgmentActionItem = {
          id: itemId,
          action,
          targetPartyRole: 'unknown',
          targetClaimType: claim.claimType,
          sourceText: item.candidate.sourceText,
          referenceResolution: {
            sourceText: item.candidate.sourceText,
            referencedClaimIds: item.candidate.referencedClaimIds,
            confidence: item.candidate.confidence,
            resolutionMethod: 'llm',
            needsSemanticResolution: false,
          },
        };
        judgmentItems.push(judgmentItem);
        appliedJudgmentCount += 1;
        targetClaimIds.add(claimId);
      });

      return {
        ...claim,
        judgmentItems,
        supportStatus: resolveClaimOutcome(claim, judgmentItems),
      };
    });

    const unresolvedReferences = parsed.unresolvedReferences.filter((_reference, index) =>
      !acceptedByFragment.has(fragmentId(index))
    );
    let applicantOutcome = parsed.applicantOutcome;
    let employeeOutcome = parsed.employeeOutcome;
    let employerOutcome = parsed.employerOutcome;
    if (appliedJudgmentCount > 0 && targetClaimIds.size > 0) {
      applicantOutcome = aggregateClaimOutcomes(claims, parsed.applicantOutcome);
      ({ employeeOutcome, employerOutcome } = resolvePartyOutcomes(parsed.applicantRole, applicantOutcome));
    }

    return {
      ...parsed,
      claims,
      unresolvedReferences,
      semanticRelations: appliedRelations,
      humanReviewCandidates,
      semanticResolutionStatus: semanticStatus(
        unresolvedReferences.length,
        result.accepted.length,
        result.humanReview.length,
      ),
      semanticResolutionErrorCode: undefined,
      applicantOutcome,
      employeeOutcome,
      employerOutcome,
      overallResult: applicantOutcome,
    };
  }
}
