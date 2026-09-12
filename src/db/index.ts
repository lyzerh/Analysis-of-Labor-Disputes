import Dexie, { Table } from 'dexie';
import { RawDocument, ArbitrationCase, SyncTask, SyncLog, AppSettings, DocumentTask, LaborInfoCrawlTask, CandidatePoolSnapshotHeader, CandidatePoolEntry, SamplingRun, AnalysisRun } from '../types';

export class ShenzhenArbitrationDatabase extends Dexie {
  rawDocuments!: Table<RawDocument, string>;
  arbitrationCases!: Table<ArbitrationCase, string>;
  syncTasks!: Table<SyncTask, string>;
  syncLogs!: Table<SyncLog, number>;
  documentTasks!: Table<DocumentTask, string>;
  crawlTasks!: Table<LaborInfoCrawlTask, string>;
  candidatePoolSnapshots!: Table<CandidatePoolSnapshotHeader, string>;
  candidatePoolEntries!: Table<CandidatePoolEntry, string>;
  samplingRuns!: Table<SamplingRun, string>;
  analysisRuns!: Table<AnalysisRun, string>;
  settings!: Table<{ key: string; value: any }, string>;

  constructor() {
    super('ShenzhenArbitrationDB');

    this.version(1).stores({
      rawDocuments: 'id, contentHash, duplicateOf, source, contentType, importedAt',
      arbitrationCases:
        'id, rawDocumentId, caseNumber, year, month, arbitrationCommittee, decisionOutcome, *disputeTags, *legalBasis, parseStatus, publishedDate',
      syncTasks: 'id, status, startedAt, updatedAt',
      syncLogs: '++id, taskId, timestamp, level',
      settings: 'key',
    });

    this.version(2)
      .stores({
        rawDocuments:
          'id, sourceUrl, contentHash, publishedAt, duplicateOf, source, contentType, importedAt',
      })
      .upgrade(async () => {
        console.log(
          'ShenzhenArbitrationDB upgraded to version 2 (added indexes: sourceUrl, contentHash, publishedAt for rawDocuments)'
        );
      });

    this.version(3)
      .stores({
        documentTasks: 'id, url, status, publishedAt, rawDocumentId, createdAt, updatedAt',
      })
      .upgrade(async () => {
        console.log(
          'ShenzhenArbitrationDB upgraded to version 3 (added documentTasks table for discovery tasks)'
        );
      });

    this.version(4)
      .stores({
        crawlTasks: 'id, status, startedAt, updatedAt',
      })
      .upgrade(async () => {
        console.log(
          'ShenzhenArbitrationDB upgraded to version 4 (added crawlTasks table for LaborInfo crawler tasks)'
        );
      });

    this.version(5)
      .stores({
        candidatePoolSnapshots: 'id, source, status, createdAt, candidateHash, snapshotFingerprint',
        candidatePoolEntries: 'id, snapshotId, caseId, pbDt, year, caseLevel, city, [snapshotId+caseId]',
      })
      .upgrade(async () => {
        console.log(
          'ShenzhenArbitrationDB upgraded to version 5 (added Candidate Pool Snapshot tables)'
        );
      });

    this.version(6)
      .stores({
        samplingRuns: 'id, snapshotId, createdAt, method, algorithmVersion, sampleHash',
      })
      .upgrade(async () => {
        console.log(
          'ShenzhenArbitrationDB upgraded to version 6 (added reproducible SamplingRun table)'
        );
      });

    this.version(7)
      .stores({
        analysisRuns: 'id, snapshotId, samplingRunId, mode, status, createdAt, provenanceHash',
      })
      .upgrade(async () => {
        console.log(
          'ShenzhenArbitrationDB upgraded to version 7 (added reproducible AnalysisRun table)'
        );
      });
  }
}

export const db = new ShenzhenArbitrationDatabase();

/**
 * 默认应用设置
 */
export const DEFAULT_SETTINGS: AppSettings = {
  syncDelayMs: 2000,
  autoParseOnImport: true,
  defaultPageSize: 20,
  isAiModuleEnabled: false,
};

/**
 * 获取或初始化设置
 */
export async function getSetting<T>(key: keyof AppSettings, defaultValue: T): Promise<T> {
  try {
    const item = await db.settings.get(key);
    return item ? (item.value as T) : defaultValue;
  } catch (error) {
    console.warn(`Failed to read setting ${key}:`, error);
    return defaultValue;
  }
}

export async function setSetting<T>(key: keyof AppSettings, value: T): Promise<void> {
  try {
    await db.settings.put({ key, value });
  } catch (error) {
    console.warn(`Failed to save setting ${key}:`, error);
  }
}
