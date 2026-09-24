import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('existing RawDocument reparse routing', () => {
  const readBatchSource = () => {
    const source = readFileSync(new URL('../../src/services/data/dataService.ts', import.meta.url), 'utf8');
    const start = source.indexOf('public static async reparseAllCases');
    const end = source.indexOf('public static exportToCsv', start);
    return source.slice(start, end);
  };

  it('routes LaborInfo documents through the current LaborInfo parser', () => {
    const source = readFileSync(new URL('../../src/services/data/dataService.ts', import.meta.url), 'utf8');
    expect(source).toContain("import { LaborInfoParserAdapter } from '../parser/LaborInfoParserAdapter';");
    expect(source).toMatch(/rawDoc\.source === 'laborinfo'\s*\n\s*\? LaborInfoParserAdapter\.parse\(rawDoc\)/);
    expect(source).toContain('const parsedCase = await this.parseStoredDocument(rawDoc);');
    expect(source).toContain('const parsedCase = await this.parseStoredDocument(doc);');
  });

  it('returns per-case progress and failure details without touching raw documents', () => {
    const batchSource = readBatchSource();
    expect(batchSource).toContain('db.rawDocuments.toArray()');
    expect(batchSource).toContain('onProgress?.(index + 1, allRaw.length, doc.id)');
    expect(batchSource).toContain('failures.push');
    expect(batchSource).toContain('succeeded');
    expect(batchSource).toContain('failed: failures.length');
    expect(batchSource).toContain('db.arbitrationCases.put(parsedCase)');
    expect(batchSource).not.toContain('db.rawDocuments.put');
    expect(batchSource).not.toContain('db.rawDocuments.delete');
  });

  it('keeps local reparse isolated from remote fetching and frozen analysis runs', () => {
    const batchSource = readBatchSource();
    expect(batchSource).not.toContain('fetch(');
    expect(batchSource).not.toContain('analysisRuns');
    expect(batchSource).not.toContain('semanticResolver');
  });

  it('exposes one confirmed local reparse entry with offline confirmation and progress copy', () => {
    const reviewSource = readFileSync(new URL('../../src/components/LaborInfoReview.tsx', import.meta.url), 'utf8');
    const managementSource = readFileSync(new URL('../../src/components/DataManagement.tsx', import.meta.url), 'utf8');
    expect(managementSource).toContain("activeTab === 'quality' && <LaborInfoReview onDataChanged={onDataChanged} />");
    expect(reviewSource).toContain('重新解析本地案例');
    expect(reviewSource).toContain('不会重新下载原始文书');
    expect(reviewSource).toContain('不会发起网络请求');
    expect(reviewSource).toContain('正在重新解析');
    expect(reviewSource).toContain('重新解析完成：成功');
    expect(reviewSource).toContain('开始重新解析');
    expect(reviewSource).toContain('已有人工复核记录和冻结 AnalysisRun 不会被改写');
  });
});
