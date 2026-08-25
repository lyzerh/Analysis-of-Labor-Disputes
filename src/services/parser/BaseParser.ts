import { RawDocument, ArbitrationCase } from '../../types';

export interface DocumentParser {
  canHandle(doc: RawDocument): boolean;
  parse(doc: RawDocument): Promise<ArbitrationCase>;
}

export abstract class BaseParser implements DocumentParser {
  abstract canHandle(doc: RawDocument): boolean;
  abstract parse(doc: RawDocument): Promise<ArbitrationCase>;

  /**
   * 清洗与规整文本
   */
  protected cleanText(text: string): string {
    if (!text) return '';
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * 从 HTML 中提取纯文本 (保留段落结构)
   */
  protected extractTextFromHtml(html: string): string {
    if (!html) return '';
    if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // 移除脚本、样式、导航、页脚
        const removeTags = ['script', 'style', 'noscript', 'iframe', 'nav', 'header', 'footer'];
        removeTags.forEach((t) => {
          const elements = doc.querySelectorAll(t);
          elements.forEach((el) => el.remove());
        });

        // 优先提取典型正文容器 (如 .content, .article-content, #main, table, etc.)
        const mainContent =
          doc.querySelector('.article-content') ||
          doc.querySelector('.content') ||
          doc.querySelector('#content') ||
          doc.querySelector('.TRS_Editor') ||
          doc.querySelector('.TRS_PreAppend') ||
          doc.body;

        return mainContent ? (mainContent.textContent || '').trim() : (doc.body.textContent || '').trim();
      } catch (_) {}
    }

    // 正则备用提取
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
