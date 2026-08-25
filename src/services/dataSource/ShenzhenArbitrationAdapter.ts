import { DataSourceAdapter } from './DataSourceAdapter';
import { PageInfo, DocumentLink, RawDocument } from '../../types';
import { ParserUtils } from '../parser/ParserUtils';

export class RateLimitError extends Error {
  constructor(message = '数据源暂时限制访问（429/403），任务已安全暂停') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class CorsBlockedError extends Error {
  constructor(message = '采集服务受限或不可达。请检查网络，或使用「网页导入」直接拖入 HTML / MHT 文件。') {
    super(message);
    this.name = 'CorsBlockedError';
  }
}

export class ShenzhenArbitrationAdapter implements DataSourceAdapter {
  readonly id = 'shenzhen_hrss_live';
  readonly name = '深圳市人力资源和社会保障局（公开文书网）';
  readonly baseUrl = 'https://hrss.sz.gov.cn/ztfw/cjjy/wsgk/';

  public async discoverPages(): Promise<PageInfo[]> {
    const pages: PageInfo[] = [
      { pageNumber: 1, url: `${this.baseUrl}index.html` },
      { pageNumber: 2, url: `${this.baseUrl}index_1.html` },
      { pageNumber: 3, url: `${this.baseUrl}index_2.html` },
      { pageNumber: 4, url: `${this.baseUrl}index_3.html` },
      { pageNumber: 5, url: `${this.baseUrl}index_4.html` },
    ];
    return pages;
  }

  public async discoverDocuments(pageUrl: string): Promise<DocumentLink[]> {
    try {
      const response = await fetch('/api/fetch-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ url: pageUrl }),
      });

      if (response.status === 429) {
        throw new RateLimitError();
      }

      const result = await response.json().catch(() => null);

      if (!response.ok || (result && result.success === false)) {
        if (result && result.errorType === 'RATE_LIMITED') {
          throw new RateLimitError(result.message);
        }
        const errorType = result?.errorType ? `[${result.errorType}] ` : '';
        const msg = result?.message || result?.error || `HTTP ${response.status}`;
        const detail = result?.detail ? ` (${result.detail})` : '';
        throw new Error(`${errorType}${msg}${detail}`);
      }

      const html = result?.html || '';
      return this.parseListHtml(html, pageUrl);
    } catch (err: any) {
      if (err instanceof RateLimitError) throw err;
      if (err.name === 'TypeError' && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))) {
        throw new CorsBlockedError('无法连接本地后端抓取服务，请确认服务已正常运行或使用「数据导入」直接导入文件。');
      }
      throw err;
    }
  }

  public async fetchDocument(url: string, linkMeta?: DocumentLink): Promise<RawDocument> {
    try {
      const response = await fetch('/api/fetch-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      if (response.status === 429) {
        throw new RateLimitError();
      }

      const result = await response.json().catch(() => null);

      if (!response.ok || (result && result.success === false)) {
        if (result && result.errorType === 'RATE_LIMITED') {
          throw new RateLimitError(result.message);
        }
        const errorType = result?.errorType ? `[${result.errorType}] ` : '';
        const msg = result?.message || result?.error || `HTTP ${response.status}`;
        const detail = result?.detail ? ` (${result.detail})` : '';
        throw new Error(`${errorType}${msg}${detail}`);
      }

      const rawHtml = result?.html || '';
      const rawText = this.stripHtml(rawHtml);
      const contentHash = await ParserUtils.calculateContentHash(rawText);

      return {
        id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        source: this.name,
        sourceUrl: url,
        title: linkMeta?.title || this.extractTitleFromHtml(rawHtml) || '劳动人事争议仲裁裁决书',
        publishedAt: linkMeta?.date,
        contentType: 'html',
        rawHtml,
        rawText,
        contentHash,
        duplicateOf: null,
        fileSize: rawHtml.length,
        fetchedAt: new Date().toISOString(),
        importedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      if (err instanceof RateLimitError) throw err;
      if (err.name === 'TypeError' && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))) {
        throw new CorsBlockedError('无法连接本地后端抓取服务，请确认服务已正常运行或使用「数据导入」直接导入文件。');
      }
      throw err;
    }
  }

  private parseListHtml(html: string, baseUrl: string): DocumentLink[] {
    const links: DocumentLink[] = [];
    if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const items = doc.querySelectorAll('ul.list_news li, .news_list li, table.list_table tr, .list li');

        items.forEach((item) => {
          const a = item.querySelector('a');
          if (!a) return;
          const href = a.getAttribute('href') || '';
          const title = a.getAttribute('title') || a.textContent || '';
          const dateEl = item.querySelector('.date, .time, span:last-child');
          const date = dateEl ? dateEl.textContent?.trim() : undefined;

          if (href && !href.startsWith('javascript:')) {
            let fullUrl = href;
            if (!href.startsWith('http')) {
              fullUrl = new URL(href, baseUrl).toString();
            }
            links.push({
              title: title.trim(),
              url: fullUrl,
              date,
              source: this.name,
            });
          }
        });
      } catch (_) {}
    }
    return links;
  }

  private extractTitleFromHtml(html: string): string | null {
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) return titleMatch[1].replace(/[-_]深圳市人力资源和社会保障局.*$/, '').trim();
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match) return h1Match[1].trim();
    return null;
  }

  private stripHtml(html: string): string {
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

