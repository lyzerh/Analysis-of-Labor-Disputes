import { 
  AnalysisCaseRecord,
  DefenseAnalysisReport,
  DefenseStrategyEnhancedItem,
  FailedDefenseAnalysisItem,
  EvidenceCombinationItem,
  DisputeDefenseMatrixReport,
  DisputeDefenseMatrixCell,
  EvidenceAnalyticsItem,
  MissingEvidenceStat,
  CourtReasoningKeywordStat,
LegalOutcomeType } from '../../types';
import { isEmployerProvidedEvidence } from '../evidence/EvidenceProvider';
import {
  filterAnalyticsEligibleRecords,
  type AnalyticsAdmissionFilterOptions,
} from './AnalyticsAdmission';

/**
 * 重点标准抗辩事由清单 (用于标准统计与矩阵对齐)
 */
export const STANDARD_DEFENSE_TYPES = [
  '严重违纪',
  '旷工',
  '不能胜任工作',
  '规章制度',
  '协商解除',
  '自愿离职',
  '业务调整',
  '合法调岗',
] as const;

/**
 * 重点争议类型清单 (用于矩阵分析)
 */
export const STANDARD_DISPUTE_TYPES = [
  '违法解除',
  '劳动合同解除',
  '经济补偿金',
  '加班工资',
  '未签劳动合同二倍工资',
  '竞业限制',
  '调岗降薪',
] as const;

/**
 * 重点证据材料核查清单 (用于缺失证据与高频组合分析)
 */
export const STANDARD_CHECKLIST_EVIDENCE = [
  '规章制度',
  '员工签收',
  '考勤记录',
  '劳动合同',
  '工资流水',
  '聊天记录',
  '处分记录',
  '送达回执',
  '民主程序记录',
  '协商一致协议',
] as const;

/**
 * 法院否定企业抗辩的典型裁判理由关键词库 (用于纯结构化词频统计，严禁AI推断)
 */
export const COURT_REASONING_KEYWORDS = [
  '证据不足',
  '缺乏事实依据',
  '未经民主程序',
  '未向劳动者公示',
  '未送达',
  '程序违法',
  '不符合法定解除条件',
  '未作明确约定',
  '未经协商一致',
  '未提供有效证据',
  '依据不足',
  '不予采纳',
] as const;

/**
 * 预设典型证据组合模板 (2项~3项协同)
 */
export const PRESET_EVIDENCE_COMBINATIONS: string[][] = [
  ['规章制度', '员工签收'],
  ['规章制度', '员工签收', '考勤记录'],
  ['考勤记录', '员工签收'],
  ['劳动合同', '工资流水'],
  ['规章制度', '考勤记录'],
  ['规章制度', '处分记录'],
  ['劳动合同', '规章制度', '员工签收'],
  ['规章制度', '送达回执'],
  ['聊天记录', '员工签收'],
];

/**
 * 广深莞劳动争议企业抗辩策略关联分析引擎 (DefenseStrategyAnalyzer)
 * 职责：
 * 1. 严格基于 isIncludedInAnalysisSet === true 的有效分析集
 * 2. 统计各抗辩胜诉率与胜败分布
 * 3. 统计企业未完全获支持案件的缺失证据、法院否定关键词与争议分布
 * 4. 统计支持企业结果案件中各证据及证据组合的出现频率 (严禁“导致胜诉”因果推断)
 * 5. 生成争议类型 × 抗辩事由二维交叉分析矩阵
 * 6. 全指标支持 caseId 溯源穿透
 */
