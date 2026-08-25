/**
 * 深圳劳动仲裁文书本地研究库 - 本地文本预处理器 (TextProcessor)
 * 纯本地浏览器执行，不调用任何外部 API，保留原文 rawText 不变。
 */

export interface TextSectionOffsets {
  header?: string;
  claims?: string;
  applicantArguments?: string;
  respondentArguments?: string;
  evidence?: string;
  facts?: string;
  reasoning?: string;
  decision?: string;
  legalBasis?: string;
}

export interface ExtractedEntities {
  applicantName?: string;
  respondentName?: string;
  dates: string[];
  amounts: number[];
  caseNumber?: string;
  committee?: string;
}

export interface LegalArticleMatch {
  lawName: string;
  article: string;
  fullText: string;
}

export class TextProcessor {
  /**
   * 1. HTML 清洗
   * 将含有标签的 HTML 文本清洗为规范文本，保留段落结构
   */
  public static cleanHtml(html: string): string {
    if (!html) return '';

    let text = html
      // 移除 script 和 style
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      // 换行标签转换行符
      .replace(/<(?:br|p|div|tr|li|h[1-6])\b[^>]*>/gi, '\n')
      .replace(/<\/(?:p|div|tr|li|h[1-6])>/gi, '\n')
      // 移除所有其余 HTML 标签
      .replace(/<[^>]+>/g, '')
      // 常见 HTML 实体转义
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&mdash;/gi, '—')
      .replace(/&ldquo;|&rdquo;/gi, '"');

