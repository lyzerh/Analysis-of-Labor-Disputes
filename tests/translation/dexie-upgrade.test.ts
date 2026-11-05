import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { ShenzhenArbitrationDatabase } from '../../src/db';

const databaseName = 'ShenzhenArbitrationDB';

describe('translation store migration from existing v7 data', () => {
  afterEach(async () => {
    await Dexie.delete(databaseName);
  });

  it('opens a v7 database as v8 without changing existing documents, cases, or analysis runs', async () => {
    await Dexie.delete(databaseName);
    const old = new Dexie(databaseName);
    old.version(7).stores({
      rawDocuments: 'id, sourceUrl, contentHash, publishedAt, duplicateOf, source, contentType, importedAt',
      arbitrationCases: 'id, rawDocumentId, caseNumber, year, month, arbitrationCommittee, decisionOutcome, *disputeTags, *legalBasis, parseStatus, publishedDate',
      syncTasks: 'id, status, startedAt, updatedAt',
      syncLogs: '++id, taskId, timestamp, level',
      settings: 'key',
      documentTasks: 'id, url, status, publishedAt, rawDocumentId, createdAt, updatedAt',
      crawlTasks: 'id, status, startedAt, updatedAt',
      candidatePoolSnapshots: 'id, source, status, createdAt, candidateHash, snapshotFingerprint',
      candidatePoolEntries: 'id, snapshotId, caseId, pbDt, year, caseLevel, city, [snapshotId+caseId]',
      samplingRuns: 'id, snapshotId, createdAt, method, algorithmVersion, sampleHash',
      analysisRuns: 'id, snapshotId, samplingRunId, mode, status, createdAt, provenanceHash',
    });
    const raw = { id: 'raw-existing', source: 'laborinfo', rawText: '原始判决书。', contentHash: 'existing-hash' };
    const caseRecord = { id: 'case-existing', rawDocumentId: raw.id, caseNumber: '（2020）测试', disputeTags: [], legalBasis: [] };
    const analysisRun = { id: 'run-existing', snapshotId: 'snapshot-existing', status: 'completed' };
    await old.open();
    await old.table('rawDocuments').put(raw);
    await old.table('arbitrationCases').put(caseRecord);
    await old.table('analysisRuns').put(analysisRun);
    old.close();

    const upgraded = new ShenzhenArbitrationDatabase();
    try {
      await upgraded.open();
      expect(upgraded.verno).toBe(8);
      expect(await upgraded.rawDocuments.get(raw.id)).toEqual(raw);
      expect(await upgraded.arbitrationCases.get(caseRecord.id)).toEqual(caseRecord);
      expect(await upgraded.analysisRuns.get(analysisRun.id)).toEqual(analysisRun);
      const translation = {
        id: 'translation-existing', rawDocumentId: raw.id, sourceLanguage: 'zh-CN' as const,
        targetLanguage: 'en' as const, sourceTextHash: 'exact-hash', provider: 'xai',
        model: 'grok-4.20-0309-reasoning', promptVersion: 'judgment-translation-v1',
        translatedText: 'Original judgment.', status: 'completed' as const,
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      };
      await upgraded.documentTranslations.put(translation);
      expect(await upgraded.documentTranslations.get(translation.id)).toEqual(translation);
      expect(await upgraded.rawDocuments.get(raw.id)).toEqual(raw);
    } finally {
      upgraded.close();
    }
  });
});
