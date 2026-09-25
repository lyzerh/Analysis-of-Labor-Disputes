import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  filterAnalysisCaseRecords,
  getAvailableDisputeTypes,
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
import { formatRateWithDenominator } from '../../src/services/presentation/MetricPresentation';
import { createCaseLibraryCoverage } from '../../src/services/presentation/CaseLibraryCoverage';

const records = [
  analysisRecord('gz-2023-first', 'supported', { city: '广州', year: 2023, caseLevel: '一审' }),
  analysisRecord('gz-2023-second', 'supported', { city: '广州', year: 2023, caseLevel: '二审' }),
  analysisRecord('sz-2022-retrial', 'supported', { city: '深圳', year: 2022, caseLevel: '再审' }),
  analysisRecord('gz-null-unknown', 'supported', { city: '广州', year: null, caseLevel: 'unknown' }),
];

describe('Case Library filter contract', () => {
  it('does not present an empty denominator as 0%', () => {
    expect(formatRateWithDenominator(0, 0, 0)).toBe('当前样本不足');
    expect(formatRateWithDenominator(50, 1, 2)).toBe('50% (1/2)');
  });

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

  it('builds dispute options from current and legacy record fields, excluding blanks and duplicates', () => {
    const source = [
      analysisRecord('current', 'supported', { disputeType: ['加班工资', '经济补偿金'] }),
      analysisRecord('legacy', 'supported', { disputeType: [], disputeTypes: ['经济补偿金', '未休年休假工资'] } as any),
      analysisRecord('blank', 'supported', { disputeType: [''] }),
    ];
    expect(getAvailableDisputeTypes(source)).toEqual(['加班工资', '经济补偿金', '未休年休假工资']);
    expect(filterAnalysisCaseRecords(source, { dispute: '未休年休假工资' }).map((record) => record.caseId))
      .toEqual(['legacy']);
  });

  it('builds database-wide coverage from normalized cities and real years', () => {
    const source = [
      analysisRecord('foshan-1', 'supported', { city: '佛山', year: 2020 }),
      analysisRecord('foshan-2', 'supported', { city: '佛山市', year: 2020 }),
      analysisRecord('guangzhou-1', 'supported', { city: '广州', year: 2023 }),
      analysisRecord('missing-city-year', 'supported', { city: '', year: null }),
    ];
    expect(createCaseLibraryCoverage(source)).toEqual({
      total: 4,
      yearLabel: '2020 – 2023',
      cityCount: 2,
    });
  });

  it('formats a single year and missing year without inventing a range', () => {
    expect(createCaseLibraryCoverage([
      analysisRecord('single-year', 'supported', { city: '佛山', year: 2020 }),
    ])).toMatchObject({ yearLabel: '2020', cityCount: 1 });
    expect(createCaseLibraryCoverage([
      analysisRecord('no-year', 'supported', { city: null, year: null }),
    ])).toMatchObject({ yearLabel: '—', cityCount: 0 });
  });

  it('keeps coverage independent from the browsing filter surface', () => {
    const librarySource = readFileSync(new URL('../../src/components/LaborAnalysisCaseLibrary.tsx', import.meta.url), 'utf8');
    expect(librarySource).toMatch(/createCaseLibraryCoverage\(Array\.isArray\(records\) \? records : \[\]\)/);
    expect(librarySource).not.toMatch(/广州案例数|深圳案例数|东莞案例数/);
    expect(librarySource).not.toMatch(/stats\.gz|stats\.sz|stats\.dg/);
  });

  it('supports case-local search by title, party name, and caseId', () => {
    const target = analysisRecord('case-fixture-001', 'supported', {
      title: '劳动者甲与某教育培训中心工伤保险待遇纠纷',
      employeeParty: '劳动者甲',
      employerParty: '某教育培训中心',
    });
    const other = analysisRecord('case-other', 'supported', {
      title: '其他劳动争议',
      employeeParty: '劳动者乙',
      employerParty: '其他公司',
    });
    const source = [target, other];

    expect(filterAnalysisCaseRecords(source, { keyword: '劳动者甲' }).map((record) => record.caseId))
      .toEqual(['case-fixture-001']);
    expect(filterAnalysisCaseRecords(source, { keyword: 'CASE-FIXTURE' }).map((record) => record.caseId))
      .toEqual(['case-fixture-001']);
    expect(filterAnalysisCaseRecords(source, { keyword: '某教育培训中心' }).map((record) => record.caseId))
      .toEqual(['case-fixture-001']);
    expect(filterAnalysisCaseRecords(source, { keyword: '不存在的案件' })).toEqual([]);
  });

  it('exposes a minimal local-only search input in the case library', () => {
    const librarySource = readFileSync(new URL('../../src/components/LaborAnalysisCaseLibrary.tsx', import.meta.url), 'utf8');
    expect(librarySource).toContain('搜索案件名称 / 当事人 / Case ID');
    expect(librarySource).toContain('setKeyword');
    expect(librarySource).not.toContain('fetch(');
  });

  it('exposes explicit Gold add-case empty states instead of an empty dropdown', () => {
    const goldSource = readFileSync(new URL('../../src/components/GoldAnnotationWorkspace.tsx', import.meta.url), 'utf8');
    expect(goldSource).toContain('暂无可添加案例');
    expect(goldSource).toContain('本地案例库暂无案例');
    expect(goldSource).toContain('当前案例库中的 ${records.length} 个案例均已加入此 Gold Set');
    expect(goldSource).toMatch(/disabled[^>]*><option value="">\{addCaseAvailability/);
    expect(goldSource).toContain('getAvailableGoldCaseRecords');
    expect(goldSource).toContain('请先创建一个 Gold Set。');
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
    const workspace = readFileSync(new URL('../../src/components/PipelineWorkspace.tsx', import.meta.url), 'utf8');
    const clueWorkspace = readFileSync(new URL('../../src/components/DiagnosticClueWorkspace.tsx', import.meta.url), 'utf8');
    expect(source).toMatch(/onSelectCase=\{handleReviewItemClick\}/);
    expect(clueWorkspace).toMatch(/onSelectCase\(item\)/);
    expect(source).toMatch(/outcomeReviewEvidenceFields/);
    expect(source).toMatch(/OutcomeEvidenceFields/);
    expect(source).toMatch(/setSelectedCaseId\(item\.caseId\)/);
  });

  it('keeps the pipeline workspace space-efficient and semantically layered', () => {
    const source = readFileSync(new URL('../../src/components/CaseAnalysisView.tsx', import.meta.url), 'utf8');
    const workspace = readFileSync(new URL('../../src/components/PipelineWorkspace.tsx', import.meta.url), 'utf8');
    expect(source).toMatch(/流水线工作台/);
    expect(workspace).toMatch(/aria-label="分析流水线工作台"/);
    expect(workspace).toMatch(/aria-label="流水线总览"/);
    const clueWorkspace = readFileSync(new URL('../../src/components/DiagnosticClueWorkspace.tsx', import.meta.url), 'utf8');
    expect(clueWorkspace).toMatch(/aria-label="裁判结果诊断线索"/);
    expect(workspace).toMatch(/xl:grid-cols-2/);
    expect(clueWorkspace).toMatch(/当前：\{outcome\.label\}/);
    expect(clueWorkspace).toMatch(/line-clamp-2/);
    expect(workspace).toMatch(/SemanticReviewWorkspace/);
  });

  it('keeps the pipeline workspace vertically scrollable without clipping its cards', () => {
    const source = readFileSync(new URL('../../src/components/CaseAnalysisView.tsx', import.meta.url), 'utf8');
    const appSource = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
    const workspace = readFileSync(new URL('../../src/components/PipelineWorkspace.tsx', import.meta.url), 'utf8');
    expect(source).toMatch(/className="flex h-full min-h-0 flex-col overflow-hidden/);
    expect(workspace).toMatch(/min-h-0 flex-1 overflow-y-auto/);
    expect(workspace).toMatch(/xl:grid-cols-2/);
    expect(workspace).toMatch(/overflow-y-auto/);
    expect(appSource).toMatch(/flex-1 flex flex-col h-full min-h-0 min-w-0 overflow-hidden/);
    expect(appSource).toMatch(/<main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden select-text">/);
  });

  it('keeps the pipeline header compact while retaining scope and immutable-result warnings', () => {
    const workspace = readFileSync(new URL('../../src/components/PipelineWorkspace.tsx', import.meta.url), 'utf8');
    expect(workspace).toMatch(/当前显示的是本次分析集中的案例/);
    expect(workspace).toMatch(/当前为本地案例浏览/);
    expect(workspace).toMatch(/不会改写原始解析或研究统计/);
    expect(workspace).toMatch(/grid gap-2 sm:grid-cols-2 xl:grid-cols-4/);
  });

  it('splits Case Analysis into browse and review subviews with browse as the default', () => {
    const source = readFileSync(new URL('../../src/components/CaseAnalysisView.tsx', import.meta.url), 'utf8');
    const scopeSource = readFileSync(new URL('../../src/services/presentation/CaseAnalysisScopePresentation.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/type CaseAnalysisSubview = 'browse' \| 'pipeline'/);
    expect(source).toMatch(/useState<CaseAnalysisSubview>\('browse'\)/);
    expect(source).toMatch(/案例浏览/);
    expect(source).toMatch(/流水线工作台/);
    expect(source).toMatch(/activeSubview === 'pipeline'/);
    expect(source).toMatch(/activeSubview === 'browse'/);
    expect(source).toMatch(/activeSubview === 'browse' && <div className="flex flex-col lg:flex-row/);
    expect(source).toMatch(/<PipelineWorkspace records=\{records\}/);
    expect(source).toMatch(/setActiveSubview\('browse'\)/);
    expect(source).toMatch(/setSelectedReviewItem\(item\)/);
    expect(source).toMatch(/createCaseAnalysisScopeNotice/);
    expect(source).toMatch(/createCaseListScopeLabel/);
    expect(source).not.toMatch(/共 \$\{filteredRecords\.length\} 个案例/);
    expect(scopeSource).toMatch(/待复核项来自当前分析集/);
  });

  it('keeps legacy review persistence out of the formal pipeline UI', () => {
    const source = readFileSync(new URL('../../src/components/CaseAnalysisView.tsx', import.meta.url), 'utf8');
    const queueSource = readFileSync(new URL('../../src/services/outcome/OutcomeReviewQueue.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/加入 LLM 复核候选|标记人工复核|标记规则改进|暂缓处理/);
    expect(source).not.toMatch(/reviewStatusCounts|updateReviewStatus/);
    expect(queueSource).toMatch(/labor-analysis-review-status-v1/);
    expect(queueSource).toMatch(/readOutcomeReviewStatusMap/);
    expect(queueSource).toMatch(/catch \{/);
    expect(queueSource).toMatch(/可加入 LLM 复核候选/);
    expect(queueSource).toMatch(/建议完善规则库/);
    expect(queueSource).toMatch(/建议规则库改进/);
    expect(queueSource).toMatch(/建议人工判断/);
  });

  it('exposes the review overlay boundary without implying that review has run', () => {
    const source = readFileSync(new URL('../../src/components/PipelineWorkspace.tsx', import.meta.url), 'utf8');
    expect(source).toMatch(/阶段变化不会改写原始解析或研究统计/);
    expect(source).toMatch(/不会覆盖原始规则解析结果|不会改写原始解析/);
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
    expect(contextSource).toMatch(/分析模式：\{researchModeLabel\(run\.mode\)\}/);
    expect(contextSource).toMatch(/当前分析集/);
    expect(contextSource).toMatch(/个案例/);
    expect(contextSource).toMatch(/AnalysisRun：\{shortResearchId\(run\.id\)\}/);
    expect(contextSource).toMatch(/统计口径：\{scopeLabel\}/);
  });

  it('renders a compact outcome coverage audit without changing the review queue contract', () => {
    const caseAnalysisSource = readFileSync(new URL('../../src/components/CaseAnalysisView.tsx', import.meta.url), 'utf8');
    const auditPanelSource = readFileSync(new URL('../../src/components/OutcomeCoverageAuditPanel.tsx', import.meta.url), 'utf8');
    const pipelineSource = readFileSync(new URL('../../src/components/PipelineWorkspace.tsx', import.meta.url), 'utf8');
    expect(caseAnalysisSource).toMatch(/PipelineWorkspace/);
    expect(pipelineSource).toMatch(/自动核验未通过/);
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
