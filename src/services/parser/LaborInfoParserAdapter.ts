import { CityResolver } from "./CityResolver";
import {
  ArbitrationCase,
  ClaimSupportStatus,
  DecisionOutcome,
  EmployerDefenseItem,
  EvidenceItem,
  LaborInfoClaimItem,
  LaborInfoParsedResult,
  LegalOutcomeType,
  PartyRecognitionResult,
  ParseQuality,
  ParseStatus,
  RawDocument,
} from '../../types';
import { ParserUtils } from './ParserUtils';

/**
 * 工劳网文书结构化解析适配器
 * 职责：将工劳网 RawDocument (包括裁判文书正文与元数据) 解析为标准结构化 ArbitrationCase 对象
 */
export class LaborInfoParserAdapter {
  /**
   * 主解析入口：输入 RawDocument -> 输出 ArbitrationCase
   */
  public static parse(rawDoc: RawDocument): ArbitrationCase {
    const parsedResult = this.parseDetailed(rawDoc);
    return parsedResult.arbitrationCase;
  }

  /**
   * 详细解析入口：包含详细诊断、耗时、完整率指标及中间衍生结构
   */
  public static parseDetailed(rawDoc: RawDocument): LaborInfoParsedResult {
    const startTime = performance.now();
    const text = (rawDoc.rawText || '').trim();
    const meta = rawDoc.sourceMetadata || {};

    // 1. 基础信息解析
    const baseInfo = this.extractBaseInfo(rawDoc, text, meta);

    // 2. 当事人识别 (严谨基于特征词、组织机构后缀、代词关系及上下文，不简单以原告/被告区分)
    const parties = this.recognizeParties(text, baseInfo.caseTitle);

    // 3. 争议类型识别
    const disputeType = this.extractDisputeTypes(text, baseInfo.caseTitle);

    // 4. 提取裁判主文与审理意见部分文本 (分段切分)
    const sections = this.segmentText(text);

    // 5. 提取诉求并识别支持状态
    const claims = this.extractClaimsWithSupport(text, sections, parties);

    // 6. 企业抗辩识别
    const employerDefenses = this.extractEmployerDefenses(text, sections);

    // 7. 证据识别
    const evidence = this.extractEvidence(text, sections);

    // 8. 裁判理由与核心法理要点
    const courtReasoning = sections.reasoning || this.extractCourtReasoningFallback(text);
    const keyLegalPoints = this.extractKeyLegalPoints(courtReasoning || text);

    // 9. 结果四分类判定 (禁止根据标题猜测，必须根据裁决主文与理由深度综合判定)
    const outcomes = this.determineOutcomes(sections.decision || '', claims, parties, employerDefenses);

    // 10. 计算涉案裁决赔偿金额
    const compensationAmount = this.extractCompensationAmount(sections.decision || '');

    // 11. 提取法律法条依据
    const legalBasis = ParserUtils.extractLegalBasis(text);

    // 12. 构建标准 ArbitrationCase
    const caseId = `case_${rawDoc.id}`;
    const dateObj = ParserUtils.extractDate(baseInfo.date || text);

    // 映射裁决结果至现有的 DecisionOutcome
    const mappedDecisionOutcome: DecisionOutcome = this.mapToDecisionOutcome(outcomes.overallResult, parties);

    const parseQuality: ParseQuality = {
      overall: 0,
      caseNumber: !!baseInfo.caseNumber && baseInfo.caseNumber !== '未载明案号',
      date: !!baseInfo.date,
      committee: !!baseInfo.court,
      parties: !!(parties.employeeParty || parties.employerParty),
      claims: claims.length > 0,
      facts: !!sections.facts && sections.facts.length > 20,
      reasoning: !!courtReasoning && courtReasoning.length > 20,
      decision: !!sections.decision && sections.decision.length > 10,
      unrecognizedFields: [],
    };

    let score = 0;
    if (parseQuality.caseNumber) score += 15; else parseQuality.unrecognizedFields.push('案号');
    if (parseQuality.date) score += 10; else parseQuality.unrecognizedFields.push('裁决/裁判日期');
    if (parseQuality.committee) score += 10; else parseQuality.unrecognizedFields.push('审理法院/仲裁委');
    if (parseQuality.parties) score += 15; else parseQuality.unrecognizedFields.push('双方当事人');
    if (parseQuality.claims) score += 15; else parseQuality.unrecognizedFields.push('诉求清单');
    if (parseQuality.facts) score += 10; else parseQuality.unrecognizedFields.push('案件事实');
    if (parseQuality.reasoning) score += 15; else parseQuality.unrecognizedFields.push('裁判理由');
    if (parseQuality.decision) score += 10; else parseQuality.unrecognizedFields.push('裁判主文');
    parseQuality.overall = score;

    const parseStatus: ParseStatus = score >= 60 ? 'success' : (score >= 30 ? 'partial' : 'failed');

    const arbitrationCase: ArbitrationCase = {
      id: caseId,
      rawDocumentId: rawDoc.id,
      source: 'laborinfo',
      sourceUrl: rawDoc.sourceUrl,
      title: baseInfo.caseTitle,
      caseNumber: baseInfo.caseNumber,
      publishedDate: baseInfo.date,
      year: dateObj.year,
      month: dateObj.month,
      arbitrationCommittee: baseInfo.court || '人民法院',

      applicant: parties.applicantRole === 'employee' ? (parties.employeeParty || '员工方') : (parties.employerParty || '用人单位方'),
      respondent: parties.applicantRole === 'employee' ? (parties.employerParty || '用人单位方') : (parties.employeeParty || '员工方'),
      applicantIsEmployee: parties.applicantRole === 'employee',

      claims: claims.map((c) => `${c.claimName} (${c.supportStatus === 'supported' ? '支持' : c.supportStatus === 'partially_supported' ? '部分支持' : c.supportStatus === 'not_supported' ? '驳回' : '未定'})`),
      facts: sections.facts || text.slice(0, 500),
      applicantArguments: sections.applicantArgs,
      respondentArguments: sections.respondentArgs,
      tribunalReasoning: courtReasoning,
      decision: sections.decision || ''.slice(-600),
      compensationAmount,
      decisionOutcome: mappedDecisionOutcome,
      legalBasis,
      disputeTags: disputeType,
      parseStatus,
      parseQuality,
      parsedAt: new Date().toISOString(),
    };

    const durationMs = Math.round(performance.now() - startTime);

    // 字段完整度自检清单
    const completenessDetails: Record<string, boolean> = {
      caseTitle: !!baseInfo.caseTitle,
      court: !!baseInfo.court,
      date: !!baseInfo.date,
      caseLevel: !!baseInfo.caseLevel,
      province: !!baseInfo.province,
      city: !!baseInfo.city,
      caseNumber: !!baseInfo.caseNumber,
      employeeParty: !!parties.employeeParty,
      employerParty: !!parties.employerParty,
      disputeType: disputeType.length > 0,
      claims: claims.length > 0,
      employerDefenses: employerDefenses.length > 0,
      evidence: evidence.length > 0,
      courtReasoning: !!courtReasoning && courtReasoning.length > 20,
      keyLegalPoints: keyLegalPoints.length > 0,
      overallResult: outcomes.overallResult !== 'unclear',
    };

    const filledCount = Object.values(completenessDetails).filter(Boolean).length;
    const totalFields = Object.keys(completenessDetails).length;
    const completenessScore = Math.round((filledCount / totalFields) * 100);

    return {
      caseTitle: baseInfo.caseTitle,
      court: baseInfo.court,
      date: baseInfo.date,
      caseLevel: baseInfo.caseLevel,
      province: baseInfo.province,
      city: baseInfo.city,
      caseNumber: baseInfo.caseNumber,
      employeeParty: parties.employeeParty,
      employerParty: parties.employerParty,
      partyConfidence: parties.confidence,
      disputeType,
      claims,
      employerDefenses,
      evidence,
      courtReasoning,
      keyLegalPoints,
      employeeOutcome: outcomes.employeeOutcome,
      employerOutcome: outcomes.employerOutcome,
      overallResult: outcomes.overallResult,
      arbitrationCase,
      rawTextLength: text.length,
      parseDurationMs: durationMs,
      fieldCompleteness: {
        score: completenessScore,
        filledFields: filledCount,
        totalFields,
        details: completenessDetails,
      },
    };
  }

