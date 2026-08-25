/**
 * 深圳劳动仲裁文书本地研究库 - 败诉原因识别器 (LossReasonRecognizer)
 * 重点扫描裁判说理与事实认定区域，精准定位用人单位败诉的法理归因
 */

import { LossReasonItem } from '../../types';
import { TextProcessor } from './TextProcessor';

export interface LossReasonRuleDef {
  reason: string;
  patterns: RegExp[];
  baseConfidence: number;
}

export const LOSS_REASON_RULES: LossReasonRuleDef[] = [
  {
    reason: '证据不足',
    patterns: [
      /(?:证据不足|未提交充分证据|现有证据不足以证明|证据尚不足以采信|缺乏充分证据支持)/,
    ],
    baseConfidence: 0.9,
  },
  {
    reason: '举证不能',
    patterns: [
      /(?:承担举证不能的法律后果|应承担举证不能的责任|未尽到举证责任|举证责任在被申请人.*未举证)/,
      /(?:依据《劳动争议调解仲裁法》第六条.*举证不能)/,
    ],
    baseConfidence: 0.95,
  },
  {
    reason: '无法证明',
    patterns: [
      /(?:无法证明|未能证明|不足以证明申请人存在|未能有效证明|无法证实)/,
    ],
    baseConfidence: 0.85,
  },
  {
    reason: '事实依据不足',
    patterns: [
      /(?:缺乏事实依据|事实依据不足|无事实依据|认定事实缺乏根据)/,
    ],
    baseConfidence: 0.9,
  },
  {
    reason: '制度未公示',
    patterns: [
      /(?:未向劳动者公示|未送达劳动者|未能证明已向申请人送达或告知|未履行告知义务|无签收确认记录)/,
      /(?:规章制度未经公示|未向申请人公示或告知)/,
    ],
    baseConfidence: 0.95,
  },
  {
    reason: '制度未经民主程序',
    patterns: [
      /(?:未经职工代表大会或者全体职工讨论|未经过民主协商程序|未履行法定民主程序|民主程序存在瑕疵)/,
      /(?:依据《劳动合同法》第四条.*民主程序)/,
    ],
    baseConfidence: 0.95,
  },
  {
    reason: '解除程序违法',
    patterns: [
      /(?:解除程序违法|单方解除程序不符合法律规定|未依法事先通知工会|解除劳动合同程序不合法)/,
      /(?:依据《劳动合同法》第四十三条)/,
    ],
    baseConfidence: 0.95,
  },
  {
    reason: '通知程序违法',
    patterns: [
      /(?:未履行通知义务|未有效送达解除通知|送达程序违法|通知工会程序缺失|未提前三十日书面通知)/,
    ],
    baseConfidence: 0.9,
  },
  {
    reason: '违纪事实不能成立',
    patterns: [
      /(?:违纪事实不成立|违纪行为不能成立|主张的严重违纪缺乏事实根据|违纪情节不能成立)/,
    ],
    baseConfidence: 0.95,
  },
  {
    reason: '严重程度不足',
    patterns: [
      /(?:未达到严重违纪程度|违纪行为尚未达到严重程度|用人单位处分畸重|违纪情节轻微|严重程度不足以解除)/,
    ],
    baseConfidence: 0.9,
  },
  {
    reason: '证据真实性问题',
    patterns: [
      /(?:申请人不予认可真实性|真实性无法确认|无法核实真实性|证据真实性存疑|未提供原件核对)/,
    ],
    baseConfidence: 0.9,
  },
  {
    reason: '证据关联性不足',
    patterns: [
      /(?:与本案缺乏关联性|不具有关联性|未能证明与本案主张存在直接关联|关联性不足)/,
    ],
    baseConfidence: 0.85,
  },
  {
    reason: '证据合法性问题',
    patterns: [
      /(?:取证程序不合法|证据来源不合法|侵害他人合法权益取得|合法性存在瑕疵)/,
    ],
    baseConfidence: 0.95,
  },
];

export class LossReasonRecognizer {
  /**
   * 识别败诉原因（重点在仲裁庭意见与事实说理区域）
   */
  public static recognize(
    fullText: string,
    tribunalReasoning?: string,
    facts?: string
  ): LossReasonItem[] {
    if (!fullText) return [];

    // 优先构建说理与事实的核心文本域
    const reasoningText = tribunalReasoning || TextProcessor.recognizeSections(fullText).reasoning || '';
    const factsText = facts || TextProcessor.recognizeSections(fullText).facts || '';
    const priorityText = `${reasoningText}\n${factsText}`;

    const results: LossReasonItem[] = [];

    for (const rule of LOSS_REASON_RULES) {
      let matched = false;

      // 1. 优先扫描裁判说理与事实认定区域
      if (priorityText && priorityText.length > 20) {
        for (const pattern of rule.patterns) {
          const m = priorityText.match(pattern);
          if (m && m.index !== undefined) {
            const start = Math.max(0, m.index - 20);
            const end = Math.min(priorityText.length, m.index + m[0].length + 40);
            const matchedText = priorityText.slice(start, end).replace(/\n+/g, ' ').trim();

            results.push({
              reason: rule.reason,
              matchedText,
              confidence: rule.baseConfidence,
              reasoningSnippet: matchedText,
            });
            matched = true;
            break;
          }
        }
      }

      // 2. 备用：在全文中审慎匹配（要求带“本委认为/认定/经查”等前缀）
      if (!matched) {
        for (const pattern of rule.patterns) {
          const m = fullText.match(pattern);
          if (m && m.index !== undefined) {
            const start = Math.max(0, m.index - 20);
            const end = Math.min(fullText.length, m.index + m[0].length + 40);
            const matchedText = fullText.slice(start, end).replace(/\n+/g, ' ').trim();

            results.push({
              reason: rule.reason,
              matchedText,
              confidence: Math.max(0.65, rule.baseConfidence - 0.15),
              reasoningSnippet: matchedText,
            });
            break;
          }
        }
      }
    }

    return results;
  }
}
