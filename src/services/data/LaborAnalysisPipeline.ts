import {
  RawDocument,
  AnalysisCaseRecord,
  LaborInfoParsedResult,
  ParserReviewRecord,
  DatasetBuildSummary,
  ParserEvaluationReport,
} from '../../types';
import { LaborInfoParserAdapter } from '../parser/LaborInfoParserAdapter';
import { ParserEvaluator } from '../parser/ParserEvaluator';
import { ReviewStorageService } from './ReviewStorageService';
import { LaborCaseDatasetBuilder } from '../dataset/LaborCaseDatasetBuilder';
import { DataService } from './dataService';
import { db } from '../../db';

export interface PipelineProcessStats {
  totalRaw: number;
  filteredNonLaborinfo: number;
  emptyText: number;
  alreadyProcessed: number;
  parsedSuccess: number;
  parsedFailed: number;
  includedInAnalysisSet: number;
  pendingOptimization: number;
  reviewedApproved: number;
  reviewedModified: number;
}

export interface PipelineFailedItem {
  sourceId: string;
  docId: string;
  title: string;
  error: string;
  time: string;
}

export interface PipelineResult {
  records: AnalysisCaseRecord[];
  summary: DatasetBuildSummary;
  stats: PipelineProcessStats;
  failedItems: PipelineFailedItem[];
}

export interface DataPipelineHealthStats {
  apiFoundTotal: number;
  rawDocumentsSaved: number;
  parsedSuccessCount: number;
  evaluatorQualifiedCount: number;
  analysisAvailableCount: number;
  pendingReviewCount: number;
  failedCount: number;
  layers: Array<{
    id: string;
    name: string;
    description: string;
    count: number;
    subText?: string;
    status: 'healthy' | 'warning' | 'error';
    rateText?: string;
  }>;
}

/**
 * 案例分析入库流水线服务 (LaborAnalysisPipeline)
 * 职责：
 * 1. 将 IndexedDB rawDocuments 表中的 laborinfo 裁判文书转换为标准 AnalysisCaseRecord
 * 2. 串联完整标准流水线：
 *    RawDocument -> LaborInfoParserAdapter -> LaborInfoParsedResult -> ParserEvaluator -> ReviewStorage -> AnalysisCaseRecord
 * 3. 严格数据准入控制：
 *    reviewStatus === 'approved' 或 parserScore >= 80 -> isIncludedInAnalysisSet = true
 *    否则 -> isIncludedInAnalysisSet = false, 进入待优化池
 * 4. 严禁分析引擎直接消费 RawDocument，确保数据血缘可溯
 */
export class LaborAnalysisPipeline {
  private static cachedRecords: AnalysisCaseRecord[] | null = null;
  private static cachedFailedItems: PipelineFailedItem[] = [];
  private static lastRunTimestamp: number = 0;

