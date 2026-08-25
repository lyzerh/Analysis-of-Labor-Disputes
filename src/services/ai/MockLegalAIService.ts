import { LegalAIService, CaseAnalysisRequest, CaseAnalysisResult } from './LegalAIService';

export class MockLegalAIService implements LegalAIService {
  readonly isEnabled = false;

  public async structureRawText(_text: string): Promise<{ success: boolean; message: string }> {
    return {
      success: false,
      message: 'AI 深度结构化模块已预留，当前系统处于离线极速模式，采用本地规则引擎解析。',
    };
  }

  public async analyzeBatchCases(request: CaseAnalysisRequest): Promise<CaseAnalysisResult> {
    return {
      reportId: `mock_${Date.now()}`,
      generatedAt: new Date().toISOString(),
      title: `批量案例分析 (${request.caseIds.length} 篇)`,
      summary: 'AI 深度分析模块将在系统第二阶段升级启用。当前阶段建议通过「数据分析」和「案例数据库」本地多维度组合筛选进行法务研判。',
      recommendations: [
        '建议关注高频违纪解除案件中的工会通知程序证据链',
        '建议规范加班审批制并定期留存员工签字确认的考勤薪酬确认单',
      ],
      status: 'mock_standby',
    };
  }

  public async assessDefenseStrategy(_facts: string, _claims: string): Promise<CaseAnalysisResult> {
    return {
      reportId: `mock_assess_${Date.now()}`,
      generatedAt: new Date().toISOString(),
      title: '个案应诉策略分析',
      summary: 'AI 模块将在第二阶段接入。',
      recommendations: [],
      status: 'mock_standby',
    };
  }
}

export const aiService: LegalAIService = new MockLegalAIService();
