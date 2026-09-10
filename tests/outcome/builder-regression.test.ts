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

  it('does not reinterpret an employer-plaintiff-loss review as an employee loss (P0)', () => {
    arrangeParser(parsedResult({
      overallResult: 'supported',
      employeeOutcome: 'not_supported',
      employerOutcome: 'supported',
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
});
