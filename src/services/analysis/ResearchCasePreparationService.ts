import type { CandidatePoolSnapshot, DocumentMetadata, RawDocument } from '../../types';
import { DataService } from '../data/dataService';
import { LaborInfoAdapter } from '../dataSource/LaborInfoAdapter';

export interface ResearchCasePreparationSummary {
  requestedCount: number;
  alreadyAvailableCount: number;
  fetchedCount: number;
  savedCount: number;
  failedCaseIds: string[];
}

export interface ResearchCaseDetailClient {
  fetchCaseDetail(id: string | number, metadata?: Partial<DocumentMetadata>): Promise<RawDocument>;
}

export interface ResearchRawDocumentRepository {
  list(): Promise<RawDocument[]>;
  save(rawDocument: RawDocument): Promise<{ saved: boolean; isDuplicate: boolean; docId: string; reason?: string }>;
}

const defaultRepository: ResearchRawDocumentRepository = {
  list: () => DataService.getLaborInfoRawDocuments(0),
  save: (rawDocument) => DataService.saveLaborInfoRawDocument(rawDocument),
};

/** Fetches only the immutable candidate IDs from one Snapshot. Parsing remains on the formal analysis path. */
export class ResearchCasePreparationService {
  public constructor(
    private readonly client: ResearchCaseDetailClient = new LaborInfoAdapter(),
    private readonly repository: ResearchRawDocumentRepository = defaultRepository,
  ) {}

  public async prepareSnapshot(snapshot: CandidatePoolSnapshot): Promise<ResearchCasePreparationSummary> {
    const requestedIds = snapshot.candidates.map((candidate) => candidate.caseId);
    const existing = new Set((await this.repository.list()).map((document) => String(document.sourceId ?? document.id)));
    let fetchedCount = 0;
    let savedCount = 0;
    const failedCaseIds: string[] = [];
    for (const candidate of snapshot.candidates) {
      if (existing.has(candidate.caseId)) continue;
      try {
        const rawDocument = await this.client.fetchCaseDetail(candidate.caseId, {
          sourceId: candidate.caseId,
          date: candidate.pbDt,
          pbDt: candidate.pbDt,
          caseLevel: candidate.caseLevel,
          court: candidate.court,
        });
        fetchedCount++;
        if (String(rawDocument.sourceId) !== candidate.caseId || !rawDocument.rawText.trim()) {
          failedCaseIds.push(candidate.caseId);
          continue;
        }
        const result = await this.repository.save(rawDocument);
        if (result.saved || result.isDuplicate) savedCount++;
        else failedCaseIds.push(candidate.caseId);
      } catch {
        failedCaseIds.push(candidate.caseId);
      }
    }
    return {
      requestedCount: requestedIds.length,
      alreadyAvailableCount: requestedIds.filter((id) => existing.has(id)).length,
      fetchedCount,
      savedCount,
      failedCaseIds,
    };
  }
}
