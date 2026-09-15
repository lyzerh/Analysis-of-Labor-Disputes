import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  filterAnalysisCaseRecords,
  normalizeCaseLevel,
  normalizeYearFilter,
} from '../../src/services/case/CaseLibraryFilter';
import { createPipelineHealthPresentation } from '../../src/services/data/PipelineHealthPresentation';
import type { DataPipelineHealthStats } from '../../src/services/data/LaborAnalysisPipeline';
import { analysisRecord } from './helpers/record-factories';

const records = [
  analysisRecord('gz-2023-first', 'supported', { city: '广州', year: 2023, caseLevel: '一审' }),
  analysisRecord('gz-2023-second', 'supported', { city: '广州', year: 2023, caseLevel: '二审' }),
  analysisRecord('sz-2022-retrial', 'supported', { city: '深圳', year: 2022, caseLevel: '再审' }),
  analysisRecord('gz-null-unknown', 'supported', { city: '广州', year: null, caseLevel: 'unknown' }),
];

describe('Case Library filter contract', () => {
  it('normalizes selector year strings to the numeric domain type', () => {
    expect(normalizeYearFilter('2023')).toBe(2023);
    expect(normalizeYearFilter('all')).toBeNull();
    expect(normalizeYearFilter('invalid')).toBeNull();
  });

  it('matches numeric record years and rejects other or null years', () => {
    expect(filterAnalysisCaseRecords(records, { year: '2023' }).map((record) => record.caseId))
      .toEqual(['gz-2023-first', 'gz-2023-second']);
  });

  it('does not filter when all years is selected', () => {
    expect(filterAnalysisCaseRecords(records, { year: 'all' })).toHaveLength(4);
  });

  it.each([
    ['一审', 'first'],
    ['劳动仲裁/一审', 'first'],
    ['first', 'first'],
    ['二审', 'second'],
    ['second', 'second'],
    ['再审', 'retrial'],
    ['retrial', 'retrial'],
    ['unknown', 'unknown'],
  ] as const)('normalizes stored case level %s to %s', (stored, expected) => {
    expect(normalizeCaseLevel(stored)).toBe(expected);
  });

  it.each([
    ['first', ['gz-2023-first']],
    ['second', ['gz-2023-second']],
    ['retrial', ['sz-2022-retrial']],
  ] as const)('matches canonical selector %s against stored values', (caseLevel, expected) => {
    expect(filterAnalysisCaseRecords(records, { caseLevel }).map((record) => record.caseId)).toEqual(expected);
  });

  it('does not make unknown records match a known level', () => {
    expect(filterAnalysisCaseRecords(records, { caseLevel: 'first' }).map((record) => record.caseId))
      .not.toContain('gz-null-unknown');
  });

  it('supports city + year, year + level, and city + year + level combinations', () => {
    expect(filterAnalysisCaseRecords(records, { city: '广州', year: '2023' })).toHaveLength(2);
    expect(filterAnalysisCaseRecords(records, { year: '2023', caseLevel: 'second' }).map((record) => record.caseId))
      .toEqual(['gz-2023-second']);
    expect(filterAnalysisCaseRecords(records, { city: '广州', year: '2023', caseLevel: 'first' }).map((record) => record.caseId))
      .toEqual(['gz-2023-first']);
  });
});

function health(overrides: Partial<DataPipelineHealthStats>): DataPipelineHealthStats {
  return {
    apiFoundTotal: 0,
    rawDocumentsSaved: 0,
    parsedSuccessCount: 0,
    evaluatorQualifiedCount: 0,
    analysisAvailableCount: 0,
    pendingReviewCount: 0,
    failedCount: 0,
    layers: [],
    ...overrides,
  };
}

describe('Data Management health presentation contract', () => {
  it('maps current pipeline fields to the four top cards', () => {
    expect(createPipelineHealthPresentation(health({
      rawDocumentsSaved: 4,
      parsedSuccessCount: 4,
      analysisAvailableCount: 4,
      pendingReviewCount: 0,
    }))).toMatchObject({
      rawCount: 4,
      parsedCount: 4,
      availableCount: 4,
      pendingCount: 0,
      rawCompletenessRate: 100,
      parseSuccessRate: 100,
      analysisAvailabilityRate: 100,
    });
  });

  it('calculates partial pipeline rates from the correct denominators', () => {
    expect(createPipelineHealthPresentation(health({
      rawDocumentsSaved: 10,
      parsedSuccessCount: 8,
      analysisAvailableCount: 6,
      pendingReviewCount: 2,
    }))).toMatchObject({
      rawCount: 10,
      parsedCount: 8,
      availableCount: 6,
      pendingCount: 2,
      rawCompletenessRate: 100,
      parseSuccessRate: 80,
      analysisAvailabilityRate: 75,
    });
  });
});

describe('Case detail frontend contract', () => {
  const librarySource = readFileSync(new URL('../../src/components/LaborAnalysisCaseLibrary.tsx', import.meta.url), 'utf8');
  const modalSource = readFileSync(new URL('../../src/components/CaseDetailModal.tsx', import.meta.url), 'utf8');

  it('removes Raw Judgment Viewer entry points while retaining structured analysis', () => {
    expect(librarySource).toMatch(/结构化分析结果/);
    expect(modalSource).toMatch(/结构化法务要素/);
    expect(librarySource).not.toMatch(/原始裁判文书|无法加载原始文书或原文本为空|detailTab/);
    expect(modalSource).not.toMatch(/tab-btn-raw|原始文书全文|btn-copy-raw-text|未找到对应的原始文书对象/);
  });

  it('keeps RawDocument persistence and parser input intact', () => {
    const dataSource = readFileSync(new URL('../../src/services/data/dataService.ts', import.meta.url), 'utf8');
    const pipelineSource = readFileSync(new URL('../../src/services/data/LaborAnalysisPipeline.ts', import.meta.url), 'utf8');
    expect(dataSource).toMatch(/db\.rawDocuments\.put/);
    expect(pipelineSource).toMatch(/rawDoc\.rawText/);
  });
});
