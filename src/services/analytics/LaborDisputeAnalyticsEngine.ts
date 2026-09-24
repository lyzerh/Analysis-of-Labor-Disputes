import {
  AnalysisCaseRecord,
  LaborDisputeReport,
  CityAnalyticsSummary,
  DisputeTypeAnalyticsItem,
  EmployerDefenseAnalyticsItem,
  EvidenceAnalyticsItem,
  OutcomeStats,
  LegalOutcomeType,
} from '../../types';
import { isEmployerProvidedEvidence } from '../evidence/EvidenceProvider';
import {
  filterAnalyticsEligibleRecords,
  type AnalyticsAdmissionFilterOptions,
} from './AnalyticsAdmission';
import {
  PEARL_RIVER_DELTA_CITIES,
  normalizeResearchCity,
  normalizeResearchGeographicScope,
  type ResearchGeographicScope,
} from '../research/ResearchGeographicScope';

/**
 * 重点标准争议类型清单
 */
export const KEY_DISPUTE_TYPES = [
  '劳动合同解除',
  '违法解除',
  '经济补偿金',
  '加班工资',
  '未签劳动合同二倍工资',
  '竞业限制',
  '调岗降薪',
] as const;

/**
 * 重点标准企业抗辩清单
 */
export const KEY_EMPLOYER_DEFENSES = [
  '严重违纪',
  '旷工',
  '不能胜任工作',
  '规章制度',
  '协商解除',
] as const;

/**
 * 重点标准证据清单
 */
export const KEY_EVIDENCE_TYPES = [
  '劳动合同',
  '规章制度',
  '员工签收',
  '考勤记录',
  '工资流水',
  '聊天记录',
  '处分记录',
] as const;

/**
 * 研究地域劳动争议基础统计分析引擎 (LaborDisputeAnalyticsEngine)
 * 职责：
 * 1. 严格基于 isIncludedInAnalysisSet === true 的有效分析集
 * 2. 排除待优化池与未准入案件
 * 3. 统计冻结研究地域内的案件分布与结果比例
 * 4. 统计争议类型、企业抗辩、证据关联分布
 * 5. 全指标支持 caseId 溯源
 * 6. 绝不调用任何 AI 或生成自然语言推断，恪守零污染与纯结构化统计
 */
export class LaborDisputeAnalyticsEngine {
  /**
   * 执行统计分析并生成报告
   */
  public static generateReport(
    allRecords: AnalysisCaseRecord[],
    admissionOptions: AnalyticsAdmissionFilterOptions = {},
    geographicScope?: ResearchGeographicScope,
  ): LaborDisputeReport {
    const totalCases = admissionOptions.totalInputCount ?? allRecords.length;

    // 1. 唯一统计准入：旧字段只能作为规则路径的一部分，不能绕过语义门禁。
    const includedRecords = filterAnalyticsEligibleRecords(allRecords, admissionOptions).eligibleRecords;
    const excludedCases = totalCases - includedRecords.length;

    // 2. 基础总体指标
    const totalScore = includedRecords.reduce((sum, r) => sum + (r.parserScore || 0), 0);
    const averageParserScore = includedRecords.length > 0
      ? Number((totalScore / includedRecords.length).toFixed(1))
      : 0;

    const reviewApprovedCount = includedRecords.filter((r) => r.reviewStatus === 'approved').length;
    const modifiedReviewCount = includedRecords.filter((r) => r.reviewStatus === 'modified').length;
    const pendingReviewCount = includedRecords.filter((r) => r.reviewStatus === 'pending').length;

    // 3. 城市维度分析：只使用当前 AnalysisRun 已冻结的地域范围与输入记录。
    const targetCities = this.analyzeTargetCities(includedRecords, geographicScope);

    // 4. 争议类型分析
    const disputeTypes = this.analyzeDisputeTypes(includedRecords);

    // 5. 企业抗辩分析
    const employerDefenses = this.analyzeEmployerDefenses(includedRecords);

    // 6. 证据关联分析
    const evidenceRanking = this.analyzeEvidence(includedRecords);

    return {
      generatedAt: new Date().toISOString(),
      overall: {
        totalCases,
        includedCases: includedRecords.length,
        excludedCases,
        averageParserScore,
        reviewApprovedCount,
        modifiedReviewCount,
        pendingReviewCount,
      },
      targetCities,
      disputeTypes,
      employerDefenses,
      evidenceRanking,
    };
  }

