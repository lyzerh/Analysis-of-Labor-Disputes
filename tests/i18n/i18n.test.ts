import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resources, DEFAULT_LOCALE } from '../../src/i18n/locales';
import { persistLocalePreference, readPreferredLocale } from '../../src/i18n';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { createHash } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { ImportCases } from '../../src/components/ImportCases';
import { LaborInfoCrawlerComponent } from '../../src/components/LaborInfoCrawler';
import { LaborInfoApiTest } from '../../src/components/LaborInfoApiTest';
import { LaborInfoImportHistory } from '../../src/components/LaborInfoImportHistory';
import { LaborInfoReview } from '../../src/components/LaborInfoReview';
import { LaborInfoParserTest } from '../../src/components/LaborInfoParserTest';
import { DatasetBuilderTest } from '../../src/components/DatasetBuilderTest';
import { ResearchWorkspace } from '../../src/components/ResearchWorkspace';
import { CaseDetailModal } from '../../src/components/CaseDetailModal';
import { CaseAnalysisView } from '../../src/components/CaseAnalysisView';

const flattenStrings = (value: unknown, prefix = '', output: Record<string, string> = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return output;
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') output[path] = child;
    else flattenStrings(child, path, output);
  }
  return output;
};

const createTestI18n = async (locale: string) => {
  const instance = i18n.createInstance();
  await instance.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    defaultNS: 'translation',
  });
  return instance;
};

