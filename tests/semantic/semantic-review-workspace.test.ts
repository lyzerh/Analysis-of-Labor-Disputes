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
    expect(workspaceSource).toContain('整体置信度');
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

  it('is reachable from data management as a dedicated review workspace', () => {
    expect(dataManagementSource).toContain("activeTab === 'semanticReview'");
    expect(dataManagementSource).toContain('<SemanticReviewWorkspace />');
  });
});
