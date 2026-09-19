import type { AnalysisCaseRecord } from '../../types';
import { readSemanticReviewItems } from '../semantic/SemanticReviewStorage';
import type { SemanticReviewItem } from '../semantic/SemanticReviewQueue';
import type {
  ResolvedSemanticResult,
  SemanticResolutionResult,
} from '../semantic/SemanticResult';
import {
  parseSemanticResolutionResult,
} from '../semantic/SemanticResultSchema';
import type { SemanticLocalAuditResult } from '../semantic/SemanticResultAudit';
import { traceSemantic } from '../semantic/SemanticTracing';

/**
 * The only admission decision used by formal analytics. Legacy parser fields
 * can describe a record, but they cannot by themselves establish trust in a
 * semantic result.
 */
export type AnalyticsAdmissionStatus = 'eligible' | 'blocked';
export type AnalyticsAdmissionSource = 'rule' | 'llm' | 'human_review';
export type AnalyticsAdmissionReasonCode =
  | 'semantic_unresolved'
  | 'audit_failed'
  | 'review_pending'
  | 'technical_failure'
  | 'critical_outcome_unclear'
  | 'missing_accepted_semantic_result'
  | 'not_in_analysis_set';

export interface AcceptedSemanticResult {
  source: AnalyticsAdmissionSource;
  result: ResolvedSemanticResult | SemanticResolutionResult;
}

export interface AnalyticsAdmissionResult {
  status: AnalyticsAdmissionStatus;
  reasonCodes: AnalyticsAdmissionReasonCode[];
  source?: AnalyticsAdmissionSource;
  acceptedSemanticResult?: AcceptedSemanticResult;
}

/** Optional semantic material associated with one AnalysisCaseRecord. */
export interface AnalyticsAdmissionInput {
  record: AnalysisCaseRecord;
  ruleResult?: ResolvedSemanticResult | null;
  semanticResult?: SemanticResolutionResult | null;
  audit?: SemanticLocalAuditResult | null;
  reviewItem?: SemanticReviewItem | null;
  reviewItems?: readonly SemanticReviewItem[];
  technicalErrorCode?: string | null;
}

export interface AnalyticsAdmissionFilterOptions {
  /** Preserves the frozen input count when an analytics caller passes only eligible rows. */
  totalInputCount?: number;
  reviewItems?: readonly SemanticReviewItem[];
  semanticResults?: ReadonlyMap<string, SemanticResolutionResult>;
  audits?: ReadonlyMap<string, SemanticLocalAuditResult>;
  ruleResults?: ReadonlyMap<string, ResolvedSemanticResult>;
  technicalErrors?: ReadonlyMap<string, string>;
  getAdmissionInput?: (
    record: AnalysisCaseRecord,
  ) => Partial<Omit<AnalyticsAdmissionInput, 'record'>>;
}

export interface AnalyticsAdmissionFilterResult {
  eligibleRecords: AnalysisCaseRecord[];
  blockedRecords: AnalysisCaseRecord[];
  admissions: Map<string, AnalyticsAdmissionResult>;
}

const addReason = (
  reasons: Set<AnalyticsAdmissionReasonCode>,
  reason: AnalyticsAdmissionReasonCode,
): void => {
  reasons.add(reason);
};

const criticalOutcomeUnclear = (
  value: Pick<AnalysisCaseRecord, 'applicantRole' | 'applicantOutcome' | 'employeeOutcome' | 'employerOutcome'>,
): boolean => value.applicantRole === 'unknown'
  || value.applicantOutcome === 'unclear'
  || value.employeeOutcome === 'unclear'
  || value.employerOutcome === 'unclear';

const recordHasUnresolvedClaimState = (
  value: Pick<AnalysisCaseRecord, 'claims' | 'outcomeDiagnostics'>,
): boolean => value.claims.some((claim) => (
  claim.supportStatus === 'unclear'
  || claim.referenceResolution?.resolutionMethod === 'unresolved'
  || claim.referenceResolution?.needsSemanticResolution === true
  || (value.outcomeDiagnostics || []).some((diagnostic) => (
    diagnostic.needsReview
    && (!diagnostic.claimId || diagnostic.claimId === claim.id)
  ))
)) || (value.outcomeDiagnostics || []).some((diagnostic) => diagnostic.needsReview && !diagnostic.claimId);

const recordHasCriticalUnclear = (value: AnalysisCaseRecord): boolean => (
  criticalOutcomeUnclear(value) || recordHasUnresolvedClaimState(value)
);

const semanticResultHasCriticalUnclear = (result: SemanticResolutionResult | ResolvedSemanticResult): boolean => (
  result.applicantRole === 'unknown'
  || result.applicantOutcome === 'unclear'
  || result.employeeOutcome === 'unclear'
  || result.employerOutcome === 'unclear'
  || result.claimResolutions.some((resolution) => resolution.outcome === 'unclear')
  || ('unresolvedReasonCodes' in result && (result.unresolvedReasonCodes?.length ?? 0) > 0)
);

