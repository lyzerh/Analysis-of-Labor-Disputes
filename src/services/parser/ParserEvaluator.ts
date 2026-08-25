import {
  LaborInfoParsedResult,
  ParserEvaluationReport,
  FieldCompletenessCategory,
  ConsistencyCheckResult,
  ConsistencyIssue,
} from '../../types';

/**
 * 工劳网案例结构化解析质量评估器
 * 职责：对 LaborInfoParserAdapter 的解析结果进行质量评分、规则一致性检查与诊断分析
 */
export class ParserEvaluator {
  /**
   * 主评估入口
   */
  public static evaluate(
    parsedResult: LaborInfoParsedResult,
    rawTextOverride?: string
  ): ParserEvaluationReport {
    const rawDocId = parsedResult.arbitrationCase?.rawDocumentId || 'unknown_doc';
    const text = rawTextOverride || parsedResult.courtReasoning || '';

    // 1. 字段完整度多维度评分
    const completenessCategories = this.evaluateCompletenessCategories(parsedResult);
    const completenessScore = this.calculateTotalCompletenessScore(completenessCategories);

    // 2. 规则一致性检查
    const consistency = this.checkConsistency(parsedResult, text);

    // 3. 评定等级
    let grade: 'excellent' | 'good' | 'fair' | 'poor' = 'poor';
    if (completenessScore >= 85 && consistency.conflictCount === 0) {
      grade = 'excellent';
    } else if (completenessScore >= 70 && consistency.conflictCount === 0) {
      grade = 'good';
    } else if (completenessScore >= 50) {
      grade = 'fair';
    } else {
      grade = 'poor';
    }

    return {
      rawDocId,
      caseTitle: parsedResult.caseTitle,
      completenessScore,
      grade,
      categories: completenessCategories,
      consistency,
      evaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * 1. 字段完整度分类评估
   */
  public static evaluateCompletenessCategories(parsed: LaborInfoParsedResult): {
    baseInfo: FieldCompletenessCategory;
    parties: FieldCompletenessCategory;
    disputes: FieldCompletenessCategory;
    claims: FieldCompletenessCategory;
    defenses: FieldCompletenessCategory;
    evidence: FieldCompletenessCategory;
    reasoning: FieldCompletenessCategory;
  } {
    // 基础信息 (权重 25 分)
    const baseFields = [
      {
        fieldName: 'caseTitle',
        label: '案例文书标题',
        isFilled: !!parsed.caseTitle && parsed.caseTitle !== '未命名判决书',
        valueSummary: parsed.caseTitle || undefined,
        weight: 5,
      },
      {
        fieldName: 'court',
        label: '审理法院/仲裁委',
        isFilled: !!parsed.court && parsed.court.length > 2,
        valueSummary: parsed.court || undefined,
        weight: 5,
      },
      {
        fieldName: 'date',
        label: '裁判/裁决日期',
        isFilled: !!parsed.date && parsed.date.length >= 4,
        valueSummary: parsed.date || undefined,
        weight: 5,
      },
      {
        fieldName: 'caseLevel',
        label: '审判层级/审级',
        isFilled: !!parsed.caseLevel,
        valueSummary: parsed.caseLevel || undefined,
        weight: 5,
      },
      {
        fieldName: 'caseNumber',
        label: '标准案号',
        isFilled: !!parsed.caseNumber && parsed.caseNumber !== '未载明案号',
        valueSummary: parsed.caseNumber || undefined,
        weight: 5,
      },
    ];
    const baseFilledCount = baseFields.filter((f) => f.isFilled).length;
    const baseInfo: FieldCompletenessCategory = {
      categoryKey: 'baseInfo',
      categoryName: '基础信息',
      score: Math.round((baseFilledCount / baseFields.length) * 100),
      weight: 25,
      filledCount: baseFilledCount,
      totalCount: baseFields.length,
      fields: baseFields,
    };

    // 当事人识别 (权重 20 分)
    const partyFields = [
      {
        fieldName: 'employeeParty',
        label: '劳动者方姓名',
        isFilled: !!parsed.employeeParty && parsed.employeeParty.length >= 2,
        valueSummary: parsed.employeeParty || undefined,
        weight: 10,
      },
      {
        fieldName: 'employerParty',
        label: '用人单位方名称',
        isFilled: !!parsed.employerParty && parsed.employerParty.length >= 2,
        valueSummary: parsed.employerParty || undefined,
        weight: 10,
      },
    ];
    const partyFilledCount = partyFields.filter((f) => f.isFilled).length;
    const parties: FieldCompletenessCategory = {
      categoryKey: 'parties',
      categoryName: '当事人主体',
      score: Math.round((partyFilledCount / partyFields.length) * 100),
      weight: 20,
      filledCount: partyFilledCount,
      totalCount: partyFields.length,
      fields: partyFields,
    };

    // 争议类型 (权重 10 分)
    const hasDisputes = parsed.disputeType && parsed.disputeType.length > 0;
    const disputeFields = [
      {
        fieldName: 'disputeType',
        label: '争议类型标签',
        isFilled: hasDisputes,
        valueSummary: hasDisputes ? parsed.disputeType.join('、') : undefined,
        weight: 10,
      },
    ];
    const disputes: FieldCompletenessCategory = {
      categoryKey: 'disputes',
      categoryName: '争议类型',
      score: hasDisputes ? 100 : 0,
      weight: 10,
      filledCount: hasDisputes ? 1 : 0,
      totalCount: 1,
      fields: disputeFields,
    };

    // 诉求列表 (权重 15 分)
    const hasValidClaims = parsed.claims && parsed.claims.length > 0;
    const claimsFields = [
      {
        fieldName: 'claims',
        label: '诉求清单及判定',
        isFilled: hasValidClaims,
        valueSummary: hasValidClaims ? `共 ${parsed.claims.length} 项诉求` : undefined,
        weight: 15,
      },
    ];
    const claims: FieldCompletenessCategory = {
      categoryKey: 'claims',
      categoryName: '诉求清单',
      score: hasValidClaims ? 100 : 0,
      weight: 15,
      filledCount: hasValidClaims ? 1 : 0,
      totalCount: 1,
      fields: claimsFields,
    };

    // 企业抗辩 (权重 10 分)
    const hasDefenses = parsed.employerDefenses && parsed.employerDefenses.length > 0;
    const defenseFields = [
      {
        fieldName: 'employerDefenses',
        label: '企业抗辩事由',
        isFilled: hasDefenses,
        valueSummary: hasDefenses ? parsed.employerDefenses.map((d) => d.defenseType).join('；') : undefined,
        weight: 10,
      },
    ];
    const defenses: FieldCompletenessCategory = {
      categoryKey: 'defenses',
      categoryName: '企业抗辩',
      score: hasDefenses ? 100 : 0,
      weight: 10,
      filledCount: hasDefenses ? 1 : 0,
      totalCount: 1,
      fields: defenseFields,
    };

    // 关键证据 (权重 10 分)
    const hasEvidence = parsed.evidence && parsed.evidence.length > 0;
    const evidenceFields = [
      {
        fieldName: 'evidence',
        label: '关键证据清单',
        isFilled: hasEvidence,
        valueSummary: hasEvidence ? parsed.evidence.map((e) => e.name).join('；') : undefined,
        weight: 10,
      },
    ];
    const evidence: FieldCompletenessCategory = {
      categoryKey: 'evidence',
      categoryName: '证据材料',
      score: hasEvidence ? 100 : 0,
      weight: 10,
      filledCount: hasEvidence ? 1 : 0,
      totalCount: 1,
      fields: evidenceFields,
    };

    // 裁判说理与要点 (权重 10 分)
    const hasReasoning = !!parsed.courtReasoning && parsed.courtReasoning.length >= 20;
    const reasoningFields = [
      {
        fieldName: 'courtReasoning',
        label: '裁判说理内容',
        isFilled: hasReasoning,
        valueSummary: hasReasoning ? `${parsed.courtReasoning.length} 字说理` : undefined,
        weight: 10,
      },
    ];
    const reasoning: FieldCompletenessCategory = {
      categoryKey: 'reasoning',
      categoryName: '裁判说理',
      score: hasReasoning ? 100 : 0,
      weight: 10,
      filledCount: hasReasoning ? 1 : 0,
      totalCount: 1,
      fields: reasoningFields,
    };

    return {
      baseInfo,
      parties,
      disputes,
      claims,
      defenses,
      evidence,
      reasoning,
    };
  }

  /**
   * 加权计算总完整度得分 (0 - 100)
   */
  private static calculateTotalCompletenessScore(categories: {
    baseInfo: FieldCompletenessCategory;
    parties: FieldCompletenessCategory;
    disputes: FieldCompletenessCategory;
    claims: FieldCompletenessCategory;
    defenses: FieldCompletenessCategory;
    evidence: FieldCompletenessCategory;
    reasoning: FieldCompletenessCategory;
  }): number {
    let totalWeightedScore = 0;
    const catList = Object.values(categories);
    for (const cat of catList) {
      totalWeightedScore += (cat.score * cat.weight) / 100;
    }
    return Math.min(100, Math.max(0, Math.round(totalWeightedScore)));
  }

  /**
   * 2. 规则一致性检查 (Consistency Check)
   * 检测 conflict (矛盾)、missing (缺失)、possible_false_positive (疑似误报)
   */
  public static checkConsistency(
    parsed: LaborInfoParsedResult,
    fullTextOrReasoning: string
  ): ConsistencyCheckResult {
    const issues: ConsistencyIssue[] = [];

    const claims = parsed.claims || [];
    const overallResult = parsed.overallResult;
    const totalClaims = claims.length;

    const supportedCount = claims.filter((c) => c.supportStatus === 'supported').length;
    const partialCount = claims.filter((c) => c.supportStatus === 'partially_supported').length;
    const notSupportedCount = claims.filter((c) => c.supportStatus === 'not_supported').length;
    const unclearCount = claims.filter((c) => c.supportStatus === 'unclear' || !c.supportStatus).length;

    // ----------------------------------------------------
    // 规则 1: 冲突检查 (conflict)
    // ----------------------------------------------------
    // 1.1 如果 overallResult 为 supported，但 claims 全部为 not_supported
    if (overallResult === 'supported' && totalClaims > 0 && notSupportedCount === totalClaims) {
      issues.push({
        id: `conflict_supported_all_rejected_${Date.now()}`,
        type: 'conflict',
        level: 'error',
        title: '裁判结果与诉求状态冲突',
        message: '综合裁判结果标记为支持 (supported)，但诉求列表中所有项均被判定为驳回 (not_supported)。',
        field: 'overallResult',
        suggestion: '请核实裁判主文是否全案驳回，或将 overallResult 修正为 not_supported。',
      });
    }

    // 1.2 如果 overallResult 为 not_supported，但 claims 全部为 supported
    if (overallResult === 'not_supported' && totalClaims > 0 && supportedCount === totalClaims) {
      issues.push({
        id: `conflict_rejected_all_supported_${Date.now()}`,
        type: 'conflict',
        level: 'error',
        title: '裁判结果与诉求状态冲突',
        message: '综合裁判结果标记为驳回 (not_supported)，但诉求列表中所有项均被判定为支持 (supported)。',
        field: 'overallResult',
        suggestion: '请核实裁判主文是否全案支持，或将 overallResult 修正为 supported。',
      });
    }

    // 1.3 如果 overallResult 为 supported，但 claims 存在部分驳回项且无全额支持
    if (overallResult === 'supported' && notSupportedCount > 0 && supportedCount > 0) {
      issues.push({
        id: `conflict_supported_has_partial_${Date.now()}`,
        type: 'conflict',
        level: 'warning',
        title: '裁判结果建议为部分支持',
        message: `综合结果判定为全部支持，但诉求中存在 ${notSupportedCount} 项驳回与 ${supportedCount} 项支持。`,
        field: 'overallResult',
        suggestion: '建议将 overallResult 调整为 partially_supported (部分支持)。',
      });
    }

    // ----------------------------------------------------
    // 规则 2: 缺失检查 (missing)
    // ----------------------------------------------------
    // 2.1 诉求存在，但 supportStatus 为空或 unclear
    claims.forEach((claim, idx) => {
      if (!claim.supportStatus || claim.supportStatus === 'unclear') {
        issues.push({
          id: `missing_claim_status_${idx}`,
          type: 'missing',
          level: 'warning',
          title: `诉求支持状态未决 (第 ${idx + 1} 项)`,
          message: `诉求【${claim.claimName}】未明确裁决支持状态 (supportStatus: ${claim.supportStatus || '空'})。`,
          field: `claims[${idx}].supportStatus`,
          suggestion: '请依据裁判主文项为该诉求标记 supported、partially_supported 或 not_supported。',
        });
      }
    });

    // 2.2 当事人缺失检查
    if (!parsed.employeeParty) {
      issues.push({
        id: 'missing_employee_party',
        type: 'missing',
        level: 'warning',
        title: '劳动者当事人缺失',
        message: '未能从文书中精准识别到劳动者方主体姓名。',
        field: 'employeeParty',
        suggestion: '请在人工校验台中手动录入劳动者姓名。',
      });
    }
    if (!parsed.employerParty) {
      issues.push({
        id: 'missing_employer_party',
        type: 'missing',
        level: 'warning',
        title: '用人单位当事人缺失',
        message: '未能从文书中精准识别到用人单位方主体名称。',
        field: 'employerParty',
        suggestion: '请在人工校验台中手动录入用人单位公司全称。',
      });
    }

    // 2.3 诉求列表为空
    if (totalClaims === 0) {
      issues.push({
        id: 'missing_all_claims',
        type: 'missing',
        level: 'warning',
        title: '诉求列表为空',
        message: '文书中未成功抽取到任何具体劳动争议诉求条目。',
        field: 'claims',
        suggestion: '请在人工校验台中添加本案涉及的诉求项目。',
      });
    }

    // ----------------------------------------------------
    // 规则 3: 疑似误报检查 (possible_false_positive)
    // ----------------------------------------------------
    // 如果 employerDefenses 存在，但在裁判理由或文书中没有相关关键词
    const defenseKeywordMap: Record<string, string[]> = {
      '旷工 / 擅自离岗': ['旷工', '擅自离职', '脱岗', '未请假', '出勤', '考勤'],
      '严重违纪 / 违反规章制度': ['规章制度', '违纪', '员工手册', '第三十九条', '第39条', '严重失职'],
      '不能胜任工作 / 考核不达标': ['不胜任', '考核', '绩效', '培训', '第四十条', '第40条'],
      '协商一致解除': ['协商', '协议解除', '自愿离职', '辞职', '离职协议'],
      '试用期不符合录用条件': ['试用期', '录用条件', '考核不合格'],
      '劳动合同期满终止': ['合同期满', '到期', '终止劳动合同', '续签'],
      '已足额支付劳动报酬/已结清': ['足额支付', '已结清', '无拖欠', '发放完毕'],
      '客观情况发生重大变化': ['重大变化', '部门撤销', '架构调整', '业务关停'],
    };

    const combinedSearchText = (
      (parsed.courtReasoning || '') +
      ' ' +
      (fullTextOrReasoning || '')
    ).toLowerCase();

    (parsed.employerDefenses || []).forEach((defense, idx) => {
      const keywords = defenseKeywordMap[defense.defenseType] || [defense.defenseType];
      const hasMatchedKeyword = keywords.some((kw) => combinedSearchText.includes(kw.toLowerCase()));

      if (!hasMatchedKeyword) {
        issues.push({
          id: `false_positive_defense_${idx}`,
          type: 'possible_false_positive',
          level: 'warning',
          title: `企业抗辩疑似误报 (${defense.defenseType})`,
          message: `识别到企业抗辩【${defense.defenseType}】，但在裁判说理段落中未检测到相关关键词（如：${keywords.slice(0, 3).join('、')}）。`,
          field: `employerDefenses[${idx}]`,
          suggestion: '请核实该抗辩是否确系本案用人单位主张，若非本案内容可删除该条目。',
        });
      }
    });

    // 统计各类型问题计数
    const conflictCount = issues.filter((i) => i.type === 'conflict').length;
    const missingCount = issues.filter((i) => i.type === 'missing').length;
    const falsePositiveCount = issues.filter((i) => i.type === 'possible_false_positive').length;

    return {
      hasConflicts: conflictCount > 0,
      issues,
      conflictCount,
      missingCount,
      falsePositiveCount,
      passed: conflictCount === 0 && missingCount === 0 && falsePositiveCount === 0,
    };
  }

  /**
   * 批量评估汇总统计
   */
  public static summarizeBatch(reports: ParserEvaluationReport[]): {
    totalCount: number;
    avgCompletenessScore: number;
    totalConflicts: number;
    totalMissing: number;
    totalFalsePositives: number;
    gradeCounts: {
      excellent: number;
      good: number;
      fair: number;
      poor: number;
    };
  } {
    if (reports.length === 0) {
      return {
        totalCount: 0,
        avgCompletenessScore: 0,
        totalConflicts: 0,
        totalMissing: 0,
        totalFalsePositives: 0,
        gradeCounts: { excellent: 0, good: 0, fair: 0, poor: 0 },
      };
    }

    const totalCompleteness = reports.reduce((acc, r) => acc + r.completenessScore, 0);
    const totalConflicts = reports.reduce((acc, r) => acc + r.consistency.conflictCount, 0);
    const totalMissing = reports.reduce((acc, r) => acc + r.consistency.missingCount, 0);
    const totalFalsePositives = reports.reduce((acc, r) => acc + r.consistency.falsePositiveCount, 0);

    const gradeCounts = {
      excellent: reports.filter((r) => r.grade === 'excellent').length,
      good: reports.filter((r) => r.grade === 'good').length,
      fair: reports.filter((r) => r.grade === 'fair').length,
      poor: reports.filter((r) => r.grade === 'poor').length,
    };

    return {
      totalCount: reports.length,
      avgCompletenessScore: Math.round(totalCompleteness / reports.length),
      totalConflicts,
      totalMissing,
      totalFalsePositives,
      gradeCounts,
    };
  }
}
