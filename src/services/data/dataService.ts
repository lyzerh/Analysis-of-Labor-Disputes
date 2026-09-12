import { db } from '../../db';
import { RawDocument, ArbitrationCase, CaseFilterOptions, DocumentContentType, LaborInfoCrawlTask } from '../../types';
import { ShenzhenArbitrationParser } from '../parser/ShenzhenArbitrationParser';
import { ParserUtils } from '../parser/ParserUtils';
import { MockDataSourceAdapter } from '../dataSource/MockDataSourceAdapter';
import { MHTParser } from '../../utils/mhtParser';

export class DataService {
  private static parser = new ShenzhenArbitrationParser();

  /**
   * 自动检查并载入示范数据集（初次使用或库为空时）
   */
  public static async seedSampleDataIfEmpty(): Promise<boolean> {
    const count = await db.arbitrationCases.count();
    if (count > 0) {
      return false;
    }

    const adapter = new MockDataSourceAdapter();
    const sampleDocs = await adapter.getAllSampleRawDocuments();

    for (const doc of sampleDocs) {
      await db.rawDocuments.put(doc);
      const parsedCase = await this.parser.parse(doc);
      await db.arbitrationCases.put(parsedCase);
    }

    return true;
  }

  /**
   * 导入 MHT/MHTML 文书文件
   */
  public static async importMhtDocument(
    file: File
  ): Promise<{ rawDoc: RawDocument; parsedCase: ArbitrationCase; isDuplicate: boolean }> {
    const parsedMht = await MHTParser.parse(file);
    if (!parsedMht.success || !parsedMht.cleanedText) {
      throw new Error(parsedMht.error || 'MHT/MHTML 文件解析失败');
    }

    const contentHash = await ParserUtils.calculateContentHash(parsedMht.cleanedText);
    const existing = await db.rawDocuments.where('contentHash').equals(contentHash).first();

    const docId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const effectiveTitle =
      parsedMht.subject ||
      parsedMht.caseNumber ||
      file.name.replace(/\.m?html?$/i, '');

    const rawDoc: RawDocument = {
      id: docId,
      source: '本地MHT/MHTML导入',
      title: effectiveTitle,
      contentType: 'html',
      rawHtml: parsedMht.rawHtml,
      rawText: parsedMht.cleanedText,
      contentHash,
      duplicateOf: existing ? existing.id : null,
      fileSize: file.size,
      fileName: file.name,
      importedAt: new Date().toISOString(),
    };

    await db.rawDocuments.put(rawDoc);
    const parsedCase = await this.parser.parse(rawDoc);
    await db.arbitrationCases.put(parsedCase);

    return { rawDoc, parsedCase, isDuplicate: !!existing };
  }

