import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  filterAnalysisCaseRecords,
  normalizeCaseLevel,
  normalizeYearFilter,
} from '../../src/services/case/CaseLibraryFilter';
import { createPipelineHealthPresentation } from '../../src/services/data/PipelineHealthPresentation';
import type { DataPipelineHealthStats } from '../../src/services/data/LaborAnalysisPipeline';
import { analysisRecord } from './helpers/record-factories';
import { shortResearchId } from '../../src/services/research/AnalysisContextPresentation';
import {
  createCaseAnalysisScopeNotice,
  createCaseListScopeLabel,
  createReviewQueueScopeLabel,
} from '../../src/services/presentation/CaseAnalysisScopePresentation';

const records = [
  analysisRecord('gz-2023-first', 'supported', { city: '广州', year: 2023, caseLevel: '一审' }),
  analysisRecord('gz-2023-second', 'supported', { city: '广州', year: 2023, caseLevel: '二审' }),
  analysisRecord('sz-2022-retrial', 'supported', { city: '深圳', year: 2022, caseLevel: '再审' }),
  analysisRecord('gz-null-unknown', 'supported', { city: '广州', year: null, caseLevel: 'unknown' }),
];

describe('Case Library filter contract', () => {
  it('normalizes selector year strings to the numeric domain type', () => {
    expect(normalizeYearFilter('2023')).toBe(2023);
    expect(normalizeYearFilter('all')).toBeNull();
    expect(normalizeYearFilter('invalid')).toBeNull();
  });

  it('matches numeric record years and rejects other or null years', () => {
    expect(filterAnalysisCaseRecords(records, { year: '2023' }).map((record) => record.caseId))
      .toEqual(['gz-2023-first', 'gz-2023-second']);
  });

  it('does not filter when all years is selected', () => {
    expect(filterAnalysisCaseRecords(records, { year: 'all' })).toHaveLength(4);
  });

  it.each([
    ['一审', 'first'],
    ['劳动仲裁/一审', 'first'],
    ['first', 'first'],
    ['二审', 'second'],
    ['second', 'second'],
    ['再审', 'retrial'],
    ['retrial', 'retrial'],
    ['unknown', 'unknown'],
  ] as const)('normalizes stored case level %s to %s', (stored, expected) => {
    expect(normalizeCaseLevel(stored)).toBe(expected);
  });

  it.each([
    ['first', ['gz-2023-first']],
    ['second', ['gz-2023-second']],
    ['retrial', ['sz-2022-retrial']],
  ] as const)('matches canonical selector %s against stored values', (caseLevel, expected) => {
    expect(filterAnalysisCaseRecords(records, { caseLevel }).map((record) => record.caseId)).toEqual(expected);
  });

  it('does not make unknown records match a known level', () => {
    expect(filterAnalysisCaseRecords(records, { caseLevel: 'first' }).map((record) => record.caseId))
      .not.toContain('gz-null-unknown');
  });

  it('supports city + year, year + level, and city + year + level combinations', () => {
    expect(filterAnalysisCaseRecords(records, { city: '广州', year: '2023' })).toHaveLength(2);
    expect(filterAnalysisCaseRecords(records, { year: '2023', caseLevel: 'second' }).map((record) => record.caseId))
      .toEqual(['gz-2023-second']);
    expect(filterAnalysisCaseRecords(records, { city: '广州', year: '2023', caseLevel: 'first' }).map((record) => record.caseId))
      .toEqual(['gz-2023-first']);
  });
});

function health(overrides: Partial<DataPipelineHealthStats>): DataPipelineHealthStats {
  return {
    apiFoundTotal: 0,
    rawDocumentsSaved: 0,
    parsedSuccessCount: 0,
    evaluatorQualifiedCount: 0,
    analysisAvailableCount: 0,
    pendingReviewCount: 0,
    failedCount: 0,
    layers: [],
    ...overrides,
  };
}

