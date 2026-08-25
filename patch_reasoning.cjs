const fs = require('fs');
let code = fs.readFileSync('src/services/analytics/DefenseStrategyAnalyzer.ts', 'utf-8');

const newStatsGen = `
      // 2. 统计法院否定裁判理由高频关键词 (Denial Reasons)
      // Extract denial reasons strictly from court reasoning block
      const courtReasoningStats: CourtReasoningKeywordStat[] = [];
      const standardReasons = [
        { key: '证据不足', keywords: ['证据不足', '未提供证据', '缺乏证据', '未举证', '举证不能'] },
        { key: '缺乏事实依据', keywords: ['缺乏事实依据', '无事实依据', '事实不成立'] },
        { key: '未明确录用条件', keywords: ['录用条件不明确', '未明确录用条件', '未向劳动者说明录用条件', '未证明不符合录用条件'] },
        { key: '未明确考核标准', keywords: ['未明确考核标准', '无考核标准', '考核标准不客观', '未定考核标准'] },
        { key: '未完成举证责任', keywords: ['未完成举证责任', '举证责任在用人单位', '未能举证', '由用人单位承担举证不能的不利后果', '未能提供足以证明'] },
        { key: '未经民主程序', keywords: ['未经民主程序', '未经过民主程序', '规章制度未依法通过'] },
        { key: '未向劳动者公示', keywords: ['未向劳动者公示', '未公示', '未送达', '未告知'] },
        { key: '程序违法', keywords: ['程序违法', '不符合法定程序', '未通知工会', '解雇程序违法'] },
        { key: '证据真实性/关联性不足', keywords: ['不予采信', '不具关联性', '无法确认真实性', '系单方制作', '存在涂改'] }
      ];

      const reasonMap = new Map<string, { count: number, caseIds: string[] }>();

      failedRecords.forEach((r) => {
        const reasoning = r.courtReasoning || '';
        let foundReason = false;
        
        for (const sr of standardReasons) {
           if (sr.keywords.some(kw => reasoning.includes(kw))) {
               if (!reasonMap.has(sr.key)) reasonMap.set(sr.key, { count: 0, caseIds: [] });
               const entry = reasonMap.get(sr.key)!;
               entry.count++;
               entry.caseIds.push(r.caseId);
               foundReason = true;
           }
        }
        
        if (!foundReason && reasoning.length > 0) {
           const otherKey = '其他';
           if (!reasonMap.has(otherKey)) reasonMap.set(otherKey, { count: 0, caseIds: [] });
           const entry = reasonMap.get(otherKey)!;
           entry.count++;
           entry.caseIds.push(r.caseId);
        }
      });

      for (const [key, val] of reasonMap.entries()) {
         courtReasoningStats.push({
           keyword: key,
           count: val.count,
           caseIds: val.caseIds
         });
      }
      courtReasoningStats.sort((a, b) => b.count - a.count);
`;

code = code.replace(
  /\/\/ 2\. 统计法院否定裁判理由高频关键词[\s\S]*?courtReasoningStats\.sort\(\(a, b\) => b\.count - a\.count\);/,
  newStatsGen.trim()
);
fs.writeFileSync('src/services/analytics/DefenseStrategyAnalyzer.ts', code);
