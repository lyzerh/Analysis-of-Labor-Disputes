import {
  RawDocument,
  ArbitrationCase,
  LaborInfoParsedResult,
  ParserReviewRecord,
  AnalysisCaseRecord,
  DatasetBuildSummary,
  LegalOutcomeType,
  ReviewStatus,
} from '../../types';
import { CityResolver } from '../parser/CityResolver';
import { LaborInfoParserAdapter } from '../parser/LaborInfoParserAdapter';
import { ParserEvaluator } from '../parser/ParserEvaluator';
import { ReviewStorageService } from '../data/ReviewStorageService';
import { resolvePartyOutcomes } from '../outcome/OutcomeResolver';

/**
 * 珠三角 9 大核心城市列表
 */
export const PRD_CITIES: { name: string; aliases: string[]; districtKeywords: string[]; courtPrefixes: string[] }[] = [
  {
    name: '深圳',
    aliases: ['深圳市', '深圳'],
    districtKeywords: ['福田', '罗湖', '南山', '盐田', '宝安', '龙岗', '龙华', '坪山', '光明', '大鹏', '前海'],
    courtPrefixes: ['深', '粤03', '深劳人仲'],
  },
  {
    name: '广州',
    aliases: ['广州市', '广州'],
    districtKeywords: ['越秀', '海珠', '荔湾', '天河', '白云', '黄埔', '花都', '番禺', '南沙', '从化', '增城'],
    courtPrefixes: ['穗', '粤01', '穗劳人仲'],
  },
  {
    name: '东莞',
    aliases: ['东莞市', '东莞'],
    districtKeywords: ['南城', '东城', '莞城', '万江', '虎门', '长安', '塘厦', '常平', '厚街', '寮步'],
    courtPrefixes: ['莞', '粤19', '莞劳人仲'],
  },
  {
    name: '佛山',
    aliases: ['佛山市', '佛山'],
    districtKeywords: ['禅城', '南海', '顺德', '三水', '高明'],
    courtPrefixes: ['佛', '粤06', '佛劳人仲'],
  },
  {
    name: '珠海',
    aliases: ['珠海市', '珠海'],
    districtKeywords: ['香洲', '斗门', '金湾', '横琴', '高新'],
    courtPrefixes: ['珠', '粤04', '珠劳人仲'],
  },
  {
    name: '惠州',
    aliases: ['惠州市', '惠州'],
    districtKeywords: ['惠城', '惠阳', '博罗', '惠东', '龙门', '大亚湾', '仲恺'],
    courtPrefixes: ['惠', '粤13', '惠劳人仲'],
  },
  {
    name: '中山',
    aliases: ['中山市', '中山'],
    districtKeywords: ['石岐', '东区', '西区', '南区', '小榄', '古镇', '火炬', '三乡'],
    courtPrefixes: ['中', '粤20', '中劳人仲'],
  },
  {
    name: '江门',
    aliases: ['江门市', '江门'],
    districtKeywords: ['蓬江', '江海', '新会', '台山', '开平', '鹤山', '恩平'],
    courtPrefixes: ['江', '粤07', '江劳人仲'],
  },
  {
    name: '肇庆',
    aliases: ['肇庆市', '肇庆'],
    districtKeywords: ['端州', '鼎湖', '高要', '广宁', '怀集', '封开', '德庆', '四会'],
    courtPrefixes: ['肇', '粤12', '肇劳人仲'],
  },
];

/**
 * 珠三角劳动争议分析数据集构建器 (LaborCaseDatasetBuilder)
 * 职责：
 * 1. 将 RawDocument + ArbitrationCase (LaborInfoParsedResult) + ParserReviewRecord 组合生成 AnalysisCaseRecord
 * 2. 严格遵循零污染原则，不篡改上游原始数据
 * 3. 按照质量规则执行过滤：reviewStatus === 'approved' 或 parserScore >= 80 进入正式分析集，其余进入待优化池
 */