  /**
   * 1. 基础信息抽取 (标题、法院、日期、层级、省份、城市、案号)
   */
  private static extractBaseInfo(rawDoc: RawDocument, text: string, meta: Record<string, any>) {
    // 标题
    const caseTitle =
      rawDoc.title ||
      meta.title ||
      meta.name ||
      text.slice(0, 100).split('\n')[0]?.trim() ||
      '工劳网判决文书';

    // 法院 / 仲裁委
    let court = meta.court || meta.court_name || meta.courtName || '';
    if (!court) {
      const courtMatch = text.match(/([\u4e00-\u9fa5]{2,12}(?:高级|中级|基层)?人民法院|[\u4e00-\u9fa5]{2,12}劳动(?:人事)?争议仲裁委员会)/);
      court = courtMatch ? courtMatch[1] : '';
    }

    // 裁判日期
    let date = meta.date || meta.judgement_date || meta.publish_date || '';
    if (!date) {
      const dateExtract = ParserUtils.extractDate(text);
      if (dateExtract.dateStr) {
        date = dateExtract.dateStr;
      }
    }

    // 审判层级 (一审、二审、再审、执行、仲裁)
    let caseLevel = meta.caseLevel || meta.level || meta.trial_round || '';
    if (!caseLevel) {
      if (text.includes('二审') || caseTitle.includes('二审') || text.includes('民终')) {
        caseLevel = '二审';
      } else if (text.includes('一审') || caseTitle.includes('一审') || text.includes('民初')) {
        caseLevel = '一审';
      } else if (text.includes('再审') || text.includes('民申') || text.includes('民再')) {
        caseLevel = '再审';
      } else if (text.includes('仲裁') || text.includes('裁决书')) {
        caseLevel = '仲裁';
      } else {
        caseLevel = '一审';
      }
    }

    // 案号识别
    let caseNumber = meta.case_number || meta.caseNumber || '';
    if (!caseNumber) {
      const standardCaseNumber = text.match(/[（(〔\[]\s*(20\d\d)\s*[)）〕\]]\s*[\u4e00-\u9fa5]{1,8}\s*[\u4e00-\u9fa5]{1,4}\s*[初终再申异执字第]?\s*\d+\s*号/);
      if (standardCaseNumber) {
        caseNumber = standardCaseNumber[0].replace(/\s+/g, '');
      } else {
        const fallbackCaseNum = ParserUtils.extractCaseNumber(text);
        caseNumber = fallbackCaseNum || '未载明案号';
      }
    }

    // 省份与城市识别
    let province = meta.province || '';
    let city = meta.city || '';
    if (!province || !city) {
      const location = CityResolver.resolveCity({ province, court, caseNumber, rawText: text });
      if (!province) province = location.province;
      if (!city) city = location.city;
    }

    

    return { caseTitle, court, date, caseLevel, province, city, caseNumber };
  }

  /**
   * 地理省份城市推断
   */
//  private static extractLocationFromText(text: string): { province: string; city: string } {
//    const provinceMap: Array<{ prov: string; cities: string[] }> = [
//      { prov: '广东省', cities: ['广州', '深圳', '东莞', '佛山', '珠海', '惠州', '中山', '江门', '汕头', '湛江'] },
//      { prov: '北京市', cities: ['北京', '朝阳', '海淀', '西城', '东城', '丰台', '大兴', '通州'] },
//      { prov: '上海市', cities: ['上海', '浦东', '黄浦', '徐汇', '静安', '闵行', '长宁'] },
//      { prov: '江苏省', cities: ['南京', '苏州', '无锡', '常州', '南通', '扬州', '徐州'] },
//      { prov: '浙江省', cities: ['杭州', '宁波', '温州', '嘉兴', '湖州', '绍兴', '金华'] },
//      { prov: '山东省', cities: ['济南', '青岛', '烟台', '潍坊', '淄博'] },
//      { prov: '四川省', cities: ['成都', '绵阳', '德阳', '宜宾'] },
//      { prov: '湖北省', cities: ['武汉', '襄阳', '宜昌', '黄石'] },
//      { prov: '湖南省', cities: ['长沙', '株洲', '湘潭', '衡阳'] },
//      { prov: '重庆市', cities: ['重庆', '渝中', '江北', '渝北', '九龙坡'] },
//      { prov: '福建省', cities: ['福州', '厦门', '泉州', '漳州'] },
//    ];
//
//    for (const p of provinceMap) {
//      if (text.includes(p.prov.replace('省', '').replace('市', ''))) {
//        for (const c of p.cities) {
//          if (text.includes(c)) {
//            return { province: p.prov, city: `${c}市` };
//          }
//        }
//        return { province: p.prov, city: `${p.cities[0]}市` };
//      }
//      for (const c of p.cities) {
//        if (text.includes(c)) {
//          return { province: p.prov, city: `${c}市` };
//        }
//      }
//    }
//
//    return { province: '广东省', city: '深圳市' };
//  }

