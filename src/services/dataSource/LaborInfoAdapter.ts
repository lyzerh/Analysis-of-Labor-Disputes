import { DocumentMetadata, LaborInfoSearchParams, LaborInfoSearchResult, RawDocument } from '../../types';
import { ParserUtils } from '../parser/ParserUtils';

export const LABORINFO_PER_PAGE_MAX = 50;

export function normalizeLaborInfoPerPage(value?: number): number {
  if (!Number.isFinite(value)) return 5;
  return Math.max(1, Math.min(LABORINFO_PER_PAGE_MAX, Math.floor(value as number)));
}

/**
 * 工劳网 API 内部返回数据类型定义
 */
export interface LaborInfoLawcaseHit {
  id: string | number;
  no?: string;
  name?: string;
  title?: string;
  users?: string[];
  caseLevel?: string;
  courtNm?: string;
  court?: string;
  pbDt?: string;
  date?: string;
  province?: string;
  match_snippet?: string;
  site_url?: string;
}

export interface LaborInfoSearchMeta {
  q?: string;
  range?: string;
  order?: string;
  page?: number;
  per_page?: number;
  total_count?: number;
  total_pages?: number;
}

export interface LaborInfoSearchResponse {
  data?: LaborInfoLawcaseHit[];
  items?: LaborInfoLawcaseHit[];
  lawcases?: LaborInfoLawcaseHit[];
  results?: LaborInfoLawcaseHit[];
  meta?: LaborInfoSearchMeta;
  total?: number;
  total_count?: number;
  facet_counts?: Record<string, any>;
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, any>;
  };
}

export interface LaborInfoLawcaseDetail {
  id: string | number;
  no?: string;
  name?: string;
  title?: string;
  users?: string[];
  caseLevel?: string;
  courtNm?: string;
  court?: string;
  pbDt?: string;
  date?: string;
  province?: string;
  fbqw?: string; // 发布全文 (完整裁判文书正文)
  cpjg?: string; // 裁判结果
  dsr?: string;  // 当事人
  fxgc?: string; // 分析过程 (裁判说理)
  jbqk?: string; // 基本情况 (案件事实)
  ssjl?: string; // 诉讼记录
  content?: string;
  body?: string;
  site_url?: string;
  [key: string]: any;
}

export interface LaborInfoDetailResponse {
  data?: LaborInfoLawcaseDetail;
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, any>;
  };
}

export class LaborInfoAdapter {
  private baseUrl: string;

