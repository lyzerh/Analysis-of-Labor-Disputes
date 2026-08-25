/**
 * 深圳劳动仲裁文书本地研究库 - 劳动争议要素抽取器 (DisputeElementExtractor)
 * 基于本地精确规则词典，支持多标签识别与上下文片段提取
 */

export interface DisputeElementMatch {
  tag: string;
  category: '解除终止' | '劳动报酬' | '权益保障' | '管理履约' | '其他';
  matchedKeywords: string[];
  snippet: string;
  confidence: number;
}

export interface DisputeRule {
  tag: string;
  category: '解除终止' | '劳动报酬' | '权益保障' | '管理履约' | '其他';
  patterns: RegExp[];
  weight: number;
}

export const DISPUTE_RULES: DisputeRule[] = [
  {
    tag: '解除',
    category: '解除终止',
    patterns: [
      /(?:违法解除|解除劳动合同|通知解除|解除劳动关系|辞退|开除|解聘)/,
      /(?:用人单位解除|劳动者解除|单方解除)/,
    ],
    weight: 0.9,
  },
  {
    tag: '终止',
    category: '解除终止',
    patterns: [
      /(?:终止劳动合同|合同到期终止|劳动合同期满|终止劳动关系)/,
    ],
    weight: 0.85,
  },
  {
    tag: '经济补偿',
    category: '解除终止',
    patterns: [
      /(?:经济补偿金?|解除经济补偿|补偿金[0-9]+元|支付经济补偿)/,
    ],
    weight: 0.9,
  },
  {
    tag: '赔偿金',
    category: '解除终止',
    patterns: [
      /(?:违法解除劳动合同赔偿金|双倍赔偿金|赔偿金[0-9]+元|赔偿金争议)/,
    ],
    weight: 0.95,
  },
  {
    tag: '工资',
    category: '劳动报酬',
    patterns: [
      /(?:拖欠工资|未付工资|克扣工资|补发工资|基本工资|绩效工资|工资差额)/,
      /(?:提成工资|岗位工资|津贴|年终奖金?)/,
    ],
    weight: 0.85,
  },
  {
    tag: '加班',
    category: '劳动报酬',
    patterns: [
      /(?:加班工资|加班费|延长工作时间加班|休息日加班|法定节假日加班|延时加班)/,
    ],
    weight: 0.9,
  },
  {
    tag: '年休假',
    category: '劳动报酬',
    patterns: [
      /(?:带薪年休假|年休假工资|未休年休假|应休未休年休假)/,
    ],
    weight: 0.9,
  },
  {
    tag: '竞业限制',
    category: '管理履约',
    patterns: [
      /(?:竞业限制|竞业禁止|竞业限制补偿金|违约金|保密协议)/,
    ],
    weight: 0.95,
  },
  {
    tag: '调岗',
    category: '管理履约',
    patterns: [
      /(?:调岗|调整工作岗位|调岗降薪|调整职务|变更工作地点|岗位变动)/,
    ],
    weight: 0.9,
  },
  {
    tag: '劳动关系',
    category: '权益保障',
    patterns: [
      /(?:确认劳动关系|事实劳动关系|未订立书面劳动合同|双倍工资|未签合同)/,
    ],
    weight: 0.9,
  },
  {
    tag: '工伤',
    category: '权益保障',
    patterns: [
      /(?:工伤认定|工伤保险待遇|停工留薪期|一次性伤残补助金|伤残津贴|工伤医疗)/,
    ],
    weight: 0.95,
  },
  {
    tag: '社保',
    category: '权益保障',
    patterns: [
      /(?:社会保险|社保补缴|未缴纳社保|住房公积金|养老保险|医疗保险)/,
    ],
    weight: 0.85,
  },
  {
    tag: '严重违纪',
    category: '解除终止',
    patterns: [
      /(?:严重违纪|严重违反用人单位的规章制度|严重违反劳动纪律|违反公司规定)/,
    ],
    weight: 0.95,
  },
  {
    tag: '旷工',
    category: '管理履约',
    patterns: [
      /(?:旷工|无故缺勤|连续旷工|擅自离岗|脱岗|未按规定请假)/,
    ],
    weight: 0.9,
  },
  {
    tag: '不能胜任工作',
    category: '解除终止',
    patterns: [
      /(?:不能胜任工作|不胜任|绩效不合格|经培训或者调整工作岗位|试用期不符合录用条件)/,
    ],
    weight: 0.9,
  },
  {
    tag: '试用期',
    category: '管理履约',
    patterns: [
      /(?:试用期|试用期内|录用条件|试用期工资|试用期解除)/,
    ],
    weight: 0.9,
  },
  {
    tag: '规章制度',
    category: '管理履约',
    patterns: [
      /(?:规章制度|员工手册|奖惩制度|考勤管理制度|公司制度)/,
    ],
    weight: 0.85,
  },
];

export class DisputeElementExtractor {
  /**
   * 提取文书涉及的所有争议要素标签
   */
  public static extract(text: string): DisputeElementMatch[] {
    if (!text) return [];

    const matches: DisputeElementMatch[] = [];

    for (const rule of DISPUTE_RULES) {
      const foundKeywords: string[] = [];
      let bestSnippet = '';

      for (const pattern of rule.patterns) {
        const m = text.match(pattern);
        if (m) {
          foundKeywords.push(m[0]);
          if (!bestSnippet && m.index !== undefined) {
            const start = Math.max(0, m.index - 20);
            const end = Math.min(text.length, m.index + m[0].length + 30);
            bestSnippet = text.slice(start, end).replace(/\n+/g, ' ').trim();
          }
        }
      }

      if (foundKeywords.length > 0) {
        matches.push({
          tag: rule.tag,
          category: rule.category,
          matchedKeywords: Array.from(new Set(foundKeywords)),
          snippet: bestSnippet,
          confidence: Math.min(1, rule.weight + (foundKeywords.length > 1 ? 0.05 : 0)),
        });
      }
    }

    return matches;
  }
}
