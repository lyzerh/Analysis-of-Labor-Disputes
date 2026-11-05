import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ParserUtils } from '../../src/services/parser/ParserUtils';

const records = new Map<string, any>();
const calls: string[] = [];
vi.mock('../../src/db', () => ({
  db: { documentTranslations: {
    get: async (id: string) => records.get(id),
    put: async (record: any) => { records.set(record.id, structuredClone(record)); },
    where: () => ({ equals: (id: string) => ({ toArray: async () => [...records.values()].filter((record) => record.rawDocumentId === id) }) }),
  } },
}));
vi.mock('../../src/services/semantic/LlmRuntimeSettings', () => ({
  readLlmRuntimeSettings: () => ({ enabled: true, apiKey: 'secret-test-key' }),
}));

import { exactRawTextHash, JudgmentTranslationService, splitJudgmentText, TRANSLATION_SINGLE_REQUEST_CHAR_LIMIT } from '../../src/services/translation/JudgmentTranslationService';
import { JUDGMENT_TRANSLATION_SYSTEM_PROMPT } from '../../src/services/translation/JudgmentTranslationPrompt';
import { browserXaiTranslationClient, TranslationRequestError } from '../../src/services/translation/BrowserXaiTranslationClient';
import { resources } from '../../src/i18n/locales';

const makeService = (failAt = -1) => new JudgmentTranslationService({
  translate: async (text) => {
    const index = calls.push(text) - 1;
    if (index === failAt) throw new Error('secret-test-key must not persist');
    return `[${index}] ${text}`;
  },
});