export class LaborCaseDatasetBuilder {
  /**
   * 将单篇原始文书构建为标准分析记录
   */
  public static buildSingleRecord(
    rawDoc: RawDocument,
    reviewRecord?: ParserReviewRecord | null,
    parsedResult?: LaborInfoParsedResult,
  ): AnalysisCaseRecord {
    // 1. 结构化解析
    const parsed: LaborInfoParsedResult = parsedResult ?? LaborInfoParserAdapter.parseDetailed(rawDoc);

    // 2. 质量完整度评估
    const evalReport = ParserEvaluator.evaluate(parsed, rawDoc.rawText);
    const parserScore = evalReport.completenessScore;

    // 3. 读取人工校验记录 (如果未传入则尝试从存储服务读取)
    const review: ParserReviewRecord | null = reviewRecord !== undefined
      ? reviewRecord
      : ReviewStorageService.getReview(rawDoc.id);

    const reviewStatus: ReviewStatus = review?.reviewStatus || 'pending';
    const hasReviewerChanges = !!(review && review.reviewerChanges);
    const changes = review?.reviewerChanges;

    // 4. 融合人工修改字段 (若有)
    const employeeParty = (hasReviewerChanges && changes?.employeeParty !== undefined)
      ? (changes.employeeParty || null)
      : (parsed.employeeParty || null);

    const employerParty = (hasReviewerChanges && changes?.employerParty !== undefined)
      ? (changes.employerParty || null)
      : (parsed.employerParty || null);

    const disputeType = (hasReviewerChanges && changes?.disputeType && changes.disputeType.length > 0)
      ? changes.disputeType
      : (parsed.disputeType && parsed.disputeType.length > 0 ? parsed.disputeType : ['劳动合同争议']);

    const claims = (hasReviewerChanges && changes?.claims && changes.claims.length > 0)
      ? changes.claims
      : (parsed.claims || []);

    const employerDefenses = (hasReviewerChanges && changes?.employerDefenses)
      ? changes.employerDefenses
      : (parsed.employerDefenses || []);

    const evidence = (hasReviewerChanges && changes?.evidence)
      ? changes.evidence
      : (parsed.evidence || []);
      
    const courtReasoning = (hasReviewerChanges && changes?.courtReasoning)
      ? changes.courtReasoning
      : (parsed.courtReasoning || '');
      
    const keyLegalPoints = (hasReviewerChanges && changes?.keyLegalPoints)
      ? changes.keyLegalPoints
      : (parsed.keyLegalPoints || []);

    const applicantRole = changes?.applicantRole ?? parsed.applicantRole ?? 'unknown';
    const applicantOutcome: LegalOutcomeType = changes?.applicantOutcome
      ?? changes?.overallResult
      ?? parsed.applicantOutcome
      ?? parsed.overallResult
      ?? 'unclear';
    // 兼容旧字段；其语义固定为申请人视角。
    const overallResult = applicantOutcome;

    // 5. Parser 的明确 party outcomes 是事实来源；仅在 Review 改了 Outcome/角色时确定性重算。
    let employeeOutcome = parsed.employeeOutcome ?? 'unclear';
    let employerOutcome = parsed.employerOutcome ?? 'unclear';
    const reviewChangesPerspective = changes?.applicantRole !== undefined
      || changes?.applicantOutcome !== undefined
      || changes?.overallResult !== undefined;

    if (changes?.employeeOutcome !== undefined && changes?.employerOutcome !== undefined) {
      employeeOutcome = changes.employeeOutcome;
      employerOutcome = changes.employerOutcome;
    } else if (reviewChangesPerspective) {
      ({ employeeOutcome, employerOutcome } = resolvePartyOutcomes(applicantRole, applicantOutcome));
    }

    // 6. 识别城市与珠三角 (PRD) 属性
    const { city, isPRD } = this.detectCityAndPRD(rawDoc, parsed);

    // 7. 工劳网 pbDt 是裁判日期的权威来源；正文日期只作回退。
    const authoritativeDate = this.resolveAuthoritativeDate(rawDoc, parsed.date);
    const year = authoritativeDate ? Number(authoritativeDate.slice(0, 4)) : null;
    const parsedCaseNumber = parsed.caseNumber?.trim();
    const caseNumber = parsedCaseNumber && parsedCaseNumber !== '未载明案号'
      ? parsedCaseNumber
      : null;

    // 8. 过滤规则判定：
    // 默认只进入分析集：reviewStatus === 'approved' 或 completenessScore >= 80
    const isApproved = reviewStatus === 'approved';
    const isScoreQualified = parserScore >= 80;
    const isIncludedInAnalysisSet = isApproved || isScoreQualified;

    let filterReason = '';
    if (isApproved) {
      filterReason = `人工审核通过 (Approved)`;
    } else if (isScoreQualified) {
      filterReason = `完整度评分达标 (${parserScore}分 >= 80分)`;
    } else {
      filterReason = `质量评分较低 (${parserScore}分 < 80分) 且未人工核准，进入待优化池`;
    }

    // 9. 计算综合置信度 (0.0 - 1.0)
    let confidence = parsed.partyConfidence || 0.75;
    if (reviewStatus === 'approved') {
      confidence = 1.0;
    } else if (reviewStatus === 'modified') {
      confidence = 0.95;
    } else {
      confidence = Math.min(0.92, Math.max(0.4, Number(((parserScore / 100) * 0.9).toFixed(2))));
    }

    return {
      caseId: parsed.arbitrationCase?.id || `analysis_${rawDoc.id}`,
      rawDocumentId: rawDoc.id,
      title: rawDoc.title || parsed.caseTitle || '未命名案例',
      source: rawDoc.source || 'laborinfo',
      city,
      isPRD,
      court: parsed.court || '劳动人事争议仲裁委员会/人民法院',
      caseNumber,
      date: authoritativeDate || '未载明日期',
      year,
      caseLevel: parsed.caseLevel || '劳动仲裁/一审',

      disputeType,
      employeeParty,
      employerParty,
      applicantRole,
      parties: parsed.parties || [],

      employerDefenses,
      evidence,
      claims,
      unresolvedReferences: parsed.unresolvedReferences || [],
      semanticRelations: parsed.semanticRelations,
      humanReviewCandidates: parsed.humanReviewCandidates,
      semanticResolutionStatus: parsed.semanticResolutionStatus,
      semanticResolutionErrorCode: parsed.semanticResolutionErrorCode,
      courtReasoning,
      keyLegalPoints,

      applicantOutcome,
      employeeOutcome,
      employerOutcome,
      overallResult,

      parserScore,
      reviewStatus,
      confidence,

      isIncludedInAnalysisSet,
      filterReason,

      hasReviewerChanges,
      reviewedAt: review?.reviewTime,
      reviewerNotes: review?.reviewerChanges?.customNotes,
    };
  }

