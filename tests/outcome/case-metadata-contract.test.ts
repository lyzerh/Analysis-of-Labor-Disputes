import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LaborCaseDatasetBuilder } from '../../src/services/dataset/LaborCaseDatasetBuilder';
import {
  formatCaseDate,
  formatCaseLevel,
  formatCaseNumber,
  formatPartyName,
} from '../../src/services/presentation/CaseMetadataPresentation';
import { ParserEvaluator } from '../../src/services/parser/ParserEvaluator';
import { LaborInfoParserAdapter } from '../../src/services/parser/LaborInfoParserAdapter';
import type { RawDocument } from '../../src/types';
import { parsedResult } from './helpers/record-factories';

const raw: RawDocument = {
  id: 'metadata-contract',
  source: 'laborinfo',
  title: '元数据契约测试',
  publishedAt: '2023-11-29',
  contentType: 'json',
  rawText: '判决如下：驳回原告诉讼请求。',
  contentHash: 'metadata-contract',
  importedAt: '2026-09-15T00:00:00.000Z',
};

describe('analysis metadata preservation contract', () => {
  afterEach(() => vi.restoreAllMocks());

  function build(caseNumber: string) {
    vi.spyOn(ParserEvaluator, 'evaluate').mockReturnValue({ completenessScore: 100 } as ReturnType<typeof ParserEvaluator.evaluate>);
    return LaborCaseDatasetBuilder.buildSingleRecord(raw, null, parsedResult({
      caseNumber,
      date: '2016-09-02',
    }));
  }

  it('preserves the parsed case number and the authoritative full date while retaining year for filters', () => {
    const record = build('(2023)粤01民终27032号');
    expect(record.caseNumber).toBe('(2023)粤01民终27032号');
    expect(record.date).toBe('2023-11-29');
    expect(record.year).toBe(2023);
  });

  it('normalizes a missing parser case number to null instead of inventing one', () => {
    expect(build('未载明案号').caseNumber).toBeNull();
    expect(build('').caseNumber).toBeNull();
  });

  it('reads the canonical LaborInfo detail API case number from sourceMetadata.no', () => {
    const parsed = LaborInfoParserAdapter.parseDetailed({
      ...raw,
      sourceMetadata: {
        no: '（2023）粤01民终27032号',
        pbDt: '2023-11-29',
        caseLevel: '二审',
      },
    });
    expect(parsed.caseNumber).toBe('（2023）粤01民终27032号');
  });
});

describe('shared case metadata presentation contract', () => {
  it('formats case number, full date and missing values consistently', () => {
    expect(formatCaseNumber('(2023)粤01民终27032号')).toBe('(2023)粤01民终27032号');
    expect(formatCaseNumber(null)).toBe('未识别');
    expect(formatCaseNumber('未载明案号')).toBe('未识别');
    expect(formatCaseDate('2023-11-29')).toBe('2023-11-29');
    expect(formatCaseDate('2023-02-30')).toBe('未识别');
    expect(formatCaseDate('未载明日期')).toBe('未识别');
  });

  it.each([
    ['二审', '二审'],
    ['second', '二审'],
    ['first', '一审/初裁'],
    ['retrial', '再审'],
    ['unknown', '未识别'],
  ])('formats case level %s as %s', (value, expected) => {
    expect(formatCaseLevel(value)).toBe(expected);
  });

  it('does not present known semantic fragments as party names', () => {
    expect(formatPartyName(null)).toBe('未识别');
    expect(formatPartyName('为其成员')).toBe('未识别');
    expect(formatPartyName('廖某')).toBe('廖某');
  });

  it('keeps the formal UIs on the shared metadata formatter and canonical date field', () => {
    for (const component of ['LaborAnalysisCaseLibrary.tsx', 'CaseAnalysisView.tsx']) {
      const source = readFileSync(new URL(`../../src/components/${component}`, import.meta.url), 'utf8');
      expect(source).toContain('formatCaseNumber');
      expect(source).toContain('formatCaseDate');
      expect(source).toContain('formatCaseLevel');
      expect(source).toContain('formatPartyName');
      expect(source).not.toContain('decisionDate');
    }
  });
});
