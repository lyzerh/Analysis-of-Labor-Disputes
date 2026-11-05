export type TranslationViewStatus = 'not_translated' | 'translating' | 'completed' | 'failed' | 'stale';

export interface TranslationSegment {
  index: number;
  sourceTextHash: string;
  translatedText: string;
}

/** Presentation-only cache record. Never attach this to RawDocument or AnalysisCaseRecord. */
export interface DocumentTranslation {
  id: string;
  rawDocumentId: string;
  sourceLanguage: 'zh-CN';
  targetLanguage: 'en';
  sourceTextHash: string;
  provider: string;
  model: string;
  promptVersion: string;
  translatedText: string;
  status: 'completed' | 'failed' | 'partial';
  segments?: TranslationSegment[];
  segmentCount?: number;
  createdAt: string;
  updatedAt: string;
  errorCode?: string;
}