  /**
   * 根据冻结研究范围确定城市集合。旧 AnalysisRun 没有 scope 时按全部已纳入记录展示。
   */
  private static analyzeTargetCities(
    records: AnalysisCaseRecord[],
    geographicScope?: ResearchGeographicScope,
  ): CityAnalyticsSummary[] {
    const scope = normalizeResearchGeographicScope(geographicScope);
    const normalizedRecordCities = new Map<string, AnalysisCaseRecord[]>();
    records.forEach((record) => {
      const city = normalizeResearchCity(record.city);
      if (!city) return;
      const cityRecords = normalizedRecordCities.get(city) ?? [];
      cityRecords.push(record);
      normalizedRecordCities.set(city, cityRecords);
    });

    let cities: string[];
    if (scope?.mode === 'pearl_river_delta') {
      cities = [...PEARL_RIVER_DELTA_CITIES];
    } else if (scope?.mode === 'custom_cities') {
      cities = [...(scope.cities ?? [])];
    } else {
      // province/all（以及 legacy run）只展示当前 AnalysisRun 实际出现的城市。
      cities = [...normalizedRecordCities.keys()].sort((a, b) => a.localeCompare(b, 'zh-CN'));
    }

    return cities.map((city) => {
      const cityRecords = normalizedRecordCities.get(city) ?? [];

      const caseIds = cityRecords.map((r) => r.caseId);
      const employeeOutcome = this.computeOutcomeStats(cityRecords, 'employeeOutcome');
      const employerOutcome = this.computeOutcomeStats(cityRecords, 'employerOutcome');

      // 计算企业胜诉率及部分支持率 (分母排除 unclear)
      const validEmployerTotal = employerOutcome.supported + employerOutcome.partially_supported + employerOutcome.not_supported;
      const employerWinRate = validEmployerTotal > 0
        ? Number(((employerOutcome.supported / validEmployerTotal) * 100).toFixed(1))
        : null;

      const employerPartialRate = validEmployerTotal > 0
        ? Number(((employerOutcome.partially_supported / validEmployerTotal) * 100).toFixed(1))
        : null;

      // 劳动者胜诉率
      const validEmployeeTotal = employeeOutcome.supported + employeeOutcome.partially_supported + employeeOutcome.not_supported;
      const employeeWinRate = validEmployeeTotal > 0
        ? Number(((employeeOutcome.supported / validEmployeeTotal) * 100).toFixed(1))
        : null;

      return {
        city,
        caseCount: cityRecords.length,
        caseIds,
        employeeOutcome,
        employerOutcome,
        employerWinRate,
        employerPartialRate,
        employeeWinRate,
      };
    });
  }