    return this.normalizePunctuation(text);
  }

  /**
   * 2. 中文标点标准化
   * 规范全角半角标点符号，处理异常空格
   */
  public static normalizePunctuation(text: string): string {
    if (!text) return '';

    return text
      // 统一连续空白
      .replace(/[ \t\f\v\u00A0\u3000]+/g, ' ')
      // 统一英文逗号、句号到中文句读环境下的规范形式
      .replace(/，/g, '，')
      .replace(/。/g, '。')
      .replace(/：/g, '：')
      .replace(/；/g, '；')
      .replace(/（/g, '（')
      .replace(/）/g, '）')
      .replace(/【/g, '【')
      .replace(/】/g, '】')
      .replace(/“|”/g, '"')
      .replace(/‘|’/g, "'")
      // 统一多余换行符
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * 3. 段落切分
   * 将长文按语义空行/换行切分为清晰的段落数组
   */
  public static splitParagraphs(text: string): string[] {
    if (!text) return [];
    const normalized = this.normalizePunctuation(text);
    return normalized
      .split(/\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }

  /**
   * 4. 去除无意义重复官方文本与页眉页脚
   */
  public static removeBoilerplate(text: string): string {
    if (!text) return '';

    const boilerplatePatterns = [
      /深圳市人力资源和社会保障局\s*公开裁决文书/gi,
      /免责声明[：:][\s\S]*?(?=\n|$)/gi,
      /技术支持[：:][\s\S]*?(?=\n|$)/gi,
      /页面生成时间[：:][\s\S]*?(?=\n|$)/gi,
      /本网站所有内容仅供参考[\s\S]*?(?=\n|$)/gi,
      /【打印本页】|【关闭窗口】|【返回顶部】/gi,
    ];

    let cleaned = text;
    for (const pattern of boilerplatePatterns) {
      cleaned = cleaned.replace(pattern, '');
    }

    return cleaned.trim();
  }

  /**
   * 5. 章节识别
   * 准确定位文书中：基本信息、仲裁请求、申请人主张、被申请人答辩、证据质证、事实认定、说理理由、裁决结果、法律条文
   */
  public static recognizeSections(text: string): TextSectionOffsets {
    const clean = this.removeBoilerplate(text);
    const sections: TextSectionOffsets = {};

    // 申请人主张 / 仲裁请求区域
    const claimsMatch = clean.match(
      /(?:申请人(?:向本委)?(?:提出|主张|诉称|申诉称|仲裁请求)[：:\s]*)([\s\S]*?)(?=(?:被申请人(?:辩称|答辩|答辩称|称)|经(?:本委)?审理查明|经查明|本委查明|双方无争议事实|$))/
    );
    if (claimsMatch) {
      sections.claims = claimsMatch[1].trim();
      sections.applicantArguments = claimsMatch[1].trim();
    }

    // 被申请人答辩与抗辩区域 (核心：用于企业抗辩识别)
    const respondentMatch = clean.match(
      /(?:被申请人(?:辩称|答辩|答辩称|辩诉|答称|主张)[：:\s]*)([\s\S]*?)(?=(?:经(?:本委)?审理查明|经查明|本委查明|本委认为|仲裁庭认为|仲裁庭评述|依照.*裁决如下|裁决如下|$))/
    );
    if (respondentMatch) {
      sections.respondentArguments = respondentMatch[1].trim();
    }

    // 证据举证质证区域
    const evidenceMatch = clean.match(
      /(?:为证明其主张|证据(?:如下|名称|清单)|当事人围绕仲裁请求提交证据|举证质证情况|当事人举证质证)[：:\s]*([\s\S]*?)(?=(?:经(?:本委)?审理查明|本委认为|仲裁庭认为|裁决如下|$))/
    );
    if (evidenceMatch) {
      sections.evidence = evidenceMatch[1].trim();
    }

    // 事实认定区域
    const factsMatch = clean.match(
      /(?:经(?:本委)?审理查明|本委查明事实如下|查明事实|查明如下|经审理查明)[：:\s]*([\s\S]*?)(?=(?:本委认为|仲裁庭认为|仲裁庭评述|仲裁庭认定|依照.*裁决如下|裁决如下|$))/
    );
    if (factsMatch) {
      sections.facts = factsMatch[1].trim();
    }

    // 裁判理由 / 说理区域 (核心：用于败诉原因识别)
    const reasoningMatch = clean.match(
      /(?:本委认为|仲裁庭认为|仲裁庭评述|仲裁庭认定|关于.*问题，本委认为)[：:\s]*([\s\S]*?)(?=(?:综上|依照|依据|裁决如下|裁决结果|$))/
    );
    if (reasoningMatch) {
      sections.reasoning = reasoningMatch[1].trim();
    }

    // 裁决结果主文
    const decisionMatch = clean.match(
      /(?:裁决如下|裁决结果)[：:\s]*([\s\S]*?)(?=(?:如不服本裁决|当事人如不服|双方当事人如不服|本裁决为终局裁决|本裁决为非终局裁决|$))/
    );
    if (decisionMatch) {
      sections.decision = decisionMatch[1].trim();
    }

    // 法律依据区域
    const legalMatch = clean.match(
      /(?:依照|依据|根据)《([^》]+)》([第0-9一二三四五六七八九十百千条款项、及及\s]+)(?:之规定)?(?:，?裁决如下)?/
    );
    if (legalMatch) {
      sections.legalBasis = legalMatch[0].trim();
    }

    return sections;
  }

  /**
   * 6. 法律条文编号识别
   * 识别文书中援引的具体法律、行政法规及条文序号
   */
  public static extractLegalArticles(text: string): LegalArticleMatch[] {
    if (!text) return [];

    const results: LegalArticleMatch[] = [];
    const pattern = /《([^》]+)》[第\s]*([0-9一二三四五六七八九十百]+)\s*条(?:[第\s]*([0-9一二三四五六七八九十]+)\s*款)?(?:[第\s]*([0-9一二三四五六七八九十]+)\s*项)?/g;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const lawName = match[1].trim();
      const articleNum = match[2].trim();
      const paragraphNum = match[3] ? `第${match[3]}款` : '';
      const itemNum = match[4] ? `第${match[4]}项` : '';

      results.push({
        lawName,
        article: `第${articleNum}条${paragraphNum}${itemNum}`,
        fullText: match[0].trim(),
      });
    }

    return results;
  }

  /**
   * 7. 人名、公司名、日期、金额等关键实体识别
   */
  public static extractEntities(text: string): ExtractedEntities {
    const clean = this.normalizePunctuation(text);
    const entities: ExtractedEntities = {
      dates: [],
      amounts: [],
    };

    // 案号识别
    const caseNumMatch = clean.match(/(?:深|粤)[0-9a-zA-Z\u4e00-\u9fa5（\(\[\{【]{2,8}[0-9]{4}[）\)\]\}】][0-9a-zA-Z\u4e00-\u9fa5]{0,8}第?[0-9一二三四五六七八九十]+号/);
    if (caseNumMatch) {
      entities.caseNumber = caseNumMatch[0].trim();
    }

    // 仲裁委识别
    const committeeMatch = clean.match(/深圳市(?:[\u4e00-\u9fa5]{2,6}区)?劳动(?:人事)?争议仲裁委员会/);
    if (committeeMatch) {
      entities.committee = committeeMatch[0].trim();
    }

    // 申请人识别
    const applicantMatch = clean.match(/申请人[：:\s]*([^\n，,。；;]{2,40})/);
    if (applicantMatch) {
      entities.applicantName = applicantMatch[1].trim();
    }

    // 被申请人识别
    const respondentMatch = clean.match(/被申请人[：:\s]*([^\n，,。；;]{2,40})/);
    if (respondentMatch) {
      entities.respondentName = respondentMatch[1].trim();
    }

    // 日期识别
    const dateMatches = clean.match(/[12][0-9]{3}年[01]?[0-9]月[0-3]?[0-9]日/g);
    if (dateMatches) {
      entities.dates = Array.from(new Set(dateMatches));
    }

    // 裁决金额识别
    const amountMatches = clean.match(/(?:支付|赔偿|补偿|返还|金额为?)[^\d\n。]{0,8}([0-9]+(?:\.[0-9]{1,2})?)\s*元/g);
    if (amountMatches) {
      const numbers: number[] = [];
      for (const m of amountMatches) {
        const numMatch = m.match(/([0-9]+(?:\.[0-9]{1,2})?)/);
        if (numMatch) {
          const val = parseFloat(numMatch[1]);
          if (val > 0 && val < 100000000) {
            numbers.push(val);
          }
        }
      }
      entities.amounts = Array.from(new Set(numbers));
    }

    return entities;
  }
}
