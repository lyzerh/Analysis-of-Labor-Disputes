import { afterEach, describe, expect, it, vi } from 'vitest';
import { LaborCaseDatasetBuilder } from '../../src/services/dataset/LaborCaseDatasetBuilder';
import { LaborInfoParserAdapter } from '../../src/services/parser/LaborInfoParserAdapter';
import { ParserEvaluator } from '../../src/services/parser/ParserEvaluator';
import type { ParserReviewRecord } from '../../src/types';
import { rawDocument } from './fixtures/outcome-fixtures';
import { parsedResult } from './helpers/record-factories';

function arrangeParser(result: ReturnType<typeof parsedResult>): void {
  vi.spyOn(LaborInfoParserAdapter, 'parseDetailed').mockReturnValue(result);
  vi.spyOn(ParserEvaluator, 'evaluate').mockReturnValue({
    completenessScore: 100,
  } as ReturnType<typeof ParserEvaluator.evaluate>);
}

describe('Layer 3: Parser -> Builder outcome contract', () => {
  afterEach(() => vi.restoreAllMocks());

  it('preserves a correct employer-plaintiff-loss result from Parser (P0)', () => {
    arrangeParser(parsedResult({
      overallResult: 'not_supported',
      employeeOutcome: 'supported',
      employerOutcome: 'not_supported',
    }));

    const record = LaborCaseDatasetBuilder.buildSingleRecord(
      rawDocument('builder-employer-loss', '测试文本'),
      null,
    );

    expect(record.employeeOutcome).toBe('supported');
    expect(record.employerOutcome).toBe('not_supported');
  });

  it('preserves a correct employer-plaintiff-win result from Parser', () => {
    arrangeParser(parsedResult({
      overallResult: 'supported',
      employeeOutcome: 'not_supported',
      employerOutcome: 'supported',
    }));

    const record = LaborCaseDatasetBuilder.buildSingleRecord(
      rawDocument('builder-employer-win', '测试文本'),
      null,
    );

    expect(record.employeeOutcome).toBe('not_supported');
    expect(record.employerOutcome).toBe('supported');
  });

  it('does not reinterpret an already-determined employer-plaintiff result from legacy overallResult (P0)', () => {
    arrangeParser(parsedResult({
      overallResult: 'not_supported',
      employeeOutcome: 'supported',
      employerOutcome: 'not_supported',
    }));
    const review: ParserReviewRecord = {
      id: 'review-employer-loss',
      rawDocumentId: 'builder-review-employer-loss',
      caseTitle: '企业原告败诉审核',
      reviewStatus: 'modified',
      reviewerChanges: { overallResult: 'not_supported' },
      reviewTime: '2024-01-01T00:00:00.000Z',
    };

    const record = LaborCaseDatasetBuilder.buildSingleRecord(
      rawDocument('builder-review-employer-loss', '测试文本'),
      review,
    );

    expect(record.employeeOutcome).toBe('supported');
    expect(record.employerOutcome).toBe('not_supported');
  });

  it('does not overwrite determined party outcomes when applicantOutcome review conflicts', () => {
    arrangeParser(parsedResult({
      applicantRole: 'employer',
      applicantOutcome: 'not_supported',
      overallResult: 'not_supported',
      employeeOutcome: 'supported',
      employerOutcome: 'not_supported',
    }));
    const review: ParserReviewRecord = {
      id: 'review-conflicting-applicant-outcome',
      rawDocumentId: 'builder-review-conflicting-applicant-outcome',
      caseTitle: '申请人视角冲突审核',
      reviewStatus: 'modified',
      reviewerChanges: {
        applicantRole: 'employer',
        applicantOutcome: 'supported',
        overallResult: 'supported',
      },
      reviewTime: '2024-01-01T00:00:00.000Z',
    };

    const record = LaborCaseDatasetBuilder.buildSingleRecord(
      rawDocument('builder-review-conflicting-applicant-outcome', '测试文本'),
      review,
    );

    expect(record.applicantOutcome).toBe('supported');
    expect(record.employeeOutcome).toBe('supported');
    expect(record.employerOutcome).toBe('not_supported');
  });

  it('leaves unresolved sides unclear when applicant review conflicts with a determined party outcome', () => {
    arrangeParser(parsedResult({
      applicantRole: 'employer',
      applicantOutcome: 'supported',
      overallResult: 'supported',
      employeeOutcome: 'unclear',
      employerOutcome: 'supported',
    }));
    const review: ParserReviewRecord = {
      id: 'review-partial-conflict',
      rawDocumentId: 'builder-review-partial-conflict',
      caseTitle: '部分结果冲突审核',
      reviewStatus: 'modified',
      reviewerChanges: { applicantRole: 'employer', applicantOutcome: 'not_supported' },
      reviewTime: '2024-01-01T00:00:00.000Z',
    };

    const record = LaborCaseDatasetBuilder.buildSingleRecord(
      rawDocument('builder-review-partial-conflict', '测试文本'),
      review,
    );

    expect(record.employeeOutcome).toBe('unclear');
    expect(record.employerOutcome).toBe('supported');
  });

  it('keeps unknown party outcomes unclear when review lacks explicit party results', () => {
    arrangeParser(parsedResult({
      applicantRole: 'unknown',
      applicantOutcome: 'unclear',
      overallResult: 'unclear',
      employeeOutcome: 'unclear',
      employerOutcome: 'unclear',
    }));
    const review: ParserReviewRecord = {
      id: 'review-unknown-role',
      rawDocumentId: 'builder-review-unknown-role',
      caseTitle: '未知身份审核',
      reviewStatus: 'modified',
      reviewerChanges: { overallResult: 'supported' },
      reviewTime: '2024-01-01T00:00:00.000Z',
    };

    const record = LaborCaseDatasetBuilder.buildSingleRecord(
      rawDocument('builder-unknown-role', '测试文本'),
      review,
    );

    expect(record.employeeOutcome).toBe('unclear');
    expect(record.employerOutcome).toBe('unclear');
  });

  it('applies an explicit pair of human-reviewed party outcomes without deriving from overallResult', () => {
    arrangeParser(parsedResult({
      applicantRole: 'employer',
      applicantOutcome: 'supported',
      overallResult: 'supported',
      employeeOutcome: 'not_supported',
      employerOutcome: 'supported',
    }));
    const review: ParserReviewRecord = {
      id: 'review-explicit-party-outcomes',
      rawDocumentId: 'builder-explicit-party-outcomes',
      caseTitle: '双方结果审核',
      reviewStatus: 'modified',
      reviewerChanges: {
        employeeOutcome: 'supported',
        employerOutcome: 'not_supported',
        overallResult: 'supported',
      },
      reviewTime: '2024-01-01T00:00:00.000Z',
    };

    const record = LaborCaseDatasetBuilder.buildSingleRecord(
      rawDocument('builder-explicit-party-outcomes', '测试文本'),
      review,
    );

    expect(record.employeeOutcome).toBe('supported');
    expect(record.employerOutcome).toBe('not_supported');
  });

  it('reproduces the real employer-plaintiff-loss Parser -> Builder inversion (P0)', () => {
    const document = rawDocument(
      'pipeline-employer-loss',
      '原告：甲有限公司。被告：张某。原告请求确认无需支付违法解除劳动合同赔偿金。判决如下：驳回原告全部诉讼请求。',
    );
    const parsed = LaborInfoParserAdapter.parseDetailed(document);
    expect(parsed.employeeOutcome).toBe('supported');
    expect(parsed.employerOutcome).toBe('not_supported');
    expect(parsed.overallResult).toBe('not_supported');

    const record = LaborCaseDatasetBuilder.buildSingleRecord(document, null);
    expect(record.employeeOutcome).toBe('supported');
    expect(record.employerOutcome).toBe('not_supported');
  });

  it('repairs a reliable supported lower-award amount pair while preserving source data', () => {
    const parsed = parsedResult({
      employeeParty: '成柏昱',
      employerParty: '上海景和国际展览有限公司',
      applicantRole: 'employee',
      parties: [
        { id: 'employee-party', name: '成柏昱', laborRole: 'employee', proceduralRoles: ['plaintiff'] },
        { id: 'employer-party', name: '上海景和国际展览有限公司', laborRole: 'employer', proceduralRoles: ['defendant'] },
      ],
      claims: [{
        id: 'cheng-overtime',
        claimName: '加班工资',
        claimType: 'overtime_pay',
        claimant: 'employee',
        claimantRole: 'employee',
        claimantPartyId: 'employee-party',
        supportStatus: 'supported',
        requestedAmount: 3494.10,
        awardedAmount: 1341.38,
        sourceText: '原告请求被告支付加班工资3494.10元',
        judgmentItems: [{
          action: 'pay',
          targetPartyRole: 'plaintiff',
          targetClaimType: 'overtime_pay',
          awardedAmount: 1341.38,
          sourceText: '被告向原告支付加班工资1341.38元',
        }],
      }],
      applicantOutcome: 'supported',
      employeeOutcome: 'supported',
      employerOutcome: 'not_supported',
      overallResult: 'supported',
    });
    const before = JSON.stringify(parsed);
    arrangeParser(parsed);

    const record = LaborCaseDatasetBuilder.buildSingleRecord(rawDocument('builder-amount-repair', '测试文本'), null);

    expect(record.claims[0]).toMatchObject({ supportStatus: 'partially_supported', requestedAmount: 3494.10, awardedAmount: 1341.38 });
    expect(record.employeeOutcome).toBe('partially_supported');
    expect(record.applicantOutcome).toBe('partially_supported');
    expect(record.outcomeDiagnostics || []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ claimId: 'cheng-overtime', reasonCode: 'amount_conflict' }),
    ]));
    expect(JSON.stringify(parsed)).toBe(before);
  });
});