  /**
   * 清除内存缓存
   */
  public static clearCache(): void {
    this.cachedRecords = null;
    this.cachedFailedItems = [];
    this.lastRunTimestamp = 0;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('labor-data-updated'));
    }
  }

  /**
   * 处理单篇 RawDocument 文书转换为 AnalysisCaseRecord
   */
  public static processRawDocument(
    rawDoc: RawDocument,
    reviewRecord?: ParserReviewRecord | null
  ): {
    record: AnalysisCaseRecord | null;
    parsedResult?: LaborInfoParsedResult;
    evalReport?: ParserEvaluationReport;
    error?: string;
  } {
    // 1. 来源与正文校验
    if (rawDoc.source !== 'laborinfo') {
      return {
        record: null,
        error: `非工劳网文书 (source: ${rawDoc.source})，跳过处理`,
      };
    }

    const text = (rawDoc.rawText || '').trim();
    if (!text) {
      return {
        record: null,
        error: '裁判文书正文内容为空，无法进行结构化解析',
      };
    }

    try {
      // 2. 结构化解析
      const parsedResult = LaborInfoParserAdapter.parseDetailed(rawDoc);

      // 3. 质量评估
      const evalReport = ParserEvaluator.evaluate(parsedResult, text);

      // 4. 读取人工审核
      const review = reviewRecord !== undefined
        ? reviewRecord
        : ReviewStorageService.getReview(rawDoc.id);

      // 5. 构建标准分析记录
      const record = LaborCaseDatasetBuilder.buildSingleRecord(rawDoc, review);

      return {
        record,
        parsedResult,
        evalReport,
      };
    } catch (err: any) {
      return {
        record: null,
        error: err.message || '结构化解析或质量评估异常',
      };
    }
  }

  /**
   * 执行全量流水线转换
   */
  public static async runPipeline(options?: {
    forceReparse?: boolean;
    onProgress?: (current: number, total: number, latestTitle: string) => void;
  }): Promise<PipelineResult> {
    const rawDocs = await DataService.getLaborInfoRawDocuments(0); // 获取全部 laborinfo 文书
    const reviews = ReviewStorageService.getAllReviews();

    const records: AnalysisCaseRecord[] = [];
    const failedItems: PipelineFailedItem[] = [];

    const stats: PipelineProcessStats = {
      totalRaw: rawDocs.length,
      filteredNonLaborinfo: 0,
      emptyText: 0,
      alreadyProcessed: 0,
      parsedSuccess: 0,
      parsedFailed: 0,
      includedInAnalysisSet: 0,
      pendingOptimization: 0,
      reviewedApproved: 0,
      reviewedModified: 0,
    };

    const seenSourceIds = new Set<string>();

    for (let i = 0; i < rawDocs.length; i++) {
      const doc = rawDocs[i];

      if (options?.onProgress) {
        options.onProgress(i + 1, rawDocs.length, doc.title || '处理中文书');
      }

      if (doc.source !== 'laborinfo') {
        stats.filteredNonLaborinfo++;
        continue;
      }

      const text = (doc.rawText || '').trim();
      if (!text) {
        stats.emptyText++;
        continue;
      }

      const sid = String(doc.sourceId || doc.id).trim();
      if (seenSourceIds.has(sid)) {
        stats.alreadyProcessed++;
        continue;
      }
      seenSourceIds.add(sid);

      const review = reviews[doc.id] || null;
      const processRes = this.processRawDocument(doc, review);

      if (processRes.record) {
        stats.parsedSuccess++;
        if (processRes.record.isIncludedInAnalysisSet) {
          stats.includedInAnalysisSet++;
        } else {
          stats.pendingOptimization++;
        }

        if (processRes.record.reviewStatus === 'approved') {
          stats.reviewedApproved++;
        } else if (processRes.record.reviewStatus === 'modified') {
          stats.reviewedModified++;
        }

        records.push(processRes.record);
      } else {
        stats.parsedFailed++;
        failedItems.push({
          sourceId: sid,
          docId: doc.id,
          title: doc.title || '未命名文书',
          error: processRes.error || '解析失败',
          time: new Date().toISOString(),
        });
      }
    }

    const summary = LaborCaseDatasetBuilder.summarizeDataset(records, rawDocs.length);

    this.cachedRecords = records;
    this.cachedFailedItems = failedItems;
    this.lastRunTimestamp = Date.now();

    return {
      records,
      summary,
      stats,
      failedItems,
    };
  }

  /**
   * 获取所有分析案例记录 (自动懒加载并缓存)
   */
  public static async getAllAnalysisRecords(forceRefresh = false): Promise<AnalysisCaseRecord[]> {
    if (!forceRefresh && this.cachedRecords && this.cachedRecords.length > 0) {
      return this.cachedRecords;
    }
    const result = await this.runPipeline({ forceReparse: forceRefresh });
    return result.records;
  }

  /**
   * 获取失败文书列表
   */
  public static getFailedItems(): PipelineFailedItem[] {
    return this.cachedFailedItems;
  }

  /**
   * 反向溯源：通过 AnalysisCaseRecord 定位 RawDocument 原始文书
   */
  public static async getRawDocumentForRecord(record: AnalysisCaseRecord): Promise<RawDocument | null> {
    if (record.rawDocumentId) {
      const doc = await db.rawDocuments.get(record.rawDocumentId);
      if (doc) return doc;
    }
    // 次选 sourceId 查找
    const sourceId = record.caseId.replace(/^case_/, '').replace(/^analysis_/, '');
    const docBySource = await db.rawDocuments
      .filter((d) => d.source === 'laborinfo' && String(d.sourceId) === sourceId)
      .first();
    return docBySource || null;
  }

  /**
   * 数据链路健康检查与状态汇总
   */
  public static async getPipelineHealthStats(): Promise<DataPipelineHealthStats> {
    const rawDocs = await DataService.getLaborInfoRawDocuments(0);
    const crawlTasks = await DataService.getAllCrawlTasks();

    let apiFoundTotal = 0;
    for (const t of crawlTasks) {
      apiFoundTotal = Math.max(apiFoundTotal, t.totalCountInApi || 0, t.found || 0);
    }
    if (apiFoundTotal === 0 && rawDocs.length > 0) {
      apiFoundTotal = rawDocs.length;
    }

    const records = await this.getAllAnalysisRecords();
    const qualifiedRecords = records.filter((r) => r.isIncludedInAnalysisSet);
    const pendingReviewRecords = records.filter((r) => !r.isIncludedInAnalysisSet);
    const failedCount = this.cachedFailedItems.length;

    const layers = [
      {
        id: 'api',
        name: '工劳网公开裁判文书库 (API)',
        description: '公开检索与分页获取',
        count: apiFoundTotal,
        subText: `检索到可用文书总量`,
        status: 'healthy' as const,
        rateText: '100%',
      },
      {
        id: 'raw',
        name: '原始文书存储层 (RawDocument)',
        description: '正文完整性校验与去重入库',
        count: rawDocs.length,
        subText: `已入库 ${rawDocs.length} 篇真实裁判文书`,
        status: rawDocs.length > 0 ? ('healthy' as const) : ('warning' as const),
        rateText: apiFoundTotal > 0 ? `${Math.min(100, Math.round((rawDocs.length / apiFoundTotal) * 100))}%` : '100%',
      },
      {
        id: 'parser',
        name: '结构化解析层 (Parser)',
        description: '当事人、诉求、抗辩、证据与裁判理由提取',
        count: records.length,
        subText: `成功解析 ${records.length} 篇 (失败 ${failedCount} 篇)`,
        status: failedCount > 0 && records.length === 0 ? ('error' as const) : ('healthy' as const),
        rateText: rawDocs.length > 0 ? `${Math.round((records.length / rawDocs.length) * 100)}%` : '0%',
      },
      {
        id: 'evaluator',
        name: '质量评估与准入层 (Evaluator)',
        description: '完整度评分与人工核准质检门槛',
        count: qualifiedRecords.length,
        subText: `达标准入 ${qualifiedRecords.length} 篇 | 待优化池 ${pendingReviewRecords.length} 篇`,
        status: qualifiedRecords.length > 0 ? ('healthy' as const) : ('warning' as const),
        rateText: records.length > 0 ? `${Math.round((qualifiedRecords.length / records.length) * 100)}%` : '0%',
      },
      {
        id: 'analytics',
        name: '案件分析与策略引擎 (Analytics Engine)',
        description: '基础统计与企业抗辩关联分析消费',
        count: qualifiedRecords.length,
        subText: `已向分析引擎提供 ${qualifiedRecords.length} 篇有效案例`,
        status: qualifiedRecords.length > 0 ? ('healthy' as const) : ('warning' as const),
        rateText: '100% 消费就绪',
      },
    ];

    return {
      apiFoundTotal,
      rawDocumentsSaved: rawDocs.length,
      parsedSuccessCount: records.length,
      evaluatorQualifiedCount: qualifiedRecords.length,
      analysisAvailableCount: qualifiedRecords.length,
      pendingReviewCount: pendingReviewRecords.length,
      failedCount,
      layers,
    };
  }
}