const auditPassed = (audit: SemanticLocalAuditResult | null | undefined): boolean => (
  audit?.decision === 'pass' && audit.reasonCodes.length === 0
);

const reviewCandidates = (input: AnalyticsAdmissionInput): SemanticReviewItem[] => {
  const candidates = [
    ...(input.reviewItem ? [input.reviewItem] : []),
    ...(input.reviewItems ?? readSemanticReviewItems()),
  ].filter((item) => item.caseId === input.record.caseId);
  const unique = new Map<string, SemanticReviewItem>();
  candidates.forEach((item) => unique.set(item.id, item));
  return [...unique.values()];
};

const humanReviewResult = (
  item: SemanticReviewItem,
): AcceptedSemanticResult | undefined => {
  if (item.status !== 'reviewed') return undefined;
  if (!item.reviewedResult
    || item.reviewedResult.source !== 'human_review'
    || item.reviewedResult.reviewStatus !== 'approved') return undefined;
  try {
    const result = parseSemanticResolutionResult(item.reviewedResult.reviewedResult);
    return { source: 'human_review', result };
  } catch {
    return undefined;
  }
};

/**
 * Resolves the trusted semantic source in the required order. This helper is
 * deliberately side-effect free and does not modify provenance or records.
 */
export const resolveAcceptedSemanticResult = (
  input: AnalyticsAdmissionInput,
): AcceptedSemanticResult | undefined => {
  const reviews = reviewCandidates(input);
  const reviewed = reviews
    .filter((item) => item.status === 'reviewed')
    .map(humanReviewResult)
    .find((item): item is AcceptedSemanticResult => item !== undefined);
  if (reviewed) return reviewed;

  if (input.semanticResult?.status === 'resolved'
    && !input.semanticResult.resolverErrorCode
    && auditPassed(input.audit)) {
    try {
      const result = parseSemanticResolutionResult(input.semanticResult);
      return semanticResultHasCriticalUnclear(result)
        ? undefined
        : { source: 'llm', result };
    } catch {
      return undefined;
    }
  }

  if (input.ruleResult?.status === 'resolved') {
    return { source: 'rule', result: input.ruleResult };
  }
  return undefined;
};

const pendingReviewExists = (reviews: SemanticReviewItem[]): boolean => reviews.some((item) => {
  if (item.status === 'pending') return true;
  return item.status === 'reviewed'
    && (!item.reviewedResult
      || item.reviewedResult.source !== 'human_review'
      || item.reviewedResult.reviewStatus !== 'approved');
});

const hasSemanticUnresolvedState = (record: AnalysisCaseRecord): boolean => (
  record.unresolvedReferences.length > 0
  || record.semanticResolutionStatus === 'pending'
  || record.semanticResolutionStatus === 'partially_resolved'
);

const hasReviewPendingState = (record: AnalysisCaseRecord): boolean => (
  record.semanticResolutionStatus === 'needs_review'
  || (record.humanReviewCandidates?.length ?? 0) > 0
);

const hasTechnicalFailureState = (record: AnalysisCaseRecord): boolean => (
  Boolean(record.semanticResolutionErrorCode)
  || record.semanticResolutionStatus === 'provider_unavailable'
);

const hasUnknownSemanticState = (record: AnalysisCaseRecord): boolean => {
  const status = record.semanticResolutionStatus as string | undefined;
  return Boolean(status && ![
    'not_needed', 'pending', 'partially_resolved', 'resolved', 'needs_review', 'provider_unavailable',
  ].includes(status));
};

/**
 * Evaluates whether one record may enter formal Analytics. A human-approved
 * semantic result is checked first and intentionally overrides failed LLM
 * audit/legacy parser state.
 */