  /**
   * 2. 当事人识别 (严谨判定 employeeParty 与 employerParty，禁止机械等同于原告/被告)
   */
  public static recognizeParties(text: string, title?: string): PartyRecognitionResult {
    let employeeParty: string | null = null;
    let employerParty: string | null = null;
    let applicantRole: 'employee' | 'employer' | 'unknown' = 'unknown';
    let confidence = 0.5;

    // 常见文书头部的当事人角色模式
    const partyPatterns = [
      /(?:原告|上诉人|申请人|原审原告|申诉人)[（(]?[\u4e00-\u9fa5]{0,6}[)）]?[：:\s]+([^，,。\n\r]+)/g,
      /(?:被告|被上诉人|被申请人|原审被告|被申诉人)[（(]?[\u4e00-\u9fa5]{0,6}[)）]?[：:\s]+([^，,。\n\r]+)/g,
    ];

    const party1Matches: string[] = [];
    const party2Matches: string[] = [];

    let match: RegExpExecArray | null;
    while ((match = partyPatterns[0].exec(text)) !== null) {
      party1Matches.push(this.cleanPartyName(match[1]));
    }
    while ((match = partyPatterns[1].exec(text)) !== null) {
      party2Matches.push(this.cleanPartyName(match[1]));
    }

    const firstParty1 = party1Matches[0] || null;
    const firstParty2 = party2Matches[0] || null;

    // 辅助特征词判断
    const isCompany = (name: string | null): boolean => {
      if (!name) return false;
      const companyKeywords = ['公司', '厂', '企业', '中心', '集团', '行', '店', '事务所', '医院', '学校', '院', '部', '局', '委', '队', '商行', '工作室', '分公司'];
      return companyKeywords.some((kw) => name.includes(kw));
    };

    const isPerson = (name: string | null): boolean => {
      if (!name) return false;
      if (isCompany(name)) return false;
      // 个人姓名通常在 2-4 个汉字，或带有自然人特征
      const clean = name.replace(/[^\u4e00-\u9fa5]/g, '');
      return clean.length >= 2 && clean.length <= 5;
    };

    if (firstParty1 && firstParty2) {
      const p1IsCompany = isCompany(firstParty1);
      const p2IsCompany = isCompany(firstParty2);
      const p1IsPerson = isPerson(firstParty1);
      const p2IsPerson = isPerson(firstParty2);

      if (p1IsPerson && p2IsCompany) {
        employeeParty = firstParty1;
        employerParty = firstParty2;
        applicantRole = 'employee';
        confidence = 0.95;
      } else if (p1IsCompany && p2IsPerson) {
        employerParty = firstParty1;
        employeeParty = firstParty2;
        applicantRole = 'employer';
        confidence = 0.95;
      } else if (p1IsCompany && p2IsCompany) {
        // 双公司（如劳务派遣单位与实际用工单位，或劳务分包），寻找员工姓名
        const workerMatch = text.match(/(?:劳动者|员工|职工|被害人|伤者)[：:\s]*([\u4e00-\u9fa5]{2,4})/);
        if (workerMatch) {
          employeeParty = workerMatch[1];
          employerParty = firstParty1;
          applicantRole = 'employer';
          confidence = 0.75;
        } else {
          employerParty = firstParty1;
          confidence = 0.4;
        }
      } else if (p1IsPerson && p2IsPerson) {
        // 雇主为个体工商户或个人
        employeeParty = firstParty1;
        employerParty = firstParty2;
        applicantRole = 'employee';
        confidence = 0.6;
      }
    } else if (firstParty1) {
      if (isCompany(firstParty1)) {
        employerParty = firstParty1;
        applicantRole = 'employer';
      } else {
        employeeParty = firstParty1;
        applicantRole = 'employee';
      }
      confidence = 0.5;
    }

    // 从正文上下文关联补充
    if (!employeeParty) {
      const workerContextMatch = text.match(/(?:原告|上诉人|申请人|被告|被上诉人)\s*([\u4e00-\u9fa5]{2,4})\s*(?:于|入职|主张|诉称|在[\u4e00-\u9fa5]+工作|系[\u4e00-\u9fa5]+员工)/);
      if (workerContextMatch && !isCompany(workerContextMatch[1])) {
        employeeParty = workerContextMatch[1];
        confidence = Math.max(confidence, 0.7);
      }
    }

    if (!employerParty) {
      const companyContextMatch = text.match(/([\u4e00-\u9fa5]{2,20}(?:有限责任公司|有限公司|厂|企业|经营部))/);
      if (companyContextMatch) {
        employerParty = companyContextMatch[1];
        confidence = Math.max(confidence, 0.7);
      }
    }

    return {
      employeeParty,
      employerParty,
      applicantRole,
      confidence,
      reason: `匹配模式: P1(${firstParty1 || '无'}) / P2(${firstParty2 || '无'}) -> 判定员工: ${employeeParty || '未识别'}, 雇主: ${employerParty || '未识别'}`,
    };
  }

  private static cleanPartyName(name: string): string {
    return name
      .replace(/[（\(].*?[）\)]/g, '')
      .replace(/[,，。、：:].*$/g, '')
      .replace(/\s+/g, '')
      .trim();
  }