  /**
   * 争议类型分析
   */
  private static analyzeDisputeTypes(records: AnalysisCaseRecord[]): DisputeTypeAnalyticsItem[] {
    const isProceduralDisputeLabel = (value: string) => value.trim() === 'procedural_appeal' || value.trim() === '程序性上诉请求';
    // 收集出现的所有争议类型标签
    const typeSet = new Set<string>();
    KEY_DISPUTE_TYPES.forEach((t) => typeSet.add(t));

    records.forEach((r) => {
      if (Array.isArray(r.disputeType)) {
        r.disputeType.forEach((dt) => {
          if (dt && dt.trim() && !isProceduralDisputeLabel(dt)) {
            typeSet.add(dt.trim());
          }
        });
      }
    });

    const items: DisputeTypeAnalyticsItem[] = [];

    typeSet.forEach((typeKey) => {
      const matchedRecords = records.filter((r) => {
        if (!r.disputeType || !Array.isArray(r.disputeType)) return false;
        return r.disputeType.some((dt) => dt.includes(typeKey) || typeKey.includes(dt));
      });

      if (matchedRecords.length === 0) return;

      const caseIds = matchedRecords.map((r) => r.caseId);
      // 根据当前争议类型，精准统计对应 Claim 的胜败诉率，而不是直接使用案件的整体 outcome
      const employeeOutcome = this.computeClaimOutcomeStats(matchedRecords, typeKey, 'employee');
      const employerOutcome = this.computeClaimOutcomeStats(matchedRecords, typeKey, 'employer');

      const validEmployerTotal = employerOutcome.supported + employerOutcome.partially_supported + employerOutcome.not_supported;
      const employerWinRate = validEmployerTotal > 0
        ? Number(((employerOutcome.supported / validEmployerTotal) * 100).toFixed(1))
        : 0;

      const validEmployeeTotal = employeeOutcome.supported + employeeOutcome.partially_supported + employeeOutcome.not_supported;
      const employeeWinRate = validEmployeeTotal > 0
        ? Number(((employeeOutcome.supported / validEmployeeTotal) * 100).toFixed(1))
        : 0;

      items.push({
        disputeType: typeKey,
        caseCount: matchedRecords.length,
        caseIds,
        employeeOutcome,
        employerOutcome,
        employerWinRate,
        employeeWinRate,
      });
    });

    // 优先按重点争议类型排序，其次按案件量降序
    return items.sort((a, b) => {
      const aIsKey = (KEY_DISPUTE_TYPES as readonly string[]).includes(a.disputeType);
      const bIsKey = (KEY_DISPUTE_TYPES as readonly string[]).includes(b.disputeType);
      if (aIsKey && !bIsKey) return -1;
      if (!aIsKey && bIsKey) return 1;
      return b.caseCount - a.caseCount;
    });
  }

  /**
   * 企业抗辩分析
   */
  private static analyzeEmployerDefenses(records: AnalysisCaseRecord[]): EmployerDefenseAnalyticsItem[] {
    const defenseSet = new Set<string>();
    KEY_EMPLOYER_DEFENSES.forEach((d) => defenseSet.add(d));

    records.forEach((r) => {
      if (Array.isArray(r.employerDefenses)) {
        r.employerDefenses.forEach((d) => {
          if (d.defenseType && d.defenseType.trim()) {
            defenseSet.add(d.defenseType.trim());
          }
        });
      }
    });

    const items: EmployerDefenseAnalyticsItem[] = [];

    defenseSet.forEach((defenseKey) => {
      let frequency = 0;
      const matchedCaseIds: string[] = [];
      const employerSupportedCaseIds: string[] = [];
      const employerPartialCaseIds: string[] = [];
      const employerNotSupportedCaseIds: string[] = [];

      records.forEach((r) => {
        if (!r.employerDefenses || !Array.isArray(r.employerDefenses)) return;
        const matchingDefenses = r.employerDefenses.filter((d) => {
          return d.defenseType.includes(defenseKey) || defenseKey.includes(d.defenseType);
        });

        if (matchingDefenses.length > 0) {
          frequency += matchingDefenses.length;
          matchedCaseIds.push(r.caseId);

          if (r.employerOutcome === 'supported') {
            employerSupportedCaseIds.push(r.caseId);
          } else if (r.employerOutcome === 'partially_supported') {
            employerPartialCaseIds.push(r.caseId);
          } else if (r.employerOutcome === 'not_supported') {
            employerNotSupportedCaseIds.push(r.caseId);
          }
        }
      });

      if (matchedCaseIds.length === 0) return;

      const validTotal = employerSupportedCaseIds.length + employerPartialCaseIds.length + employerNotSupportedCaseIds.length;
      const supportRate = validTotal > 0
        ? Number(((employerSupportedCaseIds.length / validTotal) * 100).toFixed(1))
        : 0;

      items.push({
        defenseType: defenseKey,
        frequency,
        caseCount: matchedCaseIds.length,
        caseIds: matchedCaseIds,
        employerSupportedCount: employerSupportedCaseIds.length,
        employerSupportedCaseIds,
        employerPartialCount: employerPartialCaseIds.length,
        employerPartialCaseIds,
        employerNotSupportedCount: employerNotSupportedCaseIds.length,
        employerNotSupportedCaseIds,
        supportRate,
      });
    });

    // 重点抗辩优先，其次按案发量降序
    return items.sort((a, b) => {
      const aIsKey = (KEY_EMPLOYER_DEFENSES as readonly string[]).includes(a.defenseType);
      const bIsKey = (KEY_EMPLOYER_DEFENSES as readonly string[]).includes(b.defenseType);
      if (aIsKey && !bIsKey) return -1;
      if (!aIsKey && bIsKey) return 1;
      return b.caseCount - a.caseCount;
    });
  }

