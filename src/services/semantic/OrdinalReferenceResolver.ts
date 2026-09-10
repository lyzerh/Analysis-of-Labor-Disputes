import type { JudgmentAction } from '../../types';
import type {
  CourtTreatment,
  DeterministicReferenceCandidate,
  DeterministicResolutionResult,
  SemanticResolutionInput,
  SemanticUnresolvedFragment,
} from './types';

const CHINESE_DIGITS: Record<string, number> = {
  '〇': 0,
  '零': 0,
  '一': 1,
  '二': 2,
  '两': 2,
  '三': 3,
  '四': 4,
  '五': 5,
  '六': 6,
  '七': 7,
  '八': 8,
  '九': 9,
};

const toOrdinal = (raw: string): number | undefined => {
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw === '十') return 10;
  const tenIndex = raw.indexOf('十');
  if (tenIndex >= 0) {
    const tens = tenIndex === 0 ? 1 : CHINESE_DIGITS[raw[tenIndex - 1]];
    const units = tenIndex === raw.length - 1 ? 0 : CHINESE_DIGITS[raw[tenIndex + 1]];
    if (tens === undefined || units === undefined) return undefined;
    return tens * 10 + units;
  }
  return raw.length === 1 ? CHINESE_DIGITS[raw] : undefined;
};

const inferTreatment = (clause: string): CourtTreatment => {
  if (/部分(?:予以)?支持|部分有依据/.test(clause)) return 'partially_accepted';
  if (/不予支持|不支持|驳回|缺乏依据|无事实(?:和|及)?法律依据|不能成立/.test(clause)) return 'rejected';
  if (/未处理|不予审理|另案处理/.test(clause)) return 'not_addressed';
  if (/予以支持|应予支持|有(?:事实|法律|事实和法律)?依据|成立/.test(clause)) return 'accepted';
  return 'unclear';
};

const inferAction = (clause: string): JudgmentAction | undefined => {
  if (/维持/.test(clause)) return 'maintain';
  if (/撤销/.test(clause)) return 'revoke';
  if (/不予支持|不支持|驳回|缺乏依据|不能成立/.test(clause)) return 'reject';
  if (/予以支持|应予支持|有(?:事实|法律|事实和法律)?依据|成立/.test(clause)) return 'support';
  return undefined;
};

const clauseAround = (source: string, start: number, end: number): string => {
  const preceding = source.slice(0, start);
  const precedingBoundary = Math.max(
    preceding.lastIndexOf('。'),
    preceding.lastIndexOf('；'),
    preceding.lastIndexOf(';'),
    preceding.lastIndexOf('，'),
    preceding.lastIndexOf(','),
  );
  const following = source.slice(end);
  const followingBoundary = following.search(/[。；;，,]/);
  return source.slice(
    precedingBoundary + 1,
    followingBoundary < 0 ? source.length : end + followingBoundary,
  );
};

const makeCandidate = (
  fragment: SemanticUnresolvedFragment,
  referencedClaimIds: string[],
  clause: string,
  reasoningType: DeterministicReferenceCandidate['reasoningType'],
): DeterministicReferenceCandidate => ({
  fragmentId: fragment.id,
  referencedClaimIds,
  courtTreatment: inferTreatment(clause),
  confidence: 1,
  sourceText: fragment.sourceText,
  reasoningType,
  resolutionMethod: reasoningType === 'remaining_claims' ? 'rule' : 'ordinal',
  judgmentAction: inferAction(clause),
});

export class OrdinalReferenceResolver {
  public static resolveFragment(
    input: SemanticResolutionInput,
    fragment: SemanticUnresolvedFragment,
  ): DeterministicResolutionResult {
    const source = fragment.sourceText;
    const orderedClaims = [...input.claims].sort((left, right) => left.order - right.order);
    const candidates: DeterministicReferenceCandidate[] = [];
    let containsOutOfRangeOrdinal = false;
    const explicitPattern = /第([一二两三四五六七八九十百〇零\d]+(?:[、，,及和与][一二两三四五六七八九十百〇零\d]+)*)项/g;

    for (const match of source.matchAll(explicitPattern)) {
      const ordinals = match[1]
        .split(/[、，,及和与]/)
        .map(toOrdinal);
      if (ordinals.some((ordinal) => ordinal === undefined || ordinal < 1 || ordinal > orderedClaims.length)) {
        containsOutOfRangeOrdinal = true;
        continue;
      }
      const ids = ordinals.map((ordinal) => orderedClaims[(ordinal as number) - 1].id);
      const start = match.index ?? 0;
      const clause = clauseAround(source, start, start + match[0].length);
      candidates.push(makeCandidate(
        fragment,
        ids,
        clause,
        ids.length > 1 ? 'multi_claim_reference' : (/一审判决|原判/.test(source) ? 'appeal_mapping' : 'ordinal_reference'),
      ));
    }

    const leadingPattern = /前([一二两三四五六七八九十\d]+)项/g;
    for (const match of source.matchAll(leadingPattern)) {
      const count = toOrdinal(match[1]);
      if (count === undefined || count < 1 || count > orderedClaims.length) {
        containsOutOfRangeOrdinal = true;
        continue;
      }
      const start = match.index ?? 0;
      const clause = clauseAround(source, start, start + match[0].length);
      candidates.push(makeCandidate(
        fragment,
        orderedClaims.slice(0, count).map((claim) => claim.id),
        clause,
        'multi_claim_reference',
      ));
    }

    if (containsOutOfRangeOrdinal) {
      return { status: 'unresolved', candidates: [], reason: 'ordinal_out_of_range' };
    }
    if (candidates.length > 0) {
      return { status: 'resolved', candidates, reason: 'deterministic_ordinal_match' };
    }

    if (/其余(?:诉讼|上诉|仲裁)?请求/.test(source)) {
      const handledIds = new Set((input.judgmentItems ?? []).flatMap((item) => item.referencedClaimIds));
      const remainingIds = orderedClaims.filter((claim) => !handledIds.has(claim.id)).map((claim) => claim.id);
      if (handledIds.size > 0 && remainingIds.length > 0) {
        return {
          status: 'resolved',
          candidates: [makeCandidate(fragment, remainingIds, source, 'remaining_claims')],
          reason: 'remaining_claims_by_elimination',
        };
      }
      return { status: 'unresolved', candidates: [], reason: 'remaining_claims_without_prior_mapping' };
    }

    return { status: 'unresolved', candidates: [], reason: 'non_deterministic_anaphora' };
  }
}
