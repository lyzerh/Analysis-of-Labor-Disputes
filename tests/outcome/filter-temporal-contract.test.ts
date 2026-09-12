import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LaborInfoAdapter } from '../../src/services/dataSource/LaborInfoAdapter';
import { LaborCaseDatasetBuilder } from '../../src/services/dataset/LaborCaseDatasetBuilder';
import { ParserEvaluator } from '../../src/services/parser/ParserEvaluator';
import type { RawDocument } from '../../src/types';
import { parsedResult } from './helpers/record-factories';

function mockSearch(): string[] {
  const requestedUrls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    requestedUrls.push(String(input));
    return {
      ok: true,
      json: async () => ({ data: [], meta: { total_count: 0 } }),
    } as Response;
  }));
  return requestedUrls;
}

function laborInfoDocument(overrides: Partial<RawDocument> = {}): RawDocument {
  return {
    id: 'temporal-contract',
    source: 'laborinfo',
    title: '日期权威来源测试',
    publishedAt: '2023-11-29',
    contentType: 'json',
    rawText: '劳动关系始于2016年9月2日。判决如下：驳回原告诉讼请求。',
    contentHash: 'test-hash',
    importedAt: '2026-09-10T00:00:00.000Z',
    ...overrides,
  };
}

describe('Stage 5 filter contract', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('serializes one case level as one repeated-key query value', async () => {
    const urls = mockSearch();
    await new LaborInfoAdapter('https://example.test').searchCases({ caseLevel: '一审' });
    expect(new URL(urls[0]).searchParams.getAll('caseLevel[]')).toEqual(['一审']);
  });

  it('serializes multiple case levels in stable input order', async () => {
    const urls = mockSearch();
    await new LaborInfoAdapter('https://example.test').searchCases({
      caseLevel: ['一审', '二审'],
    } as never);
    expect(new URL(urls[0]).searchParams.getAll('caseLevel[]')).toEqual(['一审', '二审']);
  });

  it('omits caseLevel[] when the selection is empty', async () => {
    const urls = mockSearch();
    await new LaborInfoAdapter('https://example.test').searchCases({ caseLevel: [] } as never);
    expect(new URL(urls[0]).searchParams.has('caseLevel[]')).toBe(false);
  });

  it('clamps per_page to the documented LaborInfo maximum of 50', async () => {
    const urls = mockSearch();
    const result = await new LaborInfoAdapter('https://example.test').searchCases({
      caseLevel: ['一审', '二审'],
      per_page: 100,
    });
    expect(new URL(urls[0]).searchParams.get('per_page')).toBe('50');
    expect(result.perPage).toBe(50);
  });

  it('does not truncate the crawler selection with caseLevel[0]', () => {
    const source = readFileSync(
      new URL('../../src/services/dataSource/LaborInfoCrawler.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/caseLevel\s*:\s*[^\n]*caseLevel\[0\]/);
  });

  it('does not truncate the crawler selection with province[0]', () => {
    const source = readFileSync(
      new URL('../../src/services/dataSource/LaborInfoCrawler.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/province\s*:\s*[^\n]*province\[0\]/);
  });
});

describe('Stage 5 authoritative judgment date contract', () => {
  afterEach(() => vi.restoreAllMocks());

  function build(raw: RawDocument, parsedDate: string) {
    vi.spyOn(ParserEvaluator, 'evaluate').mockReturnValue({
      completenessScore: 100,
    } as ReturnType<typeof ParserEvaluator.evaluate>);
    return LaborCaseDatasetBuilder.buildSingleRecord(
      raw,
      null,
      parsedResult({
        date: parsedDate,
        employeeOutcome: 'supported',
        employerOutcome: 'not_supported',
        applicantOutcome: 'not_supported',
        overallResult: 'not_supported',
      }),
    );
  }

  it('uses LaborInfo publishedAt ahead of a historical body date', () => {
    const record = build(laborInfoDocument(), '2016-09-02');
    expect(record.date).toBe('2023-11-29');
    expect(record.year).toBe(2023);
  });

  it('falls back to a valid parsed date when LaborInfo metadata is absent', () => {
    const record = build(laborInfoDocument({ publishedAt: undefined }), '2022年3月4日');
    expect(record.date).toBe('2022-03-04');
    expect(record.year).toBe(2022);
  });

  it('rejects invalid metadata dates and uses a valid parsed fallback', () => {
    const record = build(laborInfoDocument({ publishedAt: '2023-02-30' }), '2021-06-08');
    expect(record.date).toBe('2021-06-08');
    expect(record.year).toBe(2021);
  });

  it('keeps date unknown and does not infer year from the case number when both dates are invalid', () => {
    const record = build(laborInfoDocument({ publishedAt: 'not-a-date' }), '2024-13-40');
    expect(record.date).toBe('未载明日期');
    expect(record.year).toBeNull();
  });

  it('keeps the parsed date authoritative for non-LaborInfo documents', () => {
    const record = build(
      laborInfoDocument({ source: 'local-upload', publishedAt: '2023-11-29' }),
      '2020-05-06',
    );
    expect(record.date).toBe('2020-05-06');
    expect(record.year).toBe(2020);
  });

  it('does not change outcome fields while resolving the authoritative date', () => {
    const record = build(laborInfoDocument(), '2016-09-02');
    expect({
      applicantOutcome: record.applicantOutcome,
      employeeOutcome: record.employeeOutcome,
      employerOutcome: record.employerOutcome,
      overallResult: record.overallResult,
    }).toEqual({
      applicantOutcome: 'not_supported',
      employeeOutcome: 'supported',
      employerOutcome: 'not_supported',
      overallResult: 'not_supported',
    });
  });
});