export class DefenseStrategyAnalyzer {
  /**
   * 执行策略关联分析并生成报告
   */
  public static analyze(
    allRecords: AnalysisCaseRecord[],
    admissionOptions: AnalyticsAdmissionFilterOptions = {},
  ): DefenseAnalysisReport {
    // 1. 唯一统计准入：旧字段不能绕过语义、审计与人工复核门禁。
    const includedRecords = filterAnalyticsEligibleRecords(allRecords, admissionOptions).eligibleRecords;

    const analyzedCaseCount = includedRecords.length;
    const employerSupportedCases = includedRecords.filter((r) => r.employerOutcome === 'supported');
    const employerNonSupportedCases = includedRecords.filter(
      (r) => r.employerOutcome === 'partially_supported' || r.employerOutcome === 'not_supported'
    );

    // 2. 企业抗辩增强排行
    const defenseRanking = this.analyzeDefenseRanking(includedRecords);

    // 3. 失败案件归因统计 (针对企业未完全支持案件)
    const failedDefenses = this.analyzeFailedDefenses(includedRecords);

    // 4. 证据单项及组合在企业获支持案件中的出现频率分析
    const { singleRanking, combinations } = this.analyzeEvidenceAssociations(
      includedRecords,
      employerSupportedCases
    );

    // 5. 争议类型 × 抗辩二维矩阵
    const matrix = this.generateDisputeDefenseMatrix(includedRecords);

    return {
      generatedAt: new Date().toISOString(),
      analyzedCaseCount,
      employerSupportedCaseCount: employerSupportedCases.length,
      employerNonSupportedCaseCount: employerNonSupportedCases.length,
      defenseRanking,
      failedDefenses,
      evidenceSingleRanking: singleRanking,
      evidenceCombinations: combinations,
      matrix,
    };
  }

  /**
   * 抗辩排行及支持率分布统计
   */
  private static analyzeDefenseRanking(records: AnalysisCaseRecord[]): DefenseStrategyEnhancedItem[] {
    const defenseSet = new Set<string>();
    STANDARD_DEFENSE_TYPES.forEach((d) => defenseSet.add(d));

    // 收集所有出现的抗辩类型
    records.forEach((r) => {
      if (Array.isArray(r.employerDefenses)) {
        r.employerDefenses.forEach((d) => {
          if (d.defenseType && d.defenseType.trim()) {
            defenseSet.add(d.defenseType.trim());
          }
        });
      }
    });

    const items: DefenseStrategyEnhancedItem[] = [];

    defenseSet.forEach((defenseKey) => {
      const caseIds: string[] = [];
      const supportedCaseIds: string[] = [];
      const partiallySupportedCaseIds: string[] = [];
      const notSupportedCaseIds: string[] = [];
      const unclearCaseIds: string[] = [];

      records.forEach((r) => {
        if (!r.employerDefenses || !Array.isArray(r.employerDefenses)) return;
        const matches = r.employerDefenses.some((d) => {
          return d.defenseType.includes(defenseKey) || defenseKey.includes(d.defenseType);
        });

        if (matches) {
          caseIds.push(r.caseId);
          const outcome = this.deduceDefenseOutcome(r, defenseKey);
          if (outcome === 'supported') {
            supportedCaseIds.push(r.caseId);
          } else if (outcome === 'partially_supported') {
            partiallySupportedCaseIds.push(r.caseId);
          } else if (outcome === 'not_supported') {
            notSupportedCaseIds.push(r.caseId);
          } else {
            unclearCaseIds.push(r.caseId);
          }
        }
      });

      if (caseIds.length === 0) return;

      const validTotal = supportedCaseIds.length + partiallySupportedCaseIds.length + notSupportedCaseIds.length;
      const employerSupportRate = validTotal > 0
        ? Number(((supportedCaseIds.length / validTotal) * 100).toFixed(1))
        : 0;

      items.push({
        defenseName: defenseKey,
        caseCount: caseIds.length,
        caseIds,
        supportedCount: supportedCaseIds.length,
        supportedCaseIds,
        partiallySupportedCount: partiallySupportedCaseIds.length,
        partiallySupportedCaseIds,
        notSupportedCount: notSupportedCaseIds.length,
        notSupportedCaseIds,
        unclearCount: unclearCaseIds.length,
        unclearCaseIds,
        employerSupportRate,
      });
    });

    // 排序：标准抗辩优先，其次按案件量降序
    return items.sort((a, b) => {
      const aIsStd = (STANDARD_DEFENSE_TYPES as readonly string[]).includes(a.defenseName);
      const bIsStd = (STANDARD_DEFENSE_TYPES as readonly string[]).includes(b.defenseName);
      if (aIsStd && !bIsStd) return -1;
      if (!aIsStd && bIsStd) return 1;
      return b.caseCount - a.caseCount;
    });
  }