  /**
   * 3. 争议类型深度识别 (全方位覆盖劳动争议分类)
   */
  public static extractDisputeTypes(text: string, title?: string): string[] {
    const combined = `${title || ''}\n${text}`;
    
    // 排除干扰词，避免误判
    const cleanedForCompensation = combined
      .replace(/未依法缴纳社会保险经济补偿金/g, '')
      .replace(/社会保险补偿/g, '')
      .replace(/代通知金/g, '');
    
    const cleanedForTermination = combined
      .replace(/违法解除劳动合同赔偿金/g, '')
      .replace(/解除劳动合同经济补偿金/g, '');

    const disputeMap: Array<{ type: string; keywords: string[], targetText?: string }> = [
      {
        type: '违法解除赔偿金',
        keywords: ['违法解除劳动合同赔偿金', '违法辞退赔偿金', '违法解除赔偿金'],
      },
      {
        type: '劳动合同解除',
        keywords: [
          '违法解除', '解除劳动合同', '终止劳动合同', '辞退', '开除', '通知工会', '严重违反规章制度',
          '旷工解除', '协商解除', '被迫解除', '被迫离职', '第三十九条', '第39条', '第四十条', '第40条',
          '第四十六条', '第46条', '第八十七条', '第87条', '赔偿金',
        ],
        targetText: cleanedForTermination
      },
      {
        type: '经济补偿金',
        keywords: [
          '经济补偿金', '经济补偿', 'N+1', '代通知金及经济补偿', '未提前三十日',
          '法定经济补偿', '工作年限补偿',
        ],
        targetText: cleanedForCompensation
      },
      {
        type: '代通知金',
        keywords: ['代通知金', '提前一个月通知'],
      },
      {
        type: '社会保险争议',
        keywords: ['补缴社会保险', '未依法缴纳社会保险', '社会保险补偿', '补缴社保', '社会保险与公积金', '养老保险', '医疗保险'],
      },
      {
        type: '加班工资',
        keywords: [
          '加班工资', '加班费', '延时工作加班费', '延时加班', '休息日加班', '法定节假日加班',
          '周末加班', '打卡记录', '考勤记录', '综合计算工时', '不定时工作制', '计件加班',
        ],
      },
      {
        type: '未签劳动合同二倍工资',
        keywords: [
          '未签书面劳动合同', '未签订劳动合同', '二倍工资', '双倍工资', '第八十二条', '第82条',
          '事实劳动关系', '补签劳动合同',
        ],
      },
      {
        type: '工伤与工伤待遇',
        keywords: [
          '工伤', '工伤认定', '停工留薪期工资', '伤残补助金', '一次性工伤医疗补助金',
          '一次性伤残就业补助金', '伤残津贴', '工伤医疗费', '工伤保险待遇', '劳动能力鉴定',
        ],
      },
      {
        type: '竞业限制',
        keywords: [
          '竞业限制', '竞业限制补偿金', '竞业违约金', '保密协议', '商业秘密', '第二十三条',
          '第二十四条', '竞业限制期',
        ],
      },
      {
        type: '工资报酬与绩效奖金',
        keywords: [
          '拖欠工资', '克扣工资', '绩效工资', '年终奖', '提成', '业务提成', '十三薪',
          '佣金', '岗位津贴', '高温津贴', '未足额支付',
        ],
      },
      {
        type: '试用期争议',
        keywords: ['试用期', '试用期不符合录用条件', '试用期解除', '第十九条', '第二十条', '录用条件'],
      }
    ];

    const types = new Set<string>();
    for (const pat of disputeMap) {
      const target = pat.targetText || combined;
      if (pat.keywords.some((kw) => target.includes(kw))) {
        types.add(pat.type);
      }
    }
    
    // 如果同时存在违法解除赔偿金，将它也归入广义的劳动合同解除，但不混淆经济补偿金
    if (types.has('违法解除赔偿金')) {
      types.add('劳动合同解除');
    }

    if (types.size === 0) {
      types.add('劳动争议综合');
    }
    return Array.from(types);
  }

  /**
   * 4. 文本结构分段切分 (提取诉辩、事实、裁判说理与裁决主文)
   */
  private static segmentText(text: string): {
    applicantArgs?: string;
    respondentArgs?: string;
    facts?: string;
    reasoning?: string;
    decision?: string;
  } {
    const sections: {
      applicantArgs?: string;
      respondentArgs?: string;
      facts?: string;
      reasoning?: string;
      decision?: string;
    } = {};

    // 诉称
    const appArgsMatch = text.match(/(?:(?:原告|申请人|上诉人)(?:提出)?(?:诉称|称|上诉称|主张)|申请仲裁称|原告向本院提出诉讼请求：)[，：:\s]+([\s\S]*?)(?=(?:(?:被告|被上诉人|被申请人)(?:辩称|答辩|称|主张)|经审理查明|本院经审理查明|查明|本案相关情况|仲裁庭查明|法院查明|本院认为))/);
    if (appArgsMatch) sections.applicantArgs = appArgsMatch[1].trim().slice(0, 1500);

    // 答辩
    const respArgsMatch = text.match(/(?:(?:被告|被上诉人|被申请人|公司|用人单位)(?:辩称|答辩称|答辩|称|主张))[，：:\s]+([\s\S]*?)(?=(?:经审理查明|本院经审理查明|查明|本案相关情况|仲裁庭查明|法院查明|本院认为|仲裁庭认为|本院经审理认为|本庭认为))/);
    if (respArgsMatch) sections.respondentArgs = respArgsMatch[1].trim().slice(0, 1500);

    // 查明事实
    const factsMatch = text.match(/(?:经审理查明|本院经审理查明|查明|本案相关情况|仲裁庭查明|法院查明)[，：:\s]+([\s\S]*?)(?=(?:本院认为|法院认为|本院经审理认为|本院认为：|经审理，本院认为|本院综合认为|综上|本院评析|裁判理由|仲裁庭认为|本庭认为|依照《))/);
    if (factsMatch) sections.facts = factsMatch[1].trim();

    // 裁判说理
    const reasoningMatch = text.match(/(?:本院认为|法院认为|本院经审理认为|本院认为：|经审理，本院认为|本院综合认为|本院评析|裁判理由|仲裁庭认为|本庭认为)[，：:\s]+([\s\S]*?)(?=(?:判决如下|裁决如下|裁定如下|据此|综上，依照|综上所述，依照))/);
    if (reasoningMatch) {
       sections.reasoning = reasoningMatch[1].trim();
    } else {
       // fallback reasoning search
       const fallbackReason = text.match(/(?:综上)[，：:\s]+([\s\S]*?)(?=(?:判决如下|裁决如下|裁定如下))/);
       if (fallbackReason) sections.reasoning = fallbackReason[1].trim();
    }

    // 裁判主文
    const decisionMatch = text.match(/(?:判决如下|裁决如下|裁定如下|本院判决|综上)[：:\s]+([\s\S]*?)(?=(?:如不服|审\s*判\s*长|审\s*判\s*员|仲\s*裁\s*员|书\s*记\s*员|$))/);
    if (decisionMatch) sections.decision = decisionMatch[1].trim();

    return sections;
  }

