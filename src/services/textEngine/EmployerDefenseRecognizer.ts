/**
 * 深圳劳动仲裁文书本地研究库 - 企业抗辩识别器 (EmployerDefenseRecognizer)
 * 优先扫描被申请人答辩/公司主张区域，避免简单全文关键词误判
 */

import { EmployerDefenseItem } from '../../types';
import { TextProcessor } from './TextProcessor';

export interface DefenseRuleDef {
  type: string;
  // 在答辩专属区域的高置信度正则
  respondentPatterns: RegExp[];
  // 在全文或事实区域的上下文正则（要求带“被申请人主张/答辩/主张劳动者...”等限定词）
  contextPatterns: RegExp[];
  baseConfidence: number;
}

export const EMPLOYER_DEFENSE_RULES: DefenseRuleDef[] = [
  {
    type: '严重违纪',
    respondentPatterns: [
      /(?:严重违纪|严重违反用人单位规章制度|严重违反劳动纪律|存在严重违纪行为|违规违纪)/,
      /(?:依据《劳动合同法》第三十九条.*解除|解除劳动合同合法合规|违纪辞退)/,
    ],
    contextPatterns: [
      /被申请人(?:辩称|主张|认为|主张其系因|提交证据证明).*?(?:严重违纪|严重违反公司制度|严重违反劳动纪律)/,
      /被申请人系以申请人(?:严重违纪|严重违反制度)为由解除/,
    ],
    baseConfidence: 0.9,
  },
  {
    type: '旷工',
    respondentPatterns: [
      /(?:旷工|连续旷工|擅自离岗|累计旷工|旷工达[0-9]+天|未请假擅自离岗|旷工属于严重违纪)/,
      /(?:按自动离职处理|按旷工严重违纪解除)/,
    ],
    contextPatterns: [
      /被申请人(?:辩称|主张|提交考勤).*?(?:旷工|连续旷工|未履行请假手续|脱岗)/,
      /被申请人以申请人旷工为由.*?(?:解除|辞退|终止)/,
    ],
    baseConfidence: 0.9,
  },
  {
    type: '不能胜任工作',
    respondentPatterns: [
      /(?:不能胜任工作|绩效不合格|经考核不合格|经培训.*仍不能胜任|调整岗位.*仍不能胜任)/,
      /(?:依据《劳动合同法》第四十条.*解除|考核等级为[D|E|不合格])/,
    ],
    contextPatterns: [
      /被申请人(?:辩称|主张).*?(?:不能胜任工作|绩效考核不达标|不胜任)/,
      /被申请人以申请人不能胜任工作为由解除/,
    ],
    baseConfidence: 0.9,
  },
  {
    type: '规章制度依据',
    respondentPatterns: [
      /(?:员工手册|规章制度|考勤管理办法|奖惩管理制度|制度已向申请人公示|申请人已签收制度|民主程序制定)/,
      /(?:依据公司《[^》]+制度》|制度合法有效)/,
    ],
    contextPatterns: [
      /被申请人(?:辩称|提交).*?(?:规章制度已公示|已签收员工手册|制度履行了民主程序)/,
    ],
    baseConfidence: 0.85,
  },
  {
    type: '协商解除',
    respondentPatterns: [
      /(?:双方协商一致解除|协商解除|达成离职协议|签署离职证明|申请人自愿签署解除协议)/,
      /(?:依据《劳动合同法》第三十六条|已全额结清补偿)/,
    ],
    contextPatterns: [
      /被申请人(?:辩称|主张).*?(?:双方系协商一致解除|达成离职补偿协议)/,
    ],
    baseConfidence: 0.9,
  },
  {
    type: '客观情况重大变化',
    respondentPatterns: [
      /(?:客观情况发生重大变化|致使劳动合同无法履行|部门撤销|业务关停|项目终止|未能就变更合同达成协议)/,
      /(?:依据《劳动合同法》第四十条第(?:三|\(三\)|3)项)/,
    ],
    contextPatterns: [
      /被申请人(?:辩称|主张).*?(?:客观情况发生重大变化|组织架构调整导致岗位取消)/,
    ],
    baseConfidence: 0.9,
  },
  {
    type: '调岗合理',
    respondentPatterns: [
      /(?:调岗具有合理性|用人单位自主用工权|生产经营需要|合理调整岗位|薪资待遇未降低|属于合理用工管理)/,
      /(?:拒绝合理调岗|不服从合理工作安排)/,
    ],
    contextPatterns: [
      /被申请人(?:辩称|主张).*?(?:调岗属于合理行使用工自主权|调岗具有必要性与合理性)/,
    ],
    baseConfidence: 0.85,
  },
  {
    type: '劳动者主动辞职',
    respondentPatterns: [
      /(?:申请人主动辞职|个人原因辞职|主动提出离职|提交辞职信|提交离职申请|自愿离职|擅自离职)/,
      /(?:并非用人单位辞退|系劳动者单方辞职)/,
    ],
    contextPatterns: [
      /被申请人(?:辩称|主张).*?(?:申请人系因个人原因辞职|自愿提出离职|并非被申请人解除)/,
    ],
    baseConfidence: 0.95,
  },
  {
    type: '试用期不符合录用条件',
    respondentPatterns: [
      /(?:试用期不符合录用条件|试用期考核不合格|未达到录用标准|录用条件已明确告知)/,
      /(?:依据《劳动合同法》第三十九条第(?:一|\(一\)|1)项)/,
    ],
    contextPatterns: [
      /被申请人(?:辩称|主张).*?(?:在试用期内不符合录用条件|试用期考核不达标)/,
    ],
    baseConfidence: 0.9,
  },
  {
    type: '竞业限制',
    respondentPatterns: [
      /(?:违反竞业限制义务|入职竞争对手公司|自营同类业务|应支付违约金|返还竞业限制补偿金)/,
      /(?:竞业限制协议有效|已按期足额支付竞业限制补偿)/,
    ],
    contextPatterns: [
      /被申请人(?:辩称|反请求|主张).*?(?:申请人违反竞业限制|入职同业竞品公司)/,
    ],
    baseConfidence: 0.9,
  },
  {
    type: '加班不存在',
    respondentPatterns: [
      /(?:不存在加班事实|未安排加班|未履行加班审批手续|实行不定时工作制|实行综合计算工时制)/,
      /(?:申请人未提交有效证据证明加班|考勤记录无加班打卡)/,
    ],
    contextPatterns: [
      /被申请人(?:辩称|主张).*?(?:申请人未实际加班|不存在加班事实|未经过加班审批)/,
    ],
    baseConfidence: 0.9,
  },
  {
    type: '工资已经支付',
    respondentPatterns: [
      /(?:工资已足额发放|已全额结清工资|不存在拖欠工资|银行转账记录证明工资已结清|提成已按约定支付)/,
      /(?:双方无工资拖欠争议|工资发放符合约定)/,
    ],
    contextPatterns: [
      /被申请人(?:辩称|主张|提交银行流水).*?(?:工资已全额支付|已足额结清全部报酬)/,
    ],
    baseConfidence: 0.9,
  },
];