  /**
   * 证据关联分析 (重点统计在企业获得支持案件中的出现频率)
   */
  private static analyzeEvidence(records: AnalysisCaseRecord[]): EvidenceAnalyticsItem[] {
    const evidenceSet = new Set<string>();
    KEY_EVIDENCE_TYPES.forEach((e) => evidenceSet.add(e));

    records.forEach((r) => {
      if (Array.isArray(r.evidence)) {
        r.evidence.filter(isEmployerProvidedEvidence).forEach((ev) => {
          if (ev.name && ev.name.trim()) {
            evidenceSet.add(ev.name.trim());
          }
        });
      }
    });

    const items: EvidenceAnalyticsItem[] = [];
    const employerSupportedDenominator = records.filter((record) => record.employerOutcome === 'supported').length;

    evidenceSet.forEach((evKey) => {
      let frequency = 0;
      const matchedCaseIds: string[] = [];
      const appearanceInEmployerSupportedCaseIds: string[] = [];

      records.forEach((r) => {
        if (!r.evidence || !Array.isArray(r.evidence)) return;
        const matchingEvs = r.evidence.filter((ev) => {
          if (!isEmployerProvidedEvidence(ev)) return false;
          return ev.name.includes(evKey) || evKey.includes(ev.name);
        });

        if (matchingEvs.length > 0) {
          frequency += matchingEvs.length;
          matchedCaseIds.push(r.caseId);

          if (r.employerOutcome === 'supported') {
            appearanceInEmployerSupportedCaseIds.push(r.caseId);
          }
        }
      });

      if (matchedCaseIds.length === 0) return;

      const rateInEmployerSupported = employerSupportedDenominator > 0
        ? Number(((appearanceInEmployerSupportedCaseIds.length / employerSupportedDenominator) * 100).toFixed(1))
        : 0;

      items.push({
        evidenceName: evKey,
        frequency,
        caseCount: matchedCaseIds.length,
        caseIds: matchedCaseIds,
        appearanceInEmployerSupportedCount: appearanceInEmployerSupportedCaseIds.length,
        appearanceInEmployerSupportedCaseIds,
        employerSupportedDenominator,
        rateInEmployerSupported,
      });
    });

    // 重点证据优先，其次按案件量降序
    return items.sort((a, b) => {
      const aIsKey = (KEY_EVIDENCE_TYPES as readonly string[]).includes(a.evidenceName);
      const bIsKey = (KEY_EVIDENCE_TYPES as readonly string[]).includes(b.evidenceName);
      if (aIsKey && !bIsKey) return -1;
      if (!aIsKey && bIsKey) return 1;
      return b.caseCount - a.caseCount;
    });
  }

  /**
   * 辅助方法：聚合 OutcomeStats 并记录四分类下对应的 caseId 列表
   */
  