  /**
   * 失败案件分析 (employerOutcome !== 'supported')
   */
  private static analyzeFailedDefenses(records: AnalysisCaseRecord[]): FailedDefenseAnalysisItem[] {
    const targetDefenses: string[] = Array.from(
      new Set([...STANDARD_DEFENSE_TYPES, ...records.flatMap((r) => r.employerDefenses.map((d) => d.defenseType))])
    ).filter(Boolean);

    const results: FailedDefenseAnalysisItem[] = [];

    targetDefenses.forEach((defenseName) => {
      // 筛选提出该抗辩且企业未获得完全支持的案件 (包含部分支持和全部驳回)
      const failedRecords = records.filter((r) => {
        const hasDefense = r.employerDefenses?.some((d) =>
          d.defenseType.includes(defenseName) || defenseName.includes(d.defenseType)
        );
        return hasDefense && (
          r.employerOutcome === 'partially_supported' || r.employerOutcome === 'not_supported'
        );
      });

      if (failedRecords.length === 0) return;

      const failedCaseIds = failedRecords.map((r) => r.caseId);

      // 1. 统计缺失的高频关键证据 (在失败案件中未出现的标准证据)
      const missingEvidenceStats: MissingEvidenceStat[] = [];

      STANDARD_CHECKLIST_EVIDENCE.forEach((evName) => {
        const missingCases: string[] = [];
        failedRecords.forEach((r) => {
          const hasEvidence = r.evidence?.some((e) =>
            isEmployerProvidedEvidence(e) && (e.name.includes(evName) || evName.includes(e.name))
          );
          if (!hasEvidence) {
            missingCases.push(r.caseId);
          }
        });

        if (missingCases.length > 0) {
          const missingRate = Number(((missingCases.length / failedRecords.length) * 100).toFixed(1));
          missingEvidenceStats.push({
            evidenceName: evName,
            missingCount: missingCases.length,
            missingRate,
            caseIds: missingCases,
          });
        }
      });

      // 缺失率降序排列
      missingEvidenceStats.sort((a, b) => b.missingCount - a.missingCount);

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

      // 3. 统计关联高频争议类型
      const disputeTypeMap = new Map<string, string[]>();
      failedRecords.forEach((r) => {
        if (Array.isArray(r.disputeType)) {
          r.disputeType.forEach((dt) => {
            const key = dt.trim();
            if (!key) return;
            if (!disputeTypeMap.has(key)) disputeTypeMap.set(key, []);
            disputeTypeMap.get(key)!.push(r.caseId);
          });
        }
      });

      const commonDisputeTypes = Array.from(disputeTypeMap.entries())
        .map(([disputeType, caseIds]) => ({
          disputeType,
          count: caseIds.length,
          caseIds,
        }))
        .sort((a, b) => b.count - a.count);

      results.push({
        defense: defenseName,
        failedCaseCount: failedRecords.length,
        failedCaseIds,
        commonEvidenceMissing: missingEvidenceStats.slice(0, 5), // 取前5高频缺失
        commonCourtReasoning: courtReasoningStats.slice(0, 6), // 取前6高频裁判关键词
        commonDisputeTypes: commonDisputeTypes.slice(0, 4),
      });
    });

    // 按失败案件量降序排列
    return results.sort((a, b) => b.failedCaseCount - a.failedCaseCount);
  }

  
  
