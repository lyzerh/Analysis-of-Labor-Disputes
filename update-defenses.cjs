const fs = require('fs');
let code = fs.readFileSync('src/services/parser/LaborInfoParserAdapter.ts', 'utf8');

const newDefensesLogic = `
  public static extractEmployerDefenses(
    text: string,
    sections: { respondentArgs?: string; reasoning?: string; facts?: string }
  ): EmployerDefenseItem[] {
    const defenses: EmployerDefenseItem[] = [];
    const sourceText = \`\${sections.respondentArgs || ''}\\n\${sections.reasoning || ''}\\n\${sections.facts || ''}\\n\${text}\`;

    const defenseCatalog: Array<{
      defenseType: string;
      keywords: string[];
      exactMatchRegex: RegExp;
    }> = [
      {
        defenseType: '旷工 / 擅自离岗',
        keywords: ['旷工', '连续旷工', '累计旷工', '擅自离职', '未履行请假手续', '脱岗', '未按时打卡出勤', '迟到早退'],
        exactMatchRegex: /([^，。；\\n]*?(?:旷工|累计旷工|连续旷工达|未经批准擅自|未办理请假手续|脱岗|迟到早退)[^，。；\\n]*)/g,
      },
      {
        defenseType: '严重违纪 / 违反规章制度',
        keywords: ['严重违反规章制度', '严重违纪', '员工手册', '考勤管理制度', '违纪行为', '第三十九条第二项', '严重失职', '违反公司制度'],
        exactMatchRegex: /([^，。；\\n]*?(?:严重违反(?:用人单位|公司)?规章制度|严重违纪|违反员工手册|严重失职|营私舞弊|违反公司制度)[^，。；\\n]*)/g,
      },
      {
        defenseType: '不能胜任工作 / 考核不达标',
        keywords: ['不胜任工作', '考核不达标', '绩效不合格', '未能完成工作任务', '第四十条第二项', '调岗培训', '不能胜任工作', '绩效考核不合格'],
        exactMatchRegex: /([^，。；\\n]*?(?:不胜任(?:本职)?工作|不能胜任工作|绩效考核不合格|考核结果不达标|经培训后仍不胜任)[^，。；\\n]*)/g,
      },
      {
        defenseType: '协商一致解除 / 自愿离职',
        keywords: ['协商一致解除', '双方协商解除', '协议解除', '签署解除协议', '自愿离职', '辞职信', '员工主动辞职', '自动离职'],
        exactMatchRegex: /([^，。；\\n]*?(?:协商一致解除|双方协商同意解除|签署了?离职协议|主动提出离职|提交辞职信|自愿离职|自动离职|员工主动辞职)[^，。；\\n]*)/g,
      },
      {
        defenseType: '试用期不符合录用条件',
        keywords: ['试用期不符合录用条件', '录用条件', '试用期考核不合格', '试用期解除', '不符合岗位要求'],
        exactMatchRegex: /([^，。；\\n]*?(?:在试用期(?:间)?被证明不符合录用条件|试用期考核不合格|未通过试用期考察|不符合录用条件)[^，。；\\n]*)/g,
      },
      {
        defenseType: '劳动合同期满终止',
        keywords: ['合同期满终止', '期满不续签', '劳动合同到期', '终止劳动合同通知', '合同期满'],
        exactMatchRegex: /([^，。；\\n]*?(?:劳动合同期满(?:终止)?|合同到期不续签|期满自然终止|劳动合同到期)[^，。；\\n]*)/g,
      },
      {
        defenseType: '已足额支付劳动报酬/已结清',
        keywords: ['已足额支付', '不存在拖欠', '工资已结清', '包含在固定工资中', '已发放完毕', '无未结款项', '不存在加班', '已支付工资', '已支付经济补偿'],
        exactMatchRegex: /([^，。；\\n]*?(?:已按月足额发放|工资已全部结清|不存在拖欠|已支付全部加班费|不存在加班|已支付工资|已支付经济补偿)[^，。；\\n]*)/g,
      },
      {
        defenseType: '客观情况发生重大变化',
        keywords: ['客观情况发生重大变化', '部门撤销', '组织架构调整', '业务关停', '第四十条第三项'],
        exactMatchRegex: /([^，。；\\n]*?(?:客观情况发生重大变化|组织架构调整|岗位取消|部门撤销)[^，。；\\n]*)/g,
      },
      {
        defenseType: '不服从安排 / 拒绝调岗',
        keywords: ['拒不服从工作安排', '拒绝调岗', '拒绝加班', '不服从管理'],
        exactMatchRegex: /([^，。；\\n]*?(?:拒不服从工作安排|拒绝调岗|拒绝加班|不服从管理)[^，。；\\n]*)/g,
      },
      {
        defenseType: '不存在劳动关系 / 未建立劳动关系',
        keywords: ['未形成劳动关系', '不属于劳动关系', '不存在劳动关系'],
        exactMatchRegex: /([^，。；\\n]*?(?:未形成劳动关系|不属于劳动关系|不存在劳动关系)[^，。；\\n]*)/g,
      },
      {
        defenseType: '证据真实性/合法性/关联性异议',
        keywords: ['真实性异议', '不予认可', '伪造', '关联性异议', '合法性异议'],
        exactMatchRegex: /([^，。；\\n]*?(?:对真实性有异议|不予认可|对合法性有异议|对关联性有异议|不予确认)[^，。；\\n]*)/g,
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
`;

const regex = /public static extractEmployerDefenses\([\s\S]*?return defenses;\n  }/;
code = code.replace(regex, newDefensesLogic.trim());
fs.writeFileSync('src/services/parser/LaborInfoParserAdapter.ts', code);
console.log('Patched extractEmployerDefenses');