export class EmployerDefenseRecognizer {
  /**
   * 识别企业抗辩策略
   * @param fullText 完整文书
   * @param respondentArguments 可选已切分的被申请人答辩章节
   */
  public static recognize(fullText: string, respondentArguments?: string): EmployerDefenseItem[] {
    if (!fullText) return [];

    const sections = respondentArguments
      ? { respondentArguments }
      : TextProcessor.recognizeSections(fullText);

    const targetSection = sections.respondentArguments || '';
    const results: EmployerDefenseItem[] = [];

    for (const rule of EMPLOYER_DEFENSE_RULES) {
      let matchedText = '';
      let confidence = 0;
      let sourceSection = '';

      // 1. 优先扫描被申请人答辩区域 (高置信度)
      if (targetSection && targetSection.length > 10) {
        for (const p of rule.respondentPatterns) {
          const m = targetSection.match(p);
          if (m && m.index !== undefined) {
            const start = Math.max(0, m.index - 15);
            const end = Math.min(targetSection.length, m.index + m[0].length + 25);
            matchedText = targetSection.slice(start, end).replace(/\n+/g, ' ').trim();
            confidence = rule.baseConfidence;
            sourceSection = '被申请人答辩';
            break;
          }
        }
      }

      // 2. 若答辩区未直接匹配，在全文带有公司主张语境的正则中匹配
      if (!matchedText) {
        for (const cp of rule.contextPatterns) {
          const m = fullText.match(cp);
          if (m && m.index !== undefined) {
            const start = Math.max(0, m.index - 10);
            const end = Math.min(fullText.length, m.index + m[0].length + 25);
            matchedText = fullText.slice(start, end).replace(/\n+/g, ' ').trim();
            confidence = Math.max(0.65, rule.baseConfidence - 0.15);
            sourceSection = '事实与意见段落';
            break;
          }
        }
      }

      if (matchedText) {
        results.push({
          defenseType: rule.type,
          matchedText,
          confidence: Number(confidence.toFixed(2)),
          sourceSection,
        });
      }
    }

    return results;
  }
}