export const evaluateAnalyticsAdmission = (
  input: AnalyticsAdmissionInput,
): AnalyticsAdmissionResult => {
  const reasons = new Set<AnalyticsAdmissionReasonCode>();
  const reviews = reviewCandidates(input);
  const reviewedItems = reviews.filter((item) => item.status === 'reviewed');
  const hasMalformedReviewedItem = reviewedItems.some((item) => !humanReviewResult(item));
  const reviewed = reviewedItems
    .map(humanReviewResult)
    .find((item): item is AcceptedSemanticResult => item !== undefined);

  // Human review is the highest-priority source. Do not fall through to an
  // older LLM or rule result when an approved review is malformed.
  if (reviewed || hasMalformedReviewedItem) {
    if (!reviewed) {
      addReason(reasons, 'technical_failure');
    } else if (reviewed.result.status === 'unresolved') {
      addReason(reasons, 'semantic_unresolved');
    } else if (semanticResultHasCriticalUnclear(reviewed.result)) {
      addReason(reasons, 'critical_outcome_unclear');
    }
    if (reviewed && 'resolverErrorCode' in reviewed.result && reviewed.result.resolverErrorCode) {
      addReason(reasons, 'technical_failure');
    }
    if (reasons.size === 0) {
      return {
        status: 'eligible',
        reasonCodes: [],
        source: 'human_review',
        acceptedSemanticResult: reviewed,
      };
    }
    return { status: 'blocked', reasonCodes: [...reasons] };
  }

  if (pendingReviewExists(reviews) || hasReviewPendingState(input.record)) {
    addReason(reasons, 'review_pending');
  }
  if (input.technicalErrorCode || hasTechnicalFailureState(input.record) || hasUnknownSemanticState(input.record)) {
    addReason(reasons, 'technical_failure');
  }

  if (input.semanticResult) {
    if (input.semanticResult.resolverErrorCode) addReason(reasons, 'technical_failure');
    if (input.semanticResult.status === 'unresolved') addReason(reasons, 'semantic_unresolved');
    if (!input.audit) addReason(reasons, 'missing_accepted_semantic_result');
    else if (!auditPassed(input.audit)) addReason(reasons, 'audit_failed');
    if (input.semanticResult.status === 'resolved'
      && (semanticResultHasCriticalUnclear(input.semanticResult)
      || recordHasCriticalUnclear(input.record))) {
      addReason(reasons, 'critical_outcome_unclear');
    }
    if (reasons.size === 0) {
      const accepted = resolveAcceptedSemanticResult(input);
      if (!accepted) addReason(reasons, 'missing_accepted_semantic_result');
      if (reasons.size > 0) return { status: 'blocked', reasonCodes: [...reasons] };
      return {
        status: 'eligible',
        reasonCodes: [],
        source: 'llm',
        acceptedSemanticResult: accepted,
      };
    }
    return { status: 'blocked', reasonCodes: [...reasons] };
  }

  if (hasSemanticUnresolvedState(input.record)) {
    addReason(reasons, 'semantic_unresolved');
  }
  if (input.record.semanticResolutionStatus === 'resolved') {
    addReason(reasons, 'missing_accepted_semantic_result');
  }
  if (recordHasCriticalUnclear(input.record)) {
    addReason(reasons, 'critical_outcome_unclear');
  }

  if (reasons.size === 0 && input.ruleResult?.status === 'resolved') {
    if (semanticResultHasCriticalUnclear(input.ruleResult)) {
      addReason(reasons, 'critical_outcome_unclear');
    } else if (input.record.isIncludedInAnalysisSet) {
      return {
        status: 'eligible',
        reasonCodes: [],
        source: 'rule',
        acceptedSemanticResult: resolveAcceptedSemanticResult(input),
      };
    }
  }

  if (reasons.size === 0 && !input.record.isIncludedInAnalysisSet) {
    addReason(reasons, 'not_in_analysis_set');
  }

  if (reasons.size === 0) {
    return {
      status: 'eligible',
      reasonCodes: [],
      source: 'rule',
    };
  }
  return { status: 'blocked', reasonCodes: [...reasons] };
};

/** Applies the same admission decision to every formal analytics input. */
export const filterAnalyticsEligibleRecords = (
  records: readonly AnalysisCaseRecord[],
  options: AnalyticsAdmissionFilterOptions = {},
): AnalyticsAdmissionFilterResult => {
  const reviewItems = options.reviewItems ?? readSemanticReviewItems();
  const admissions = new Map<string, AnalyticsAdmissionResult>();
  const eligibleRecords: AnalysisCaseRecord[] = [];
  const blockedRecords: AnalysisCaseRecord[] = [];

  records.forEach((record) => {
    const extra = options.getAdmissionInput?.(record) ?? {};
    const admission = evaluateAnalyticsAdmission({
      record,
      ...extra,
      reviewItems: extra.reviewItems !== undefined ? extra.reviewItems : reviewItems,
      semanticResult: extra.semanticResult !== undefined
        ? extra.semanticResult
        : options.semanticResults?.get(record.caseId),
      audit: extra.audit !== undefined ? extra.audit : options.audits?.get(record.caseId),
      ruleResult: extra.ruleResult !== undefined ? extra.ruleResult : options.ruleResults?.get(record.caseId),
      technicalErrorCode: extra.technicalErrorCode !== undefined
        ? extra.technicalErrorCode
        : options.technicalErrors?.get(record.caseId),
    });
    traceSemantic('analyticsAdmission', {
      caseId: record.caseId,
      status: admission.status,
      source: admission.source ?? null,
      reasonCodes: admission.reasonCodes,
    });
    admissions.set(record.caseId, admission);
    if (admission.status === 'eligible') eligibleRecords.push(record);
    else blockedRecords.push(record);
  });

  return { eligibleRecords, blockedRecords, admissions };
};