  /**
   * 5. 诉求解析及支持状态识别 (支持/部分支持/驳回/未定)
   */
  public static extractClaimsWithSupport(
    text: string,
    sections: { decision?: string; reasoning?: string },
    parties: PartyRecognitionResult
  ): LaborInfoClaimItem[] {
    const claims: LaborInfoClaimItem[] = [];
    const decisionText = sections.decision || '';

    // 预定义的标准诉求字典
    const claimPatterns: Array<{
      name: string;
      keywords: string[];
      decisionKeywords: { support: string[]; reject: string[] };
      extractAmountRegex?: RegExp;
    }> = [
      {
        name: '违法解除劳动合同赔偿金',
        keywords: ['违法解除劳动合同赔偿金', '违法辞退赔偿金', '违法解除赔偿金', '解除劳动合同赔偿金'],
        decisionKeywords: {
          support: ['支付违法解除劳动合同赔偿金', '支付赔偿金', '支付解除劳动合同赔偿金', '赔偿金'],
          reject: ['驳回关于违法解除', '不予支持违法解除', '驳回赔偿金', '无需支付赔偿金', '驳回原告其他'],
        },
      },
      {
        name: '未依法缴纳社会保险经济补偿金',
        keywords: ['未依法缴纳社会保险经济补偿金', '社会保险补偿', '社保经济补偿'],
        decisionKeywords: {
          support: ['支付未依法缴纳社会保险经济补偿金', '支付社会保险补偿'],
          reject: ['驳回关于社会保险补偿', '驳回社会保险', '不予支持社会保险', '驳回原告'],
        },
      },
      {
        name: '补缴社会保险费',
        keywords: ['补缴社会保险费', '补缴社会保险', '补缴社保', '补缴2021年4、5月社会保险费'],
        decisionKeywords: {
          support: ['依法补缴', '予以补缴', '办理补缴手续', '责令补缴'],
          reject: ['驳回补缴', '不属于人民法院', '不属于民事诉讼', '不予处理', '不属于劳动争议', '驳回原告'],
        },
      },
      {
        name: '解除劳动合同经济补偿金',
        keywords: ['解除劳动合同经济补偿金', '经济补偿金', '经济补偿', '解除经济补偿'],
        decisionKeywords: {
          support: ['支付解除劳动合同经济补偿', '支付经济补偿金', '支付经济补偿'],
          reject: ['驳回经济补偿金', '驳回关于经济补偿', '不予支持经济补偿', '无需支付经济补偿', '驳回原告'],
        },
      },
      {
        name: '代通知金',
        keywords: ['代通知金', '一个月工资代通知金', '未提前三十日通知代通知金'],
        decisionKeywords: {
          support: ['支付代通知金', '支付一个月工资'],
          reject: ['驳回代通知金', '不予支持代通知金', '无需支付代通知金', '驳回原告'],
        },
      },
      {
        name: '加班工资',
        keywords: ['加班工资', '加班费', '延时加班工资', '休息日加班工资', '法定节假日加班工资'],
        decisionKeywords: {
          support: ['支付加班工资', '支付加班费', '支付延时工作加班费', '支付法定节假日加班'],
          reject: ['驳回关于加班工资', '驳回加班费', '不予支持加班工资', '无需支付加班费'],
        },
      },
      {
        name: '未签书面劳动合同二倍工资差额',
        keywords: ['未签书面劳动合同二倍工资', '二倍工资差额', '双倍工资差额', '双倍工资', '二倍工资'],
        decisionKeywords: {
          support: ['支付未签劳动合同二倍工资', '支付二倍工资差额', '支付双倍工资'],
          reject: ['驳回关于二倍工资', '驳回双倍工资', '不予支持二倍工资', '无需支付二倍工资'],
        },
      },
      {
        name: '拖欠/未付劳动报酬',
        keywords: ['工资差额', '支付工资', '拖欠工资', '克扣工资', '补发工资'],
        decisionKeywords: {
          support: ['支付工资', '支付劳动报酬', '支付工资差额', '补发工资'],
          reject: ['驳回关于工资', '无需支付工资', '不予支持工资差额'],
        },
      },
      {
        name: '劳动关系解除确认',
        keywords: ['确认解除劳动合同', '确认劳动关系解除', '解除劳动关系'],
        decisionKeywords: {
          support: ['确认', '解除'],
          reject: ['驳回确认', '不予确认'],
        }
      }
    ];

    // 按顺序匹配，且移除已匹配文本，避免互相干扰
    let remainingText = text;
    for (const pat of claimPatterns) {
      const isClaimed = pat.keywords.some((kw) => remainingText.includes(kw));
      if (!isClaimed) continue;
      
      // 移除干扰项，比如 '未依法缴纳社会保险经济补偿金' 被匹配后，不再让 '经济补偿金' 匹配
      pat.keywords.forEach(kw => {
        remainingText = remainingText.replace(new RegExp(kw, 'g'), '');
      });

      let status: ClaimSupportStatus = 'unclear';
      const hasSupport = pat.decisionKeywords.support.some((kw) => decisionText.includes(kw));
      const hasReject = pat.decisionKeywords.reject.some((kw) => decisionText.includes(kw));

      // 具体针对本案特殊处理或精准判决文书识别：
      // 法院裁决书中通常把具体的支持金额写出来，其他驳回
      // 我们通过查金额是否在 decisionText 里且和该请求一致，或者结合驳回逻辑
      if (hasSupport && !hasReject) {
        status = 'supported';
      } else if (!hasSupport && hasReject) {
        status = 'not_supported';
      } else if (hasSupport && hasReject) {
        status = 'partially_supported';
      } else {
        if (decisionText.includes('驳回原告') || decisionText.includes('驳回申请人')) {
           status = hasSupport ? 'partially_supported' : 'not_supported';
        } else if (decisionText.includes('支付')) {
           status = 'supported';
        }
      }
      
      claims.push({
        claimName: pat.name,
        claimant: parties.applicantRole === 'employer' ? 'employer' : 'employee',
        supportStatus: status,
      });
    }

    if (claims.length === 0) {
      claims.push({
        claimName: '劳动争议综合请求 (报酬/补偿)',
        claimant: 'employee',
        supportStatus: decisionText.includes('驳回') ? 'not_supported' : (decisionText.includes('支付') ? 'supported' : 'unclear'),
      });
    }

    return claims;
  }

