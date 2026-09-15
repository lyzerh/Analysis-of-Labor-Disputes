import { CityResolver } from "./CityResolver";
import {
  ArbitrationCase,
  CaseParty,
  ClaimProceduralBasis,
  ClaimReferenceCandidate,
  ClaimSupportStatus,
  DecisionOutcome,
  EmployerDefenseItem,
  EvidenceItem,
  EvidenceProvider,
  JudgmentAction,
  JudgmentActionItem,
  LaborInfoClaimItem,
  LaborInfoParsedResult,
  LaborRole,
  LegalOutcomeType,
  PartyRecognitionResult,
  ParseQuality,
  ParseStatus,
  RawDocument,
} from '../../types';
import { ParserUtils } from './ParserUtils';
import { resolvePartyOutcomes } from '../outcome/OutcomeResolver';
import { AmountResolver } from './AmountResolver';

interface ClaimPatternDefinition {
  name: string;
  keywords: string[];
  decisionKeywords: { support: string[]; reject: string[] };
  extractAmountRegex?: RegExp;
}

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
    const unresolvedReferences = this.extractUnresolvedReferences(sections.decision || '');

    // 6. 企业抗辩识别
    const employerDefenses = this.extractEmployerDefenses(text, sections);

    // 7. 证据识别
    const evidence = this.extractEvidence(text, sections, parties);

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
      applicantRole: parties.applicantRole,
      parties: parties.parties || [],
      partyConfidence: parties.confidence,
      disputeType,
      claims,
      unresolvedReferences,
      employerDefenses,
      evidence,
      courtReasoning,
      keyLegalPoints,
      applicantOutcome: outcomes.overallResult,
      employeeOutcome: outcomes.employeeOutcome,
      employerOutcome: outcomes.employerOutcome,
      // 兼容旧消费者：overallResult 始终是申请人视角，不是劳动者视角。
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
    let caseNumber = meta.no || meta.case_number || meta.caseNumber || '';
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
      /(?:^|[。\n\r）)号书])\s*(?:原审原告|上诉人|申请人|申诉人|原告)(?:[（(［\[].{0,60}?[）)］\]])?[：:\s]+([^，,。\n\r]+)/g,
      /(?:^|[。\n\r）)号书])\s*(?:原审被告|被上诉人|被申请人|被申诉人|被告)(?:[（(［\[].{0,60}?[）)］\]])?[：:\s]+([^，,。\n\r]+)/g,
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

    const isPlausiblePersonName = (name: string | null): boolean => {
      if (!name || isCompany(name)) return false;
      const clean = name.replace(/[^\u4e00-\u9fa5]/g, '');
      if (clean.length < 2 || clean.length > 5) return false;
      if (/^(?:劳动者|员工|职工|个人|自然人|为其成员|系.+|依法.+|应当.+|可以.+|不得.+)$/.test(clean)) return false;
      return true;
    };

    const isPerson = (name: string | null): boolean => {
      return isPlausiblePersonName(name);
    };

    // 标题只在能够同时识别出一名自然人与一个组织时补充当事人，避免从叙述正文猜测姓名。
    if (title && (!firstParty1 || !firstParty2)) {
      const titleMatch = title.match(/^(.{2,30}?)(?:与|诉)(.{2,40}?)(?:劳动争议|劳务合同纠纷|追索劳动报酬)/);
      if (titleMatch) {
        const left = this.cleanPartyName(titleMatch[1]);
        const right = this.cleanPartyName(titleMatch[2]);
        if (isPlausiblePersonName(left) && isCompany(right)) {
          employeeParty = left;
          employerParty = right;
          confidence = 0.85;
        } else if (isCompany(left) && isPlausiblePersonName(right)) {
          employerParty = left;
          employeeParty = right;
          confidence = 0.85;
        }
      }
    }

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
        const workerMatch = text.match(/(?:劳动者|员工|职工|被害人|伤者)[：:]\s*([\u4e00-\u9fa5]{2,5})(?=[，,。；;\s])/);
        if (workerMatch && isPlausiblePersonName(workerMatch[1])) {
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

    // 合并审理等文书可能把劳动者与企业都列为上诉人；仅在已具名角色行中补全双方。
    const namedRoleParties = [...party1Matches, ...party2Matches];
    if (!employeeParty) {
      employeeParty = namedRoleParties.find((name) => isPlausiblePersonName(name)) || null;
    }
    if (!employerParty) {
      employerParty = namedRoleParties.find((name) => isCompany(name)) || null;
    }

    // 从正文上下文关联补充
    if (!employeeParty) {
      const workerContextMatch = text.match(/(?:原告|上诉人|申请人|被告|被上诉人)\s*([\u4e00-\u9fa5]{2,4})\s*(?:于|入职|主张|诉称|在[\u4e00-\u9fa5]+工作|系[\u4e00-\u9fa5]+员工)/);
      if (workerContextMatch && isPlausiblePersonName(workerContextMatch[1])) {
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

    const parties = this.extractCaseParties(text, employeeParty, employerParty);

    return {
      employeeParty,
      employerParty,
      applicantRole,
      parties,
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
    const decisionMatch = text.match(/(?:综上[，,、\s]*(?:本院)?判决如下|本院判决如下|判决如下|判决|裁决如下|裁定如下)[：:\s]+([\s\S]*?)(?=(?:如不服|审\s*判\s*长|审\s*判\s*员|仲\s*裁\s*员|书\s*记\s*员|$))/);
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
    const claimPatterns: ClaimPatternDefinition[] = [
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
        name: '未休年休假工资',
        keywords: ['未休年休假工资', '年休假工资', '未休年假工资'],
        decisionKeywords: {
          support: ['支付未休年休假工资', '支付年休假工资', '支持未休年假工资'],
          reject: ['驳回未休年休假工资', '不予支持年休假工资', '无需支付未休年假工资'],
        },
      },
      {
        name: '未签书面劳动合同二倍工资差额',
        keywords: ['未签书面劳动合同二倍工资', '未签订书面劳动合同二倍工资差额', '二倍工资差额', '双倍工资差额', '双倍工资', '二倍工资'],
        decisionKeywords: {
          support: ['支付未签劳动合同二倍工资', '支付二倍工资差额', '支付双倍工资'],
          reject: ['驳回关于二倍工资', '驳回双倍工资', '不予支持二倍工资', '无需支付二倍工资'],
        },
      },
      {
        name: '拖欠/未付劳动报酬',
        keywords: ['工资差额', '支付工资', '拖欠工资', '克扣工资', '补发工资', '劳动报酬', '业务提成', '业务费用', '停工工资', '停业工资', '疫情期间停业工资', '被查封期间工资', '封控工资'],
        decisionKeywords: {
          support: ['支付工资', '支付劳动报酬', '支付工资差额', '补发工资'],
          reject: ['驳回关于工资', '无需支付工资', '不予支持工资差额'],
        },
      },
      {
        name: '劳动关系解除确认',
        keywords: ['确认解除劳动合同', '确认劳动关系解除', '确认双方劳动关系已经解除', '确认双方劳动合同关系已经解除', '确认双方劳动关系于', '确认双方劳动合同关系于', '劳动合同关系已经解除', '解除劳动关系'],
        decisionKeywords: {
          support: ['确认双方劳动关系已经解除', '确认双方劳动合同关系已经解除', '确认劳动关系于', '确认劳动合同关系于'],
          reject: ['驳回确认', '不予确认'],
        }
      }
    ];

    const judgmentActions = this.extractJudgmentActions(decisionText, claimPatterns, parties);

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
      const claimType = this.normalizeClaimType(pat.name);
      const claimId = `claim_${claims.length + 1}`;
      const sourceText = this.findClaimSourceText(text, decisionText, pat.keywords);
      const claimantMetadata = this.resolveClaimantMetadata(sourceText, parties);
      const localActions = judgmentActions.filter((item) => item.targetClaimType === claimType);
      const genericApplicantActions = judgmentActions.filter((item) =>
        !item.targetClaimType
        && (item.targetPartyRole === 'plaintiff' || item.targetPartyRole === 'appellant')
        && !/上诉|维持原判|维持原裁决|原审/.test(item.sourceText)
      );
      const applicableActions = localActions.length > 0 ? localActions : genericApplicantActions;
      const hasSupport = applicableActions.some((item) => item.action === 'support' || item.action === 'pay');
      const hasReject = applicableActions.some((item) => item.action === 'reject');
      const requestedAmount = claimType === 'employment_termination_confirmation'
        ? undefined
        : AmountResolver.extractAmountNearAliases(sourceText, pat.keywords)
        ?? localActions.find((item) => item.requestedAmount !== undefined)?.requestedAmount;
      const awardedAmount = localActions.find((item) => item.awardedAmount !== undefined)?.awardedAmount;
      const amountOutcome = AmountResolver.resolveAmountOutcome(requestedAmount, awardedAmount);

      // 当同一段同时出现原告与被告请求时，以主文中的受益方确定具体请求归属。
      // 这避免“驳回公司请求”把劳动者被判支付的同名请求吞掉。
      if (parties.applicantRole === 'employer'
        && /被告|被上诉人/.test(sourceText)
        && localActions.some((item) => item.action === 'pay' || item.action === 'support')
        && localActions.some((item) => item.targetPartyRole === 'plaintiff' || item.targetPartyRole === 'appellee' || item.targetPartyRole === 'defendant')) {
        claimantMetadata.claimantRole = 'employee';
        claimantMetadata.claimantPartyId = this.findPartyId(parties, 'employee', ['plaintiff', 'appellee', 'defendant']);
      }
      if (parties.applicantRole === 'employer'
        && claimType === 'unpaid_remuneration'
        && localActions.some((item) => (item.action === 'pay' || item.action === 'support')
          && ['plaintiff', 'appellee', 'defendant'].includes(item.targetPartyRole))) {
        claimantMetadata.claimantRole = 'employee';
        claimantMetadata.claimantPartyId = this.findPartyId(parties, 'employee', ['plaintiff', 'appellee', 'defendant']);
      }
      // 二审文书往往只在主文写“驳回上诉，维持原判”，原审支付/确认主文才是实体结果。
      // 若具体主文动作明确指向劳动者，主张方应归劳动者而非上诉企业。
      if (!sourceText && parties.applicantRole === 'employer'
        && localActions.some((item) => item.action === 'pay' || item.action === 'support')
        && localActions.some((item) => item.targetPartyRole === 'plaintiff' || item.targetPartyRole === 'appellee' || item.targetPartyRole === 'defendant')) {
        claimantMetadata.claimantRole = 'employee';
        claimantMetadata.claimantPartyId = this.findPartyId(parties, 'employee', ['plaintiff', 'appellee', 'defendant']);
      }
      if (!sourceText && parties.applicantRole === 'employer'
        && claimType === 'employment_termination_confirmation'
        && localActions.some((item) => item.action === 'support')
        && /维持原判|维持原裁决/.test(decisionText)) {
        claimantMetadata.claimantRole = 'employee';
        claimantMetadata.claimantPartyId = this.findPartyId(parties, 'employee', ['plaintiff', 'appellee', 'defendant']);
      }

      if (!hasSupport && hasReject) {
        status = 'not_supported';
      } else if (hasSupport && hasReject) {
        status = 'partially_supported';
      } else if (hasSupport && applicableActions.some((item) => /全部|全额/.test(item.sourceText))) {
        status = 'supported';
      } else if (amountOutcome !== undefined) {
        status = amountOutcome;
      } else if (hasSupport) {
        status = 'supported';
      }

      const judgmentItems = localActions.map((item) => ({
        ...item,
        referenceResolution: {
          sourceText: item.sourceText,
          referencedClaimIds: [claimId],
          confidence: item.referenceResolution?.resolutionMethod === 'rule' ? 0.8 : 1,
          resolutionMethod: item.referenceResolution?.resolutionMethod === 'rule' ? 'rule' as const : 'direct' as const,
          needsSemanticResolution: false,
        },
      }));
      
      claims.push({
        id: claimId,
        claimName: pat.name,
        claimType,
        claimant: claimantMetadata.claimantRole,
        claimantRole: claimantMetadata.claimantRole,
        claimantPartyId: claimantMetadata.claimantPartyId,
        proceduralBasis: claimantMetadata.proceduralBasis,
        supportStatus: status,
        requestedAmount,
        awardedAmount,
        sourceText,
        judgmentItems,
      });
    }

    if (claims.length === 0) {
      const applicantActions = judgmentActions.filter((item) =>
        !item.targetClaimType
        && (item.targetPartyRole === 'plaintiff' || item.targetPartyRole === 'appellant')
      );
      const hasApplicantSupport = applicantActions.some((item) => item.action === 'support');
      const hasApplicantReject = applicantActions.some((item) => item.action === 'reject');
      claims.push({
        id: 'claim_1',
        claimName: '劳动争议综合请求 (报酬/补偿)',
        claimType: /上诉人|上诉请求|撤销原判/.test(text) ? 'procedural_appeal' : 'general_labor_claim',
        claimant: parties.applicantRole,
        claimantRole: parties.applicantRole,
        claimantPartyId: this.findPartyId(parties, parties.applicantRole, ['plaintiff', 'applicant', 'appellant']),
        proceduralBasis: /上诉人|上诉请求|撤销原判/.test(text) ? 'appeal_request' : 'unknown',
        supportStatus: hasApplicantSupport && hasApplicantReject
          ? 'partially_supported'
          : hasApplicantSupport
            ? 'supported'
            : hasApplicantReject
              ? 'not_supported'
              : 'unclear',
        sourceText: this.findProceduralRequestSource(text),
      });
    }

    // 上诉请求是独立的程序性请求；不得把“驳回上诉”当作劳动者实体请求的驳回。
    if (/上诉人|上诉请求/.test(text) && !claims.some((claim) => claim.proceduralBasis === 'appeal_request')) {
      const appealAction = judgmentActions.find((item) => item.targetPartyRole === 'appellant' && item.action === 'reject');
      claims.push({
        id: `claim_${claims.length + 1}`,
        claimName: '上诉请求（撤销原判）',
        claimType: 'procedural_appeal',
        claimant: parties.applicantRole === 'employer' ? 'employer' : parties.applicantRole === 'employee' ? 'employee' : 'unknown',
        claimantRole: parties.applicantRole,
        claimantPartyId: this.findPartyId(parties, parties.applicantRole, ['appellant', 'plaintiff', 'applicant']),
        proceduralBasis: 'appeal_request',
        supportStatus: appealAction ? 'not_supported' : 'unclear',
        sourceText: this.findProceduralRequestSource(text),
        judgmentItems: appealAction ? [appealAction] : [],
      });
    }

    return claims;
  }

  private static extractCaseParties(
    text: string,
    employeeParty: string | null,
    employerParty: string | null,
  ): CaseParty[] {
    const proceduralRoleMap: Record<string, CaseParty['proceduralRoles'][number]> = {
      原告: 'plaintiff',
      被告: 'defendant',
      上诉人: 'appellant',
      被上诉人: 'appellee',
      申请人: 'applicant',
      被申请人: 'respondent',
      反诉原告: 'counterclaimPlaintiff',
      反诉人: 'counterclaimPlaintiff',
      反诉被告: 'counterclaimDefendant',
      第三人: 'third_party',
    };
    const partyMap = new Map<string, CaseParty>();
    const rolePattern = /(反诉原告|反诉被告|反诉人|被上诉人|上诉人|被申请人|申请人|原告|被告|第三人)(?:[（(][^）)]*[）)])?[：:\s]+([^，,。；;\n\r]+)/g;
    let roleMatch: RegExpExecArray | null;

    while ((roleMatch = rolePattern.exec(text)) !== null) {
      const label = roleMatch[1];
      const name = this.cleanPartyName(roleMatch[2]);
      if (!name) continue;
      const proceduralRole = proceduralRoleMap[label] || 'unknown';
      const existing = partyMap.get(name);
      if (existing) {
        if (!existing.proceduralRoles.includes(proceduralRole)) {
          existing.proceduralRoles.push(proceduralRole);
        }
      } else {
        let laborRole: LaborRole = 'unknown';
        if (name === employeeParty) laborRole = 'employee';
        else if (name === employerParty) laborRole = 'employer';
        else if (proceduralRole === 'third_party') laborRole = 'other';
        partyMap.set(name, {
          id: `party_${partyMap.size + 1}`,
          name,
          laborRole,
          proceduralRoles: [proceduralRole],
        });
      }
    }

    const defendantParty = [...partyMap.values()].find((party) =>
      party.proceduralRoles.includes('defendant') || party.proceduralRoles.includes('respondent')
    );
    if (defendantParty && /(?:被告|被申请人)[^。；\n]*(?:提出反诉|反诉请求|提起反诉)/.test(text)) {
      if (!defendantParty.proceduralRoles.includes('counterclaimPlaintiff')) {
        defendantParty.proceduralRoles.push('counterclaimPlaintiff');
      }
      if (!defendantParty.proceduralRoles.includes('counterclaimant')) {
        defendantParty.proceduralRoles.push('counterclaimant');
      }
    }

    return [...partyMap.values()];
  }

  /**
   * 将裁判主文拆成最小动作片段。这里只识别明确写出的动作、程序对象和请求类型，
   * 不处理跨段指代、复杂反诉关系或二审继承。
   */
  private static extractJudgmentActions(
    decisionText: string,
    claimPatterns: ClaimPatternDefinition[] = [],
    parties?: PartyRecognitionResult,
  ): JudgmentActionItem[] {
    if (!decisionText.trim()) return [];

    const actions = decisionText
      .split(/[。；;，,\n\r]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((sourceText): JudgmentActionItem => {
        let action: JudgmentAction = 'unclear';
        if (/驳回|不予支持|无需支付|不予处理|不属于(?:人民法院|民事诉讼|劳动争议)/.test(sourceText)) {
          action = 'reject';
        } else if (/予以支持|支持|确认[^。；，,]*(?:劳动关系|劳动合同关系)?(?:已经|已)?解除/.test(sourceText)) {
          action = 'support';
        } else if (/支付|补缴|补发/.test(sourceText)) {
          action = 'pay';
        } else if (/维持(?:原判|原裁决)/.test(sourceText)) {
          action = 'maintain';
        } else if (/撤销/.test(sourceText)) {
          action = 'revoke';
        }

        let targetPartyRole: JudgmentActionItem['targetPartyRole'] = 'unknown';
        if (/驳回(?:公司|用人单位|企业)[^。；，,]*(?:诉讼请求|请求)/.test(sourceText)) {
          targetPartyRole = parties?.parties?.find((party) => party.laborRole === 'employer'
            && party.proceduralRoles.some((role) => ['plaintiff', 'appellant', 'applicant'].includes(role)))?.proceduralRoles.includes('appellant')
            ? 'appellant'
            : 'plaintiff';
        } else if (/驳回上诉/.test(sourceText)) {
          targetPartyRole = 'appellant';
        } else if (/被告[^。；，,]*(?:反诉|请求)/.test(sourceText)) {
          targetPartyRole = 'defendant';
        } else if (/被上诉人/.test(sourceText)) {
          targetPartyRole = 'appellee';
        } else if (/上诉人|上诉请求/.test(sourceText)) {
          targetPartyRole = 'appellant';
        } else if (/原告|申请人/.test(sourceText)) {
          targetPartyRole = 'plaintiff';
        }

        if (parties && /支付|补发|补缴/.test(sourceText)) {
          const paymentIndex = sourceText.search(/支付|补发|补缴/);
          const beneficiaryCandidates = (parties.parties || [])
            .filter((party) => party.laborRole === 'employee' || party.laborRole === 'employer')
            .map((party) => {
              const beforeIndex = paymentIndex >= 0 ? sourceText.lastIndexOf(party.name, paymentIndex) : -1;
              const afterIndex = paymentIndex >= 0 ? sourceText.indexOf(party.name, paymentIndex) : sourceText.indexOf(party.name);
              const index = beforeIndex >= 0 ? beforeIndex : afterIndex;
              return { party, distance: index >= 0 && paymentIndex >= 0 ? Math.abs(paymentIndex - index) : Number.MAX_SAFE_INTEGER };
            })
            .filter((candidate) => candidate.distance !== Number.MAX_SAFE_INTEGER)
            .sort((left, right) => left.distance - right.distance);
          const beneficiary = beneficiaryCandidates[0]?.party;
          if (beneficiary) {
            targetPartyRole = beneficiary.proceduralRoles.includes('appellee')
              ? 'appellee'
              : beneficiary.proceduralRoles.includes('plaintiff')
                ? 'plaintiff'
                : beneficiary.proceduralRoles.includes('defendant')
                  ? 'defendant'
                  : beneficiary.proceduralRoles.includes('appellant')
                    ? 'appellant'
                    : 'unknown';
          }
        }

        // 只有主文片段明确出现请求别名时才绑定 claim；“驳回原告”等通用措辞保持无具体 claim。
        const matchedPattern = claimPatterns.find((pat) =>
          pat.keywords.some((keyword) => sourceText.includes(keyword))
          || (pat.name === '劳动关系解除确认' && /确认[^。；，,]*(?:劳动关系|劳动合同关系)(?:于[^。；，,]*)?(?:已经|已)?解除/.test(sourceText))
        );

        const requestedAmount = AmountResolver.extractRequestedAmount(sourceText);
        const awardedAmount = action === 'reject'
          ? 0
          : AmountResolver.extractAwardedAmount(sourceText)
            ?? (action === 'pay' ? AmountResolver.extractFirstAmount(sourceText) : undefined);

        return {
          action,
          targetPartyRole,
          targetClaimType: matchedPattern ? this.normalizeClaimType(matchedPattern.name) : undefined,
          requestedAmount,
          awardedAmount,
          sourceText,
        };
      })
      .filter((item) => item.action !== 'unclear' || !!item.targetClaimType);

    for (let index = 1; index < actions.length; index++) {
      const current = actions[index];
      const previous = actions[index - 1];
      if (!current.targetClaimType && previous.targetClaimType && current.action !== 'unclear'
        && !/上诉|维持原判|维持原裁决|原审|其他/.test(current.sourceText)) {
        current.targetClaimType = previous.targetClaimType;
        current.referenceResolution = {
          sourceText: current.sourceText,
          referencedClaimIds: [],
          confidence: 0.8,
          resolutionMethod: 'rule',
          needsSemanticResolution: false,
        };
      }
    }

    return actions;
  }

  private static normalizeClaimType(claimName: string): string {
    const types: Record<string, string> = {
      违法解除劳动合同赔偿金: 'unlawful_termination_compensation',
      未依法缴纳社会保险经济补偿金: 'social_insurance_compensation',
      补缴社会保险费: 'social_insurance_contribution',
      解除劳动合同经济补偿金: 'economic_compensation',
      代通知金: 'notice_pay',
      加班工资: 'overtime_pay',
      未休年休假工资: 'annual_leave_pay',
      未签书面劳动合同二倍工资差额: 'double_wage_difference',
      '拖欠/未付劳动报酬': 'unpaid_remuneration',
      劳动关系解除确认: 'employment_termination_confirmation',
    };
    return types[claimName] || claimName;
  }

  private static findClaimSourceText(text: string, decisionText: string, aliases: string[]): string {
    const decisionIndex = decisionText ? text.indexOf(decisionText) : -1;
    const requestText = decisionIndex >= 0 ? text.slice(0, decisionIndex) : text;
    const fragments = requestText.split(/[。；;\n\r]+/).map((part) => part.trim()).filter(Boolean);
    const matches = fragments.filter((fragment) => aliases.some((alias) => fragment.includes(alias)));
    return matches.find((fragment) => /请求|主张|要求|反诉|诉请/.test(fragment)) || matches[0] || '';
  }

  private static resolveClaimantMetadata(
    sourceText: string,
    parties: PartyRecognitionResult,
  ): {
    claimantRole: LaborRole;
    claimantPartyId?: string;
    proceduralBasis: ClaimProceduralBasis;
  } {
    const isCounterclaim = /(?:^|[。；;\n\r])\s*(?:被告|被申请人|被上诉人)[^。；;\n\r]*(?:反诉|请求|主张)/.test(sourceText);
    const isAppealRequest = /上诉人|上诉请求|撤销原判/.test(sourceText);
    const isApplication = /申请人/.test(sourceText) && !isCounterclaim;
    let claimantRole: LaborRole = parties.applicantRole;
    let proceduralBasis: ClaimProceduralBasis = 'original_claim';
    let targetRoles: CaseParty['proceduralRoles'] = ['plaintiff'];

    if (isCounterclaim) {
      claimantRole = parties.applicantRole === 'employee'
        ? 'employer'
        : parties.applicantRole === 'employer'
          ? 'employee'
          : 'unknown';
      proceduralBasis = 'counterclaim';
      targetRoles = ['counterclaimant', 'defendant', 'respondent', 'appellee'];
    } else if (isAppealRequest) {
      proceduralBasis = 'appeal_request';
      targetRoles = ['appellant'];
    } else if (isApplication) {
      proceduralBasis = 'application';
      targetRoles = ['applicant'];
    }

    return {
      claimantRole,
      claimantPartyId: this.findPartyId(parties, claimantRole, targetRoles),
      proceduralBasis,
    };
  }

  private static findPartyId(
    parties: PartyRecognitionResult,
    laborRole: LaborRole,
    proceduralRoles: CaseParty['proceduralRoles'],
  ): string | undefined {
    return parties.parties?.find((party) =>
      party.laborRole === laborRole
      && proceduralRoles.some((role) => party.proceduralRoles.includes(role))
    )?.id;
  }

  private static findProceduralRequestSource(text: string): string {
    return text.split(/[。；;\n\r]+/).find((fragment) =>
      /上诉人|上诉请求|撤销原判|申请人|反诉/.test(fragment)
    )?.trim() || '';
  }

  private static extractUnresolvedReferences(decisionText: string): ClaimReferenceCandidate[] {
    return decisionText
      .split(/[。；;\n\r]+/)
      .map((part) => part.trim())
      .filter((part) => /上述|前述|该项请求|第[一二三四五六七八九十]+项|其余请求/.test(part))
      .map((sourceText) => ({
        sourceText,
        referencedClaimIds: [],
        confidence: 0,
        resolutionMethod: 'unresolved' as const,
        needsSemanticResolution: true,
      }));
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
    sections: { facts?: string; reasoning?: string },
    parties?: PartyRecognitionResult,
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
         let provider: EvidenceProvider = 'unknown';

         const evidenceContexts = sourceText
           .split(/[。；\n]/)
           .map((segment) => segment.trim())
           .filter((segment) => item.keywords.some((keyword) => segment.includes(keyword)))
           .filter((segment) => /提交|提供|出示|举证|调取|收集|提取|取得/.test(segment));

         let found = false;
         for (const sentence of evidenceContexts) {
           const resolvedProvider = this.resolveEvidenceProvider(sentence, parties);
           if (resolvedProvider !== 'unknown') {
             matchText = sentence;
             provider = resolvedProvider;
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
           provider,
           confidence: confidence,
         });
      }
    }

    return evidenceList;
  }

  private static resolveEvidenceProvider(
    evidenceText: string,
    recognition?: PartyRecognitionResult,
  ): EvidenceProvider {
    const actionMatch = [...evidenceText.matchAll(/提交|提供|出示|举证|调取|收集|提取|取得/g)]
      .find((match) => {
        const prefix = evidenceText.slice(Math.max(0, (match.index || 0) - 2), match.index);
        return !/(?:未|没|没有|未能)$/.test(prefix);
      });
    if (!actionMatch || actionMatch.index === undefined) return 'unknown';

    const beforeAction = evidenceText.slice(0, actionMatch.index);
    const trimmedActorText = beforeAction.trim();
    if (/(?:第三方|第三人)[^。；\n]*$/.test(trimmedActorText)
      || /^(?:[^，,:：]{0,12})?(?:银行|社保(?:机构|部门)|税务(?:机关|部门)|鉴定机构)(?:向[^，,:：]{0,12})?$/.test(trimmedActorText)) {
      return 'third_party';
    }
    if (/(?:本院|法院)(?:依法)?$/.test(trimmedActorText)) return 'court';

    const parties = recognition?.parties || [];
    const namedParty = [...parties]
      .filter((party) => party.name && beforeAction.includes(party.name))
      .sort((a, b) => b.name.length - a.name.length)[0];
    if (namedParty?.laborRole === 'employee' || namedParty?.laborRole === 'employer') {
      return namedParty.laborRole;
    }
    if (namedParty?.laborRole === 'unknown'
      && !namedParty.proceduralRoles.includes('third_party')
      && /^[\u4e00-\u9fa5某×*]{2,4}$/.test(namedParty.name)
      && parties.some((party) => party.laborRole === 'employer')) {
      return 'employee';
    }

    const roleMap: Array<[RegExp, CaseParty['proceduralRoles'][number]]> = [
      [/反诉原告|反诉人/, 'counterclaimant'],
      [/被上诉人/, 'appellee'],
      [/上诉人/, 'appellant'],
      [/被申请人/, 'respondent'],
      [/申请人/, 'applicant'],
      [/原告/, 'plaintiff'],
      [/被告/, 'defendant'],
      [/第三人/, 'third_party'],
    ];
    for (const [pattern, role] of roleMap) {
      if (!pattern.test(beforeAction)) continue;
      const party = parties.find((candidate) => candidate.proceduralRoles.includes(role));
      if (party?.laborRole === 'employee' || party?.laborRole === 'employer') return party.laborRole;
      if (role === 'third_party') return 'third_party';
    }

    return 'unknown';
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
    // unknown 没有足够事实建立任何一方视角，禁止默认落入劳动者或企业分支。
    if (parties.applicantRole === 'unknown') {
      return {
        employeeOutcome: 'unclear',
        employerOutcome: 'unclear',
        overallResult: 'unclear',
      };
    }

    // 案件级 applicantOutcome 只能聚合申请人自己的请求；对方反诉/请求不得混入。
    const applicantClaims = claims.filter(
      (claim) => (claim.claimantRole ?? claim.claimant) === parties.applicantRole
    );
    const supportedClaims = applicantClaims.filter((c) => c.supportStatus === 'supported').length;
    const partialClaims = applicantClaims.filter((c) => c.supportStatus === 'partially_supported').length;
    const rejectedClaims = applicantClaims.filter((c) => c.supportStatus === 'not_supported').length;
    const totalClaims = applicantClaims.length;

    const actions = this.extractJudgmentActions(decisionText, [], parties);
    const roleForAction = (action: JudgmentActionItem): LaborRole => {
      if (action.targetPartyRole === 'unknown') return 'unknown';
      const mapped = parties.parties?.find((party) => party.proceduralRoles.includes(action.targetPartyRole))?.laborRole;
      if (mapped) return mapped;
      if (['plaintiff', 'appellant', 'applicant'].includes(action.targetPartyRole)) return parties.applicantRole;
      if (['defendant', 'appellee', 'respondent'].includes(action.targetPartyRole)) {
        return parties.applicantRole === 'employee' ? 'employer' : parties.applicantRole === 'employer' ? 'employee' : 'unknown';
      }
      return 'unknown';
    };
    const statusesForRole = (role: LaborRole): ClaimSupportStatus[] => {
      const claimStatuses = claims
        .filter((claim) => (claim.claimantRole ?? claim.claimant) === role)
        .map((claim) => claim.supportStatus);
      const actionStatuses = actions
        .filter((action) => roleForAction(action) === role)
        .map((action) => action.action === 'reject'
          ? 'not_supported' as const
          : action.action === 'support' || action.action === 'pay'
            ? 'supported' as const
            : undefined)
        .filter((status): status is 'supported' | 'not_supported' => status !== undefined);
      return [...claimStatuses, ...actionStatuses];
    };
    const aggregate = (statuses: ClaimSupportStatus[]): LegalOutcomeType => {
      const known = statuses.filter((status) => status !== 'unclear');
      if (known.length === 0) return 'unclear';
      const supported = known.includes('supported');
      const partial = known.includes('partially_supported');
      const rejected = known.includes('not_supported');
      if (partial || (supported && rejected)) return 'partially_supported';
      if (supported) return 'supported';
      return rejected ? 'not_supported' : 'unclear';
    };

    const applicantStatuses = statusesForRole(parties.applicantRole);
    let applicantOutcome = aggregate(applicantStatuses);
    if (applicantOutcome === 'unclear' && totalClaims > 0) {
      // 兼容旧调用方传入没有 parties[] 的单元测试/审核对象。
      if (supportedClaims > 0 && rejectedClaims > 0 || partialClaims > 0) applicantOutcome = 'partially_supported';
      else if (supportedClaims > 0 && rejectedClaims === 0) applicantOutcome = 'supported';
      else if (rejectedClaims > 0 && supportedClaims === 0) applicantOutcome = 'not_supported';
    }
    const hasUnscopedOtherReject = actions.some((action) =>
      action.action === 'reject' && action.targetPartyRole === 'unknown' && /其他/.test(action.sourceText)
    );
    if (hasUnscopedOtherReject && applicantOutcome === 'supported') applicantOutcome = 'partially_supported';

    const employeeStatuses = statusesForRole('employee');
    const employerStatuses = statusesForRole('employer');
    let employeeOutcome = aggregate(employeeStatuses);
    let employerOutcome = aggregate(employerStatuses);
    if (employeeOutcome === 'unclear' || employerOutcome === 'unclear') {
      const mapped = resolvePartyOutcomes(parties.applicantRole, applicantOutcome);
      if (employeeOutcome === 'unclear') employeeOutcome = mapped.employeeOutcome;
      if (employerOutcome === 'unclear') employerOutcome = mapped.employerOutcome;
    }
    return { employeeOutcome, employerOutcome, overallResult: applicantOutcome };
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
    if (parties.applicantRole === 'unknown') return '调解/其他';
    const isEmployeeApplicant = parties.applicantRole === 'employee';
    if (overall === 'supported') {
      return isEmployeeApplicant ? '用人单位败诉' : '用人单位胜诉';
    }
    if (overall === 'not_supported') {
      return isEmployeeApplicant ? '用人单位胜诉' : '用人单位败诉';
    }
    if (overall === 'partially_supported') {
      return '部分支持';
    }
    return '调解/其他';
  }
}
