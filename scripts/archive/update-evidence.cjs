const fs = require('fs');
let code = fs.readFileSync('src/services/parser/LaborInfoParserAdapter.ts', 'utf8');

const newEvidenceLogic = `
  public static extractEvidence(
    text: string,
    sections: { facts?: string; reasoning?: string }
  ): EvidenceItem[] {
    const evidenceList: EvidenceItem[] = [];
    const sourceText = \`\${sections.facts || ''}\\n\${text}\`;

    const evidenceCatalog: Array<{
      name: string;
      keywords: string[];
      regex: RegExp;
    }> = [
      {
        name: '劳动合同/协议',
        keywords: ['劳动合同', '聘用协议', '劳动合同书', '续签劳动合同'],
        regex: /([^，。；\\n]*?(?:《?劳动合同(?:书)?》?|聘用协议|书面劳动合同)[^，。；\\n]*)/g,
      },
      {
        name: '规章制度/员工手册',
        keywords: ['规章制度', '员工手册', '考勤管理制度', '奖惩制度', '签字确认表', '民主程序'],
        regex: /([^，。；\\n]*?(?:《员工手册》|《考勤管理制度》|《规章制度》|规章制度|员工手册|管理办法)[^，。；\\n]*)/g,
      },
      {
        name: '考勤记录/打卡数据',
        keywords: ['考勤记录', '打卡记录', '指纹考勤', '钉钉打卡', '企业微信打卡', '出勤表', '打卡流水'],
        regex: /([^，。；\\n]*?(?:考勤表|打卡记录|钉钉打卡|出勤记录|指纹打卡|考勤记录)[^，。；\\n]*)/g,
      },
      {
        name: '工资支付/银行流水',
        keywords: ['银行流水', '工资条', '工资支付凭证', '个税完税证明', '银行转账记录', '薪资明细', '工资表'],
        regex: /([^，。；\\n]*?(?:银行流水|工资条|工资明细表|完税证明|工资发放|转账记录|工资表)[^，。；\\n]*)/g,
      },
      {
        name: '电子沟通/通知记录',
        keywords: ['聊天记录', '微信记录', '电子邮件', '钉钉', '通知', '函件', 'EMS凭证', '录音', '录像'],
        regex: /([^，。；\\n]*?(?:微信聊天记录|聊天记录|电子邮件|EMS|送达回执|钉钉|通知书|录音|录像)[^，。；\\n]*)/g,
      },
      {
        name: '离职/处分证明',
        keywords: ['辞退通知', '解除劳动合同通知书', '离职申请', '警告记录', '处罚通知', '调解书'],
        regex: /([^，。；\\n]*?(?:辞退通知|解除(?:劳动)?合同通知书|离职申请|处分通知|处罚通知|调解书|裁决书|决定书)[^，。；\\n]*)/g,
      },
      {
        name: '社保/工伤记录',
        keywords: ['社保记录', '工伤认定书', '缴纳证明', '社保', '鉴定结论'],
        regex: /([^，。；\\n]*?(?:社保记录|工伤认定书|缴纳证明|社会保险|劳动能力鉴定)[^，。；\\n]*)/g,
      }
    ];

    for (const item of evidenceCatalog) {
      if (item.keywords.some((kw) => sourceText.includes(kw))) {
         let matchText = item.keywords[0];
         let confidence = 0.5;
         
         const evidenceContextRegex = /(?:提交|提供|出示|举证).{0,10}?(?:了|的)?.{0,20}?([^，。；\\n]*?(?:证据|证明|材料)[^，。；\\n]*)/g;
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
`;

const regex = /public static extractEvidence\([\s\S]*?return evidenceList;\n  }/;
code = code.replace(regex, newEvidenceLogic.trim());
fs.writeFileSync('src/services/parser/LaborInfoParserAdapter.ts', code);
console.log('Patched extractEvidence');