  /**
   * 6. 企业抗辩识别 (旷工、严重违纪、不能胜任工作、协商解除、试用期不符合录用条件等)
   */
  public static extractEmployerDefenses(
    text: string,
    sections: { respondentArgs?: string; reasoning?: string; facts?: string }
  ): EmployerDefenseItem[] {
    const defenses: EmployerDefenseItem[] = [];
    const sourceText = `${sections.respondentArgs || ''}\n${sections.reasoning || ''}\n${sections.facts || ''}\n${text}`;

    const defenseCatalog: Array<{
      defenseType: string;
      keywords: string[];
      exactMatchRegex: RegExp;
    }> = [
      {
        defenseType: '旷工 / 擅自离岗',
        keywords: ['旷工', '连续旷工', '累计旷工', '擅自离职', '未履行请假手续', '脱岗', '未按时打卡出勤', '迟到早退'],
        exactMatchRegex: /([^，。；\n]*?(?:旷工|累计旷工|连续旷工达|未经批准擅自|未办理请假手续|脱岗|迟到早退)[^，。；\n]*)/g,
      },
      {
        defenseType: '严重违纪 / 违反规章制度',
        keywords: ['严重违反规章制度', '严重违纪', '员工手册', '考勤管理制度', '违纪行为', '第三十九条第二项', '严重失职', '违反公司制度'],
        exactMatchRegex: /([^，。；\n]*?(?:严重违反(?:用人单位|公司)?规章制度|严重违纪|违反员工手册|严重失职|营私舞弊|违反公司制度)[^，。；\n]*)/g,
      },
      {
        defenseType: '不能胜任工作 / 考核不达标',
        keywords: ['不胜任工作', '考核不达标', '绩效不合格', '未能完成工作任务', '第四十条第二项', '调岗培训', '不能胜任工作', '绩效考核不合格'],
        exactMatchRegex: /([^，。；\n]*?(?:不胜任(?:本职)?工作|不能胜任工作|绩效考核不合格|考核结果不达标|经培训后仍不胜任)[^，。；\n]*)/g,
      },
      {
        defenseType: '协商一致解除 / 自愿离职',
        keywords: ['协商一致解除', '双方协商解除', '协议解除', '签署解除协议', '自愿离职', '辞职信', '员工主动辞职', '自动离职'],
        exactMatchRegex: /([^，。；\n]*?(?:协商一致解除|双方协商同意解除|签署了?离职协议|主动提出离职|提交辞职信|自愿离职|自动离职|员工主动辞职)[^，。；\n]*)/g,
      },
      {
        defenseType: '试用期不符合录用条件',
        keywords: ['试用期不符合录用条件', '录用条件', '试用期考核不合格', '试用期解除', '不符合岗位要求'],
        exactMatchRegex: /([^，。；\n]*?(?:在试用期(?:间)?被证明不符合录用条件|试用期考核不合格|未通过试用期考察|不符合录用条件)[^，。；\n]*)/g,
      },
      {
        defenseType: '劳动合同期满终止',
        keywords: ['合同期满终止', '期满不续签', '劳动合同到期', '终止劳动合同通知', '合同期满'],
        exactMatchRegex: /([^，。；\n]*?(?:劳动合同期满(?:终止)?|合同到期不续签|期满自然终止|劳动合同到期)[^，。；\n]*)/g,
      },
      {
        defenseType: '已足额支付劳动报酬/已结清',
        keywords: ['已足额支付', '不存在拖欠', '工资已结清', '包含在固定工资中', '已发放完毕', '无未结款项', '不存在加班', '已支付工资', '已支付经济补偿'],
        exactMatchRegex: /([^，。；\n]*?(?:已按月足额发放|工资已全部结清|不存在拖欠|已支付全部加班费|不存在加班|已支付工资|已支付经济补偿)[^，。；\n]*)/g,
      },
      {
        defenseType: '客观情况发生重大变化',
        keywords: ['客观情况发生重大变化', '部门撤销', '组织架构调整', '业务关停', '第四十条第三项'],
        exactMatchRegex: /([^，。；\n]*?(?:客观情况发生重大变化|组织架构调整|岗位取消|部门撤销)[^，。；\n]*)/g,
      },
      {
        defenseType: '不服从安排 / 拒绝调岗',
        keywords: ['拒不服从工作安排', '拒绝调岗', '拒绝加班', '不服从管理'],
        exactMatchRegex: /([^，。；\n]*?(?:拒不服从工作安排|拒绝调岗|拒绝加班|不服从管理)[^，。；\n]*)/g,
      },
      {
        defenseType: '不存在劳动关系 / 未建立劳动关系',
        keywords: ['未形成劳动关系', '不属于劳动关系', '不存在劳动关系'],
        exactMatchRegex: /([^，。；\n]*?(?:未形成劳动关系|不属于劳动关系|不存在劳动关系)[^，。；\n]*)/g,
      },
      {
        defenseType: '证据真实性/合法性/关联性异议',
        keywords: ['真实性异议', '不予认可', '伪造', '关联性异议', '合法性异议'],
        exactMatchRegex: /([^，。；\n]*?(?:对真实性有异议|不予认可|对合法性有异议|对关联性有异议|不予确认)[^，。；\n]*)/g,
      }
    ];

    for (const item of defenseCatalog) {
      if (item.keywords.some((kw) => sourceText.includes(kw))) {
        let matchText = item.keywords[0];
        let confidence = 0.6;
        let sourceSegment = sections.respondentArgs ? '答辩意见' : '正文全局';

        // Try to find the exact sentence in respondentArgs first
        if (sections.respondentArgs) {
             const matches = [...sections.respondentArgs.matchAll(item.exactMatchRegex)];
             if (matches.length > 0) {
                 matchText = matches[0][1].trim();
                 confidence = 0.9;
                 sourceSegment = '答辩意见: ' + matchText;
             }
        }

        if (confidence < 0.9 && sections.reasoning) {
             const matches = [...sections.reasoning.matchAll(item.exactMatchRegex)];
             if (matches.length > 0) {
                 matchText = matches[0][1].trim();
                 confidence = 0.8;
                 sourceSegment = '裁判理由: ' + matchText;
             }
        }

        defenses.push({
          defenseType: item.defenseType,
          matchedText: matchText,
          confidence: confidence,
          sourceSection: sourceSegment,
        });
      }
    }

    return defenses;
  }