  /**
   * 推断特定抗辩是否获得支持。
   * 如果该抗辩主要涉及的诉求（如解除劳动关系）败诉，则认为该抗辩未获支持。
   */
    private static deduceDefenseOutcome(record: AnalysisCaseRecord, defenseType: string): LegalOutcomeType {
    if (!record.claims || record.claims.length === 0) return 'unclear';

    let relatedClaimNames: string[] = [];
    if (defenseType.includes('违纪') || defenseType.includes('胜任') || defenseType.includes('试用期') || defenseType.includes('旷工') || defenseType.includes('协商解除') || defenseType.includes('终止')) {
      relatedClaimNames = ['违法解除', '赔偿金', '经济补偿', '代通知金', '解除劳动合同'];
    } else if (defenseType.includes('考勤') || defenseType.includes('加班')) {
      relatedClaimNames = ['加班'];
    } else if (defenseType.includes('工资') || defenseType.includes('绩效')) {
      relatedClaimNames = ['工资', '报酬', '奖金', '提成'];
    }

    let claimsToCheck = record.claims;
    if (relatedClaimNames.length > 0) {
       const matched = record.claims.filter(c => relatedClaimNames.some(kw => c.claimName.includes(kw)));
       if (matched.length > 0) {
           claimsToCheck = matched;
       }
    }

    const employeeClaims = claimsToCheck.filter(c => c.claimant === 'employee' || c.claimant === 'other');
    if (employeeClaims.length === 0) {
       return 'unclear';
    }

    let employerWon = false;
    let employerLost = false;
    let employerPartial = false;

    for (const c of employeeClaims) {
        if (c.supportStatus === 'supported') {
            employerLost = true;
        } else if (c.supportStatus === 'not_supported') {
            employerWon = true;
        } else if (c.supportStatus === 'partially_supported') {
            employerPartial = true;
        }
    }

    if (employerPartial || (employerWon && employerLost)) return 'partially_supported';
    if (employerWon) return 'supported';
    if (employerLost) return 'not_supported';

    return 'unclear';
  }

  /**
   * 证据及证据组合关联分析
   */
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
        const evNames = Array.from(new Set(
          (r.evidence || [])
            .filter(isEmployerProvidedEvidence)
            .map(e => normalizeEvidence(e.name))
            .filter(Boolean)
        ));
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
          employerSupportedDenominator: supportedCount,
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

  /**
   * 生成争议类型与抗辩策略的相关性矩阵
   */
  
  private static readonly TOP_STRATEGIES = [
    '旷工', '擅自离岗', '严重违纪', '不能胜任工作', '试用期不符合录用条件', 
    '协商一致解除', '劳动合同期满终止', '已足额支付报酬', '不存在加班事实', 
    '劳动者单方辞职', '未提供劳动'
  ];

  private static generateDisputeDefenseMatrix(records: AnalysisCaseRecord[]): DisputeDefenseMatrixReport {
    const disputeTypes = [
      '违法解除赔偿金', '经济补偿金', '加班工资', '未签劳动合同二倍工资',
      '试用期争议', '调岗降薪', '工伤与工伤待遇', '社会保险争议',
    ];
    const defenseTypes = this.TOP_STRATEGIES;

    const cells: Record<string, Record<string, DisputeDefenseMatrixCell>> = {};

    disputeTypes.forEach((dt) => {
      cells[dt] = {};
      defenseTypes.forEach((def) => {
        const matchedCases: string[] = [];
        const supportedCases: string[] = [];
        const partialCases: string[] = [];
        const notSupportedCases: string[] = [];
        const unclearCases: string[] = [];

        records.forEach((r) => {
          const hasDispute = r.disputeType?.some((t) => t.includes(dt) || dt.includes(t));
          const hasDefense = r.employerDefenses?.some((d) => d.defenseType.includes(def) || def.includes(d.defenseType));

          if (hasDispute && hasDefense) {
            matchedCases.push(r.caseId);
            
            const outcome = this.deduceDefenseOutcome(r, def);
            if (outcome === 'supported') {
              supportedCases.push(r.caseId);
            } else if (outcome === 'partially_supported') {
              partialCases.push(r.caseId);
            } else if (outcome === 'not_supported') {
              notSupportedCases.push(r.caseId);
            } else {
              unclearCases.push(r.caseId);
            }
          }
        });

        const validTotal = supportedCases.length + partialCases.length + notSupportedCases.length;
        const employerSupportRate = validTotal > 0
          ? Number(((supportedCases.length / validTotal) * 100).toFixed(1))
          : 0;

        cells[dt][def] = {
          disputeType: dt,
          defenseType: def,
          caseCount: matchedCases.length,
          caseIds: matchedCases,
          employerSupportedCount: supportedCases.length,
          employerSupportedCaseIds: supportedCases,
          employerPartiallySupportedCount: partialCases.length,
          employerNotSupportedCount: notSupportedCases.length,
          employerUnclearCount: unclearCases.length,
          knownOutcomeDenominator: validTotal,
          employerSupportRate,
        };
      });
    });

    return {
      disputeTypes,
      defenseTypes,
      cells,
    };
  }

}