  /**
   * 批量构建数据集并生成统计概览
   */
  public static buildDataset(
    rawDocs: RawDocument[],
    reviewMap?: Record<string, ParserReviewRecord>
  ): {
    records: AnalysisCaseRecord[];
    summary: DatasetBuildSummary;
  } {
    const reviews = reviewMap || ReviewStorageService.getAllReviews();
    const records: AnalysisCaseRecord[] = [];

    for (const doc of rawDocs) {
      try {
        const review = reviews[doc.id] || null;
        const record = this.buildSingleRecord(doc, review);
        records.push(record);
      } catch (err) {
        console.error(`构建文书 [${doc.id}] 分析记录失败:`, err);
      }
    }

    const summary = this.summarizeDataset(records, rawDocs.length);
    return { records, summary };
  }

  /**
   * 聚合统计数据集的各项分布
   */
  public static summarizeDataset(
    records: AnalysisCaseRecord[],
    totalRawDocs: number
  ): DatasetBuildSummary {
    const totalConverted = records.length;
    const includedRecords = records.filter((r) => r.isIncludedInAnalysisSet);
    const pendingRecords = records.filter((r) => !r.isIncludedInAnalysisSet);

    const includedInAnalysisSetCount = includedRecords.length;
    const pendingOptimizationCount = pendingRecords.length;
    const filterRate = totalConverted > 0
      ? Number(((includedInAnalysisSetCount / totalConverted) * 100).toFixed(1))
      : 0;

    // 质量分段统计
    const qualityDistribution = {
      range90_100: records.filter((r) => r.parserScore >= 90).length,
      range80_89: records.filter((r) => r.parserScore >= 80 && r.parserScore < 90).length,
      range60_79: records.filter((r) => r.parserScore >= 60 && r.parserScore < 80).length,
      rangeBelow60: records.filter((r) => r.parserScore < 60).length,
      approvedCount: records.filter((r) => r.reviewStatus === 'approved').length,
      modifiedCount: records.filter((r) => r.reviewStatus === 'modified').length,
      pendingReviewCount: records.filter((r) => r.reviewStatus === 'pending').length,
    };

    // 城市分布统计
    const cityDistribution: Record<string, number> = {};
    let prdCount = 0;
    let nonPrdCount = 0;

    for (const r of records) {
      cityDistribution[r.city] = (cityDistribution[r.city] || 0) + 1;
      if (r.isPRD) {
        prdCount++;
      } else {
        nonPrdCount++;
      }
    }

    // 争议类型分布统计
    const disputeTypeDistribution: Record<string, number> = {};
    for (const r of records) {
      for (const dt of r.disputeType) {
        disputeTypeDistribution[dt] = (disputeTypeDistribution[dt] || 0) + 1;
      }
    }

    return {
      totalRawDocs,
      totalConverted,
      includedInAnalysisSetCount,
      pendingOptimizationCount,
      filterRate,
      qualityDistribution,
      cityDistribution,
      disputeTypeDistribution,
      prdCount,
      nonPrdCount,
    };
  }

  /**
   * 识别文书归属城市及是否为珠三角地区 (PRD)
   */
  private static detectCityAndPRD(
    rawDoc: RawDocument,
    parsed: LaborInfoParsedResult
  ): { city: string; isPRD: boolean } {
    let city = parsed.city || '其他城市';
    city = city.replace('市', '');
    const isPRD = PRD_CITIES.some(p => p.name === city || p.aliases.includes(city));
    return { city, isPRD };
  }

  private static resolveAuthoritativeDate(rawDoc: RawDocument, parsedDate: string): string | undefined {
    const metadataDate = this.normalizeDate(rawDoc.publishedAt);
    const normalizedParsedDate = this.normalizeDate(parsedDate);

    return rawDoc.source.toLowerCase() === 'laborinfo'
      ? metadataDate ?? normalizedParsedDate
      : normalizedParsedDate ?? metadataDate;
  }

  private static normalizeDate(value?: string): string | undefined {
    if (!value) return undefined;

    const match = value.trim().match(/^(\d{4})(?:-|\/|年)(\d{1,2})(?:-|\/|月)(\d{1,2})(?:日)?(?:[T\s].*)?$/);
    if (!match) return undefined;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (year < 1900 || year > 2100) return undefined;

    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (
      candidate.getUTCFullYear() !== year
      || candidate.getUTCMonth() !== month - 1
      || candidate.getUTCDate() !== day
    ) {
      return undefined;
    }

    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
}