  constructor(baseUrl = 'https://laborinfocn.com') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  public setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * 1. 检索公开判决文书元数据列表
   * 调用 GET /api/v1/lawcases/search
   */
  public async searchCases(params: LaborInfoSearchParams = {}): Promise<LaborInfoSearchResult> {
    const queryParams = new URLSearchParams();
    const provinces = Array.isArray(params.province)
      ? params.province
      : (params.province ? [params.province] : []);
    for (const province of provinces) {
      if (province) queryParams.append('province[]', province);
    }
    const caseLevels = Array.isArray(params.caseLevel)
      ? params.caseLevel
      : (params.caseLevel ? [params.caseLevel] : []);
    for (const caseLevel of caseLevels) {
      if (caseLevel) queryParams.append('caseLevel[]', caseLevel);
    }
    if (params.start_date) queryParams.append('start_date', params.start_date);
    if (params.end_date) queryParams.append('end_date', params.end_date);
    if (params.q) queryParams.append('q', params.q);

    const page = params.page || 1;
    const perPage = normalizeLaborInfoPerPage(params.per_page);
    queryParams.append('page', String(page));
    queryParams.append('per_page', String(perPage));

    const endpoint = `/api/v1/lawcases/search?${queryParams.toString()}`;
    const url = `${this.baseUrl}${endpoint}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json, text/plain, */*',
        },
        mode: 'cors',
      });
    } catch (fetchErr: any) {
      throw new Error(`工劳网检索网络请求失败 [URL: ${url}]: ${fetchErr?.message || fetchErr}`);
    }

    if (!res.ok) {
      let errDetail = '';
      try {
        const errJson = await res.json();
        errDetail = errJson?.error?.message || errJson?.message || JSON.stringify(errJson);
      } catch {
        errDetail = await res.text().catch(() => res.statusText);
      }
      throw new Error(`工劳网搜索失败 (HTTP ${res.status}) [URL: ${url}]: ${errDetail || res.statusText}`);
    }

    const data: LaborInfoSearchResponse = await res.json();
    const rawList: LaborInfoLawcaseHit[] = Array.isArray(data)
      ? data
      : data?.data || data?.items || data?.lawcases || data?.results || [];

    // 总数量优先从 meta.total_count 读取，回退到 total / total_count / rawList.length
    const total = typeof data?.meta?.total_count === 'number'
      ? data.meta.total_count
      : (typeof data?.total === 'number'
        ? data.total
        : (typeof data?.total_count === 'number' ? data.total_count : rawList.length));
    const totalPages = typeof data?.meta?.total_pages === 'number'
      ? data.meta.total_pages
      : Math.max(1, Math.ceil(total / perPage));

    // 正确映射字段
    const items: DocumentMetadata[] = rawList.map((item: LaborInfoLawcaseHit, idx: number) => {
      const sourceId = String(item.id ?? `item_${idx}`);
      const title = String(item.name || item.title || '工劳网未命名文书');
      const caseNumber = item.no || '';
      const court = item.courtNm || item.court || '';
      const date = item.pbDt || item.date || '';
      const province = item.province || provinces.join('、');
      const caseLevel = item.caseLevel || caseLevels.join('、');
      const detailUrl = item.site_url || `${this.baseUrl}/api/v1/lawcases/${sourceId}`;

      return {
        sourceId,
        source: 'laborinfo',
        title,
        url: detailUrl,
        caseNumber,
        pbDt: item.pbDt,
        court,
        date,
        province,
        caseLevel,
      };
    });

    return {
      items,
      total,
      totalPages,
      page,
      perPage,
      rawResponse: data,
    };
  }

  /**
   * 2. 获取单篇文书详情并转换为 RawDocument
   * 调用 GET /api/v1/lawcases/:id
   */
  public async fetchCaseDetail(id: string | number, metadata?: Partial<DocumentMetadata>): Promise<RawDocument> {
    if (!id && id !== 0) {
      throw new Error('fetchCaseDetail: 必须提供案件 id');
    }

    const endpoint = `/api/v1/lawcases/${encodeURIComponent(String(id))}`;
    const url = `${this.baseUrl}${endpoint}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json, text/plain, */*',
        },
        mode: 'cors',
      });
    } catch (fetchErr: any) {
      throw new Error(`获取文书详情网络请求失败 [ID: ${id}, URL: ${url}]: ${fetchErr?.message || fetchErr}`);
    }

    if (!res.ok) {
      let errDetail = '';
      try {
        const errJson = await res.json();
        errDetail = errJson?.error?.message || errJson?.message || JSON.stringify(errJson);
      } catch {
        errDetail = await res.text().catch(() => res.statusText);
      }
      throw new Error(`获取文书详情失败 (ID: ${id}, HTTP ${res.status}) [URL: ${url}]: ${errDetail || res.statusText}`);
    }

    const data: LaborInfoDetailResponse = await res.json();
    const docData: LaborInfoLawcaseDetail = (data?.data || data) as LaborInfoLawcaseDetail;

    // 正文提取优先级规则：
    // 第一优先：docData.fbqw (发布全文)
    // 第二优先：[docData.jbqk, docData.fxgc, docData.cpjg] 结构化段落拼接
    // 第三优先：docData.content
    // 第四优先：docData.body
    // 全部不存在则为 "" (严禁伪造文本)
    let rawText = '';
    if (docData && typeof docData.fbqw === 'string' && docData.fbqw.trim()) {
      rawText = docData.fbqw.trim();
    } else if (
      docData &&
      (Boolean(docData.jbqk && docData.jbqk.trim()) ||
       Boolean(docData.fxgc && docData.fxgc.trim()) ||
       Boolean(docData.cpjg && docData.cpjg.trim()) ||
       Boolean(docData.ssjl && docData.ssjl.trim()) ||
       Boolean(docData.dsr && docData.dsr.trim()))
    ) {
      const parts: string[] = [];
      if (docData.name && typeof docData.name === 'string' && docData.name.trim()) parts.push(docData.name.trim());
      if (docData.no && typeof docData.no === 'string' && docData.no.trim()) parts.push(docData.no.trim());
      if (docData.dsr && typeof docData.dsr === 'string' && docData.dsr.trim()) parts.push(`【当事人】\n${docData.dsr.trim()}`);
      if (docData.ssjl && typeof docData.ssjl === 'string' && docData.ssjl.trim()) parts.push(`【诉讼记录】\n${docData.ssjl.trim()}`);
      if (docData.jbqk && typeof docData.jbqk === 'string' && docData.jbqk.trim()) parts.push(`【基本情况】\n${docData.jbqk.trim()}`);
      if (docData.fxgc && typeof docData.fxgc === 'string' && docData.fxgc.trim()) parts.push(`【分析过程】\n${docData.fxgc.trim()}`);
      if (docData.cpjg && typeof docData.cpjg === 'string' && docData.cpjg.trim()) parts.push(`【裁判结果】\n${docData.cpjg.trim()}`);
      rawText = parts.join('\n\n');
    } else if (docData && typeof docData.content === 'string' && docData.content.trim()) {
      rawText = docData.content.trim();
    } else if (docData && typeof docData.body === 'string' && docData.body.trim()) {
      rawText = docData.body.trim();
    }

    const effectiveTitle = String(
      docData?.name ||
      docData?.title ||
      metadata?.title ||
      `工劳网判决文书_${id}`
    );

    const publishedAt = docData?.pbDt || docData?.date || metadata?.date || undefined;
    const contentHash = await ParserUtils.calculateContentHash(rawText || effectiveTitle);
    const docId = `raw_laborinfo_${id}`;

    const rawDoc: RawDocument = {
      id: docId,
      source: 'laborinfo',
      sourceId: String(docData?.id ?? id),
      sourceUrl: metadata?.url || docData?.site_url || url,
      sourceMetadata: typeof docData === 'object' ? docData : { raw: docData },
      title: effectiveTitle,
      publishedAt,
      contentType: 'json',
      rawHtml: undefined,
      rawText,
      contentHash,
      duplicateOf: null,
      fileSize: rawText.length,
      fetchedAt: new Date().toISOString(),
      importedAt: new Date().toISOString(),
    };

    return rawDoc;
  }
}