  /**
   * 针对特定争议类型，从 Claims 中精准提取该类型的支持情况
   */
  private static computeClaimOutcomeStats(
    records: AnalysisCaseRecord[],
    disputeType: string,
    role: 'employee' | 'employer'
  ): OutcomeStats {
    const stats: OutcomeStats = {
      supported: 0,
      partially_supported: 0,
      not_supported: 0,
      unclear: 0,
      caseIds: {
        supported: [],
        partially_supported: [],
        not_supported: [],
        unclear: [],
      },
    };

    records.forEach((r) => {
      // 只统计由目标角色提出的相关请求；不得把另一方请求结果反转成目标角色结果。
      const claims = r.claims || [];
      const hasSubstantiveClaims = claims.some((claim) => claim.claimType !== 'procedural_appeal');
      const relevantClaims = claims.filter(c => {
        if (c.claimType === 'procedural_appeal') return false;
        if (c.claimant !== role) return false;
        const cName = c.claimName || '';
        // 映射逻辑
        if (disputeType === '违法解除赔偿金' && cName.includes('违法解除')) return true;
        if (disputeType === '劳动合同解除' && (cName.includes('解除') || cName.includes('赔偿金'))) return true;
        if (disputeType === '经济补偿金' && cName.includes('经济补偿金') && !cName.includes('社会保险')) return true;
        if (disputeType === '代通知金' && cName.includes('代通知金')) return true;
        if (disputeType === '社会保险争议' && cName.includes('社会保险')) return true;
        if (disputeType === '加班工资' && cName.includes('加班')) return true;
        if (disputeType === '未签劳动合同二倍工资' && cName.includes('二倍工资')) return true;
        if (disputeType === '工伤与工伤待遇' && cName.includes('工伤')) return true;
        if (disputeType === '竞业限制' && cName.includes('竞业')) return true;
        if (disputeType === '工资报酬与绩效奖金' && (cName.includes('工资') && !cName.includes('加班') && !cName.includes('二倍') || cName.includes('奖金'))) return true;
        
        // fallback
        return cName.includes(disputeType) || disputeType.includes(cName);
      });

      let outcome: LegalOutcomeType = 'unclear';
      if (relevantClaims && relevantClaims.length > 0) {
        // 如果有部分支持，或者有的支持有的不支持，则是 partially_supported
        const hasSupport = relevantClaims.some(c => c.supportStatus === 'supported');
        const hasReject = relevantClaims.some(c => c.supportStatus === 'not_supported');
        const hasPartial = relevantClaims.some(c => c.supportStatus === 'partially_supported');
        
        if (hasPartial || (hasSupport && hasReject)) {
           outcome = 'partially_supported';
        } else if (hasSupport) {
           outcome = 'supported';
        } else if (hasReject) {
           outcome = 'not_supported';
        }
      } else if (hasSubstantiveClaims || claims.length === 0) {
        // 退回整体 outcome
        outcome = role === 'employee' ? r.employeeOutcome : r.employerOutcome;
      }

      if (outcome === 'supported') {
        stats.supported++;
        stats.caseIds.supported.push(r.caseId);
      } else if (outcome === 'partially_supported') {
        stats.partially_supported++;
        stats.caseIds.partially_supported.push(r.caseId);
      } else if (outcome === 'not_supported') {
        stats.not_supported++;
        stats.caseIds.not_supported.push(r.caseId);
      } else {
        stats.unclear++;
        stats.caseIds.unclear.push(r.caseId);
      }
    });

    return stats;
  }

  private static computeOutcomeStats(
    records: AnalysisCaseRecord[],
    field: 'employeeOutcome' | 'employerOutcome'
  ): OutcomeStats {
    const stats: OutcomeStats = {
      supported: 0,
      partially_supported: 0,
      not_supported: 0,
      unclear: 0,
      caseIds: {
        supported: [],
        partially_supported: [],
        not_supported: [],
        unclear: [],
      },
    };

    records.forEach((r) => {
      const outcome: LegalOutcomeType = r[field] || 'unclear';
      if (outcome === 'supported') {
        stats.supported++;
        stats.caseIds.supported.push(r.caseId);
      } else if (outcome === 'partially_supported') {
        stats.partially_supported++;
        stats.caseIds.partially_supported.push(r.caseId);
      } else if (outcome === 'not_supported') {
        stats.not_supported++;
        stats.caseIds.not_supported.push(r.caseId);
      } else {
        stats.unclear++;
        stats.caseIds.unclear.push(r.caseId);
      }
    });

    return stats;
  }
}