  /**
   * 导入单份纯文本或粘贴文本
   */
  public static async importTextDocument(
    text: string,
    title?: string,
    fileName?: string,
    source = '本地文件导入'
  ): Promise<{ rawDoc: RawDocument; parsedCase: ArbitrationCase; isDuplicate: boolean }> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error('文本内容为空');
    }

    const contentHash = await ParserUtils.calculateContentHash(trimmed);
    const existing = await db.rawDocuments.where('contentHash').equals(contentHash).first();

    const docId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const effectiveTitle = title || ParserUtils.extractCaseNumber(trimmed) || fileName || '未命名裁决书';

    const rawDoc: RawDocument = {
      id: docId,
      source,
      title: effectiveTitle,
      contentType: 'txt',
      rawText: trimmed,
      contentHash,
      duplicateOf: existing ? existing.id : null,
      fileSize: trimmed.length,
      fileName,
      importedAt: new Date().toISOString(),
    };

    await db.rawDocuments.put(rawDoc);
    const parsedCase = await this.parser.parse(rawDoc);
    await db.arbitrationCases.put(parsedCase);

    return { rawDoc, parsedCase, isDuplicate: !!existing };
  }

  /**
   * 导入 HTML 文件或拖入网页
   */
  public static async importHtmlDocument(
    html: string,
    title?: string,
    fileName?: string,
    source = '本地HTML导入'
  ): Promise<{ rawDoc: RawDocument; parsedCase: ArbitrationCase; isDuplicate: boolean }> {
    const trimmedHtml = html.trim();
    if (!trimmedHtml) {
      throw new Error('HTML内容为空');
    }

    let extractedText = '';
    let extractedTitle = title;

    if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
      try {
        const dom = new DOMParser().parseFromString(trimmedHtml, 'text/html');
        // 清除无效脚本和样式
        dom.querySelectorAll('script, style, noscript, nav, footer, header').forEach((el) => el.remove());

        if (!extractedTitle) {
          const tEl = dom.querySelector('title, h1, .title');
          if (tEl) extractedTitle = tEl.textContent?.trim();
        }

        const mainEl = dom.querySelector('.TRS_Editor, .article-content, #content, .content, table') || dom.body;
        extractedText = (mainEl ? mainEl.textContent : dom.body.textContent) || '';
      } catch (_) {}
    }

    if (!extractedText) {
      extractedText = trimmedHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    }

    const cleanText = extractedText.replace(/\r\n/g, '\n').trim();
    const contentHash = await ParserUtils.calculateContentHash(cleanText);
    const existing = await db.rawDocuments.where('contentHash').equals(contentHash).first();

    const docId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const effectiveTitle = extractedTitle || ParserUtils.extractCaseNumber(cleanText) || fileName || '未命名网页裁决书';

    const rawDoc: RawDocument = {
      id: docId,
      source,
      title: effectiveTitle,
      contentType: 'html',
      rawHtml: trimmedHtml,
      rawText: cleanText,
      contentHash,
      duplicateOf: existing ? existing.id : null,
      fileSize: trimmedHtml.length,
      fileName,
      importedAt: new Date().toISOString(),
    };

    await db.rawDocuments.put(rawDoc);
    const parsedCase = await this.parser.parse(rawDoc);
    await db.arbitrationCases.put(parsedCase);

    return { rawDoc, parsedCase, isDuplicate: !!existing };
  }

  /**
   * PDF 文档解析与导入 (使用 pdfjs-dist 文本提取层)
   */
  public static async importPdfDocument(
    file: File
  ): Promise<{ rawDoc: RawDocument; parsedCase: ArbitrationCase; isScanned: boolean }> {
    let extractedText = '';
    let isScanned = false;

    try {
      // 动态载入 pdfjs-dist
      const pdfjs = await import('pdfjs-dist');
      if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version || '3.11.174'}/pdf.worker.min.js`;
      }

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdf.numPages;
      const textParts: string[] = [];

      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageStr = textContent.items.map((item: any) => item.str || '').join(' ');
        textParts.push(pageStr);
      }

      extractedText = textParts.join('\n\n').trim();

      // 判断是否为扫描图片 PDF (文字层少于 50 字)
      if (extractedText.length < 50) {
        isScanned = true;
        extractedText = `【PDF文件文本层提取提示】：该PDF文件（${file.name}，共${numPages}页）主要由扫描图像构成，当前本地引擎暂未提取到有效文本层。请转换为文本或HTML后再次导入。`;
      }
    } catch (pdfErr: any) {
      console.warn('PDF Parsing warning:', pdfErr);
      extractedText = `【PDF解析提示】：未能读取文字层 (${pdfErr.message || '格式异常'})。`;
      isScanned = true;
    }

    const contentHash = await ParserUtils.calculateContentHash(extractedText);
    const existing = await db.rawDocuments.where('contentHash').equals(contentHash).first();
    const docId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const rawDoc: RawDocument = {
      id: docId,
      source: '本地PDF导入',
      title: file.name.replace(/\.pdf$/i, ''),
      contentType: 'pdf',
      rawText: extractedText,
      contentHash,
      duplicateOf: existing ? existing.id : null,
      fileSize: file.size,
      fileName: file.name,
      importedAt: new Date().toISOString(),
    };

    await db.rawDocuments.put(rawDoc);
    const parsedCase = await this.parser.parse(rawDoc);
    await db.arbitrationCases.put(parsedCase);

    return { rawDoc, parsedCase, isScanned };
  }

  /**
   * 综合检索与多条件筛选 (支持 AND / OR 逻辑)
   */
  public static async queryCases(
    filter: CaseFilterOptions = {},
    page = 1,
    pageSize = 20
  ): Promise<{ items: ArbitrationCase[]; total: number; page: number; totalPages: number }> {
    let collection = db.arbitrationCases.toCollection();
    let cases = await collection.toArray();

    // 1. 关键词过滤 (支持 AND / OR 表达式)
    if (filter.keyword && filter.keyword.trim()) {
      const rawKw = filter.keyword.trim();
      let andTokens: string[] = [];
      let orTokens: string[] = [];

      if (rawKw.includes(' AND ')) {
        andTokens = rawKw.split(' AND ').map((s) => s.trim().toLowerCase()).filter(Boolean);
      } else if (rawKw.includes(' OR ')) {
        orTokens = rawKw.split(' OR ').map((s) => s.trim().toLowerCase()).filter(Boolean);
      } else if (filter.keywordMode === 'AND' && rawKw.includes(' ')) {
        andTokens = rawKw.split(/\s+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
      } else if (filter.keywordMode === 'OR' && rawKw.includes(' ')) {
        orTokens = rawKw.split(/\s+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
      } else {
        andTokens = [rawKw.toLowerCase()];
      }

      cases = cases.filter((c) => {
        const fullContent = [
          c.caseNumber,
          c.title,
          c.arbitrationCommittee,
          c.applicant,
          c.respondent,
          c.claims.join(' '),
          c.facts,
          c.applicantArguments || '',
          c.respondentArguments || '',
          c.tribunalReasoning,
          c.decision,
          c.legalBasis.join(' '),
          c.disputeTags.join(' '),
        ]
          .join(' ')
          .toLowerCase();

        if (andTokens.length > 0) {
          return andTokens.every((token) => fullContent.includes(token));
        }
        if (orTokens.length > 0) {
          return orTokens.some((token) => fullContent.includes(token));
        }
        return true;
      });
    }

    // 2. 年份过滤
    if (filter.year && filter.year !== '全部') {
      const yNum = parseInt(filter.year, 10);
      cases = cases.filter((c) => c.year === yNum);
    }

    // 3. 仲裁委员会过滤
    if (filter.committee && filter.committee !== '全部') {
      cases = cases.filter((c) => c.arbitrationCommittee.includes(filter.committee!));
    }

    // 4. 争议类型过滤
    if (filter.disputeTag && filter.disputeTag !== '全部') {
      cases = cases.filter((c) => c.disputeTags.includes(filter.disputeTag!));
    }

    // 5. 裁决倾向过滤
    if (filter.decisionOutcome && filter.decisionOutcome !== '全部') {
      cases = cases.filter((c) => c.decisionOutcome === filter.decisionOutcome);
    }

    // 6. 解析状态过滤
    if (filter.parseStatus && filter.parseStatus !== '全部') {
      cases = cases.filter((c) => c.parseStatus === filter.parseStatus);
    }

    // 7. 最低质量分过滤
    if (filter.minQualityScore !== undefined && filter.minQualityScore > 0) {
      cases = cases.filter((c) => c.parseQuality && c.parseQuality.overall >= filter.minQualityScore!);
    }

    // 8. 排序
    const sortBy = filter.sortBy || 'publishedDate';
    const isAsc = filter.sortOrder === 'asc';

    cases.sort((a, b) => {
      if (sortBy === 'publishedDate') {
        const da = a.publishedDate || '';
        const db = b.publishedDate || '';
        return isAsc ? da.localeCompare(db) : db.localeCompare(da);
      }
      if (sortBy === 'parseQuality') {
        const sa = a.parseQuality?.overall || 0;
        const sb = b.parseQuality?.overall || 0;
        return isAsc ? sa - sb : sb - sa;
      }
      if (sortBy === 'year') {
        return isAsc ? (a.year || 0) - (b.year || 0) : (b.year || 0) - (a.year || 0);
      }
      return isAsc ? a.caseNumber.localeCompare(b.caseNumber) : b.caseNumber.localeCompare(a.caseNumber);
    });

    const total = cases.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * pageSize;
    const items = cases.slice(start, start + pageSize);

    return { items, total, page: safePage, totalPages };
  }

  public static async getCaseById(id: string): Promise<ArbitrationCase | undefined> {
    return db.arbitrationCases.get(id);
  }

  public static async getRawDocumentById(id: string): Promise<RawDocument | undefined> {
    return db.rawDocuments.get(id);
  }

  public static async deleteCase(id: string, deleteRawDoc = true): Promise<void> {
    await db.arbitrationCases.delete(id);
    if (deleteRawDoc) {
      await db.rawDocuments.delete(id);
    }
  }

  public static async deleteBatchCases(ids: string[]): Promise<void> {
    await db.arbitrationCases.bulkDelete(ids);
    await db.rawDocuments.bulkDelete(ids);
  }

  /**
   * 重新解析单份案例
   */
  public static async reparseCase(id: string): Promise<ArbitrationCase | null> {
    const rawDoc = await db.rawDocuments.get(id);
    if (!rawDoc) return null;

    const parsedCase = await this.parser.parse(rawDoc);
    await db.arbitrationCases.put(parsedCase);
    return parsedCase;
  }

  /**
   * 全部重新解析
   */
  public static async reparseAllCases(): Promise<number> {
    const allRaw = await db.rawDocuments.toArray();
    for (const doc of allRaw) {
      const parsedCase = await this.parser.parse(doc);
      await db.arbitrationCases.put(parsedCase);
    }
    return allRaw.length;
  }

  /**
   * 导出为 CSV
   */
  public static exportToCsv(cases: ArbitrationCase[]): string {
    const headers = [
      'ID',
      '案号',
      '仲裁委员会',
      '裁决日期',
      '年份',
      '申请人',
      '被申请人',
      '争议类型',
      '裁决倾向',
      '裁付金额(元)',
      '仲裁请求',
      '查明事实摘要',
      '仲裁庭认定',
      '裁决结果',
      '援引法律',
      '解析评分',
      '来源',
    ];

    const rows = cases.map((c) => {
      const escape = (str: string | number | undefined) => {
        if (str === undefined || str === null) return '""';
        const s = String(str).replace(/"/g, '""').replace(/\n/g, ' ');
        return `"${s}"`;
      };

      return [
        escape(c.id),
        escape(c.caseNumber),
        escape(c.arbitrationCommittee),
        escape(c.publishedDate),
        escape(c.year),
        escape(c.applicant),
        escape(c.respondent),
        escape(c.disputeTags.join('; ')),
        escape(c.decisionOutcome),
        escape(c.compensationAmount || 0),
        escape(c.claims.join('; ')),
        escape(c.facts.slice(0, 200)),
        escape(c.tribunalReasoning.slice(0, 200)),
        escape(c.decision),
        escape(c.legalBasis.join('; ')),
        escape(c.parseQuality?.overall || 0),
        escape(c.source),
      ].join(',');
    });

    // 附带 UTF-8 BOM 确保 Excel 正确识别中文字符
    return '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  }

  /**
   * 获取文书采集任务列表
   */
  public static async getDocumentTasks(status?: string): Promise<any[]> {
    if (status && status !== 'all') {
      return await db.documentTasks.where('status').equals(status).reverse().sortBy('createdAt');
    }
    return await db.documentTasks.orderBy('createdAt').reverse().toArray();
  }

  /**
   * 批量保存发现的公开文书任务（根据 URL 去重）
   */
  public static async addDiscoveredTasks(links: Array<{ title: string; url: string; date?: string; caseNumber?: string }>): Promise<{ addedCount: number; existingCount: number }> {
    let addedCount = 0;
    let existingCount = 0;
    const now = new Date().toISOString();

    for (const link of links) {
      const existing = await db.documentTasks.where('url').equals(link.url).first();
      if (existing) {
        existingCount++;
        continue;
      }

      const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await db.documentTasks.put({
        id,
        title: link.title,
        url: link.url,
        publishedAt: link.date,
        caseNumber: link.caseNumber,
        status: 'pending',
        rawDocumentId: null,
        createdAt: now,
        updatedAt: now,
      });
      addedCount++;
    }

    return { addedCount, existingCount };
  }

  /**
   * 导出采集清单为 CSV 字符串 (UTF-8 with BOM)
   * 格式：title,url,publishedAt,status
   */
  public static exportTasksToCsv(tasks: any[]): string {
    const header = 'title,url,publishedAt,status\n';
    const rows = tasks.map((t) => {
      const escape = (val: any) => `"${String(val || '').replace(/"/g, '""')}"`;
      return `${escape(t.title)},${escape(t.url)},${escape(t.publishedAt || '')},${escape(t.status || 'pending')}`;
    });
    return '\uFEFF' + header + rows.join('\n');
  }

  /**
   * 导出完整数据库备份 JSON
   */
  public static async exportFullDatabaseBackup(): Promise<string> {
    const rawDocuments = await db.rawDocuments.toArray();
    const arbitrationCases = await db.arbitrationCases.toArray();
    const syncTasks = await db.syncTasks.toArray();
    const documentTasks = await db.documentTasks.toArray();
    const settings = await db.settings.toArray();

    const backup = {
      system: '深圳劳动仲裁文书本地研究库',
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      counts: {
        rawDocuments: rawDocuments.length,
        arbitrationCases: arbitrationCases.length,
        documentTasks: documentTasks.length,
      },
      data: {
        rawDocuments,
        arbitrationCases,
        syncTasks,
        documentTasks,
        settings,
      },
    };

    return JSON.stringify(backup, null, 2);
  }

  /**
   * 恢复数据库备份
   */
  public static async restoreDatabaseBackup(backupJson: string): Promise<{ success: boolean; importedCount: number }> {
    try {
      const parsed = JSON.parse(backupJson);
      if (!parsed.data || !Array.isArray(parsed.data.rawDocuments) || !Array.isArray(parsed.data.arbitrationCases)) {
        throw new Error('备份文件格式不符合要求');
      }

      await db.rawDocuments.bulkPut(parsed.data.rawDocuments);
      await db.arbitrationCases.bulkPut(parsed.data.arbitrationCases);

      if (Array.isArray(parsed.data.documentTasks)) {
        await db.documentTasks.bulkPut(parsed.data.documentTasks);
      }

      if (Array.isArray(parsed.data.syncTasks)) {
        await db.syncTasks.bulkPut(parsed.data.syncTasks);
      }

      return {
        success: true,
        importedCount: parsed.data.arbitrationCases.length,
      };
    } catch (err: any) {
      throw new Error(`恢复失败: ${err.message}`);
    }
  }

  /**
   * 清空所有数据库
   */
  public static async clearAllDatabase(): Promise<void> {
    await db.rawDocuments.clear();
    await db.arbitrationCases.clear();
    await db.documentTasks.clear();
    await db.syncTasks.clear();
    await db.syncLogs.clear();
    await db.candidatePoolEntries.clear();
    await db.candidatePoolSnapshots.clear();
    await db.samplingRuns.clear();
    await db.analysisRuns.clear();
  }

  /**
   * 保存工劳网原始文书 (RawDocument) 并执行去重检查
   * 优先 source + sourceId，其次 contentHash
   * 必须确保 rawText 存在，正文为空时拒绝保存
   */
  public static async saveLaborInfoRawDocument(
    rawDoc: RawDocument
  ): Promise<{ saved: boolean; isDuplicate: boolean; docId: string; reason?: string }> {
    // 0. 数据完整性检查：正文不能为空
    if (!rawDoc.rawText || !rawDoc.rawText.trim()) {
      return {
        saved: false,
        isDuplicate: false,
        docId: rawDoc.id,
        reason: '裁判文书正文内容为空，不得入库',
      };
    }

    // 1. 优先查重：source + sourceId 或 sourceUrl
    if (rawDoc.sourceId) {
      const existingBySource = await db.rawDocuments
        .filter((d) => d.source === 'laborinfo' && d.sourceId === rawDoc.sourceId)
        .first();
      if (existingBySource) {
        return { saved: false, isDuplicate: true, docId: existingBySource.id, reason: `已存在相同 sourceId (${rawDoc.sourceId})` };
      }
    }

    if (rawDoc.sourceUrl) {
      const existingByUrl = await db.rawDocuments.where('sourceUrl').equals(rawDoc.sourceUrl).first();
      if (existingByUrl) {
        return { saved: false, isDuplicate: true, docId: existingByUrl.id, reason: `已存在相同 sourceUrl` };
      }
    }

    // 2. 其次查重：contentHash
    if (rawDoc.contentHash) {
      const existingByHash = await db.rawDocuments.where('contentHash').equals(rawDoc.contentHash).first();
      if (existingByHash) {
        return { saved: false, isDuplicate: true, docId: existingByHash.id, reason: `已存在相同内容摘要 (contentHash)` };
      }
    }

    // 3. 执行持久化
    await db.rawDocuments.put(rawDoc);
    return { saved: true, isDuplicate: false, docId: rawDoc.id };
  }

  /**
   * 获取工劳网来源的所有原始文书记录
   */
  public static async getLaborInfoRawDocuments(limit = 1000): Promise<RawDocument[]> {
    const docs = await db.rawDocuments
      .filter((d) => d.source === 'laborinfo')
      .reverse()
      .sortBy('importedAt');
    return limit ? docs.slice(0, limit) : docs;
  }

  /**
   * 工劳网文书统计数据（纯数据库统计，不调用分析引擎）
   */
  public static async getLaborInfoStats(): Promise<{
    total: number;
    year2021: number;
    year2022: number;
    year2023: number;
    otherYears: number;
  }> {
    const docs = await db.rawDocuments
      .filter((d) => d.source === 'laborinfo')
      .toArray();

    let year2021 = 0;
    let year2022 = 0;
    let year2023 = 0;
    let otherYears = 0;

    for (const doc of docs) {
      const dateStr = doc.publishedAt || doc.sourceMetadata?.date || doc.sourceMetadata?.pbDt || '';
      if (dateStr.startsWith('2021')) {
        year2021++;
      } else if (dateStr.startsWith('2022')) {
        year2022++;
      } else if (dateStr.startsWith('2023')) {
        year2023++;
      } else {
        otherYears++;
      }
    }

    return {
      total: docs.length,
      year2021,
      year2022,
      year2023,
      otherYears,
    };
  }

  /**
   * 保存或更新采集任务记录
   */
  public static async saveCrawlTask(task: LaborInfoCrawlTask): Promise<void> {
    await db.crawlTasks.put(task);
  }

  /**
   * 获取单个采集任务
   */
  public static async getCrawlTaskById(id: string): Promise<LaborInfoCrawlTask | undefined> {
    return await db.crawlTasks.get(id);
  }

  /**
   * 获取所有采集任务历史列表（按更新时间降序）
   */
  public static async getAllCrawlTasks(): Promise<LaborInfoCrawlTask[]> {
    const tasks = await db.crawlTasks.toArray();
    return tasks.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  /**
   * 删除采集任务记录 (注意：不删除 rawDocuments 案例库文书)
   */
  public static async deleteCrawlTask(id: string): Promise<void> {
    await db.crawlTasks.delete(id);
  }
}

