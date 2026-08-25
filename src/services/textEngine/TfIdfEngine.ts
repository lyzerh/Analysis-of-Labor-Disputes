/**
 * 深圳劳动仲裁文书本地研究库 - 中文 TF-IDF 关键词抽取与相似度引擎 (TfIdfEngine)
 * 纯本地计算，支持停用词过滤、同义词合并、Top N 调整与余弦相似度匹配
 */

import { TfIdfWordItem } from '../../types';

// 停用词表：文书通用无区分度高频词、标点、虚词
export const STOP_WORDS = new Set([
  '的', '了', '和', '是', '就', '都', '而', '及', '与', '在', '之', '由', '向',
  '其', '我', '该', '此', '按', '根据', '依照', '关于', '对于', '由于', '为了',
  '本委', '仲裁委', '仲裁庭', '申请人', '被申请人', '双方', '当事人', '原告', '被告',
  '深圳市', '劳动人事争议仲裁委员会', '裁决书', '决定书', '通知书', '案号', '号',
  '经审理查明', '本委查明', '本委认为', '裁决如下', '综上所述', '事实清楚', '证据确凿',
  '予以支持', '不予支持', '予以采信', '不予采信', '应当', '可以', '不得', '规定',
  '元', '日', '月', '年', '款', '条', '项', '第', '一份', '一份案', '相关',
  '以及', '并', '等', '至', '自', '于', '已', '未', '向本委', '提出', '请求',
  '主张', '辩称', '称', '答辩', '审理', '确认', '履行', '发生', '产生',
]);

// 同义词归一化映射
export const SYNONYM_MAP: Record<string, string> = {
  '违法解除劳动合同': '违法解除',
  '解除劳动合同': '解除劳动关系',
  '解除劳动关系': '解除合同',
  '辞退': '违法解除',
  '开除': '严重违纪解除',
  '经济补偿金': '经济补偿',
  '双倍工资': '未签合同双倍工资',
  '加班费': '加班工资',
  '延长工作时间加班': '平时加班',
  '休息日加班': '周末加班',
  '法定节假日加班': '节假日加班',
  '带薪年休假': '年休假',
  '不胜任工作': '不能胜任工作',
  '考核不合格': '不能胜任工作',
};

// 预置法律专业核心词典（优先切分）
export const LEGAL_TERMS = [
  '违法解除', '经济补偿', '赔偿金', '严重违纪', '不能胜任工作', '旷工',
  '未签劳动合同', '双倍工资', '加班工资', '年休假工资', '调岗降薪', '竞业限制',
  '员工手册', '考勤记录', '工资表', '银行流水', '解除通知书', '绩效考核',
  '试用期', '录用条件', '规章制度', '民主程序', '公示告知', '事实劳动关系',
  '工伤认定', '停工留薪期', '医疗期', '生活费', '保密协议', '违约金',
  '证明责任', '举证不能', '通知工会', '不予支持', '驳回仲裁请求', '全额支持',
];

export class TfIdfEngine {
  /**
   * 中文简易分词（结合专有法律词库匹配 + N-gram）
   */
  public static tokenize(text: string): string[] {
    if (!text) return [];

    const tokens: string[] = [];
    let remaining = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ');

    // 1. 优先提取法律专有名词
    for (const term of LEGAL_TERMS) {
      while (remaining.includes(term)) {
        const canonical = SYNONYM_MAP[term] || term;
        tokens.push(canonical);
        remaining = remaining.replace(term, ' ');
      }
    }

    // 2. 将剩余文本按连续中文 2-4 字切分
    const segments = remaining.split(/\s+/).filter((s) => s.length >= 2);
    for (const seg of segments) {
      if (seg.length <= 4) {
        if (!STOP_WORDS.has(seg)) {
          const canonical = SYNONYM_MAP[seg] || seg;
          tokens.push(canonical);
        }
      } else {
        // 滑动窗口切分 2-3 字词
        for (let i = 0; i < seg.length - 1; i++) {
          const word2 = seg.slice(i, i + 2);
          if (!STOP_WORDS.has(word2) && word2.length === 2) {
            tokens.push(SYNONYM_MAP[word2] || word2);
          }
          if (i + 3 <= seg.length) {
            const word3 = seg.slice(i, i + 3);
            if (!STOP_WORDS.has(word3)) {
              tokens.push(SYNONYM_MAP[word3] || word3);
            }
          }
        }
      }
    }

    return tokens;
  }

