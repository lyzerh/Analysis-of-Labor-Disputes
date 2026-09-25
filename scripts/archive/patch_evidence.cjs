const fs = require('fs');
let code = fs.readFileSync('src/services/analytics/DefenseStrategyAnalyzer.ts', 'utf-8');

const newAnalyzer = `
  private static analyzeEvidenceAssociations(
    allRecords: AnalysisCaseRecord[],
    supportedRecords: AnalysisCaseRecord[]
  ): {
    singleRanking: EvidenceAnalyticsItem[];
    combinations: EvidenceCombinationItem[];
  } {
    const supportedCount = supportedRecords.length;
    
    // Normalization rules
    const normalizeEvidence = (name: string): string => {
       if (!name) return '其他';
       if (/离职申请单|离职申请表|离职手续表|辞职书|辞职信/.test(name)) return '离职申请/离职手续材料';
       if (/试用期评定|试用期考核|转正考核|试用期评估/.test(name)) return '试用期考核材料';
       if (/劳动合同书|劳动合同/.test(name)) return '劳动合同';
       if (/规章制度|员工手册|奖惩规定/.test(name)) return '规章制度';
       if (/考勤记录|打卡记录|考勤表|指纹打卡/.test(name)) return '考勤记录';
       if (/工资单|工资条|银行流水|转账凭证|工资流水/.test(name)) return '工资及支付凭证';
       if (/解除劳动合同通知书|开除通知|辞退通知|辞退书/.test(name)) return '解除劳动关系通知书';
       if (/微信聊天|钉钉聊天|聊天记录|邮件沟通/.test(name)) return '电子沟通记录';
       if (/送达回证|邮寄凭证|签收单/.test(name)) return '送达与签收凭证';
       return name.trim();
    };

    // Calculate item and combination frequencies within supported records ONLY.
    // Combinations map: 'ItemA + ItemB' -> { count: number, caseIds: string[] }
    const singleMap = new Map<string, { caseIds: string[] }>();
    const combo2Map = new Map<string, { caseIds: string[] }>();
    const combo3Map = new Map<string, { caseIds: string[] }>();

    supportedRecords.forEach(r => {
        // Standardize current case evidences
        const evNames = Array.from(new Set( (r.evidence || []).map(e => normalizeEvidence(e.name)).filter(Boolean) ));
        evNames.sort();

        // 1-item
        evNames.forEach(ev => {
            if (!singleMap.has(ev)) singleMap.set(ev, { caseIds: [] });
            singleMap.get(ev)!.caseIds.push(r.caseId);
        });

        // 2-item combinations
        for (let i = 0; i < evNames.length; i++) {
            for (let j = i + 1; j < evNames.length; j++) {
                const comboKey = evNames[i] + ' + ' + evNames[j];
                if (!combo2Map.has(comboKey)) combo2Map.set(comboKey, { caseIds: [] });
                combo2Map.get(comboKey)!.caseIds.push(r.caseId);
            }
        }

        // 3-item combinations
        for (let i = 0; i < evNames.length; i++) {
            for (let j = i + 1; j < evNames.length; j++) {
                for (let k = j + 1; k < evNames.length; k++) {
                    const comboKey = evNames[i] + ' + ' + evNames[j] + ' + ' + evNames[k];
                    if (!combo3Map.has(comboKey)) combo3Map.set(comboKey, { caseIds: [] });
                    combo3Map.get(comboKey)!.caseIds.push(r.caseId);
                }
            }
        }
    });

    const singleRanking: EvidenceAnalyticsItem[] = [];
    singleMap.forEach((val, evKey) => {
        singleRanking.push({
          evidenceName: evKey,
          frequency: val.caseIds.length,
          caseCount: val.caseIds.length,
          caseIds: val.caseIds,
          appearanceInEmployerSupportedCount: val.caseIds.length,
          appearanceInEmployerSupportedCaseIds: val.caseIds,
          rateInEmployerSupported: supportedCount > 0
            ? Number(((val.caseIds.length / supportedCount) * 100).toFixed(1))
            : 0,
        });
    });
    singleRanking.sort((a, b) => b.appearanceInEmployerSupportedCount - a.appearanceInEmployerSupportedCount);

    const combinations: EvidenceCombinationItem[] = [];
    
    // Add top 2-item combos
    const combo2Arr = Array.from(combo2Map.entries()).sort((a, b) => b[1].caseIds.length - a[1].caseIds.length).slice(0, 5);
    combo2Arr.forEach(([key, val]) => {
        combinations.push({
            combinationKey: key,
            evidenceCombination: key.split(' + '),
            appearanceCount: val.caseIds.length,
            caseIds: val.caseIds,
            appearanceRate: supportedCount > 0 ? Number(((val.caseIds.length / supportedCount) * 100).toFixed(1)) : 0
        });
    });

    // Add top 3-item combos
    const combo3Arr = Array.from(combo3Map.entries()).sort((a, b) => b[1].caseIds.length - a[1].caseIds.length).slice(0, 5);
    combo3Arr.forEach(([key, val]) => {
        combinations.push({
            combinationKey: key,
            evidenceCombination: key.split(' + '),
            appearanceCount: val.caseIds.length,
            caseIds: val.caseIds,
            appearanceRate: supportedCount > 0 ? Number(((val.caseIds.length / supportedCount) * 100).toFixed(1)) : 0
        });
    });

    // Sort all combos
    combinations.sort((a, b) => b.appearanceCount - a.appearanceCount);

    return {
      singleRanking: singleRanking.slice(0, 10),
      combinations,
    };
  }
`;

code = code.replace(
  /private static analyzeEvidenceAssociations[\s\S]*?return \{\s*singleRanking:[^\}]*combinations: \[\]\,[\s\S]*?\};\s*\}/,
  newAnalyzer.trim()
);
fs.writeFileSync('src/services/analytics/DefenseStrategyAnalyzer.ts', code);
