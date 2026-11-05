import { db } from '../../db';
import { hashString } from '../crypto/HashUtils';
import { readLlmRuntimeSettings } from '../semantic/LlmRuntimeSettings';
import { browserXaiTranslationClient, TRANSLATION_MODEL, TRANSLATION_PROVIDER, TranslationRequestError, type TranslationClient } from './BrowserXaiTranslationClient';
import { JUDGMENT_TRANSLATION_PROMPT_VERSION } from './JudgmentTranslationPrompt';
import type { DocumentTranslation, TranslationSegment } from './TranslationTypes';

/** Engineering guardrail, not a claim about the provider's token limit. */
export const TRANSLATION_SINGLE_REQUEST_CHAR_LIMIT = 3000;

export const exactRawTextHash = (rawText: string): Promise<string> => hashString(rawText);

/** Slice at the last paragraph/line boundary within the limit; never drop or duplicate a source character. */
export function splitJudgmentText(rawText: string, limit = TRANSLATION_SINGLE_REQUEST_CHAR_LIMIT): string[] {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('invalid_chunk_limit');
  if (!rawText) return [];
  const chunks: string[] = [];
  for (let start = 0; start < rawText.length;) {
    let end = Math.min(start + limit, rawText.length);
    if (end < rawText.length) {
      const paragraph = rawText.lastIndexOf('\n\n', end);
      const line = rawText.lastIndexOf('\n', end);
      const boundary = paragraph > start ? paragraph + 2 : line > start ? line + 1 : -1;
      if (boundary > start) end = boundary;
    }
    chunks.push(rawText.slice(start, end));
    start = end;
  }
  return chunks;
}

const recordId = (rawDocumentId: string, hash: string, model: string): string =>
  [rawDocumentId, hash, 'en', TRANSLATION_PROVIDER, model, JUDGMENT_TRANSLATION_PROMPT_VERSION].map(encodeURIComponent).join('|');

const safeErrorCode = (error: unknown): string =>
  error instanceof TranslationRequestError ? error.code : 'translation_failed';

export class JudgmentTranslationService {
  constructor(private readonly client: TranslationClient = browserXaiTranslationClient) {}

  async getTranslationRecord(rawDocumentId: string, rawText: string, model: string = TRANSLATION_MODEL): Promise<DocumentTranslation | null> {
    const hash = await exactRawTextHash(rawText);
    return await db.documentTranslations.get(recordId(rawDocumentId, hash, model)) ?? null;
  }

  async getValidTranslation(rawDocumentId: string, rawText: string, model: string = TRANSLATION_MODEL): Promise<DocumentTranslation | null> {
    const hash = await exactRawTextHash(rawText);
    const record = await db.documentTranslations.get(recordId(rawDocumentId, hash, model));
    return record?.status === 'completed'
      && record.sourceTextHash === hash
      && record.provider === TRANSLATION_PROVIDER
      && record.model === model
      && record.promptVersion === JUDGMENT_TRANSLATION_PROMPT_VERSION
      && record.targetLanguage === 'en'
      ? record : null;
  }

  async hasStaleTranslation(rawDocumentId: string, rawText: string, model: string = TRANSLATION_MODEL): Promise<boolean> {
    const hash = await exactRawTextHash(rawText);
    const records = await db.documentTranslations.where('rawDocumentId').equals(rawDocumentId).toArray();
    return records.some((record) => record.status === 'completed' && (
      record.id !== recordId(rawDocumentId, hash, model)
      || record.sourceTextHash !== hash
      || record.model !== model
      || record.promptVersion !== JUDGMENT_TRANSLATION_PROMPT_VERSION
      || record.provider !== TRANSLATION_PROVIDER
    ));
  }

  async saveTranslation(record: DocumentTranslation): Promise<void> {
    await db.documentTranslations.put(record);
  }

  async markTranslationFailed(record: DocumentTranslation, error: unknown): Promise<void> {
    await this.saveTranslation({
      ...record,
      status: record.segments?.length ? 'partial' : 'failed',
      translatedText: '',
      errorCode: safeErrorCode(error),
      updatedAt: new Date().toISOString(),
    });
  }

  async translate(rawDocumentId: string, rawText: string): Promise<DocumentTranslation> {
    if (!rawDocumentId || !rawText.trim()) throw new Error('source_unavailable');
    const cached = await this.getValidTranslation(rawDocumentId, rawText);
    if (cached) return cached;

    const settings = readLlmRuntimeSettings();
    if (!settings.enabled || !settings.apiKey?.trim()) throw new Error('provider_not_configured');
    const sourceTextHash = await exactRawTextHash(rawText);
    const id = recordId(rawDocumentId, sourceTextHash, TRANSLATION_MODEL);
    const existing = await db.documentTranslations.get(id);
    const timestamp = new Date().toISOString();
    const chunks = splitJudgmentText(rawText);
    const segments: TranslationSegment[] = [];
    const base: DocumentTranslation = {
      id, rawDocumentId, sourceLanguage: 'zh-CN', targetLanguage: 'en', sourceTextHash,
      provider: TRANSLATION_PROVIDER, model: TRANSLATION_MODEL,
      promptVersion: JUDGMENT_TRANSLATION_PROMPT_VERSION,
      translatedText: '', status: 'failed', segmentCount: chunks.length,
      createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp,
    };
    try {
      for (let index = 0; index < chunks.length; index++) {
        const translatedText = await this.client.translate(chunks[index], settings.apiKey);
        segments.push({ index, sourceTextHash: await exactRawTextHash(chunks[index]), translatedText });
      }
      const completed: DocumentTranslation = {
        ...base, segments,
        // Chunk order is the source order. Newline joins keep independently returned prose separated.
        translatedText: segments.map((segment) => segment.translatedText).join(chunks.length > 1 ? '\n' : ''),
        status: 'completed', updatedAt: new Date().toISOString(),
      };
      await this.saveTranslation(completed);
      return completed;
    } catch (error) {
      await this.markTranslationFailed({ ...base, segments }, error);
      throw error;
    }
  }
}

export const judgmentTranslationService = new JudgmentTranslationService();
