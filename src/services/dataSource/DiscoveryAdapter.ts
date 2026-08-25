import { DocumentLink } from '../../types';

export interface DiscoveryAdapter {
  readonly name: string;
  readonly baseUrl: string;

  /**
   * 扫描并发现公开文书目录列表
   */
  discoverDocuments(targetUrl?: string): Promise<DocumentLink[]>;
}