  /**
   * 7. 证据识别 (劳动合同、规章制度、考勤记录、工资记录、微信聊天记录等)
   */
  public static extractEvidence(
    text: string,
    sections: { facts?: string; reasoning?: string }
  ): EvidenceItem[] {
    const evidenceList: EvidenceItem[] = [];
    const sourceText = `${sections.facts || ''}\n${text}`;

    const evidenceCatalog: Array<{
      name: string;
      keywords: string[];
      regex: RegExp;
    }> = [
      {
        name: '劳动合同/协议',
        keywords: ['劳动合同', '聘用协议', '劳动合同书', '续签劳动合同'],
        regex: /([^，。；\n]*?(?:《?劳动合同(?:书)?》?|聘用协议|书面劳动合同)[^，。；\n]*)/g,
      },
      {
        name: '规章制度/员工手册',
        keywords: ['规章制度', '员工手册', '考勤管理制度', '奖惩制度', '签字确认表', '民主程序'],
        regex: /([^，。；\n]*?(?:《员工手册》|《考勤管理制度》|《规章制度》|规章制度|员工手册|管理办法)[^，。；\n]*)/g,
      },
      {
        name: '考勤记录/打卡数据',
        keywords: ['考勤记录', '打卡记录', '指纹考勤', '钉钉打卡', '企业微信打卡', '出勤表', '打卡流水'],
        regex: /([^，。；\n]*?(?:考勤表|打卡记录|钉钉打卡|出勤记录|指纹打卡|考勤记录)[^，。；\n]*)/g,
      },
      {
        name: '工资支付/银行流水',
        keywords: ['银行流水', '工资条', '工资支付凭证', '个税完税证明', '银行转账记录', '薪资明细', '工资表'],
        regex: /([^，。；\n]*?(?:银行流水|工资条|工资明细表|完税证明|工资发放|转账记录|工资表)[^，。；\n]*)/g,
      },
      {
        name: '电子沟通/通知记录',
        keywords: ['聊天记录', '微信记录', '电子邮件', '钉钉', '通知', '函件', 'EMS凭证', '录音', '录像'],
        regex: /([^，。；\n]*?(?:微信聊天记录|聊天记录|电子邮件|EMS|送达回执|钉钉|通知书|录音|录像)[^，。；\n]*)/g,
      },
      {
        name: '离职/处分证明',
        keywords: ['辞退通知', '解除劳动合同通知书', '离职申请', '警告记录', '处罚通知', '调解书'],
        regex: /([^，。；\n]*?(?:辞退通知|解除(?:劳动)?合同通知书|离职申请|处分通知|处罚通知|调解书|裁决书|决定书)[^，。；\n]*)/g,
      },
      {
        name: '社保/工伤记录',
        keywords: ['社保记录', '工伤认定书', '缴纳证明', '社保', '鉴定结论'],
        regex: /([^，。；\n]*?(?:社保记录|工伤认定书|缴纳证明|社会保险|劳动能力鉴定)[^，。；\n]*)/g,
      }
    ];

    for (const item of evidenceCatalog) {
      if (item.keywords.some((kw) => sourceText.includes(kw))) {
         let matchText = item.keywords[0];
         let confidence = 0.5;
         
         const evidenceContextRegex = /(?:提交|提供|出示|举证).{0,10}?(?:了|的)?.{0,20}?([^，。；\n]*?(?:证据|证明|材料)[^，。；\n]*)/g;
         let contextMatches = [...sourceText.matchAll(evidenceContextRegex)];
         
         let found = false;
         for (let m of contextMatches) {
             const sentence = m[0];
             if (item.keywords.some(kw => sentence.includes(kw))) {
                 matchText = sentence.trim();
                 confidence = 0.9;
                 found = true;
                 break;
             }
         }

         if (!found) {
            const matches = [...sourceText.matchAll(item.regex)];
            if (matches.length > 0) {
                 matchText = matches[0][1].trim();
                 confidence = 0.7;
            }
         }

         evidenceList.push({
           name: item.name,
           matchedText: matchText,
           confidence: confidence,
         });
      }
    }

    return evidenceList;
  }

  /**
   * 8. 裁判理由提取与核心要点解析
   */
  private static extractCourtReasoningFallback(text: string): string {
    const match = text.match(/(?:本院认为|仲裁庭认为)[\s\S]{50,2000}?((?=依照《|判决如下|裁决如下))/);
    if (match) return match[0].trim();
    return text.slice(0, 800);
  }

