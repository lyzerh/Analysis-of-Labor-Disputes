import type {
  AnalysisCaseRecord,
  AnalysisRun,
  CandidatePoolSnapshotHeader,
  LegalOutcomeType,
  SamplingRun,
} from '../../types';
import {
  filterAnalyticsEligibleRecords,
  type AnalyticsAdmissionFilterOptions,
} from './AnalyticsAdmission';

export const ANALYTICS_QUALITY_GUARDRAIL_VERSION = 'analytics-quality-v1' as const;

export const ANALYTICS_QUALITY_THRESHOLDS = {
  smallSample: 30,
  unknownOutcomeWarningRate: 0.1,
  thresholdKind: 'operational',
} as const;

export type AnalysisQualityStatus = 'pass' | 'warning' | 'blocked';
export type AnalysisQualitySeverity = 'info' | 'warning' | 'error';

export interface AnalysisQualityIssue {
  code: string;
  severity: AnalysisQualitySeverity;
  message: string;
  affectedCount?: number;
}

export interface AnalysisStratumCoverage {
  key: string;
  expectedCount: number;
  availableCount: number;
  coverageRate: number;
}

export interface AnalysisQualityMetrics {
  expectedInputCount: number;
  availableRecordCount: number;
  missingRecordCount: number;
  includedCaseCount: number;
  excludedCaseCount: number;
  unknownOutcomeCount: number;
  knownOutcomeCount: number;
  unknownOutcomeRate: number;
  inputCoverageRate: number;
  outcomeCounts: Record<LegalOutcomeType, number>;
  composition: {
    byCity: Record<string, number>;
    byYear: Record<string, number>;
    byCaseLevel: Record<string, number>;
  };
  strata?: AnalysisStratumCoverage[];
}

export interface AnalysisQualityAssessment {
  status: AnalysisQualityStatus;
  issues: AnalysisQualityIssue[];
  metrics: AnalysisQualityMetrics;
  guardrailVersion: typeof ANALYTICS_QUALITY_GUARDRAIL_VERSION;
  thresholds: typeof ANALYTICS_QUALITY_THRESHOLDS;
}

