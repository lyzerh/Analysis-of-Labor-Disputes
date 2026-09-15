import type { DataPipelineHealthStats } from './LaborAnalysisPipeline';

export interface PipelineHealthPresentation {
  rawCount: number;
  parsedCount: number;
  availableCount: number;
  pendingCount: number;
  rawCompletenessRate: number;
  parseSuccessRate: number;
  analysisAvailabilityRate: number;
}

function percentage(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.min(100, Math.round((numerator / denominator) * 100));
}

export function createPipelineHealthPresentation(
  health: DataPipelineHealthStats,
): PipelineHealthPresentation {
  return {
    rawCount: health.rawDocumentsSaved,
    parsedCount: health.parsedSuccessCount,
    availableCount: health.analysisAvailableCount,
    pendingCount: health.pendingReviewCount,
    rawCompletenessRate: health.rawDocumentsSaved > 0 ? 100 : 0,
    parseSuccessRate: percentage(health.parsedSuccessCount, health.rawDocumentsSaved),
    analysisAvailabilityRate: percentage(health.analysisAvailableCount, health.parsedSuccessCount),
  };
}