describe('bilingual UI foundation', () => {
  it('defaults to zh-CN and persists the selected locale for reinitialization', async () => {
    expect(DEFAULT_LOCALE).toBe('zh-CN');
    const instance = await createTestI18n(DEFAULT_LOCALE);
    expect(instance.t('navigation.caseResearch')).toBe('案例研究');
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    persistLocalePreference('en', storage);
    expect(readPreferredLocale(storage)).toBe('en');
    const restored = await createTestI18n(readPreferredLocale(storage));
    expect(restored.language).toBe('en');
    expect(restored.t('navigation.caseResearch')).toBe('Case Research');
  });

  it('provides the representative English labels and Chinese fallback for missing keys', async () => {
    const instance = await createTestI18n('en');
    expect(instance.t('navigation.defenseInsights')).toBe('Defense Insights');
    expect(instance.t('navigation.caseLibrary')).toBe('Case Library');
    expect(instance.t('navigation.dataManagement')).toBe('Data Management');
    expect(instance.t('navigation.settings')).toBe('Settings');
    expect(instance.t('navigation.humanReview')).toBe('Human Review');
    expect(instance.t('status.eligible')).toBe('Eligible for Analysis');
    expect(instance.t('status.unclear')).toBe('Unclear');
    expect(instance.t('action.startAnalysis')).toBe('Start Analysis');
    expect(instance.t('missing.key')).toBe('missing.key');
    expect(instance.options.fallbackLng).toEqual(['zh-CN']);
  });

  it('keeps business data independent from locale resources', async () => {
    const claim = { claimType: 'overtime_pay', outcome: 'supported' };
    const before = structuredClone(claim);
    const instance = await createTestI18n('en');
    await instance.changeLanguage('zh-CN');
    expect(claim).toEqual(before);
  });

  it('provides bilingual labels for Case Research, Defense Insights, and Human Review', async () => {
    const zh = await createTestI18n('zh-CN');
    const en = await createTestI18n('en');

    expect(zh.t('research.title')).toBe('案例研究');
    expect(en.t('research.title')).toBe('Case Research');
    expect(zh.t('research.overview')).toBe('案例研究');
    expect(en.t('research.overview')).toBe('Case Research');
    expect(zh.t('research.ui.geographicPearlRiverDelta')).toBe('珠三角（9市）');
    expect(en.t('research.ui.geographicPearlRiverDelta')).toBe('Pearl River Delta (9 cities)');
    expect(zh.t('defense.title')).toBe('应诉参考');
    expect(en.t('defense.title')).toBe('Defense Insights');
    expect(zh.t('defense.ui.strictEvidence')).toContain('共现关系');
    expect(en.t('defense.ui.strictEvidence')).toContain('co-occurrence');
    expect(zh.t('review.title')).toBe('人工复核');
    expect(en.t('review.title')).toBe('Human Review');
    expect(zh.t('review.ui.filterLabel')).toBe('复核筛选');
    expect(en.t('review.ui.filterLabel')).toBe('Review filters');
    expect(zh.t('status.supported')).toBe('支持');
    expect(en.t('status.supported')).toBe('Supported');
    expect(zh.t('status.partiallySupported')).toBe('部分支持');
    expect(en.t('status.partiallySupported')).toBe('Partially Supported');
    expect(zh.t('status.notSupported')).toBe('不支持');
    expect(en.t('status.notSupported')).toBe('Not Supported');
    expect(zh.t('status.unclear')).toBe('结果不明');
    expect(en.t('status.unclear')).toBe('Unclear');
  });

  it('translates fixed page labels without changing canonical outcome or case text', async () => {
    const claim = { claimType: 'overtime_pay', outcome: 'partially_supported', sourceText: '原始请求文本' };
    const before = structuredClone(claim);
    const instance = await createTestI18n('en');
    expect(instance.t('research.cityOutcomes')).toBe('Judgment Outcomes by Research Region');
    expect(instance.t('defense.reason')).toBe('Reasons for Rejection');
    expect(instance.t('review.saveResult')).toBe('Save Review Result');
    await instance.changeLanguage('zh-CN');
    expect(instance.t('review.saveResult')).toBe('保存人工复核结果');
    expect(claim).toEqual(before);
    expect(claim.outcome).toBe('partially_supported');
    expect(claim.sourceText).toBe('原始请求文本');
  });

  it('provides bilingual copy for the Task 2.2B pages without mutating their records', async () => {
    const zh = await createTestI18n('zh-CN');
    const en = await createTestI18n('en');
    const record = { claimType: 'economic_compensation', goldOutcome: 'supported', pipelineStatus: 'safe' };
    const before = structuredClone(record);

    expect(zh.t('dataManagement.semanticReview')).toBe('语义人工复核');
    expect(en.t('dataManagement.semanticReview')).toBe('Semantic Review');
    expect(zh.t('dataManagement.importUi.title')).toBe('数据导入与本地解析中心');
    expect(en.t('dataManagement.importUi.title')).toBe('Local Document Import and Parsing');
    expect(zh.t('dataManagement.importUi.importSuccess', { count: 3 })).toBe('已解析并导入 3 份文书。');
    expect(en.t('dataManagement.importUi.importSuccess', { count: 3 })).toBe('Imported 3 document(s).');
    expect(zh.t('dataManagement.reviewUi.saveSuccess', { status: '已核准通过' })).toContain('人工质检记录已保存');
    expect(en.t('dataManagement.reviewUi.saveSuccess', { status: 'Approved' })).toContain('Human quality review saved');
    expect(zh.t('settings.title')).toBe('设置');
    expect(en.t('settings.title')).toBe('Settings');
    expect(zh.t('guide.title')).toBe('用户指南');
    expect(en.t('guide.title')).toBe('User Guide');
    expect(zh.t('pipeline.safeToStore')).toBe('可安全入库');
    expect(en.t('pipeline.safeToStore')).toBe('Safe to Store');
    expect(zh.t('pipeline.closure.technicalFailureReason')).toContain('技术失败');
    expect(en.t('pipeline.closure.technicalFailureReason')).toContain('technically');
    expect(zh.t('review.ui.auditReasons.schema_invalid')).toBe('候选结果结构未通过校验');
    expect(en.t('review.ui.auditReasons.schema_invalid')).toBe('Candidate structure failed validation');
    expect(zh.t('research.context.modeValue.sampled')).toBe('抽样');
    expect(en.t('research.context.modeValue.sampled')).toBe('Sampled');
    expect(zh.t('gold.title')).toBe('Gold 标注');
    expect(en.t('gold.title')).toBe('Gold Annotation');
    expect(zh.t('benchmark.title')).toBe('AI 解析基准测试');
    expect(en.t('benchmark.title')).toBe('AI Benchmark');
    await en.changeLanguage('zh-CN');
    expect(record).toEqual(before);
  });

  it('keeps the zh-CN and en translation trees aligned, including interpolation placeholders', () => {
    const zh = flattenStrings(resources['zh-CN'].translation);
    const en = flattenStrings(resources.en.translation);
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());

    const placeholders = (text: string) => [...text.matchAll(/{{\s*([^}]+?)\s*}}/g)]
      .map((match) => match[1].trim())
      .sort();
    for (const key of Object.keys(zh)) {
      expect(placeholders(zh[key]), `${key} placeholders`).toEqual(placeholders(en[key]));
    }
  });

  it('does not alter isolated persisted records when the locale changes zh → en → zh', async () => {
    const instance = await createTestI18n('zh-CN');
    const records = [
      { id: 'case-a', title: '原始案件标题', claimType: 'economic_compensation', outcome: 'supported' },
      { id: 'gold-a', claimExtractionStatus: 'correct', goldOutcome: 'partially_supported' },
      { id: 'benchmark-a', eligibleClaims: 8, results: [{ claimId: 'claim-1', candidate: 'unclear' }] },
      { id: 'pipeline-a', status: 'technical_failure', failureCode: 'schema_invalid' },
    ];
    const persisted = new Map<string, string>(records.map((record) => [record.id, JSON.stringify(record)]));
    const before = createHash('sha256').update(JSON.stringify([...persisted])).digest('hex');

    await instance.changeLanguage('en');
    await instance.changeLanguage('zh-CN');

    const after = createHash('sha256').update(JSON.stringify([...persisted])).digest('hex');
    expect(after).toBe(before);
    expect(JSON.parse(persisted.get('case-a')!).title).toBe('原始案件标题');
  });

  it('renders the local import workspace in the selected language without invoking import actions', async () => {
    const zh = await createTestI18n('zh-CN');
    const en = await createTestI18n('en');
    const render = (instance: typeof zh) => renderToStaticMarkup(createElement(
      I18nextProvider,
      { i18n: instance },
      createElement(ImportCases),
    ));

    const chineseMarkup = render(zh);
    const englishMarkup = render(en);
    expect(chineseMarkup).toContain('数据导入与本地解析中心');
    expect(chineseMarkup).toContain('导入网页 (.html / .mht)');
    expect(englishMarkup).toContain('Local Document Import and Parsing');
    expect(englishMarkup).toContain('Import Web Page (.html / .mht)');
    expect(englishMarkup).not.toContain('数据导入与本地解析中心');
  });

  it('renders crawler and API test controls in both languages without changing request configuration', async () => {
    const zh = await createTestI18n('zh-CN');
    const en = await createTestI18n('en');
    const config = { province: ['广东省'], caseLevel: ['一审', '二审'], endpoint: '/api/v1/lawcases/search', page: 1 };
    const before = structuredClone(config);
    const render = (instance: typeof zh, component: typeof LaborInfoCrawlerComponent) => renderToStaticMarkup(createElement(
      I18nextProvider,
      { i18n: instance },
      createElement(component),
    ));

    const crawlerZh = render(zh, LaborInfoCrawlerComponent);
    const crawlerEn = render(en, LaborInfoCrawlerComponent);
    expect(crawlerZh).toContain('开始批量采集任务');
    expect(crawlerEn).toContain('Start Batch Crawl');
    expect(crawlerEn).toContain('Batch Collection and Case Construction');
    expect(crawlerEn).not.toContain('开始批量采集任务');

    const apiZh = render(zh, LaborInfoApiTest);
    const apiEn = render(en, LaborInfoApiTest);
    expect(apiZh).toContain('工劳网 API 基础域名');
    expect(apiEn).toContain('LaborInfoCN API Base URL');
    expect(zh.t('dataManagement.apiTestUi.copy023')).toBe('请求 URL:');
    expect(en.t('dataManagement.apiTestUi.copy023')).toBe('Request URL:');
    expect(apiEn).toContain('LaborInfoCN API Connection and Import Test');
    expect(apiEn).not.toContain('工劳网 API 连通性与入库测试');
    expect(render(zh, LaborInfoImportHistory)).toContain('工劳网文书总数');
    expect(render(en, LaborInfoImportHistory)).toContain('Total LaborInfoCN Documents');
    expect(config).toEqual(before);
  });

  it('renders review, parser test, and dataset builder controls in both languages without changing records', async () => {
    const zh = await createTestI18n('zh-CN');
    const en = await createTestI18n('en');
    const records = {
      review: { reviewStatus: 'approved', claims: [{ claimName: '加班工资', supportStatus: 'supported' }] },
      parser: { caseLevel: '二审', overallResult: 'partially_supported' },
      dataset: { score: 80, isIncludedInAnalysisSet: true },
    };
    const before = structuredClone(records);
    const render = (instance: typeof zh, component: typeof LaborInfoReview) => renderToStaticMarkup(createElement(
      I18nextProvider,
      { i18n: instance },
      createElement(component),
    ));

    expect(render(zh, LaborInfoReview)).toContain('数据质量监控与人工审核');
    expect(render(en, LaborInfoReview)).toContain('Data Quality Monitoring and Human Review');
    expect(en.t('dataManagement.reviewPanelUi.copy054')).toBe('Save Changes');
    expect(en.t('dataManagement.reviewPanelUi.approvedPlain')).toBe('Approved');
    expect(render(zh, LaborInfoParserTest)).toContain('工劳网案例结构化解析测试');
    expect(render(en, LaborInfoParserTest)).toContain('LaborInfoCN Structured Case Parsing Test');
    expect(en.t('dataManagement.parserTestUi.startParsing', { count: 2 })).toContain('2 documents');
    expect(en.t('dataManagement.parserTestUi.copy031')).toBe('Parsed Result JSON');
    expect(render(zh, DatasetBuilderTest)).toContain('广深莞劳动争议分析数据集构建');
    expect(render(en, DatasetBuilderTest)).toContain('Labor Dispute Dataset Builder');
    expect(en.t('dataManagement.datasetBuilderUi.included')).toBe('Included in Analysis');
    await en.changeLanguage('zh-CN');
    expect(records).toEqual(before);
  });

  it('renders the research workspace in both languages and preserves research identifiers', async () => {
    const zh = await createTestI18n('zh-CN');
    const en = await createTestI18n('en');
    const context = { initialSnapshotId: 'snapshot-123', selectedAnalysisRunId: 'run-123' };
    const before = structuredClone(context);
    const render = (instance: typeof zh) => renderToStaticMarkup(createElement(I18nextProvider, { i18n: instance },
      createElement(ResearchWorkspace, {
        ...context,
        onSnapshotSelect: () => {},
        onOpenLaborAnalytics: () => {},
        onOpenDefenseAnalysis: () => {},
        onOpenDataManagement: () => {},
      })));
    expect(render(zh)).toContain('研究工作区');
    expect(render(en)).toContain('Research Workspace');
    expect(render(en)).toContain('Create Research Population');
    expect(context).toEqual(before);
  });

  it('provides bilingual case detail labels while keeping outcome codes untouched', async () => {
    const zh = await createTestI18n('zh-CN');
    const en = await createTestI18n('en');
    const caseData = { id: 'case-fixture', rawDocumentId: '', source: 'fixture', title: '张某劳动争议', caseNumber: '（2020）测试号', year: 2020, arbitrationCommittee: '测试仲裁委', applicant: '张某', respondent: '某公司', applicantIsEmployee: true, claims: ['请求支付工资'], facts: '', tribunalReasoning: '', decision: '', decisionOutcome: '部分支持', legalBasis: [], disputeTags: [], parseStatus: 'parsed', parseQuality: { overall: 80 }, parsedAt: '2020-01-01' };
    const before = structuredClone(caseData);
    const render = (instance: typeof zh) => renderToStaticMarkup(createElement(I18nextProvider, { i18n: instance }, createElement(CaseDetailModal, { caseItem: caseData as never, onClose: () => {} })));
    expect(render(zh)).toContain('本地文本画像与研判');
    expect(render(en)).toContain('Local Text Profile and Analysis');
    expect(render(en)).toContain('Close Window');
    await en.changeLanguage('zh-CN');
    expect(caseData).toEqual(before);
  });

  it('provides bilingual Case Analysis labels and statuses without changing case data', async () => {
    const zh = await createTestI18n('zh-CN');
    const en = await createTestI18n('en');
    const caseData = { caseId: 'case-fixture', title: '张某劳动争议', claimType: 'overtime_pay', outcome: 'partially_supported' };
    const before = structuredClone(caseData);
    const source = readFileSync(new URL('../../src/components/CaseAnalysisView.tsx', import.meta.url), 'utf8');
    expect(source).toContain("t('finalUi.caseAnalysis.copy003')");
    expect(source).toContain("t('finalUi.caseAnalysis.copy004')");
    expect(zh.t('finalUi.caseAnalysis.copy003')).toBe('案例浏览');
    expect(en.t('finalUi.caseAnalysis.copy003')).toBe('Browse Cases');
    expect(zh.t('status.partiallySupported')).toBe('部分支持');
    expect(en.t('status.partiallySupported')).toBe('Partially Supported');
    const render = (instance: typeof zh) => renderToStaticMarkup(createElement(I18nextProvider, { i18n: instance }, createElement(CaseAnalysisView, { records: [] })));
    expect(render(zh)).toContain('加载');
    expect(render(en)).toContain('Loading');
    await en.changeLanguage('zh-CN');
    expect(caseData).toEqual(before);
  });
});
