import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const workspaceSource = readFileSync(new URL('../../src/components/SemanticReviewWorkspace.tsx', import.meta.url), 'utf8');
const dataManagementSource = readFileSync(new URL('../../src/components/DataManagement.tsx', import.meta.url), 'utf8');

describe('Semantic human review workspace contract', () => {
  it('shows case, audit reason, current result, evidence, and context', () => {
    expect(workspaceSource).toContain("t('review.ui.caseId'");
    expect(workspaceSource).toContain("t('review.confirmReason')");
    expect(workspaceSource).toContain("t('review.ui.resultFields')");
    expect(workspaceSource).toContain("t('review.partyIdentity')");
    expect(workspaceSource).toContain("t('review.verifiableSource')");
    expect(workspaceSource).toContain("t('review.relatedContext')");
    expect(workspaceSource).toContain("t('review.saveResult')");
    expect(workspaceSource).toContain("t('review.acceptCandidate')");
    expect(workspaceSource).toContain("t('review.saveEdit')");
    expect(workspaceSource).toContain("t('review.unableDetermine')");
    expect(workspaceSource).toContain("t('review.ui.confidenceLabel')");
  });

  it('only exposes human-fact review actions, not technical routing controls', () => {
    expect(workspaceSource).not.toContain('重新发送');
    expect(workspaceSource).not.toContain('切换模型');
    expect(workspaceSource).not.toContain('完善规则库');
    expect(workspaceSource).not.toContain('忽略');
    expect(workspaceSource).toContain("t('review.title')");
  });

  it('keeps review filters, queue navigation, and an explicit processed empty state', () => {
    expect(workspaceSource).toContain("t('review.lowConfidence')");
    expect(workspaceSource).toContain("t('review.evidenceIssue')");
    expect(workspaceSource).toContain("t('review.previous')");
    expect(workspaceSource).toContain("t('review.next')");
    expect(workspaceSource).toContain("t('review.noCases')");
  });

  it('uses claim-outcome and related-evidence presentation while retaining machine IDs for save/traceability', () => {
    expect(workspaceSource).toContain('getClaimTypeLabel');
    expect(workspaceSource).toContain('presentJudgmentItems');
    expect(workspaceSource).toContain("t('review.relatedEvidence')");
    expect(workspaceSource).toContain("t('review.evidenceHelp')");
    expect(workspaceSource).toContain("t('review.editEvidence')");
    expect(workspaceSource).not.toContain('对应裁判项');
    expect(workspaceSource).not.toContain('暂无裁判项');
    expect(workspaceSource).toContain("t('review.judgmentUnavailable')");
    expect(workspaceSource).toContain('setClaimJudgmentItems(claim.id');
    expect(workspaceSource).toContain('judgmentItemId');
    expect(workspaceSource).toContain('save-human-outcome');
  });

  it('is reachable from data management as a dedicated review workspace', () => {
    expect(dataManagementSource).toContain("activeTab === 'semanticReview'");
    expect(dataManagementSource).toContain('<SemanticReviewWorkspace />');
  });
});