describe('Data Management health presentation contract', () => {
  it('maps current pipeline fields to the four top cards', () => {
    expect(createPipelineHealthPresentation(health({
      rawDocumentsSaved: 4,
      parsedSuccessCount: 4,
      analysisAvailableCount: 4,
      pendingReviewCount: 0,
    }))).toMatchObject({
      rawCount: 4,
      parsedCount: 4,
      availableCount: 4,
      pendingCount: 0,
      rawCompletenessRate: 100,
      parseSuccessRate: 100,
      analysisAvailabilityRate: 100,
    });
  });

  it('calculates partial pipeline rates from the correct denominators', () => {
    expect(createPipelineHealthPresentation(health({
      rawDocumentsSaved: 10,
      parsedSuccessCount: 8,
      analysisAvailableCount: 6,
      pendingReviewCount: 2,
    }))).toMatchObject({
      rawCount: 10,
      parsedCount: 8,
      availableCount: 6,
      pendingCount: 2,
      rawCompletenessRate: 100,
      parseSuccessRate: 80,
      analysisAvailabilityRate: 75,
    });
  });
});

describe('Review queue interaction and analysis context contract', () => {
  it('labels case counts by local or selected analysis scope', () => {
    expect(createCaseListScopeLabel({ hasAnalysisRun: true, totalCount: 35, visibleCount: 35, isFiltered: false }))
      .toBe('当前分析集案例：35 个');
    expect(createCaseListScopeLabel({ hasAnalysisRun: false, totalCount: 92, visibleCount: 92, isFiltered: false }))
      .toBe('本地案例浏览：92 个');
    expect(createCaseListScopeLabel({ hasAnalysisRun: true, totalCount: 35, visibleCount: 4, isFiltered: true }))
      .toBe('当前分析集案例：35 个｜当前筛选显示：4 个');
  });

  it('explains the selected analysis scope and separates review item and case counts', () => {
    expect(createCaseAnalysisScopeNotice(true)).toContain('本次分析集');
    expect(createCaseAnalysisScopeNotice(true)).toContain('不代表本地案例库总数');
    expect(createCaseAnalysisScopeNotice(false)).toBe('当前为本地案例浏览，显示本地案例库中的案例。');
    expect(createReviewQueueScopeLabel(true, 7, 4)).toBe('待复核项：7 项｜涉及案例：4 个｜待复核项来自当前分析集。');
  });

  it('keeps analysis identifiers compact while preserving the full value in a title/debug attribute', () => {
    const id = 'analysis-run-1234567890-abcdef';
    expect(shortResearchId(id)).toBe('analysis…abcdef');
    const contextSource = readFileSync(new URL('../../src/components/AnalysisContextBar.tsx', import.meta.url), 'utf8');
    expect(contextSource).toMatch(/title=\{run\.id\}/);
    expect(contextSource).toMatch(/当前分析/);
  });

  it('makes review items actionable and exposes reason plus typed evidence fields', () => {
    const source = readFileSync(new URL('../../src/components/CaseAnalysisView.tsx', import.meta.url), 'utf8');
    expect(source).toMatch(/onClick=\{\(\) => handleReviewItemClick\(item\)\}/);
    expect(source).toMatch(/outcomeReviewEvidenceFields/);
    expect(source).toMatch(/OutcomeEvidenceFields/);
    expect(source).toMatch(/复核原因筛选/);
    expect(source).toMatch(/setSelectedCaseId\(item\.caseId\)/);
    expect(source).toMatch(/shouldMarkOutcomeReviewItemViewed/);
    expect(source).toMatch(/if \(shouldMarkOutcomeReviewItemViewed\(item, reviewStatuses\)\)/);
  });

  it('keeps the review queue space-efficient and semantically layered', () => {
    const source = readFileSync(new URL('../../src/components/CaseAnalysisView.tsx', import.meta.url), 'utf8');
    expect(source).toMatch(/aria-label="待复核筛选"/);
    expect(source).toMatch(/aria-label="待复核卡片列表"/);
    expect(source).toMatch(/2xl:grid-cols-2/);
    expect(source).not.toMatch(/md:grid-cols-\[minmax\(0,1fr\)_minmax\(9rem,10rem\)\]/);
    expect(source).toMatch(/当前结果：\{getOutcomePresentation\(item\.outcome\)\.label\}/);
    expect(source).toMatch(/建议：\{outcomeReviewSuggestionLabels/);
    expect(source).toMatch(/状态：\{outcomeReviewStatusLabels/);
    expect(source).toMatch(/line-clamp-2/);
    expect(source).toMatch(/aria-label="复核状态操作"/);
    expect(source).toMatch(/onClick=\{\(\) => updateReviewStatus\(item, status\)\}/);
  });

  it('keeps the review queue vertically scrollable without clipping its two-column cards', () => {
    const source = readFileSync(new URL('../../src/components/CaseAnalysisView.tsx', import.meta.url), 'utf8');
    const appSource = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
    expect(source).toMatch(/className="flex h-full min-h-0 flex-col overflow-hidden/);
    expect(source).toMatch(/aria-label="Outcome Review Items" className="mx-4 mt-3 flex min-h-0 flex-1 flex-col overflow-hidden/);
    expect(source).toMatch(/className="mt-1 min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-1"/);
    expect(source).toMatch(/aria-label="待复核卡片列表"/);
    expect(source).toMatch(/2xl:grid-cols-2/);
    expect(source).toMatch(/lg:grid-cols-3/);
    expect(source).toMatch(/outcomeReviewEvidenceFields/);
    expect(source).toMatch(/aria-label="复核状态操作"/);
    expect(source).toMatch(/LLM候选/);
    expect(source).toMatch(/aria-label={label}/);
    expect(source).toMatch(/expandedReviewItems/);
    expect(source).toMatch(/aria-expanded={expanded}/);
    expect(source).toMatch(/展开详情/);
    expect(source).toMatch(/收起详情/);
    expect(source).toMatch(/line-clamp-4/);
    expect(source).toMatch(/line-clamp-2/);
    expect(appSource).toMatch(/flex-1 flex flex-col h-full min-h-0 min-w-0 overflow-hidden/);
    expect(appSource).toMatch(/<main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden select-text">/);
  });

  it('keeps the review header and coverage audit compact while retaining scope warnings', () => {
    const source = readFileSync(new URL('../../src/components/CaseAnalysisView.tsx', import.meta.url), 'utf8');
    const auditSource = readFileSync(new URL('../../src/components/OutcomeCoverageAuditPanel.tsx', import.meta.url), 'utf8');
    expect(source).toMatch(/一篇案例可能包含多个待复核诉求/);
    expect(source).toMatch(/当前仅标记复核状态，不会修改分析结果或统计口径/);
    expect(source).toMatch(/flex flex-wrap items-center gap-x-3/);
    expect(auditSource).toMatch(/结果覆盖率审计/);
    expect(auditSource).toMatch(/总诉求：{audit\.totalClaims}/);
    expect(auditSource).toMatch(/md:grid-cols-3/);
    expect(auditSource).toMatch(/text-\[9px\]/);
  });

  it('splits Case Analysis into browse and review subviews with browse as the default', () => {
    const source = readFileSync(new URL('../../src/components/CaseAnalysisView.tsx', import.meta.url), 'utf8');
    const scopeSource = readFileSync(new URL('../../src/services/presentation/CaseAnalysisScopePresentation.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/type CaseAnalysisSubview = 'browse' \| 'review'/);
    expect(source).toMatch(/useState<CaseAnalysisSubview>\('browse'\)/);
    expect(source).toMatch(/案例浏览/);
    expect(source).toMatch(/待复核项/);
    expect(source).toMatch(/activeSubview === 'review'/);
    expect(source).toMatch(/activeSubview === 'browse'/);
    expect(source).toMatch(/activeSubview === 'review' && <div aria-label="Outcome Review Items"/);
    expect(source).toMatch(/activeSubview === 'browse' && <div className="flex flex-col lg:flex-row/);
    expect(source).toMatch(/createReviewQueueScopeLabel/);
    expect(scopeSource).toMatch(/待复核项来自当前分析集/);
    expect(source).toMatch(/一篇案例可能包含多个待复核诉求/);
    expect(source).toMatch(/setActiveSubview\('browse'\)/);
    expect(source).toMatch(/setSelectedReviewItem\(item\)/);
    expect(source).toMatch(/createCaseAnalysisScopeNotice/);
    expect(source).toMatch(/createCaseListScopeLabel/);
    expect(source).not.toMatch(/共 \$\{filteredRecords\.length\} 个案例/);
  });

  it('exposes UI-only review decision hints, status controls, persistence, and safe degradation', () => {
    const source = readFileSync(new URL('../../src/components/CaseAnalysisView.tsx', import.meta.url), 'utf8');
    const queueSource = readFileSync(new URL('../../src/services/outcome/OutcomeReviewQueue.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/当前仅标记复核状态，不会修改分析结果或统计口径/);
    expect(source).toMatch(/updateReviewStatus\(item, 'viewed'\)/);
    expect(source).toMatch(/加入 LLM 复核候选/);
    expect(source).toMatch(/标记人工复核/);
    expect(source).toMatch(/标记规则改进/);
    expect(source).toMatch(/暂缓处理/);
    expect(source).toMatch(/当前结果：\{getOutcomePresentation\(item\.outcome\)\.label\}/);
    expect(source).toMatch(/未查看：\{reviewStatusCounts\.unseen\}/);
    expect(source).toMatch(/LLM候选：\{reviewStatusCounts\.llm_candidate\}/);
    expect(source).toMatch(/manual_review/);
    expect(source).toMatch(/rule_improvement/);
    expect(queueSource).toMatch(/labor-analysis-review-status-v1/);
    expect(queueSource).toMatch(/readOutcomeReviewStatusMap/);
    expect(queueSource).toMatch(/catch \{/);
    expect(queueSource).toMatch(/可加入 LLM 复核候选/);
    expect(queueSource).toMatch(/建议完善规则库/);
    expect(queueSource).toMatch(/建议规则库改进/);
    expect(queueSource).toMatch(/建议人工判断/);
  });

  it('keeps ordinary outcome presentation on labor-role dimensions and labels claim ownership', () => {
    const caseAnalysisSource = readFileSync(new URL('../../src/components/CaseAnalysisView.tsx', import.meta.url), 'utf8');
    const librarySource = readFileSync(new URL('../../src/components/LaborAnalysisCaseLibrary.tsx', import.meta.url), 'utf8');
    expect(caseAnalysisSource).not.toMatch(/申请人结果/);
    expect(librarySource).not.toMatch(/申请人结果/);
    expect(caseAnalysisSource).toMatch(/劳动者实体结果/);
    expect(caseAnalysisSource).toMatch(/用人单位实体结果/);
    expect(caseAnalysisSource).toMatch(/诉求与裁判结果/);
    expect(caseAnalysisSource).toMatch(/提出方：\{ownership\.claimantLabel\}/);
    expect(caseAnalysisSource).toMatch(/实质受益方：\{ownership\.beneficiaryLabel\}/);
    expect(caseAnalysisSource).toMatch(/关联权益：\{ownership\.relatedLabel\}/);
    expect(caseAnalysisSource).toMatch(/程序身份映射/);
    expect(caseAnalysisSource).toMatch(/outcomeReviewEvidenceFields/);
    expect(librarySource).toMatch(/诉求与裁判结果/);
    expect(librarySource).toMatch(/提出方：\{ownership\.claimantLabel\}/);
    expect(librarySource).not.toMatch(/申请人结果/);
  });

  it('keeps case detail dense sections collapsed and unresolved outcomes concise', () => {
    const caseAnalysisSource = readFileSync(new URL('../../src/components/CaseAnalysisView.tsx', import.meta.url), 'utf8');
    const librarySource = readFileSync(new URL('../../src/components/LaborAnalysisCaseLibrary.tsx', import.meta.url), 'utf8');
    const metadataSource = readFileSync(new URL('../../src/services/presentation/CaseMetadataPresentation.ts', import.meta.url), 'utf8');
    expect(caseAnalysisSource).toMatch(/createCaseSummaryPresentation/);
    expect(caseAnalysisSource).toMatch(/aria-label="案件摘要"/);
    expect(caseAnalysisSource).toMatch(/getCaseEntityOutcomeLabel/);
    expect(caseAnalysisSource).toMatch(/展开诊断证据片段/);
    expect(caseAnalysisSource).toMatch(/<details className="mt-6 pt-6 border-t/);
    expect(caseAnalysisSource).toMatch(/关键证据与法院认定：\{\(record\.evidence \|\| \[\]\)\.length\}/);
    expect(librarySource).toMatch(/createCaseSummaryPresentation/);
    expect(librarySource).toMatch(/关键证据与法院认定：/);
    expect(metadataSource).toMatch(/createCaseSummaryPresentation/);
    expect(metadataSource).toMatch(/本案：/);
  });

  it('shows the same selected analysis context in workspace and case analysis without auto-latest fallback', () => {
    const workspaceSource = readFileSync(new URL('../../src/components/ResearchWorkspace.tsx', import.meta.url), 'utf8');
    const appSource = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
    expect(workspaceSource).toMatch(/AnalysisContextBar/);
    expect(appSource).toMatch(/<CaseAnalysisView initialAnalysisRunId=\{selectedAnalysisRunId\}/);
    expect(appSource).toMatch(/selectedAnalysisRunId=\{selectedAnalysisRunId\}/);
    expect(workspaceSource).toMatch(/不会自动选择最新记录/);
  });

  it('keeps the context bar user-facing while retaining compact debug identifiers', () => {
    const contextSource = readFileSync(new URL('../../src/components/AnalysisContextBar.tsx', import.meta.url), 'utf8');
    expect(contextSource).toMatch(/当前分析：\{researchModeLabel\(run\.mode\)\}/);
    expect(contextSource).toMatch(/范围：本次分析集/);
    expect(contextSource).toMatch(/AnalysisRun：\{shortResearchId\(run\.id\)\}/);
    expect(contextSource).toMatch(/统计口径：\{scopeLabel\}/);
  });

  it('renders a compact outcome coverage audit without changing the review queue contract', () => {
    const caseAnalysisSource = readFileSync(new URL('../../src/components/CaseAnalysisView.tsx', import.meta.url), 'utf8');
    const auditPanelSource = readFileSync(new URL('../../src/components/OutcomeCoverageAuditPanel.tsx', import.meta.url), 'utf8');
    expect(caseAnalysisSource).toMatch(/OutcomeCoverageAuditPanel/);
    expect(caseAnalysisSource).toMatch(/createOutcomeCoverageAudit/);
    expect(caseAnalysisSource).toMatch(/analysisContext\?\.analysisRun \? records : \[\]/);
    expect(auditPanelSource).toMatch(/结果覆盖率审计/);
    expect(auditPanelSource).toMatch(/总诉求：\{audit\.totalClaims\}/);
    expect(auditPanelSource).toMatch(/已确定：\{audit\.resolvedClaims\}/);
    expect(auditPanelSource).toMatch(/待复核率：\{audit\.needsReviewRate\}%/);
    expect(auditPanelSource).toMatch(/主要原因/);
    expect(auditPanelSource).toMatch(/待复核诉求类型/);
    expect(auditPanelSource).toMatch(/处理建议分布/);
    expect(auditPanelSource).toMatch(/金额风险审计/);
    expect(auditPanelSource).toMatch(/当前分析集暂无可审计诉求/);
  });
});

describe('Case detail frontend contract', () => {
  const librarySource = readFileSync(new URL('../../src/components/LaborAnalysisCaseLibrary.tsx', import.meta.url), 'utf8');
  const modalSource = readFileSync(new URL('../../src/components/CaseDetailModal.tsx', import.meta.url), 'utf8');

  it('removes Raw Judgment Viewer entry points while retaining structured analysis', () => {
    expect(librarySource).toMatch(/结构化分析结果/);
    expect(modalSource).toMatch(/结构化法务要素/);
    expect(librarySource).not.toMatch(/原始裁判文书|无法加载原始文书或原文本为空|detailTab/);
    expect(modalSource).not.toMatch(/tab-btn-raw|原始文书全文|btn-copy-raw-text|未找到对应的原始文书对象/);
  });

  it('keeps RawDocument persistence and parser input intact', () => {
    const dataSource = readFileSync(new URL('../../src/services/data/dataService.ts', import.meta.url), 'utf8');
    const pipelineSource = readFileSync(new URL('../../src/services/data/LaborAnalysisPipeline.ts', import.meta.url), 'utf8');
    expect(dataSource).toMatch(/db\.rawDocuments\.put/);
    expect(pipelineSource).toMatch(/rawDoc\.rawText/);
  });
});
