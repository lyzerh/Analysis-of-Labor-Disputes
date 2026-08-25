import { ParserReviewRecord } from '../../types';

const STORAGE_KEY = 'laborinfo_parser_reviews_v1';

/**
 * 人工审核与反馈持久化服务
 * 严格保持零污染原则：绝不覆盖或修改原始文书 rawText，仅独立存储审核记录与人工修订字段
 */
export class ReviewStorageService {
  private static memoryCache: Record<string, ParserReviewRecord> | null = null;

  /**
   * 加载所有审核记录
   */
  public static getAllReviews(): Record<string, ParserReviewRecord> {
    if (this.memoryCache) {
      return this.memoryCache;
    }
    try {
      const json = localStorage.getItem(STORAGE_KEY);
      if (json) {
        this.memoryCache = JSON.parse(json);
        return this.memoryCache || {};
      }
    } catch (err) {
      console.warn('读取本地审核记录失败:', err);
    }
    this.memoryCache = {};
    return {};
  }

  /**
   * 获取单篇文书的审核记录
   */
  public static getReview(rawDocId: string): ParserReviewRecord | null {
    const all = this.getAllReviews();
    return all[rawDocId] || null;
  }

  /**
   * 保存或更新人工审核记录
   */
  public static saveReview(review: ParserReviewRecord): void {
    const all = this.getAllReviews();
    all[review.rawDocumentId] = {
      ...review,
      reviewTime: review.reviewTime || new Date().toISOString(),
    };
    this.memoryCache = all;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (err) {
      console.error('保存审核记录至 localStorage 失败:', err);
    }
  }

  /**
   * 清除指定审核记录
   */
  public static deleteReview(rawDocId: string): void {
    const all = this.getAllReviews();
    if (all[rawDocId]) {
      delete all[rawDocId];
      this.memoryCache = all;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
      } catch (err) {
        console.error('删除审核记录失败:', err);
      }
    }
  }
}
