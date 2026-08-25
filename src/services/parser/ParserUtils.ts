import { ParseQuality, DecisionOutcome } from '../../types';

export class ParserUtils {
  /**
   * 计算字符串的 SHA-256 内容摘要
   */
  public static async calculateContentHash(text: string): Promise<string> {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      try {
        const msgUint8 = new TextEncoder().encode(normalized);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      } catch (_) {}
    }

    // 备用简易 Hash 计算
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
  }

  /**
   * 提取案号
   * 覆盖深圳人社仲裁标准案号：深劳人仲案[2023]XXXX号 / 深劳人仲案（2023）XXXX号 / 深(XX)劳人仲裁[2023]XX号 / 深劳人仲裁字[202X]XX号
   */
  public static extractCaseNumber(text: string): string | null {
    const patterns = [
      /深[男女]?\s*[\(（\[]?\s*([0-9]{4})\s*[\)）\]]?\s*劳人仲[案裁字]?\s*[\(（\[]?\s*([0-9]{4})?\s*[\)）\]]?\s*[第号\d\s\-]+/i,
      /深[\u4e00-\u9fa5]{0,6}劳人仲[案裁字][\(（\[]?\s*(\d{4})\s*[\)）\]]?\s*[\d号\-]+/i,
      /深劳人仲[\u4e00-\u9fa5]{0,4}[（(\[]\s*(\d{4})\s*[)）\]]\s*\d+\s*号/i,
      /[（(\[]\s*(20\d\d)\s*[)）\]]\s*深\s*[\u4e00-\u9fa5]{0,6}\s*民\s*[初终再申字]?\s*\d+\s*号/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0].replace(/\s+/g, '').trim();
      }
    }
    return null;
  }

  /**
   * 提取裁决日期与年份
   */
  public static extractDate(text: string): { dateStr: string | null; year: number; month?: number } {
    // 匹配如：二〇二三年八月十五日 或 2023年8月15日 或 2023-08-15
    const chineseDateMatch = text.match(/([二〇一二三四五六七八九〇0-9]{4})\s*年\s*([一二三四五六七八九十0-9]{1,3})\s*月\s*([一二三四五六七八九十0-9]{1,3})\s*日/);
    if (chineseDateMatch) {
      const yStr = chineseDateMatch[1];
      const mStr = chineseDateMatch[2];
      const dStr = chineseDateMatch[3];
      const y = ParserUtils.parseChineseYear(yStr);
      const m = ParserUtils.parseChineseNum(mStr);
      const d = ParserUtils.parseChineseNum(dStr);
      if (y > 2000 && y < 2035) {
        const fullDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        return { dateStr: fullDate, year: y, month: m };
      }
    }

    const standardDateMatch = text.match(/(20[12]\d)[年\-\/\.](0?[1-9]|1[0-2])[月\-\/\.](0?[1-9]|[12]\d|3[01])日?/);
    if (standardDateMatch) {
      const y = parseInt(standardDateMatch[1], 10);
      const m = parseInt(standardDateMatch[2], 10);
      const d = parseInt(standardDateMatch[3], 10);
      const fullDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      return { dateStr: fullDate, year: y, month: m };
    }

    // 从案号中提取年份兜底
    const yearInCase = text.match(/[（(\[]\s*(20\d\d)\s*[)）\]]/);
    if (yearInCase) {
      const y = parseInt(yearInCase[1], 10);
      return { dateStr: `${y}-01-01`, year: y };
    }

    return { dateStr: null, year: new Date().getFullYear() };
  }

  private static parseChineseYear(str: string): number {
    const numMap: Record<string, string> = {
      '〇': '0', '零': '0', '0': '0',
      '一': '1', '1': '1',
      '二': '2', '2': '2',
      '三': '3', '3': '3',
      '四': '4', '4': '4',
      '五': '5', '5': '5',
      '六': '6', '6': '6',
      '七': '7', '7': '7',
      '八': '8', '8': '8',
      '九': '9', '9': '9',
    };
    const digits = str.split('').map((c) => numMap[c] || c).join('');
    const parsed = parseInt(digits, 10);
    return isNaN(parsed) ? new Date().getFullYear() : parsed;
  }

  private static parseChineseNum(str: string): number {
    const direct = parseInt(str, 10);
    if (!isNaN(direct)) return direct;
    if (str === '十') return 10;
    if (str.startsWith('十')) {
      return 10 + (ParserUtils.parseChineseYear(str[1]) || 0);
    }
    if (str.endsWith('十')) {
      return (ParserUtils.parseChineseYear(str[0]) || 1) * 10;
    }
    if (str.includes('十')) {
      const parts = str.split('十');
      return (ParserUtils.parseChineseYear(parts[0]) || 1) * 10 + (ParserUtils.parseChineseYear(parts[1]) || 0);
    }
    return ParserUtils.parseChineseYear(str) || 1;
  }

  /**
   * 提取仲裁委员会名称
   */
  public static extractCommittee(text: string): string {
    const committees = [
      '深圳市劳动人事争议仲裁委员会',
      '深圳市福田区劳动人事争议仲裁委员会',
      '深圳市南山区劳动人事争议仲裁委员会',
      '深圳市宝安区劳动人事争议仲裁委员会',
      '深圳市龙岗区劳动人事争议仲裁委员会',
      '深圳市龙华区劳动人事争议仲裁委员会',
      '深圳市坪山区劳动人事争议仲裁委员会',
      '深圳市光明区劳动人事争议仲裁委员会',
      '深圳市盐田区劳动人事争议仲裁委员会',
      '深圳市罗湖区劳动人事争议仲裁委员会',
      '深圳市大鹏新区劳动人事争议仲裁委员会',
      '深圳前海蛇口自贸区劳动人事争议仲裁委员会',
    ];

    for (const c of committees) {
      if (text.includes(c)) return c;
    }

    // 正则匹配
    const match = text.match(/(深圳市?(?:[福南宝龙坪光盐罗大][\u4e00-\u9fa5]{1,4})?劳动(?:人事)?争议仲裁委员会)/);
    if (match) return match[1];

    return '深圳市劳动人事争议仲裁委员会';
  }

  /**
   * 提取当事人信息
   */
  public static extractParties(text: string): { applicant: string; respondent: string; applicantIsEmployee: boolean } {
    let applicant = '申请人（未载明）';
    let respondent = '被申请人（未载明）';
    let applicantIsEmployee = true;

    // 申请人提取
    const appMatch = text.match(/申请人[：:\s]+([^，,。\n\r]+)/);
    if (appMatch) {
      applicant = appMatch[1].trim().replace(/[（\(].*?[）\)]/g, '').trim();
    }

    // 被申请人提取
    const respMatch = text.match(/被申请人[：:\s]+([^，,。\n\r]+)/);
    if (respMatch) {
      respondent = respMatch[1].trim().replace(/[（\(].*?[）\)]/g, '').trim();
    }

    if (applicant.includes('公司') || applicant.includes('厂') || applicant.includes('企业')) {
      applicantIsEmployee = false;
    }

    return { applicant, respondent, applicantIsEmployee };
  }

  /**
   * 提取援引法律条文
   */
  public static extractLegalBasis(text: string): string[] {
    const legalSet = new Set<string>();
    const patterns = [
      /《中华人民共和国劳动合同法》第[一二三四五六七八九十百0-9、及]+条/g,
      /《中华人民共和国劳动争议调解仲裁法》第[一二三四五六七八九十百0-9、及]+条/g,
      /《中华人民共和国劳动法》第[一二三四五六七八九十百0-9、及]+条/g,
      /《中华人民共和国社会保险法》第[一二三四五六七八九十百0-9、及]+条/g,
      /《深圳经济特区和谐劳动关系促进条例》第[一二三四五六七八九十百0-9、及]+条/g,
      /《深圳市员工工资支付条例》第[一二三四五六七八九十百0-9、及]+条/g,
      /《工伤保险条例》第[一二三四五六七八九十百0-9、及]+条/g,
      /《最高人民法院关于审理劳动争议案件适用法律问题的解释[（(]一[)）]》第[一二三四五六七八九十百0-9、及]+条/g,
    ];

    for (const p of patterns) {
      const matches = text.match(p);
      if (matches) {
        matches.forEach((m) => legalSet.add(m.trim()));
      }
    }

    if (legalSet.size === 0) {
      if (text.includes('劳动合同法')) legalSet.add('《中华人民共和国劳动合同法》');
      if (text.includes('深圳市员工工资支付条例')) legalSet.add('《深圳市员工工资支付条例》');
      if (text.includes('劳动争议调解仲裁法')) legalSet.add('《中华人民共和国劳动争议调解仲裁法》');
    }

    return Array.from(legalSet);
  }

  /**
   * 自动生成争议标签
   */
  public static generateDisputeTags(text: string): string[] {
    const tags: Set<string> = new Set();
    const tagMapping: Array<{ tag: string; keywords: string[] }> = [
      { tag: '违法解除', keywords: ['违法解除', '旷工', '严重违反', '违纪解除', '单方解除', '辞退', '开除', '第三十九条', '第39条', '第八十七条', '第87条', '通知工会'] },
      { tag: '加班工资', keywords: ['加班费', '加班工资', '延时工作', '法定节假日加班', '休息日加班', '计件加班', '综合工时', '考勤记录', '打卡记录', '工资支付条例'] },
      { tag: '经济补偿', keywords: ['经济补偿', '经济补偿金', '第四十六条', '第四十七条', '第46条', '第47条', '协商解除', '被迫辞职', '未及时足额支付'] },
      { tag: '未签劳动合同', keywords: ['未签书面劳动合同', '未签订劳动合同', '二倍工资', '双倍工资', '第八十二条', '第82条', '事实劳动关系'] },
      { tag: '调岗降薪', keywords: ['调岗', '降薪', '调整工作岗位', '变动工作地点', '工作地点变更', '用工自主权', '职务调整'] },
      { tag: '年终奖与绩效', keywords: ['年终奖', '绩效', '提成', '奖金', '考核', 'KPI', '绩效工资', '第十三薪'] },
      { tag: '工伤待遇', keywords: ['工伤', '工伤认定', '停工留薪', '伤残补助金', '医疗费', '一次性工伤医疗补助金'] },
      { tag: '竞业限制', keywords: ['竞业限制', '竞业补偿金', '商业秘密', '保密协议', '竞业违约金', '第二十三条', '第23条'] },
      { tag: '试用期争议', keywords: ['试用期', '不符合录用条件', '试用期解除', '第十九条', '第二十条'] },
      { tag: '社会保险', keywords: ['社会保险', '社保', '公积金', '补缴社保', '住房公积金'] },
    ];

    for (const item of tagMapping) {
      if (item.keywords.some((kw) => text.includes(kw))) {
        tags.add(item.tag);
      }
    }

    if (tags.size === 0) {
      tags.add('劳动报酬争议');
    }

    return Array.from(tags);
  }

  /**
   * 裁决结果倾向判定
   */
  public static determineDecisionOutcome(decisionText: string, text: string): DecisionOutcome {
    const d = decisionText || text;
    if (d.includes('调解协议') || d.includes('达成调解') || d.includes('撤回仲裁申请')) {
      return '调解/其他';
    }

    const hasRejectAll = d.includes('驳回申请人的全部仲裁请求') || d.includes('驳回申请人的仲裁请求') || d.includes('驳回申请人全部仲裁请求');
    const hasPayOrders = d.includes('支付') || d.includes('连带责任') || d.includes('确认劳动关系') || d.includes('赔偿金') || d.includes('补偿金');

    if (hasRejectAll && !hasPayOrders) {
      return '用人单位胜诉';
    }

    if (d.includes('驳回申请人的其他仲裁请求') && hasPayOrders) {
      return '部分支持';
    }

    if (hasPayOrders) {
      return '用人单位败诉';
    }

    return '部分支持';
  }

  /**
   * 计算解析质量评分 (0 - 100)
   */
  public static calculateQualityScore(fields: {
    caseNumber: boolean;
    date: boolean;
    committee: boolean;
    parties: boolean;
    claims: boolean;
    facts: boolean;
    reasoning: boolean;
    decision: boolean;
  }): ParseQuality {
    let score = 0;
    const unrecognized: string[] = [];

    if (fields.caseNumber) score += 15;
    else unrecognized.push('案号');

    if (fields.date) score += 10;
    else unrecognized.push('裁判日期');

    if (fields.committee) score += 10;
    else unrecognized.push('仲裁委员会');

    if (fields.parties) score += 15;
    else unrecognized.push('当事人');

    if (fields.claims) score += 15;
    else unrecognized.push('仲裁请求');

    if (fields.facts) score += 10;
    else unrecognized.push('查明事实');

    if (fields.reasoning) score += 15;
    else unrecognized.push('仲裁庭认定');

    if (fields.decision) score += 10;
    else unrecognized.push('裁决结果');

    return {
      overall: score,
      caseNumber: fields.caseNumber,
      date: fields.date,
      committee: fields.committee,
      parties: fields.parties,
      claims: fields.claims,
      facts: fields.facts,
      reasoning: fields.reasoning,
      decision: fields.decision,
      unrecognizedFields: unrecognized,
    };
  }
}