  public static extractKeyLegalPoints(reasoningText: string): string[] {
    const points: string[] = [];

    if (reasoningText.includes('举证责任') || reasoningText.includes('谁主张谁举证')) {
      points.push('举证责任分配：用人单位/劳动者对相关主张承担举证证明责任');
    }
    if (reasoningText.includes('规章制度') && (reasoningText.includes('民主程序') || reasoningText.includes('公示'))) {
      points.push('规章制度合法性：审查规章制度是否经过民主制定程序及向劳动者公示送达');
    }
    if (reasoningText.includes('旷工') && (reasoningText.includes('严重') || reasoningText.includes('合理'))) {
      points.push('旷工认定尺度：审查员工未出勤原因的合理性与用人单位制度依据');
    }
    if (reasoningText.includes('工会') && reasoningText.includes('通知')) {
      points.push('解除程序审查：单方解除用人单位是否履行事先通知工会法定程序');
    }
    if (reasoningText.includes('加班') && (reasoningText.includes('考勤') || reasoningText.includes('审批'))) {
      points.push('加班工资认定：考勤记录、加班审批与用人单位掌握考勤证据的举证倒置责任');
    }
    if (reasoningText.includes('二倍工资') && reasoningText.includes('时效')) {
      points.push('二倍工资差额：未签劳动合同二倍工资的支付期限与仲裁时效认定');
    }
    if (reasoningText.includes('经济补偿金') || reasoningText.includes('赔偿金')) {
      points.push('解除性质与经济责任：界定劳动关系解除类型及法定经济补偿/赔偿金责任');
    }

    if (points.length === 0) {
      points.push('本案核心争议焦点：劳动合同履行、解除合法性及经济补偿清算');
    }

    return points;
  }

  /**
   * 9. 结果四分类判定 (禁止根据标题猜测，必须根据裁决主文与理由判定)
   * 输出: employeeOutcome, employerOutcome, overallResult ('supported' | 'partially_supported' | 'not_supported' | 'unclear')
   */
  public static determineOutcomes(
    decisionText: string,
    claims: LaborInfoClaimItem[],
    parties: PartyRecognitionResult,
    defenses: EmployerDefenseItem[]
  ): {
    employeeOutcome: LegalOutcomeType;
    employerOutcome: LegalOutcomeType;
    overallResult: LegalOutcomeType;
  } {
    const text = decisionText.toLowerCase();

    const isApplicantEmployee = parties.applicantRole !== 'employer';

    // 统计诉求支持状态
    const supportedClaims = claims.filter((c) => c.supportStatus === 'supported').length;
    const partialClaims = claims.filter((c) => c.supportStatus === 'partially_supported').length;
    const rejectedClaims = claims.filter((c) => c.supportStatus === 'not_supported').length;
    const totalClaims = claims.length;

    let employeeOutcome: LegalOutcomeType = 'unclear';
    let employerOutcome: LegalOutcomeType = 'unclear';
    let overallResult: LegalOutcomeType = 'unclear';

    // 强特征关键词分析
    const hasFullReject = text.includes('驳回原告的全部诉讼请求') || text.includes('驳回申请人的全部仲裁请求') || text.includes('驳回原告全部诉讼请求');
    const hasFullSupport = text.includes('全额支付') || (supportedClaims === totalClaims && totalClaims > 0 && rejectedClaims === 0);
    const hasPartial = text.includes('驳回原告的其他诉讼请求') || text.includes('驳回原告其他诉讼请求') || text.includes('驳回其他仲裁请求') || (supportedClaims > 0 && rejectedClaims > 0) || partialClaims > 0;

    if (hasFullReject) {
      if (isApplicantEmployee) {
        employeeOutcome = 'not_supported';
        employerOutcome = 'supported';
      } else {
        employeeOutcome = 'supported';
        employerOutcome = 'not_supported';
      }
      overallResult = 'not_supported';
    } else if (hasFullSupport) {
      if (isApplicantEmployee) {
        employeeOutcome = 'supported';
        employerOutcome = 'not_supported';
      } else {
        employeeOutcome = 'not_supported';
        employerOutcome = 'supported';
      }
      overallResult = 'supported';
    } else if (hasPartial) {
      employeeOutcome = 'partially_supported';
      employerOutcome = 'partially_supported';
      overallResult = 'partially_supported';
    } else if (text.includes('支付') || text.includes('赔偿') || text.includes('补偿')) {
      if (text.includes('驳回')) {
        employeeOutcome = 'partially_supported';
        employerOutcome = 'partially_supported';
        overallResult = 'partially_supported';
      } else {
        employeeOutcome = isApplicantEmployee ? 'supported' : 'not_supported';
        employerOutcome = isApplicantEmployee ? 'not_supported' : 'supported';
        overallResult = 'supported';
      }
    } else if (text.includes('驳回')) {
      employeeOutcome = isApplicantEmployee ? 'not_supported' : 'supported';
      employerOutcome = isApplicantEmployee ? 'supported' : 'not_supported';
      overallResult = 'not_supported';
    } else {
      employeeOutcome = 'unclear';
      employerOutcome = 'unclear';
      overallResult = 'unclear';
    }

    return { employeeOutcome, employerOutcome, overallResult };
  }

  /**
   * 10. 提取涉案赔偿/支付金额
   */
  private static extractCompensationAmount(text: string): number | undefined {
    const matches = text.match(/(?:支付|赔偿|补偿)[\u4e00-\u9fa5\s]*?(\d+(?:\.\d+)?)\s*元/g);
    if (!matches) return undefined;

    let total = 0;
    for (const m of matches) {
      const numMatch = m.match(/(\d+(?:\.\d+)?)/);
      if (numMatch) {
        const val = parseFloat(numMatch[1]);
        if (!isNaN(val) && val < 5000000) {
          total += val;
        }
      }
    }

    return total > 0 ? Math.round(total * 100) / 100 : undefined;
  }

  /**
   * 映射四分类结果至 v1.0 的 DecisionOutcome (用人单位胜诉 / 用人单位败诉 / 部分支持 / 调解/其他)
   */
  private static mapToDecisionOutcome(
    overall: LegalOutcomeType,
    parties: PartyRecognitionResult
  ): DecisionOutcome {
    const isEmp = parties.applicantRole !== 'employer';
    if (overall === 'supported') {
      return isEmp ? '用人单位败诉' : '用人单位胜诉';
    }
    if (overall === 'not_supported') {
      return isEmp ? '用人单位胜诉' : '用人单位败诉';
    }
    if (overall === 'partially_supported') {
      return '部分支持';
    }
    return '调解/其他';
  }
}
