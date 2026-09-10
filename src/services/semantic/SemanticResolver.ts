import type {
  ReviewableSemanticResolutionCandidate,
  SemanticResolutionCandidate,
  SemanticResolutionInput,
  SemanticResolverErrorCode,
  SemanticUnresolvedFragment,
  ValidatedSemanticResolutionResult,
} from './types';
import type { ReferenceResolutionMethod } from '../../types';
import { SemanticResolutionValidator } from './SemanticResolutionValidator';

export interface SemanticResolver {
  resolve(input: SemanticResolutionInput): Promise<SemanticResolutionCandidate[]>;
}

export const shouldTriggerSemanticResolution = (
  fragment: { resolutionMethod: ReferenceResolutionMethod; needsSemanticResolution: boolean },
): boolean => fragment.resolutionMethod === 'unresolved' && fragment.needsSemanticResolution === true;

export interface SemanticResolverRunResult {
  candidates: SemanticResolutionCandidate[];
  unresolvedFragments: SemanticUnresolvedFragment[];
  status: 'not_needed' | 'resolved' | 'fallback_unresolved';
  error?: string;
}

/** Calls an injected resolver only for eligible fragments and preserves unresolved data on failure. */
export const runSemanticResolverWithFallback = async (
  resolver: SemanticResolver,
  input: SemanticResolutionInput,
): Promise<SemanticResolverRunResult> => {
  const eligible = input.unresolvedFragments.filter(shouldTriggerSemanticResolution);
  if (eligible.length === 0) {
    return { candidates: [], unresolvedFragments: input.unresolvedFragments, status: 'not_needed' };
  }

  try {
    const candidates = await resolver.resolve({ ...input, unresolvedFragments: eligible });
    return {
      candidates,
      unresolvedFragments: input.unresolvedFragments,
      status: 'resolved',
    };
  } catch (error) {
    return {
      candidates: [],
      unresolvedFragments: input.unresolvedFragments,
      status: 'fallback_unresolved',
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const errorCodeOf = (error: unknown): SemanticResolverErrorCode => {
  const code = (error as { code?: SemanticResolverErrorCode })?.code;
  return code ?? 'provider_error';
};

export const resolveAndValidateSemanticReferences = async (
  resolver: SemanticResolver,
  input: SemanticResolutionInput,
): Promise<ValidatedSemanticResolutionResult> => {
  const eligible = input.unresolvedFragments.filter(shouldTriggerSemanticResolution);
  if (eligible.length === 0) {
    return {
      accepted: [], humanReview: [], rejected: [],
      unresolvedFragments: input.unresolvedFragments,
      status: 'not_needed',
    };
  }

  let candidates: SemanticResolutionCandidate[];
  try {
    candidates = await resolver.resolve({ ...input, unresolvedFragments: eligible });
  } catch (error) {
    return {
      accepted: [], humanReview: [], rejected: [],
      unresolvedFragments: input.unresolvedFragments,
      status: 'fallback_unresolved',
      errorCode: errorCodeOf(error),
    };
  }

  const accepted: ReviewableSemanticResolutionCandidate[] = [];
  const humanReview: ReviewableSemanticResolutionCandidate[] = [];
  const rejected: ValidatedSemanticResolutionResult['rejected'] = [];
  const checked: SemanticResolutionCandidate[] = [];

  for (const candidate of candidates) {
    const validation = SemanticResolutionValidator.validate(input, candidate, checked);
    if (validation.decision === 'accepted' && validation.reviewableCandidate) {
      accepted.push(validation.reviewableCandidate);
      checked.push(candidate);
    } else if (validation.decision === 'human_review' && validation.reviewableCandidate) {
      humanReview.push(validation.reviewableCandidate);
      checked.push(candidate);
    } else {
      rejected.push({ candidate, reasons: validation.reasons });
    }
  }

  const unresolvedFragments = input.unresolvedFragments.filter((fragment) => {
    const fragmentCandidates = candidates.filter((candidate) => candidate.fragmentId === fragment.id);
    return fragmentCandidates.length === 0
      || fragmentCandidates.some((candidate) =>
        !accepted.some((item) => item.candidate === candidate)
      );
  });

  return { accepted, humanReview, rejected, unresolvedFragments, status: 'completed' };
};