export interface EvaluateAnalysisQualityInput {
  analysisRun: AnalysisRun;
  snapshot: CandidatePoolSnapshotHeader;
  samplingRun?: SamplingRun;
  records: AnalysisCaseRecord[];
  availableInputIds: Set<string>;
  missingCaseIds: string[];
  integrityIssues?: AnalysisQualityIssue[];
  analyticsAdmission?: AnalyticsAdmissionFilterOptions;
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function increment(target: Record<string, number>, value: string | number | null | undefined): void {
  const key = value === undefined || value === null || value === '' ? 'unknown' : String(value);
  target[key] = (target[key] ?? 0) + 1;
}

function qualityStatus(issues: AnalysisQualityIssue[]): AnalysisQualityStatus {
  if (issues.some((issue) => issue.severity === 'error')) return 'blocked';
  if (issues.some((issue) => issue.severity === 'warning')) return 'warning';
  return 'pass';
}

export function evaluateAnalysisQuality(input: EvaluateAnalysisQualityInput): AnalysisQualityAssessment {
  const issues = [...(input.integrityIssues ?? [])];
  const includedRecords = filterAnalyticsEligibleRecords(
    input.records,
    input.analyticsAdmission,
  ).eligibleRecords;
  const excludedCaseCount = input.records.length - includedRecords.length;
  const outcomeCounts: Record<LegalOutcomeType, number> = {
    supported: 0,
    partially_supported: 0,
    not_supported: 0,
    unclear: 0,
  };
  const composition = {
    byCity: {} as Record<string, number>,
    byYear: {} as Record<string, number>,
    byCaseLevel: {} as Record<string, number>,
  };

  for (const record of includedRecords) {
    outcomeCounts[record.applicantOutcome] += 1;
    increment(composition.byCity, record.city);
    increment(composition.byYear, record.year);
    increment(composition.byCaseLevel, record.caseLevel);
  }

  const unknownOutcomeCount = outcomeCounts.unclear;
  const knownOutcomeCount = includedRecords.length - unknownOutcomeCount;
  const unknownOutcomeRate = ratio(unknownOutcomeCount, includedRecords.length);

  if (input.missingCaseIds.length > 0) {
    issues.push({
      code: 'MISSING_ANALYSIS_RECORDS',
      severity: 'warning',
      message: `${input.missingCaseIds.length} 个冻结输入缺少可用 AnalysisCaseRecord；未补抽、未替换。`,
      affectedCount: input.missingCaseIds.length,
    });
  }
  if (input.records.length === 0) {
    issues.push({
      code: 'EMPTY_ANALYSIS_INPUT',
      severity: 'error',
      message: '冻结输入中没有任何可用 AnalysisCaseRecord，正式分析已阻止。',
      affectedCount: input.analysisRun.inputCaseCount,
    });
  } else if (includedRecords.length === 0) {
    issues.push({
      code: 'NO_ANALYTICS_ELIGIBLE_RECORDS',
      severity: 'warning',
      message: '当前可用记录全部未通过 Analytics Gate；正式分析将由准入门禁阻止。',
      affectedCount: input.records.length,
    });
  }
  if (includedRecords.length > 0 && includedRecords.length < ANALYTICS_QUALITY_THRESHOLDS.smallSample) {
    issues.push({
      code: 'SMALL_SAMPLE',
      severity: 'warning',
      message: `可用分析 N=${includedRecords.length} 小于 operational warning threshold ${ANALYTICS_QUALITY_THRESHOLDS.smallSample}；这不是统计有效性判定。`,
      affectedCount: includedRecords.length,
    });
  }
  if (unknownOutcomeRate > ANALYTICS_QUALITY_THRESHOLDS.unknownOutcomeWarningRate) {
    issues.push({
      code: 'HIGH_UNKNOWN_OUTCOME_RATE',
      severity: 'warning',
      message: `unclear 占准入记录 ${(unknownOutcomeRate * 100).toFixed(1)}%，超过 operational warning threshold 10%。`,
      affectedCount: unknownOutcomeCount,
    });
  }
  if (input.samplingRun?.method === 'stratified_seeded_random'
    && input.samplingRun.stratification.allocationStrategy === 'balanced') {
    issues.push({
      code: 'BALANCED_SAMPLE_NOT_POPULATION_REPRESENTATIVE',
      severity: 'warning',
      message: '本次 balanced 分层样本为有意非比例配置，适合组间比较，不能直接代表 Snapshot 语料总体构成。',
    });
  }

  let strata: AnalysisStratumCoverage[] | undefined;
  if (input.samplingRun?.method === 'stratified_seeded_random') {
    strata = input.samplingRun.stratification.strata.map((stratum) => {
      const expectedCount = stratum.sampledCaseIds.length;
      const availableCount = stratum.sampledCaseIds.filter((id) => input.availableInputIds.has(id)).length;
      const coverageRate = ratio(availableCount, expectedCount);
      if (expectedCount > 0 && availableCount === 0) {
        issues.push({
          code: 'STRATUM_MISSING_AFTER_PROCESSING',
          severity: 'warning',
          message: `分层 ${stratum.key} 分配 ${expectedCount} 条，但当前无可用记录。`,
          affectedCount: expectedCount,
        });
      } else if (availableCount < expectedCount) {
        issues.push({
          code: 'STRATUM_ATTRITION',
          severity: 'warning',
          message: `分层 ${stratum.key} 覆盖 ${availableCount}/${expectedCount}，存在处理后流失。`,
          affectedCount: expectedCount - availableCount,
        });
      }
      return { key: stratum.key, expectedCount, availableCount, coverageRate };
    });
  }

  return {
    status: qualityStatus(issues),
    issues,
    metrics: {
      expectedInputCount: input.analysisRun.inputCaseCount,
      availableRecordCount: input.records.length,
      missingRecordCount: input.missingCaseIds.length,
      includedCaseCount: includedRecords.length,
      excludedCaseCount,
      unknownOutcomeCount,
      knownOutcomeCount,
      unknownOutcomeRate,
      inputCoverageRate: ratio(input.records.length, input.analysisRun.inputCaseCount),
      outcomeCounts,
      composition,
      ...(strata ? { strata } : {}),
    },
    guardrailVersion: ANALYTICS_QUALITY_GUARDRAIL_VERSION,
    thresholds: ANALYTICS_QUALITY_THRESHOLDS,
  };
}
