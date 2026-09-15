/**
 * 深圳劳动仲裁文书本地研究库 - 证据识别器 (EvidenceRecognizer)
 * 扫描证据清单、事实认定与质证段落，识别案件中所使用的证据类型
 */

import { EvidenceItem, EvidenceProvider } from '../../types';

export interface EvidenceRuleDef {
  name: string;
  patterns: RegExp[];
}

export const EVIDENCE_RULES: EvidenceRuleDef[] = [
  {
    name: '员工手册',
    patterns: [
      /(?:《员工手册》|员工手册签收表|员工手册培训记录|员工守则)/,
    ],
  },
  {
    name: '规章制度',
    patterns: [
      /(?:规章制度|考勤管理制度|奖惩管理办法|薪酬管理办法|制度公示记录|民主协商纪要)/,
    ],
  },
  {
    name: '考勤记录',
    patterns: [
      /(?:考勤记录|打卡记录|门禁打卡表|指纹打卡数据|钉钉打卡明细|考勤汇总表|电子考勤表)/,
    ],
  },
  {
    name: '工资表',
    patterns: [
      /(?:工资表|工资条|薪酬发放明细表|工资签收表|绩效核算表|提成结算表)/,
    ],
  },
  {
    name: '银行流水',
    patterns: [
      /(?:银行流水|银行对账单|代发工资转账凭证|电子回单|网银转账记录)/,
    ],
  },
  {
    name: '微信聊天',
    patterns: [
      /(?:微信聊天记录|微信群聊记录|微信转账记录|工作微信沟通记录)/,
    ],
  },
  {
    name: '邮件',
    patterns: [
      /(?:电子邮件|工作邮件|企业邮箱往来邮件|邮件通知|发送邮件记录)/,
    ],
  },
  {
    name: '录音',
    patterns: [
      /(?:通话录音|录音光盘|现场沟通录音|录音文字整理件|录音资料)/,
    ],
  },
  {
    name: '录像',
    patterns: [
      /(?:现场监控录像|视频光盘|监控视频资料|视频记录)/,
    ],
  },
  {
    name: '解除通知书',
    patterns: [
      /(?:解除劳动合同通知书|终止劳动合同通知书|辞退通知书|解聘通知书|离职证明书)/,
    ],
  },
  {
    name: '警告通知',
    patterns: [
      /(?:警告通知书|违纪处分通知书|严重警告信|违规通报|整改通知书)/,
    ],
  },
  {
    name: '绩效考核',
    patterns: [
      /(?:绩效考核表|KPI评分表|月度绩效确认单|季度考核结果|不胜任工作评估表)/,
    ],
  },
  {
    name: '劳动合同',
    patterns: [
      /(?:劳动合同书|书面劳动合同|劳动用工合同|劳动合同文本)/,
    ],
  },
  {
    name: '补充协议',
    patterns: [
      /(?:补充协议|岗位调整协议|薪酬变更协议|保密及竞业限制协议)/,
    ],
  },
  {
    name: '证人证言',
    patterns: [
      /(?:证人证言|证人出庭作证|同事书面证明|第三方证言)/,
    ],
  },
];

export class EvidenceRecognizer {
  /**
   * 识别文书中使用的证据
   */
  public static recognize(text: string): EvidenceItem[] {
    if (!text) return [];

    const items: EvidenceItem[] = [];

    for (const rule of EVIDENCE_RULES) {
      for (const pattern of rule.patterns) {
        const m = text.match(pattern);
        if (m && m.index !== undefined) {
          const start = Math.max(0, m.index - 15);
          const end = Math.min(text.length, m.index + m[0].length + 25);
          const matchedText = text.slice(start, end).replace(/\n+/g, ' ').trim();

          // 本识别器没有当事人劳动关系身份上下文，不把程序角色机械映射为证据来源。
          const provider: EvidenceProvider = 'unknown';

          items.push({
            name: rule.name,
            matchedText,
            provider,
            confidence: 0.9,
          });
          break;
        }
      }
    }

    return items;
  }
}