  /**
   * 计算单篇文书的词频 (TF)
   */
  public static computeTf(tokens: string[]): Record<string, number> {
    const tf: Record<string, number> = {};
    const total = tokens.length;
    if (total === 0) return tf;

    for (const t of tokens) {
      tf[t] = (tf[t] || 0) + 1;
    }

    for (const k in tf) {
      tf[k] = tf[k] / total;
    }

    return tf;
  }

  /**
   * 批量计算文集在整个语料库中的 TF-IDF
   */
  public static computeCorpusTfIdf(
    documents: Array<{ id: string; text: string }>,
    topN: number = 50,
    minDocFreq: number = 2
  ): TfIdfWordItem[] {
    const N = documents.length;
    if (N === 0) return [];

    const docTokens: string[][] = [];
    const docFreq: Record<string, number> = {};
    const totalFreq: Record<string, number> = {};

    for (const doc of documents) {
      const tokens = this.tokenize(doc.text);
      docTokens.push(tokens);

      const uniqueTokens = new Set(tokens);
      for (const t of uniqueTokens) {
        docFreq[t] = (docFreq[t] || 0) + 1;
      }
      for (const t of tokens) {
        totalFreq[t] = (totalFreq[t] || 0) + 1;
      }
    }

    // 累加每个词在整个语料库的平均 TF-IDF
    const wordTfIdfSum: Record<string, number> = {};

    for (let i = 0; i < N; i++) {
      const tokens = docTokens[i];
      const tf = this.computeTf(tokens);

      for (const [w, tfVal] of Object.entries(tf)) {
        const df = docFreq[w] || 1;
        if (df >= minDocFreq) {
          const idf = Math.log((N + 1) / (df + 1)) + 1;
          const score = tfVal * idf;
          wordTfIdfSum[w] = (wordTfIdfSum[w] || 0) + score;
        }
      }
    }

    const results: TfIdfWordItem[] = [];
    for (const [w, scoreSum] of Object.entries(wordTfIdfSum)) {
      const df = docFreq[w] || 0;
      const tf = totalFreq[w] || 0;
      const avgTfidf = Number((scoreSum / N).toFixed(4));

      // 分类标记
      let category: TfIdfWordItem['category'] = 'general';
      if (['严重违纪', '旷工', '不能胜任工作', '调岗', '主动辞职', '试用期', '竞业限制'].includes(w)) {
        category = 'defense';
      } else if (['员工手册', '考勤记录', '工资表', '银行流水', '微信聊天', '解除通知书', '劳动合同'].includes(w)) {
        category = 'evidence';
      } else if (['证据不足', '举证不能', '未公示', '程序违法', '事实不清'].includes(w)) {
        category = 'loss';
      } else if (['经济补偿', '赔偿金', '加班工资', '双倍工资', '年休假'].includes(w)) {
        category = 'dispute';
      }

      results.push({
        word: w,
        tfidf: avgTfidf,
        docFreq: df,
        totalFreq: tf,
        category,
      });
    }

    return results
      .sort((a, b) => b.tfidf - a.tfidf || b.totalFreq - a.totalFreq)
      .slice(0, topN);
  }

  /**
   * 计算两段文本或案件画像的余弦相似度 (0 - 1.0)
   */
  public static calculateCosineSimilarity(textA: string, textB: string): number {
    const tokensA = this.tokenize(textA);
    const tokensB = this.tokenize(textB);

    if (tokensA.length === 0 || tokensB.length === 0) return 0;

    const freqA: Record<string, number> = {};
    const freqB: Record<string, number> = {};

    for (const t of tokensA) freqA[t] = (freqA[t] || 0) + 1;
    for (const t of tokensB) freqB[t] = (freqB[t] || 0) + 1;

    const allVocab = new Set([...Object.keys(freqA), ...Object.keys(freqB)]);

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (const w of allVocab) {
      const a = freqA[w] || 0;
      const b = freqB[w] || 0;
      dotProduct += a * b;
      normA += a * a;
      normB += b * b;
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
