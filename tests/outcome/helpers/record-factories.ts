import type {
  AnalysisCaseRecord,
  LaborInfoParsedResult,
  LegalOutcomeType,
} from '../../../src/types';

export function parsedResult(overrides: Partial<LaborInfoParsedResult> = {}): LaborInfoParsedResult {
  return {
    caseTitle: 'Outcome Builder 测试',
    court: '深圳市某人民法院',
    date: '2024-01-01',
    caseLevel: '一审',
    province: '广东',
    city: '深圳',
    caseNumber: '(2024)粤0301民初1号',
    employeeParty: '张某',
    employerParty: '甲有限公司',
    applicantRole: 'employer',
    parties: [],
    partyConfidence: 1,
    disputeType: ['加班工资'],
    claims: [{ claimName: '加班工资', claimant: 'employer', supportStatus: 'not_supported' }],
    unresolvedReferences: [],
    employerDefenses: [],
    evidence: [],
    courtReasoning: '',
    keyLegalPoints: [],
    applicantOutcome: overrides.overallResult ?? 'not_supported',
    employeeOutcome: 'supported',
    employerOutcome: 'not_supported',
    overallResult: 'not_supported',
    arbitrationCase: {
      id: 'parsed-case',
      rawDocumentId: 'builder-raw',
    } as LaborInfoParsedResult['arbitrationCase'],
    rawTextLength: 100,
    parseDurationMs: 1,
    fieldCompleteness: { score: 100, filledFields: 1, totalFields: 1, details: {} },
    ...overrides,
  };
}

export function analysisRecord(
  id: string,
  employerOutcome: LegalOutcomeType,
  overrides: Partial<AnalysisCaseRecord> = {},
): AnalysisCaseRecord {
  const employeeOutcome: LegalOutcomeType = employerOutcome === 'supported'
    ? 'not_supported'
    : employerOutcome === 'not_supported'
      ? 'supported'
      : employerOutcome;

  return {
    caseId: id,
    rawDocumentId: `raw-${id}`,
    title: `${id}（测试）`,
    source: 'test',
    city: '深圳',
    isPRD: true,
    court: '深圳市某人民法院',
    date: '2024-01-01',
    year: 2024,
    caseLevel: '一审',
    disputeType: ['加班工资'],
    employeeParty: '张某',
    employerParty: '甲有限公司',
    applicantRole: 'employee',
    parties: [],
    courtReasoning: '',
    keyLegalPoints: [],
    employerDefenses: [],
    evidence: [],
    claims: [],
    unresolvedReferences: [],
    applicantOutcome: employeeOutcome,
    employeeOutcome,
    employerOutcome,
    overallResult: employeeOutcome,
    parserScore: 100,
    reviewStatus: 'approved',
    confidence: 1,
    isIncludedInAnalysisSet: true,
    filterReason: 'test fixture',
    hasReviewerChanges: false,
    ...overrides,
  };
}
