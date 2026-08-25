import { db } from '../../db';
import {
  RawDocument,
  ArbitrationCase,
  HTMLInspectionReport,
  DocumentTask,
} from '../../types';
import { ShenzhenArbitrationParser } from '../parser/ShenzhenArbitrationParser';
import { ParserUtils } from '../parser/ParserUtils';
import { MHTParser } from '../../utils/mhtParser';

export class HTMLImportAdapter {
  private static parser = new ShenzhenArbitrationParser();

  /**
   * 导入并解析单个本地 HTML / MHT 文件
   */
  public static async importSingleFile(file: File): Promise<HTMLInspectionReport> {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    let htmlContent = '';
    let extractedText = '';
    let docTitle = file.name.replace(/\.[^/.]+$/, '');
    let sourceUrl: string | undefined;

    try {
      if (ext === 'mht' || ext === 'mhtml') {
        const parsedMht = await MHTParser.parse(file);
        if (!parsedMht.success || !parsedMht.cleanedText) {
          throw new Error(parsedMht.error || 'MHT/MHTML 文件内容为空或解包失败');
        }
        htmlContent = parsedMht.rawHtml || '';
        extractedText = parsedMht.cleanedText;
        if (parsedMht.subject) docTitle = parsedMht.subject;
        if (parsedMht.sourceUrl) sourceUrl = parsedMht.sourceUrl;
      } else {
        htmlContent = await file.text();
        if (!htmlContent || !htmlContent.trim()) {
          throw new Error('HTML 文件内容为空');
        }

        // DOM 解析与正文清洗
        if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
          try {
            const dom = new DOMParser().parseFromString(htmlContent, 'text/html');
            dom.querySelectorAll('script, style, noscript, nav, footer, header, iframe').forEach((el) => el.remove());

            const pageTitle = dom.querySelector('title, h1, .title, .article-title')?.textContent?.trim();
            if (pageTitle && pageTitle.length > 3) {
              docTitle = pageTitle;
            }

            const mainEl = dom.querySelector('.TRS_Editor, .article-content, #content, .content, table') || dom.body;
            extractedText = (mainEl ? mainEl.textContent : dom.body.textContent) || '';
          } catch (_) {}
        }

        if (!extractedText) {
          extractedText = htmlContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        }
      }

      const cleanText = extractedText.replace(/\r\n/g, '\n').trim();
      if (cleanText.length < 20) {
        throw new Error('未能从HTML文件中提取到有效的裁判文书正文字符（内容过短或无文字层）');
      }

      // 计算 SHA-256 唯一摘要
      const contentHash = await ParserUtils.calculateContentHash(cleanText);
      const existing = await db.rawDocuments.where('contentHash').equals(contentHash).first();

      const docId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const rawDoc: RawDocument = {
        id: docId,
        source: '本地HTML导入',
        sourceUrl,
        title: docTitle,
        contentType: 'html',
        rawHtml: htmlContent,
        rawText: cleanText,
        contentHash,
        duplicateOf: existing ? existing.id : null,
        fileSize: file.size,
        fileName: file.name,
        importedAt: new Date().toISOString(),
      };

      await db.rawDocuments.put(rawDoc);

      // 调用解析器提取结构化数据
      const parsedCase = await this.parser.parse(rawDoc);
      await db.arbitrationCases.put(parsedCase);

      // 尝试关联合并待采集任务 DocumentTask
      await this.linkAndUpdateDocumentTask(parsedCase, docId, sourceUrl);

      // 提取报告质检明细
      const q = parsedCase.parseQuality;
      const report: HTMLInspectionReport = {
        fileName: file.name,
        fileSize: file.size,
        extractedTitle: parsedCase.title,
        extractedCaseNumber: parsedCase.caseNumber,
        hasTitle: !!parsedCase.title && parsedCase.title.length > 3,
        hasCaseNumber: q.caseNumber,
        hasDate: q.date,
        hasCommittee: q.committee,
        hasParties: q.parties,
        hasClaims: q.claims,
        hasFacts: q.facts,
        hasReasoning: q.reasoning,
        hasDecision: q.decision,
        hasLegalBasis: (parsedCase.legalBasis || []).length > 0,
        qualityScore: q.overall,
        unrecognizedFields: q.unrecognizedFields || [],
        isDuplicate: !!existing,
        parseStatus: parsedCase.parseStatus,
        rawDocumentId: docId,
        caseId: parsedCase.id,
      };

      return report;
    } catch (err: any) {
      return {
        fileName: file.name,
        fileSize: file.size,
        extractedTitle: null,
        extractedCaseNumber: null,
        hasTitle: false,
        hasCaseNumber: false,
        hasDate: false,
        hasCommittee: false,
        hasParties: false,
        hasClaims: false,
        hasFacts: false,
        hasReasoning: false,
        hasDecision: false,
        hasLegalBasis: false,
        qualityScore: 0,
        unrecognizedFields: ['全文字段提取失败'],
        isDuplicate: false,
        parseStatus: 'failed',
        error: err?.message || '未知解析异常',
      };
    }
  }

  /**
   * 批量导入多个 HTML 文件（支持 10、50、100+ 单文件异常隔离）
   */
  public static async importBatch(
    files: File[],
    onProgress?: (processed: number, total: number, currentReport: HTMLInspectionReport) => void
  ): Promise<{
    reports: HTMLInspectionReport[];
    successCount: number;
    duplicateCount: number;
    failedCount: number;
  }> {
    const reports: HTMLInspectionReport[] = [];
    let successCount = 0;
    let duplicateCount = 0;
    let failedCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const report = await this.importSingleFile(file);
      reports.push(report);

      if (report.parseStatus === 'failed') {
        failedCount++;
      } else {
        successCount++;
        if (report.isDuplicate) {
          duplicateCount++;
        }
      }

      onProgress?.(i + 1, files.length, report);
    }

    return {
      reports,
      successCount,
      duplicateCount,
      failedCount,
    };
  }

  /**
   * 关联并回写更新 DocumentTask 状态
   */
  private static async linkAndUpdateDocumentTask(
    parsedCase: ArbitrationCase,
    rawDocId: string,
    sourceUrl?: string
  ): Promise<void> {
    try {
      const allTasks = await db.documentTasks.toArray();
      let matchedTask: DocumentTask | undefined;

      if (sourceUrl) {
        matchedTask = allTasks.find((t) => t.url === sourceUrl);
      }

      if (!matchedTask && parsedCase.caseNumber) {
        matchedTask = allTasks.find(
          (t) =>
            t.title.includes(parsedCase.caseNumber) ||
            (t.caseNumber && t.caseNumber === parsedCase.caseNumber)
        );
      }

      if (!matchedTask && parsedCase.title) {
        matchedTask = allTasks.find(
          (t) =>
            t.title.trim() === parsedCase.title.trim() ||
            (t.title.length > 8 && parsedCase.title.includes(t.title.slice(0, 10)))
        );
      }

      if (matchedTask) {
        await db.documentTasks.update(matchedTask.id, {
          status: 'parsed',
          rawDocumentId: rawDocId,
          caseNumber: parsedCase.caseNumber || matchedTask.caseNumber,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn('Failed to link document task during import:', err);
    }
  }
}
