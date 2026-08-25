/**
 * AI 法律能力预留接口 (第二阶段扩展)
 * 当前阶段默认关闭，不产生任何真实 API 请求与外部流量
 */
export interface CaseAnalysisRequest {
  caseIds: string[];
  prompt?: string;
  focusArea?: 'win_loss_strategy' | 'evidence_admissibility' | 'similar_matrix';
}

export interface CaseAnalysisResult {
  reportId: string;
  generatedAt: string;
  title: string;
  summary: string;
  recommendations: string[];
  status: 'mock_standby' | 'ready';
}

export interface LegalAIService {
  readonly isEnabled: boolean;
  structureRawText(text: string): Promise<{ success: boolean; message: string }>;
  analyzeBatchCases(request: CaseAnalysisRequest): Promise<CaseAnalysisResult>;
  assessDefenseStrategy(facts: string, claims: string): Promise<CaseAnalysisResult>;
}