describe('optional judgment translation, isolated from case facts', () => {
  beforeEach(() => { records.clear(); calls.length = 0; });
  afterEach(() => vi.restoreAllMocks());

  it('hashes exact text, including whitespace, unlike the parser content hash', async () => {
    expect(await exactRawTextHash('甲\n乙')).not.toBe(await exactRawTextHash('甲 乙'));
    expect(await exactRawTextHash('甲 乙')).not.toBe(await exactRawTextHash('甲  乙'));
    expect(await exactRawTextHash('甲 乙')).not.toBe(await exactRawTextHash('甲 丙'));
    expect(await ParserUtils.calculateContentHash('甲\n乙')).toBe(await ParserUtils.calculateContentHash('甲 乙'));
  });

  it('uses one request for short text and reuses a completed cache without invoking again', async () => {
    const service = makeService();
    const first = await service.translate('raw-1', '请求支付工资。');
    const second = await service.translate('raw-1', '请求支付工资。');
    expect(first.status).toBe('completed');
    expect(second).toEqual(first);
    expect(calls).toEqual(['请求支付工资。']);
    expect(JSON.stringify([...records.values()])).not.toContain('secret-test-key');
    expect(first.provider).toBe('xai');
    expect(first.promptVersion).toBe('judgment-translation-v1');
  });

  it('invalidates for exact whitespace changes and does not serve stale text', async () => {
    const service = makeService();
    await service.translate('raw-1', '甲\n乙');
    expect(await service.getValidTranslation('raw-1', '甲 乙')).toBeNull();
    expect(await service.hasStaleTranslation('raw-1', '甲 乙')).toBe(true);
    await service.translate('raw-1', '甲 乙');
    expect(calls).toHaveLength(2);
  });

  it('misses cache when model or prompt version changes', async () => {
    const service = makeService();
    await service.translate('raw-1', '甲');
    expect(await service.getValidTranslation('raw-1', '甲', 'different-model')).toBeNull();
    const record = [...records.values()][0];
    records.set(record.id, { ...record, promptVersion: 'old-prompt' });
    expect(await service.getValidTranslation('raw-1', '甲')).toBeNull();
    // A changed prompt creates a different key; old records cannot be returned by a new version.
    const source = readFileSync(resolve(process.cwd(), 'src/services/translation/JudgmentTranslationService.ts'), 'utf8');
    expect(source).toContain('JUDGMENT_TRANSLATION_PROMPT_VERSION].map(encodeURIComponent)');
  });

  it('preserves every source character and original order across chunks', async () => {
    const source = '甲'.repeat(1500) + '\n\n' + '乙'.repeat(1500) + '\n' + '丙'.repeat(1600);
    const chunks = splitJudgmentText(source, 1700);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toBe(source);
    expect(chunks.every((chunk) => chunk.length <= 1700)).toBe(true);
    const service = makeService();
    const result = await service.translate('raw-long', source);
    expect(calls.join('')).toBe(source);
    expect(result.segmentCount).toBeGreaterThan(1);
    expect(result.segments?.map((item) => item.index)).toEqual(result.segments?.map((_, index) => index));
    expect(result.translatedText).toContain('[0]');
    expect(result.translatedText).toContain('[1]');
  });

  it('never marks an incomplete chunk sequence completed or persists exception text', async () => {
    const source = '甲'.repeat(TRANSLATION_SINGLE_REQUEST_CHAR_LIMIT + 10);
    await expect(makeService(1).translate('raw-fail', source)).rejects.toThrow();
    const saved = [...records.values()][0];
    expect(saved.status).toBe('partial');
    expect(saved.translatedText).toBe('');
    expect(saved.errorCode).toBe('translation_failed');
    expect(JSON.stringify(saved)).not.toContain('secret-test-key');
    expect((await makeService().getTranslationRecord('raw-fail', source))?.status).toBe('partial');
    expect(await makeService().getValidTranslation('raw-fail', source)).toBeNull();
  });

  it('does not mutate source documents or case records', async () => {
    const document = Object.freeze({ id: 'raw-1', rawText: '中文原文' });
    const caseRecord = Object.freeze({ caseId: 'case-1', claimText: '请求支付工资' });
    await makeService().translate(document.id, document.rawText);
    expect(document.rawText).toBe('中文原文');
    expect(caseRecord.claimText).toBe('请求支付工资');
  });

  it('keeps translation out of analytics inputs and on click rather than language changes', () => {
    const reader = readFileSync(resolve(process.cwd(), 'src/components/JudgmentTranslationReader.tsx'), 'utf8');
    expect(reader).toContain('onClick={translate}');
    expect(reader).toContain('window.confirm');
    expect(reader).not.toContain('i18n.language');
    const service = readFileSync(resolve(process.cwd(), 'src/services/translation/JudgmentTranslationService.ts'), 'utf8');
    expect(service).not.toMatch(/Analytics|DatasetBuilder|Gold|Benchmark|ParserAdapter/);
    expect(JUDGMENT_TRANSLATION_SYSTEM_PROMPT).not.toMatch(/semantic result|schema/i);
  });

  it('has paired reader copy and an additive Dexie v8 store', () => {
    const zh = resources['zh-CN'].translation.judgmentTranslation;
    const en = resources.en.translation.judgmentTranslation;
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
    expect(zh.disclaimer).toContain('中文原文');
    expect(en.disclaimer).toContain('Chinese source text');
    const dbSource = readFileSync(resolve(process.cwd(), 'src/db/index.ts'), 'utf8');
    expect(dbSource).toContain('this.version(7)');
    expect(dbSource).toContain('this.version(8).stores({');
    expect(dbSource).toContain("documentTranslations: 'id, rawDocumentId");
  });

  it('sends a dedicated plain-text translation request without semantic schema or JSON response mode', async () => {
    const fetchMock = vi.fn(async (_url, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.messages[0].content).toBe(JUDGMENT_TRANSLATION_SYSTEM_PROMPT);
      expect(body.messages[1].content).toBe('判决如下。');
      expect(body.response_format).toBeUndefined();
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'The judgment is as follows.' } }] }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await browserXaiTranslationClient.translate('判决如下。', 'test-key')).toBe('The judgment is as follows.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reduces provider failures to safe fixed codes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })));
    await expect(browserXaiTranslationClient.translate('判决如下。', 'test-key')).rejects.toMatchObject({ code: 'http_401' });
    const failure = new TranslationRequestError('http_401');
    expect(failure.message).not.toContain('test-key');
  });

  it('keeps translation imports outside the formal fact chain', () => {
    const paths = [
      'src/services/dataSource/LaborInfoAdapter.ts',
      'src/services/parser/ParserEvaluator.ts',
      'src/services/data/DatasetBuilder.ts',
      'src/services/analytics/LaborDisputeAnalyticsEngine.ts',
      'src/components/GoldAnnotationWorkspace.tsx',
      'src/components/GoldBenchmarkPanel.tsx',
    ];
    for (const path of paths) {
      try {
        const source = readFileSync(resolve(process.cwd(), path), 'utf8');
        expect(source, path).not.toMatch(/services\/translation|documentTranslations|translatedText|JudgmentTranslation/);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  });
});
