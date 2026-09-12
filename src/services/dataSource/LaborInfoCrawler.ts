import { LaborInfoAdapter } from './LaborInfoAdapter';
import { DataService } from '../data/dataService';
import { LaborAnalysisPipeline } from '../data/LaborAnalysisPipeline';
import {
  LaborInfoCrawlParams,
  LaborInfoCrawlTask,
  LaborInfoCrawlSummary,
  CrawlLogEntry,
  DocumentMetadata,
  RawDocument,
} from '../../types';
import { EXCLUDED_LABORINFO_TEST_CASE_IDS } from './LaborInfoEligibility';

export const EXCLUDED_TEST_CASE_IDS = EXCLUDED_LABORINFO_TEST_CASE_IDS;

export interface CrawlEventCallbacks {
  onProgress?: (task: LaborInfoCrawlTask) => void;
  onLog?: (log: CrawlLogEntry) => void;
  onStateChange?: (task: LaborInfoCrawlTask) => void;
}

export class LaborInfoCrawler {
  private adapter: LaborInfoAdapter;
  private currentTask: LaborInfoCrawlTask | null = null;
  private isPauseRequested = false;
  private isStopRequested = false;
  private callbacks: CrawlEventCallbacks = {};

  // 请求节流节奏控制配置
  private searchDelayMs = 800; // 搜索请求间隔 (500~1000ms)
  private detailDelayMs = 500; // 详情请求间隔 (300~800ms)
  private maxRetries = 3;      // 普通网络错误最多重试 3 次

  constructor(baseUrl = 'https://laborinfocn.com', callbacks: CrawlEventCallbacks = {}) {
    this.adapter = new LaborInfoAdapter(baseUrl);
    this.callbacks = callbacks;
  }

  public setCallbacks(callbacks: CrawlEventCallbacks) {
    this.callbacks = callbacks;
  }

  public setBaseUrl(url: string) {
    this.adapter.setBaseUrl(url);
  }

  public getBaseUrl(): string {
    return this.adapter.getBaseUrl();
  }

  public getCurrentTask(): LaborInfoCrawlTask | null {
    return this.currentTask;
  }

