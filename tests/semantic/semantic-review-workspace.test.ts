import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const workspaceSource = readFileSync(new URL('../../src/components/SemanticReviewWorkspace.tsx', import.meta.url), 'utf8');
const dataManagementSource = readFileSync(new URL('../../src/components/DataManagement.tsx', import.meta.url), 'utf8');

describe('Semantic human review workspace contract', () => {
  it('shows case, audit reason, current result, evidence, and context', () => {
    expect(workspaceSource).toContain('案件：');
    expect(workspaceSource).toContain('需要人工确认的原因');
    expect(workspaceSource).toContain('当前结构化结果');
    expect(workspaceSource).toContain('申请方身份');
    expect(workspaceSource).toContain('可核对的原文依据');
    expect(workspaceSource).toContain('相关上下文');
    expect(workspaceSource).toContain('保存人工复核结果');
    expect(workspaceSource).toContain('接受 AI 候选');
    expect(workspaceSource).toContain('保存编辑结果');
    expect(workspaceSource).toContain('标记无法确定');
    expect(workspaceSource).toContain('模型置信度');
  });

  it('only exposes human-fact review actions, not technical routing controls', () => {
    expect(workspaceSource).not.toContain('重新发送');
    expect(workspaceSource).not.toContain('切换模型');
    expect(workspaceSource).not.toContain('完善规则库');
    expect(workspaceSource).not.toContain('忽略');
    expect(workspaceSource).toContain('语义人工复核');
  });

  it('keeps review filters, queue navigation, and an explicit processed empty state', () => {
    expect(workspaceSource).toContain('低置信度');
    expect(workspaceSource).toContain('证据问题');
    expect(workspaceSource).toContain('上一项');
    expect(workspaceSource).toContain('下一项');
    expect(workspaceSource).toContain('当前没有需要人工复核的案例');
  });

  it('uses claim-outcome and related-evidence presentation while retaining machine IDs for save/traceability', () => {
    expect(workspaceSource).toContain('claimTypeLabel');
    expect(workspaceSource).toContain('presentJudgmentItems');
    expect(workspaceSource).toContain('相关裁判依据');
    expect(workspaceSource).toContain('以下内容由系统提取，用于辅助判断该诉求是否获得支持。');
    expect(workspaceSource).toContain('修改依据');
    expect(workspaceSource).toContain('支持');
    expect(workspaceSource).toContain('部分支持');
    expect(workspaceSource).toContain('不支持');
    expect(workspaceSource).toContain('无法判断');
    expect(workspaceSource).toContain('暂未定位到明确的请求原文');
    expect(workspaceSource).not.toContain('对应裁判项');
    expect(workspaceSource).not.toContain('暂无裁判项');
    expect(workspaceSource).toContain('裁判文本暂不可用');
    expect(workspaceSource).toContain('setClaimJudgmentItems(claim.id');
    expect(workspaceSource).toContain('judgmentItemId');
    expect(workspaceSource).toContain('save-human-outcome');
  });

  it('is reachable from data management as a dedicated review workspace', () => {
    expect(dataManagementSource).toContain("activeTab === 'semanticReview'");
    expect(dataManagementSource).toContain('<SemanticReviewWorkspace />');
  });
});
