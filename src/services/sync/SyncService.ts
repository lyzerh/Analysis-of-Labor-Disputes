import { db } from '../../db';
import { DataSourceAdapter } from '../dataSource/DataSourceAdapter';
import { ShenzhenArbitrationAdapter, RateLimitError, CorsBlockedError } from '../dataSource/ShenzhenArbitrationAdapter';
import { MockDataSourceAdapter } from '../dataSource/MockDataSourceAdapter';
import { ShenzhenArbitrationParser } from '../parser/ShenzhenArbitrationParser';
import { SyncTask, SyncLog, RawDocument } from '../../types';

export class SyncService {
  private static instance: SyncService;
  private currentAdapter: DataSourceAdapter;
  private parser: ShenzhenArbitrationParser;
  private activeTask: SyncTask | null = null;
  private isPaused = false;
  private isStopped = false;
  private listeners: Array<(task: SyncTask) => void> = [];

  private constructor() {
    this.currentAdapter = new ShenzhenArbitrationAdapter();
    this.parser = new ShenzhenArbitrationParser();
  }

  public static getInstance(): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService();
    }
    return SyncService.instance;
  }

  public setAdapter(useMock: boolean): void {
    this.currentAdapter = useMock ? new MockDataSourceAdapter() : new ShenzhenArbitrationAdapter();
  }

  public getAdapterName(): string {
    return this.currentAdapter.name;
  }

  public isUsingMock(): boolean {
    return this.currentAdapter.id === 'mock_shenzhen_hrss';
  }

  public subscribe(fn: (task: SyncTask) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private notify(task: SyncTask): void {
    this.activeTask = task;
    this.listeners.forEach((fn) => fn({ ...task }));
  }

  public async getLatestTask(): Promise<SyncTask | null> {
    const list = await db.syncTasks.orderBy('updatedAt').reverse().limit(1).toArray();
    return list.length > 0 ? list[0] : null;
  }

  public async getLogs(taskId?: string, limit = 100): Promise<SyncLog[]> {
    if (taskId) {
      return db.syncLogs.where('taskId').equals(taskId).reverse().limit(limit).toArray();
    }
    return db.syncLogs.orderBy('id').reverse().limit(limit).toArray();
  }

  public async clearLogs(): Promise<void> {
    await db.syncLogs.clear();
  }

  private async log(taskId: string, level: SyncLog['level'], message: string, details?: string): Promise<void> {
    const logItem: SyncLog = {
      taskId,
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      level,
      message,
      details,
    };
    try {
      await db.syncLogs.add(logItem);
    } catch (_) {}
  }

  /**
   * 启动同步任务
   */
  public async startSync(delayMs = 2000): Promise<SyncTask> {
    if (this.activeTask && this.activeTask.status === 'running') {
      return this.activeTask;
    }

    this.isPaused = false;
    this.isStopped = false;

    const taskId = `sync_${Date.now()}`;
    const task: SyncTask = {
      id: taskId,
      source: this.currentAdapter.name,
      status: 'running',
      totalDiscovered: 0,
      totalFetched: 0,
      totalParsed: 0,
      totalDuplicates: 0,
      totalErrors: 0,
      currentStep: '正在初始化数据源...',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.syncTasks.put(task);
    this.notify(task);
    await this.log(taskId, 'info', `🚀 开始同步任务: ${this.currentAdapter.name}`);

    // 异步执行同步流
    this.runSyncPipeline(task, delayMs);

    return task;
  }

  public pauseSync(): void {
    if (this.activeTask && this.activeTask.status === 'running') {
      this.isPaused = true;
      this.activeTask.status = 'paused';
      this.activeTask.currentStep = '任务已暂停';
      this.activeTask.updatedAt = new Date().toISOString();
      db.syncTasks.put(this.activeTask);
      this.notify(this.activeTask);
      this.log(this.activeTask.id, 'warn', '⏸️ 同步任务已由用户暂停');
    }
  }

  public resumeSync(delayMs = 2000): void {
    if (this.activeTask && this.activeTask.status === 'paused') {
      this.isPaused = false;
      this.activeTask.status = 'running';
      this.activeTask.currentStep = '正在继续同步...';
      this.activeTask.updatedAt = new Date().toISOString();
      db.syncTasks.put(this.activeTask);
      this.notify(this.activeTask);
      this.log(this.activeTask.id, 'info', '▶️ 正在继续同步任务');
      this.runSyncPipeline(this.activeTask, delayMs);
    }
  }

  public stopSync(): void {
    if (this.activeTask) {
      this.isStopped = true;
      this.isPaused = false;
      this.activeTask.status = 'completed';
      this.activeTask.currentStep = '任务已由用户手动停止';
      this.activeTask.completedAt = new Date().toISOString();
      this.activeTask.updatedAt = new Date().toISOString();
      db.syncTasks.put(this.activeTask);
      this.notify(this.activeTask);
      this.log(this.activeTask.id, 'warn', '⏹️ 同步任务已停止');
    }
  }

  private async runSyncPipeline(task: SyncTask, delayMs: number): Promise<void> {
    const taskId = task.id;

    try {
      // 1. 扫描页面列表
      task.currentStep = '正在扫描公开目录分页...';
      this.notify(task);
      await this.log(taskId, 'info', '正在扫描公开文书目录分页...');

      const pages = await this.currentAdapter.discoverPages();
      await this.log(taskId, 'success', `发现 ${pages.length} 个文书目录分页`);

      for (let pIndex = 0; pIndex < pages.length; pIndex++) {
        if (this.isStopped) break;
        while (this.isPaused) {
          await new Promise((r) => setTimeout(r, 500));
          if (this.isStopped) break;
        }

        const page = pages[pIndex];
        task.currentStep = `正在扫描第 ${page.pageNumber} 页文书清单...`;
        this.notify(task);
        await this.log(taskId, 'info', `正在检索第 ${page.pageNumber} 页文书列表 (${page.url})`);

        const docLinks = await this.currentAdapter.discoverDocuments(page.url);
        task.totalDiscovered += docLinks.length;
        this.notify(task);
        await this.log(taskId, 'info', `第 ${page.pageNumber} 页发现 ${docLinks.length} 份文书`);

        // 2. 逐份抓取与解析 (串行低频并发控制)
        for (let dIndex = 0; dIndex < docLinks.length; dIndex++) {
          if (this.isStopped) break;
          while (this.isPaused) {
            await new Promise((r) => setTimeout(r, 500));
            if (this.isStopped) break;
          }

          const link = docLinks[dIndex];
          task.currentStep = `正在处理 (${task.totalFetched + 1}/${task.totalDiscovered}): ${link.title.slice(0, 20)}...`;
          this.notify(task);

          try {
            // URL 去重检查
            const existingByUrl = await db.rawDocuments.where('sourceUrl').equals(link.url).first();
            if (existingByUrl) {
              task.totalDuplicates++;
              task.totalFetched++;
              this.notify(task);
              await this.log(taskId, 'warn', `文书已存在 (URL匹配): ${link.title.slice(0, 25)}`);
              continue;
            }

            // 礼貌延时
            if (delayMs > 0) {
              await new Promise((r) => setTimeout(r, delayMs));
            }

            const rawDoc: RawDocument = await this.currentAdapter.fetchDocument(link.url, link);
            task.totalFetched++;

            // Content Hash 去重检查
            const existingByHash = await db.rawDocuments.where('contentHash').equals(rawDoc.contentHash).first();
            if (existingByHash) {
              rawDoc.duplicateOf = existingByHash.id;
              task.totalDuplicates++;
              await this.log(taskId, 'warn', `内容完全重复 (Hash匹配 #${existingByHash.id}): ${rawDoc.title.slice(0, 25)}`);
            }

            // 存入 RawDocument
            await db.rawDocuments.put(rawDoc);

            // 本地解析
            const parsedCase = await this.parser.parse(rawDoc);
            await db.arbitrationCases.put(parsedCase);

            task.totalParsed++;
            task.updatedAt = new Date().toISOString();
            await db.syncTasks.put(task);
            this.notify(task);

            await this.log(
              taskId,
              'success',
              `✅ 成功入库: ${parsedCase.caseNumber} (质量评分: ${parsedCase.parseQuality.overall}分)`
            );
          } catch (err: any) {
            task.totalErrors++;
            this.notify(task);

            if (err instanceof RateLimitError) {
              await this.log(taskId, 'error', '⚠️ 收到 429/403 访问频率限制，任务已自动安全暂停', err.message);
              this.pauseSync();
              return;
            } else if (err instanceof CorsBlockedError) {
              await this.log(
                taskId,
                'error',
                '🛡️ 服务端采集通道受阻或无法连接。请切换至「本地测试数据集」，或通过「数据导入」直接拖入 HTML / MHT 文件',
                err.message
              );
              this.stopSync();
              return;
            } else {
              await this.log(taskId, 'error', `处理文书失败 [${link.title.slice(0, 20)}]: ${err.message || '未知错误'}`);
            }
          }
        }
      }

      task.status = 'completed';
      task.currentStep = `同步完成！共发现 ${task.totalDiscovered} 份，成功入库 ${task.totalParsed} 份，重复 ${task.totalDuplicates} 份`;
      task.completedAt = new Date().toISOString();
      task.updatedAt = new Date().toISOString();
      await db.syncTasks.put(task);
      this.notify(task);
      await this.log(taskId, 'success', `🎉 同步流程执行完毕: 入库 ${task.totalParsed} 份, 重复 ${task.totalDuplicates} 份, 错误 ${task.totalErrors} 份`);
    } catch (globalErr: any) {
      task.status = 'error';
      task.errorMessage = globalErr.message;
      task.currentStep = `同步异常中断: ${globalErr.message}`;
      task.updatedAt = new Date().toISOString();
      await db.syncTasks.put(task);
      this.notify(task);
      await this.log(taskId, 'error', `💥 同步流程致命错误: ${globalErr.message}`);
    }
  }
}