  /**
   * 启动全新的采集任务
   */
  public async startCrawl(
    params: LaborInfoCrawlParams,
    customTaskId?: string
  ): Promise<LaborInfoCrawlTask> {
    this.isPauseRequested = false;
    this.isStopRequested = false;

    const taskId = customTaskId || `crawl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const initialTask: LaborInfoCrawlTask = {
      id: taskId,
      params,
      currentPage: params.startPage || 1,
      totalPages: 1,
      totalCountInApi: 0,
      found: 0,
      fetched: 0,
      saved: 0,
      duplicates: 0,
      failed: 0,
      emptyText: 0,
      filteredSamples: 0,
      parsedSuccess: 0,
      parsedFailed: 0,
      includedInAnalysisSet: 0,
      pendingOptimization: 0,
      status: 'running',
      rateLimited: false,
      logs: [],
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.currentTask = initialTask;
    await this.persistAndNotifyTask();
    this.addLog('info', `启动工劳网批量采集任务 (目标最大量: ${params.maxCases} 篇，起始页: ${initialTask.currentPage})`);

    // 启动执行主循环
    this.runCrawlLoop().catch((err) => {
      console.error('Crawl loop execution error:', err);
    });

    return this.currentTask;
  }

  /**
   * 从指定任务断点继续执行采集
   */
  public async resumeCrawl(taskId: string): Promise<LaborInfoCrawlTask> {
    const existingTask = await DataService.getCrawlTaskById(taskId);
    if (!existingTask) {
      throw new Error(`未找到 ID 为 ${taskId} 的历史采集任务`);
    }

    if (existingTask.status === 'completed') {
      throw new Error(`任务 ${taskId} 已经完成，无需继续执行`);
    }

    this.isPauseRequested = false;
    this.isStopRequested = false;

    this.currentTask = {
      ...existingTask,
      status: 'running',
      rateLimited: false,
      errorMessage: undefined,
      updatedAt: new Date().toISOString(),
    };

    await this.persistAndNotifyTask();
    this.addLog('info', `从断点恢复采集任务 (当前已入库: ${this.currentTask.saved}，从第 ${this.currentTask.currentPage} 页继续)`);

    this.runCrawlLoop().catch((err) => {
      console.error('Resume crawl loop error:', err);
    });

    return this.currentTask;
  }

  /**
   * 暂停采集任务
   */
  public async pauseCrawl(): Promise<void> {
    this.isPauseRequested = true;
    if (this.currentTask && this.currentTask.status === 'running') {
      this.addLog('warn', '收到暂停指令，正在等待当前文书下载完成后暂停...');
    }
  }

  /**
   * 停止采集任务
   */
  public async stopCrawl(): Promise<void> {
    this.isStopRequested = true;
    if (this.currentTask && this.currentTask.status === 'running') {
      this.addLog('warn', '收到停止指令，正在安全退出采集流程...');
    }
  }

  /**
   * 核心采集主循环调度器
   */
  private async runCrawlLoop(): Promise<void> {
    if (!this.currentTask) return;

    const task = this.currentTask;
    const params = task.params;
    const maxCases = params.maxCases || 100;

    try {
      while (true) {
        // 检查用户控制指令
        if (this.isStopRequested) {
          task.status = 'stopped';
          task.updatedAt = new Date().toISOString();
          task.finishedAt = new Date().toISOString();
          await this.persistAndNotifyTask();
          this.addLog('warn', `采集任务已手动停止。本次累计成功入库 ${task.saved} 篇，重复跳过 ${task.duplicates} 篇。`);
          break;
        }

        if (this.isPauseRequested) {
          task.status = 'paused';
          task.updatedAt = new Date().toISOString();
          await this.persistAndNotifyTask();
          this.addLog('info', `采集任务已安全暂停。可在历史任务中随时点击「继续任务」从第 ${task.currentPage} 页断点续传。`);
          break;
        }

        // 检查终止条件：累计已处理文书达到 maxCases
        const totalProcessed = task.saved + task.duplicates;
        if (totalProcessed >= maxCases) {
          task.status = 'completed';
          task.updatedAt = new Date().toISOString();
          task.finishedAt = new Date().toISOString();
          await this.persistAndNotifyTask();
          this.addLog('success', `已达到本次设定的采集上限 (${maxCases} 篇)。采集任务顺利完成！`);
          break;
        }

        // 1. 发起分页检索请求（含防限流与重试）
        this.addLog('info', `正在检索第 ${task.currentPage} 页文书列表 (每页 ${params.per_page} 条)...`);
        
        let searchResult: {
          items: DocumentMetadata[];
          total: number;
          page: number;
          perPage: number;
          rawResponse?: any;
        };

        try {
          searchResult = await this.executeWithRetry(
            () =>
              this.adapter.searchCases({
                province: params.province,
                caseLevel: params.caseLevel,
                start_date: params.start_date,
                end_date: params.end_date,
                page: task.currentPage,
                per_page: params.per_page,
                q: params.q,
              }),
            `搜索第 ${task.currentPage} 页`
          );
        } catch (searchErr: any) {
          // 判断是否遭遇限流 / 403 / 429
          if (this.isRateLimitError(searchErr)) {
            task.status = 'paused';
            task.rateLimited = true;
            task.errorMessage = '数据源限制访问，采集任务已暂停。';
            task.updatedAt = new Date().toISOString();
            await this.persistAndNotifyTask();
            this.addLog('error', '⚠️ 数据源限制访问，采集任务已自动暂停，避免触发封禁。请稍后重试。');
            break;
          }

          // 常规不可恢复错误
          task.status = 'failed';
          task.errorMessage = searchErr.message || '检索接口发生不可恢复异常';
          task.updatedAt = new Date().toISOString();
          await this.persistAndNotifyTask();
          this.addLog('error', `检索第 ${task.currentPage} 页失败: ${task.errorMessage}`);
          break;
        }

        // 解析元数据
        const metaTotalPages =
          searchResult.rawResponse?.meta?.total_pages ||
          (searchResult.total > 0 ? Math.ceil(searchResult.total / searchResult.perPage) : 1);
        task.totalPages = metaTotalPages || 1;
        task.totalCountInApi = searchResult.total || searchResult.rawResponse?.meta?.total_count || 0;

        const rawItems = searchResult.items || [];
        this.addLog('info', `第 ${task.currentPage} / ${task.totalPages} 页检索完成，获取到 ${rawItems.length} 条案件元数据 (API 库内总计 ${task.totalCountInApi} 篇)`);

        if (rawItems.length === 0) {
          task.status = 'completed';
          task.updatedAt = new Date().toISOString();
          task.finishedAt = new Date().toISOString();
          await this.persistAndNotifyTask();
          this.addLog('success', `当前查询条件已无更多文书，采集任务完成。`);
          break;
        }

        // 2. 过滤固定测试样本
        const validItemsToProcess: DocumentMetadata[] = [];
        for (const item of rawItems) {
          const sid = String(item.sourceId).trim();
          if (EXCLUDED_TEST_CASE_IDS.has(sid)) {
            task.filteredSamples++;
            this.addLog('warn', `跳过固定测试样本文书 (ID: ${sid}, 标题: ${item.title})`);
          } else {
            validItemsToProcess.push(item);
          }
        }

        task.found += validItemsToProcess.length;
        await this.persistAndNotifyTask();

        // 3. 逐篇串行下载全文并入库 (严禁并发 Promise.all)
        for (const meta of validItemsToProcess) {
          // 检查用户中断
          if (this.isStopRequested || this.isPauseRequested) {
            break;
          }

          // 检查采集数量上限
          if (task.saved + task.duplicates >= maxCases) {
            this.addLog('info', `已采集达到上限 (${maxCases} 篇)，停止处理当前页剩余文书`);
            break;
          }

          // 详情请求间隔节流
          await this.sleep(this.detailDelayMs);

          task.fetched++;
          this.addLog('info', `[${task.saved + task.duplicates + 1}/${maxCases}] 正在下载文书详情: ${meta.title} (ID: ${meta.sourceId})...`);

          let rawDoc: RawDocument;
          try {
            rawDoc = await this.executeWithRetry(
              () => this.adapter.fetchCaseDetail(meta.sourceId, meta),
              `获取文书详情 ${meta.sourceId}`
            );
          } catch (detailErr: any) {
            if (this.isRateLimitError(detailErr)) {
              task.status = 'paused';
              task.rateLimited = true;
              task.errorMessage = '数据源限制访问，采集任务已暂停。';
              task.updatedAt = new Date().toISOString();
              await this.persistAndNotifyTask();
              this.addLog('error', '⚠️ 数据源限制访问，采集任务已自动暂停。');
              return;
            }

            task.failed++;
            this.addLog('error', `下载案件 ${meta.sourceId} 详情失败: ${detailErr.message}`);
            await this.persistAndNotifyTask();
            continue;
          }

          // 4. 校验正文完整性 (fbqw 优先)
          const textLength = rawDoc.rawText?.length || 0;
          if (!rawDoc.rawText || !rawDoc.rawText.trim()) {
            task.failed++;
            task.emptyText = (task.emptyText || 0) + 1;
            this.addLog('warn', `案件 ${meta.sourceId} 正文内容为空，按数据完整性原则拒绝入库`);
            await this.persistAndNotifyTask();
            continue;
          }

          // 5. 调用 DataService 保存并执行 sourceId + contentHash 严格去重
          try {
            const saveResult = await DataService.saveLaborInfoRawDocument(rawDoc);
            if (saveResult.saved) {
              task.saved++;
              this.addLog('success', `正文 ${textLength} 字符 | 成功入库 IndexedDB (docId: ${saveResult.docId})`);

              // 6. 执行流水线模式处理 (仅在非 raw_only 模式下自动触发)
              const pMode = task.params.pipelineMode || 'crawl_parse_build';
              if (pMode !== 'raw_only') {
                const pipeRes = LaborAnalysisPipeline.processRawDocument(rawDoc);
                if (pipeRes.record) {
                  task.parsedSuccess = (task.parsedSuccess || 0) + 1;
                  if (pipeRes.record.isIncludedInAnalysisSet) {
                    task.includedInAnalysisSet = (task.includedInAnalysisSet || 0) + 1;
                    this.addLog(
                      'success',
                      `[流水线] 评分 ${pipeRes.record.parserScore}分 | 准入正式分析集 (城市: ${pipeRes.record.city || '未指定'})`
                    );
                  } else {
                    task.pendingOptimization = (task.pendingOptimization || 0) + 1;
                    this.addLog(
                      'info',
                      `[流水线] 评分 ${pipeRes.record.parserScore}分 (<80分待审核) | 归入待优化池`
                    );
                  }
                } else {
                  task.parsedFailed = (task.parsedFailed || 0) + 1;
                  this.addLog('warn', `[流水线解析警告] ${pipeRes.error || '解析异常'}`);
                }
              }
            } else if (saveResult.isDuplicate) {
              task.duplicates++;
              this.addLog('warn', `文书已存在跳过 (${saveResult.reason || '重复案例'})`);
            } else {
              task.failed++;
              this.addLog('error', `保存入库失败: ${saveResult.reason || '未知原因'}`);
            }
          } catch (saveErr: any) {
            task.failed++;
            this.addLog('error', `写入本地数据库失败: ${saveErr.message}`);
          }

          task.updatedAt = new Date().toISOString();
          await this.persistAndNotifyTask();
        }

        // 如果用户在中途点击了暂停/停止，则跳出循环
        if (this.isStopRequested || this.isPauseRequested) {
          continue;
        }

        // 如果达到了最大采集数，直接完成
        if (task.saved + task.duplicates >= maxCases) {
          task.status = 'completed';
          task.updatedAt = new Date().toISOString();
          task.finishedAt = new Date().toISOString();
          LaborAnalysisPipeline.clearCache();
          await this.persistAndNotifyTask();
          this.addLog('success', `已成功采集达到目标上限 (${maxCases} 篇)，本次任务完成！`);
          break;
        }

        // 4. 检查是否已经扫描完所有可用页码
        if (task.currentPage >= task.totalPages) {
          task.status = 'completed';
          task.updatedAt = new Date().toISOString();
          task.finishedAt = new Date().toISOString();
          LaborAnalysisPipeline.clearCache();
          await this.persistAndNotifyTask();
          this.addLog('success', `已遍历全部 ${task.totalPages} 页文书，采集任务顺利完成！`);
          break;
        }

        // 翻至下一页并在请求前休眠节流
        task.currentPage++;
        task.updatedAt = new Date().toISOString();
        await this.persistAndNotifyTask();
        await this.sleep(this.searchDelayMs);
      }
    } catch (unexpectedErr: any) {
      console.error('Crawl unexpected error:', unexpectedErr);
      task.status = 'failed';
      task.errorMessage = unexpectedErr.message || '未知调度异常';
      task.updatedAt = new Date().toISOString();
      await this.persistAndNotifyTask();
      this.addLog('error', `任务出现全局异常: ${task.errorMessage}`);
    }
  }

  /**
   * 带递增退避重试的执行器
   */
  private async executeWithRetry<T>(fn: () => Promise<T>, actionName: string): Promise<T> {
    let lastError: any = null;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastError = err;
        if (this.isRateLimitError(err)) {
          // 限流错误不进行盲目重试，直接抛出交由调度器暂停
          throw err;
        }

        if (attempt < this.maxRetries) {
          const backoffDelay = attempt * 1500;
          this.addLog('warn', `${actionName} 遇到网络波动，${backoffDelay}ms 后进行第 ${attempt + 1} 次重试...`);
          await this.sleep(backoffDelay);
        }
      }
    }
    throw lastError;
  }

  /**
   * 检查是否属于数据源限流/封禁/安全拦截特征
   */
  private isRateLimitError(err: any): boolean {
    if (!err) return false;
    const msg = String(err.message || err.statusText || err).toLowerCase();
    const status = err.statusCode || err.status;

    if (status === 403 || status === 429) return true;
    if (
      msg.includes('403') ||
      msg.includes('429') ||
      msg.includes('rate limit') ||
      msg.includes('too many requests') ||
      msg.includes('验证码') ||
      msg.includes('captcha') ||
      msg.includes('限制访问') ||
      msg.includes('访问过于频繁')
    ) {
      return true;
    }
    return false;
  }

  /**
   * 记录实时运行日志
   */
  private addLog(level: 'info' | 'success' | 'warn' | 'error', message: string, details?: any) {
    if (!this.currentTask) return;

    const timeStr = new Date().toLocaleTimeString();
    const logEntry: CrawlLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      time: timeStr,
      level,
      message,
      details,
    };

    // 最多保留 200 条最新运行日志以防内存过度增长
    if (this.currentTask.logs.length >= 200) {
      this.currentTask.logs.shift();
    }
    this.currentTask.logs.push(logEntry);

    if (this.callbacks.onLog) {
      this.callbacks.onLog(logEntry);
    }
  }

  /**
   * 持久化当前任务状态到 IndexedDB 并触发回调
   */
  private async persistAndNotifyTask() {
    if (!this.currentTask) return;
    try {
      await DataService.saveCrawlTask(this.currentTask);
    } catch (e) {
      console.warn('Failed to save crawl task progress to DB:', e);
    }

    if (this.callbacks.onProgress) {
      this.callbacks.onProgress(this.currentTask);
    }
    if (this.callbacks.onStateChange) {
      this.callbacks.onStateChange(this.currentTask);
    }
  }

  /**
   * 异步延时辅助
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
