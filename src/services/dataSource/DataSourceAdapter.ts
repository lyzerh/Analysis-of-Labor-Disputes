import { PageInfo, DocumentLink, RawDocument } from '../../types';

export interface DataSourceAdapter {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;

  /**
   * 发现分页信息
   */
  discoverPages(): Promise<PageInfo[]>;

  /**
   * 发现指定页码的裁决书列表
   */
  discoverDocuments(pageUrl: string): Promise<DocumentLink[]>;

  /**
   * 获取单份裁决书原始数据
   */
  fetchDocument(url: string, linkMeta?: DocumentLink): Promise<RawDocument>;
}
