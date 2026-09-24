import type {
  AnalysisCaseRecord,
  CaseParty,
  LaborInfoClaimItem,
  LaborRole,
} from '../../types';
import { hashStringSync } from '../crypto/HashUtils';

/**
 * Identity is deliberately separate from the parser's claimId.  A parser may
 * renumber claims when a document is reparsed, while the claimant, request
 * text and provenance still identify the same legal request.
 */
export type ClaimIdentityStatus = 'verified' | 'legacy_unverified' | 'identity_mismatch' | 'identity_missing';

export interface ClaimIdentity {
  caseId: string;
  claimantPartyIds: string[];
  claimantRole: LaborRole;
  /** Procedural roles are context; they are not substituted for laborRole. */
  proceduralRoleContext: string[];
  claimType: string;
  normalizedClaimText: string;
  requestedAmount?: number;
  currency?: string;
  sourceKind?: string;
  sourceField?: string;
  claimIdentityHash: string;
}

export type FrozenClaimIdentity = Omit<ClaimIdentity, 'claimIdentityHash'> & {
  claimIdentityHash: string;
  identityStatus?: ClaimIdentityStatus;
};

const uniqueSorted = (values: readonly string[]): string[] => [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();

export const normalizeClaimText = (value: string | undefined): string => (value || '')
  .normalize('NFKC')
  .replace(/\s+/g, ' ')
  .trim();

const partiesForClaim = (record: AnalysisCaseRecord, claim: LaborInfoClaimItem): CaseParty[] => {
  const parties = record.parties || [];
  if (claim.claimantPartyId) return parties.filter((party) => party.id === claim.claimantPartyId);
  // This mirrors the existing semantic-task projection.  It is deterministic,
  // but an absent explicit party id is still surfaced as legacy/missing by the
  // status calculation rather than silently treated as verified Gold data.
  return parties.filter((party) => party.laborRole === (claim.claimantRole || claim.claimant));
};

const proceduralContextFor = (parties: CaseParty[], claim: LaborInfoClaimItem): string[] => uniqueSorted([
  ...parties.flatMap((party) => (party.proceduralRoles || []).map((role) => `party:${role}`)),
  ...(claim.proceduralBasis ? [`basis:${claim.proceduralBasis}`] : []),
]);

export const claimIdentityPayload = (identity: Omit<ClaimIdentity, 'claimIdentityHash'>): string => JSON.stringify({
  version: 'claim-identity-v1',
  caseId: identity.caseId,
  claimantPartyIds: uniqueSorted(identity.claimantPartyIds),
  claimantRole: identity.claimantRole,
  proceduralRoleContext: uniqueSorted(identity.proceduralRoleContext),
  claimType: identity.claimType,
  normalizedClaimText: identity.normalizedClaimText,
  requestedAmount: identity.requestedAmount ?? null,
  currency: identity.currency ?? null,
  sourceKind: identity.sourceKind ?? null,
  sourceField: identity.sourceField ?? null,
});

export const buildClaimIdentity = (record: AnalysisCaseRecord, claim: LaborInfoClaimItem): ClaimIdentity => {
  const parties = partiesForClaim(record, claim);
  const claimantPartyIds = uniqueSorted(claim.claimantPartyId ? [claim.claimantPartyId] : parties.map((party) => party.id));
  const base: Omit<ClaimIdentity, 'claimIdentityHash'> = {
    caseId: record.caseId,
    claimantPartyIds,
    claimantRole: claim.claimantRole || claim.claimant,
    proceduralRoleContext: proceduralContextFor(parties, claim),
    claimType: claim.claimType || claim.claimName || '',
    normalizedClaimText: normalizeClaimText(claim.sourceText),
    ...(claim.requestedAmount === undefined ? {} : { requestedAmount: claim.requestedAmount, currency: 'CNY' }),
    ...(claim.claimSourceKind ? { sourceKind: claim.claimSourceKind } : {}),
    ...(claim.claimSourceField ? { sourceField: claim.claimSourceField } : {}),
  };
  return { ...base, claimIdentityHash: hashStringSync(claimIdentityPayload(base)) };
};

/** Resolve a claim by parser id first, then by an exact frozen identity hash.
 * The hash fallback handles deterministic claimId renumbering without fuzzy or
 * semantic rebinding; ambiguous duplicate hashes are intentionally rejected.
 */
export const findClaimForIdentity = (
  record: AnalysisCaseRecord,
  claimId: string | undefined,
  storedHash?: string,
): LaborInfoClaimItem | undefined => {
  const byId = claimId ? record.claims?.find((claim) => claim.id === claimId) : undefined;
  if (byId) return byId;
  if (!storedHash) return undefined;
  const matches = (record.claims || []).filter((claim) => buildClaimIdentity(record, claim).claimIdentityHash === storedHash);
  return matches.length === 1 ? matches[0] : undefined;
};

export const freezeClaimIdentity = (identity: ClaimIdentity, identityStatus: ClaimIdentityStatus = 'verified'): FrozenClaimIdentity => ({
  ...identity,
  claimantPartyIds: [...identity.claimantPartyIds],
  proceduralRoleContext: [...identity.proceduralRoleContext],
  identityStatus,
});

export const claimIdentityStatus = (
  storedHash: string | undefined,
  current: ClaimIdentity | undefined,
): ClaimIdentityStatus => {
  if (!current || !current.claimIdentityHash) return 'identity_missing';
  if (!storedHash) return 'legacy_unverified';
  return storedHash === current.claimIdentityHash ? 'verified' : 'identity_mismatch';
};

export const claimIdentityStatusLabel = (status: ClaimIdentityStatus): string => ({
  verified: '身份已验证',
  legacy_unverified: '历史身份未验证',
  identity_mismatch: '身份不一致',
  identity_missing: '身份信息不足',
}[status]);

export const isIdentityVerified = (status: ClaimIdentityStatus): boolean => status === 'verified';

/** Stable projection used in exports without exposing the parser's claimId as identity. */
export const claimIdentityForExport = (identity: ClaimIdentity | undefined): FrozenClaimIdentity | undefined => identity ? freezeClaimIdentity(identity) : undefined;
