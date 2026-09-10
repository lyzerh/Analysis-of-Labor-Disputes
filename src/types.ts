/**
 * 深圳劳动仲裁文书本地研究库 - 核心数据类型定义
 */

import type {
  AppliedSemanticRelation,
  ReviewableSemanticResolutionCandidate,
  SemanticResolutionStatus,
} from './services/semantic/types';

export type DocumentContentType = 'html' | 'txt' | 'pdf' | 'mht' | 'pasted' | 'json';

export type DecisionOutcome = '用人单位胜诉' | '用人单位败诉' | '部分支持' | '调解/其他';

export type ParseStatus = 'success' | 'partial' | 'failed';

export type TaskStatus = 'pending' | 'imported' | 'parsed' | 'failed';

/**
 * 待采集公开文书任务 (DocumentTask)
 * 记录从公开目录页发现的文书元数据，供人工下载 HTML 并批量导入
 */
export interface DocumentTask {
  id: string;
  title: string;
  url: string;
  publishedAt?: string;
  caseNumber?: string;
  status: TaskStatus;
  rawDocumentId?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * HTML 批量导入与质量检查报告
 */
export interface HTMLInspectionReport {
  fileName: string;
  fileSize: number;
  extractedTitle: string | null;
  extractedCaseNumber: string | null;
  hasTitle: boolean;
  hasCaseNumber: boolean;
  hasDate: boolean;
  hasCommittee: boolean;
  hasParties: boolean;
  hasClaims: boolean;
  hasFacts: boolean;
  hasReasoning: boolean;
  hasDecision: boolean;
  hasLegalBasis: boolean;
  qualityScore: number;
  unrecognizedFields: string[];
  isDuplicate: boolean;
  parseStatus: ParseStatus;
  rawDocumentId?: string;
  caseId?: string;
  error?: string;
}

/**
 * 原始文书对象 (RawDocument)
 * 永久保留用户上传或同步获取的原始内容，用于追溯、重新解析与对比
 */
export interface RawDocument {
  id: string;
  source: string; // 如：'深圳市人力资源和社会保障局' | '本地文件导入' | 'laborinfo'
  sourceId?: string; // 数据源中的原始唯一标识 ID
  sourceUrl?: string;
  sourceMetadata?: Record<string, any>; // 存放公开API返回的原始结构化元数据
  title: string;
  publishedAt?: string;
  contentType: DocumentContentType;
  rawHtml?: string;
  rawText: string;
  contentHash: string; // SHA-256 计算的内容摘要
  duplicateOf?: string | null; // 若重复，指向首次入库的 RawDocument id
  fileSize?: number;
  fileName?: string;
  fetchedAt?: string;
  importedAt: string;
}

/**
 * 本地解析质量评分
 */
export interface ParseQuality {
  overall: number; // 0 - 100 分
  caseNumber: boolean; // 是否成功识别案号 (+15分)
  date: boolean; // 是否成功识别裁决日期 (+10分)
  committee: boolean; // 是否成功识别仲裁委 (+10分)
  parties: boolean; // 是否成功识别申请人与被申请人 (+15分)
  claims: boolean; // 是否成功识别仲裁请求 (+15分)
  facts: boolean; // 是否成功识别案件事实 (+10分)
  reasoning: boolean; // 是否成功识别仲裁庭认定与说理 (+15分)
  decision: boolean; // 是否成功识别裁决主文 (+10分)
  unrecognizedFields: string[]; // 未能成功提取的字段列表，便于质检
}

/**
 * 结构化仲裁案例对象 (ArbitrationCase)
 */
export interface ArbitrationCase {
  id: string;
  rawDocumentId: string; // 关联的 RawDocument id
  source: string;
  sourceUrl?: string;
  title: string;
  caseNumber: string;
  publishedDate?: string;
  year: number;
  month?: number;
  arbitrationCommittee: string; // 如：'深圳市劳动人事争议仲裁委员会'、'深圳市福田区劳动人事争议仲裁委员会'

  applicant: string; // 申请人（劳动者或单位）
  respondent: string; // 被申请人（单位或劳动者）
  applicantIsEmployee: boolean; // 申请人是否为劳动者

  claims: string[]; // 仲裁请求列表
  facts: string; // 经审理查明事实

  applicantArguments?: string; // 申请人主张
  respondentArguments?: string; // 被申请人答辩与抗辩

  evidence?: Array<{
    name: string;
    provider?: string;
    admitted: boolean;
    reason?: string;
  }>;

  tribunalReasoning: string; // 仲裁庭意见与法理认定
  decision: string; // 裁决结果主文
  compensationAmount?: number; // 裁决裁付总金额（如有）
  decisionOutcome: DecisionOutcome; // 归一化裁决结果倾向

  legalBasis: string[]; // 援引法律法条（如：《劳动合同法》第38条、第39条、第40条、第46条、第82条）
  disputeTags: string[]; // 争议类型标签（如：违法解除、加班工资、经济补偿、未签劳动合同、调岗降薪、年终奖）

  parseStatus: ParseStatus;
  parseQuality: ParseQuality;

  // 本地文本分析画像缓存（纯本地规则分析，不修改 rawText）
  profile?: CaseProfile;

  parsedAt: string;
  updatedAt?: string;
}

/**
 * 企业抗辩识别项
 */
export interface EmployerDefenseItem {
  defenseType: string;
  matchedText: string;
  confidence: number; // 0 - 1.0
  sourceSection?: string;
}

/**
 * 证据识别项
 */
export interface EvidenceItem {
  name: string;
  matchedText: string;
  provider?: string;
  confidence: number;
}

/**
 * 败诉原因识别项
 */
export interface LossReasonItem {
  reason: string;
  matchedText: string;
  confidence: number; // 0 - 1.0
  reasoningSnippet?: string;
}

/**
 * 结构化案件画像 (CaseProfile) - 纯本地规则引擎生成，不使用任何LLM
 */
export interface CaseProfile {
  caseId: string;
  caseNumber: string;
  title: string;
  disputeTypes: string[];
  employerDefenses: EmployerDefenseItem[];
  evidence: EvidenceItem[];
  lossReasons: LossReasonItem[];
  legalBasis: string[];
  outcome: DecisionOutcome;
  compensationAmount?: number;
  keywords: Array<{ word: string; weight: number }>;
  sectionsFound?: {
    hasApplicantArguments: boolean;
    hasRespondentArguments: boolean;
    hasFacts: boolean;
    hasReasoning: boolean;
    hasDecision: boolean;
  };
}

/**
 * 抗辩效果分析模型 (DefenseOutcomeStat)
 */
export interface DefenseOutcomeStat {
  defenseType: string;
  totalCount: number;
  supportedCount: number; // 用人单位胜诉
  unsupportedCount: number; // 用人单位败诉 / 部分支持
  partialCount: number;
  winRate: number; // 百分比 0 - 100
  sourceCaseIds: string[];
  supportedCaseIds: string[];
  unsupportedCaseIds: string[];
  topEvidence: string[];
  commonLossReasons: string[];
}

/**
 * 抗辩 + 证据组合效果模型 (DefenseEvidenceComboStat)
 */
export interface DefenseEvidenceComboStat {
  id: string;
  defenseType: string;
  evidenceList: string[]; // 例如: ['员工手册', '考勤记录']
  comboKey: string;
  totalCount: number;
  supportedCount: number;
  unsupportedCount: number;
  winRate: number;
  sourceCaseIds: string[];
  sampleCaseNumber?: string;
}

/**
 * 败诉原因统计模型 (LossReasonStat)
 */
export interface LossReasonStat {
  reason: string;
  count: number;
  percentage: number; // 在所有败诉案件中的占比
  involvedDefenses: Array<{ defense: string; count: number }>;
  sourceCaseIds: string[];
  sampleCases: Array<{ caseId: string; caseNumber: string; title: string; snippet?: string }>;
}

/**
 * TF-IDF 关键词项
 */
export interface TfIdfWordItem {
  word: string;
  tfidf: number;
  docFreq: number; // 出现文档数
  totalFreq: number; // 总词频
  category?: 'defense' | 'evidence' | 'loss' | 'dispute' | 'general';
}

/**
 * 词语共现矩阵单元
 */
export interface CooccurrenceCell {
  wordA: string;
  wordB: string;
  count: number;
  correlation: number;
  sourceCaseIds: string[];
}

/**
 * 相似案件匹配结果
 */
export interface SimilarCaseResult {
  caseItem: ArbitrationCase;
  similarity: number; // 0 - 100%
  commonDisputes: string[];
  commonDefenses: string[];
  commonEvidence: string[];
  outcome: DecisionOutcome;
}

/**
 * 本地研究报告完整数据结构
 */
export interface LocalResearchReport {
  generatedAt: string;
  filterSummary: {
    totalSampleCount: number;
    disputeTypeFilter?: string;
    yearRange?: string;
  };
  sampleSize: number;
  yearDistribution: Record<string, number>;
  disputeTypeDistribution: Array<{ type: string; count: number; percentage: number }>;
  employerDefenseDistribution: Array<{ defense: string; count: number; percentage: number }>;
  evidenceDistribution: Array<{ evidence: string; count: number; percentage: number }>;
  outcomeDistribution: Record<DecisionOutcome, number>;
  defenseOutcomes: DefenseOutcomeStat[];
  comboOutcomes: DefenseEvidenceComboStat[];
  lossReasons: LossReasonStat[];
  topKeywords: TfIdfWordItem[];
  topCooccurrences: CooccurrenceCell[];
  representativeCases: Array<{
    caseId: string;
    caseNumber: string;
    title: string;
    outcome: DecisionOutcome;
    defenses: string[];
    evidence: string[];
    lossReasons: string[];
  }>;
  disclaimer: string;
}

/**
 * 同步任务与日志
 */
export interface SyncTask {
  id: string;
  source: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  totalDiscovered: number;
  totalFetched: number;
  totalParsed: number;
  totalDuplicates: number;
  totalErrors: number;
  currentStep?: string;
  errorMessage?: string;
  startedAt?: string;
  updatedAt: string;
  completedAt?: string;
}

export interface SyncLog {
  id?: number;
  taskId: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  details?: string;
}

/**
 * 数据质量统计模型
 */
export interface DataQualityStats {
  totalDocuments: number;
  successParsed: number;
  partialParsed: number;
  failedParsed: number;
  duplicateCount: number;
  emptyOrShortCount: number;

  caseNumberRate: number; // %
  dateRate: number; // %
  claimsRate: number; // %
  factsRate: number; // %
  reasoningRate: number; // %
  decisionRate: number; // %

  avgQualityScore: number;
}

/**
 * 筛选查询条件
 */
export interface CaseFilterOptions {
  keyword?: string;
  keywordMode?: 'AND' | 'OR';
  year?: string;
  month?: string;
  committee?: string;
  disputeTag?: string;
  decisionOutcome?: string;
  parseStatus?: string;
  minQualityScore?: number;
  sortBy?: 'publishedDate' | 'year' | 'parseQuality' | 'caseNumber';
  sortOrder?: 'asc' | 'desc';
}

/**
 * 系统设置
 */
export interface AppSettings {
  syncDelayMs: number; // 采集请求间隔（毫秒）
  autoParseOnImport: boolean; // 导入后自动解析
  defaultPageSize: number;
  isAiModuleEnabled: boolean; // AI模块预留标记（默认 false）
}

/**
 * 数据源接口定义 (为合规采集及模式切换预留)
 */
export interface PageInfo {
  pageNumber: number;
  url: string;
  totalItems?: number;
}

export interface DocumentLink {
  title: string;
  url: string;
  date?: string;
  caseNumber?: string;
  source: string;
}

/**
 * 工劳网文书元数据统一结构 (DocumentMetadata)
 */
export interface DocumentMetadata {
  sourceId: string;
  source: string;
  title: string;
  url: string;
  court?: string;
  date?: string;
  province?: string;
  caseLevel?: string;
}

/**
 * 工劳网检索参数
 */
export interface LaborInfoSearchParams {
  province?: string;
  caseLevel?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  per_page?: number;
  q?: string;
}

export type PipelineMode = 'raw_only' | 'crawl_and_parse' | 'crawl_parse_build';

/**
 * 工劳网批量采集参数 (LaborInfoCrawlParams)
 */
export interface LaborInfoCrawlParams {
  province: string[];
  caseLevel: string[];
  start_date?: string;
  end_date?: string;
  per_page: number;
  maxCases: number;
  startPage?: number;
  q?: string;
  pipelineMode?: PipelineMode;
}

/**
 * 采集日志条目
 */
export interface CrawlLogEntry {
  id?: string;
  time: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
  details?: any;
}

/**
 * 采集任务状态
 */
export type CrawlTaskStatus = 'running' | 'paused' | 'completed' | 'stopped' | 'failed';

/**
 * 工劳网采集任务记录 (LaborInfoCrawlTask)
 */
export interface LaborInfoCrawlTask {
  id: string;
  params: LaborInfoCrawlParams;
  currentPage: number;
  totalPages: number;
  totalCountInApi: number;
  found: number;
  fetched: number;
  saved: number;
  duplicates: number;
  failed: number;
  emptyText?: number;
  filteredSamples: number;
  parsedSuccess?: number;
  parsedFailed?: number;
  includedInAnalysisSet?: number;
  pendingOptimization?: number;
  status: CrawlTaskStatus;
  rateLimited?: boolean;
  errorMessage?: string;
  logs: CrawlLogEntry[];
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
}

/**
 * 采集统计汇总
 */
export interface LaborInfoCrawlSummary {
  apiTotalCount: number;
  scannedPages: number;
  foundCases: number;
  filteredSamples: number;
  fetchedDetails: number;
  fullTextSuccess: number;
  newlySaved: number;
  duplicates: number;
  failed: number;
  finalDatabaseTotal: number;
}

/**
 * 诉求判定状态
 */
export type ClaimSupportStatus = 'supported' | 'partially_supported' | 'not_supported' | 'unclear';

/** 裁判请求提出方的劳动关系身份。unknown 不得默认映射为任何一方。 */
export type ApplicantRole = 'employee' | 'employer' | 'unknown';

export type LaborRole = 'employee' | 'employer' | 'other' | 'unknown';

export type ProceduralRole =
  | 'plaintiff'
  | 'defendant'
  | 'appellant'
  | 'appellee'
  | 'applicant'
  | 'respondent'
  | 'counterclaimant'
  | 'third_party'
  | 'unknown';

export interface CaseParty {
  id: string;
  name: string;
  laborRole: LaborRole;
  proceduralRoles: ProceduralRole[];
}

export type ClaimProceduralBasis =
  | 'original_claim'
  | 'counterclaim'
  | 'appeal_request'
  | 'application'
  | 'unknown';

export type ReferenceResolutionMethod = 'direct' | 'ordinal' | 'rule' | 'llm' | 'unresolved';

export interface ClaimReferenceCandidate {
  sourceText: string;
  referencedClaimIds: string[];
  confidence: number;
  resolutionMethod: ReferenceResolutionMethod;
  needsSemanticResolution: boolean;
}

/** 裁判主文中的最小动作模型，用于隔离动作、程序对象与具体请求。 */
export type JudgmentAction = 'support' | 'reject' | 'pay' | 'maintain' | 'revoke' | 'unclear';

export interface JudgmentActionItem {
  id?: string;
  action: JudgmentAction;
  targetPartyRole: 'plaintiff' | 'defendant' | 'appellant' | 'appellee' | 'unknown';
  targetClaimType?: string;
  requestedAmount?: number;
  awardedAmount?: number;
  referenceResolution?: ClaimReferenceCandidate;
  sourceText: string;
}

/**
 * 诉求条目
 */
export interface LaborInfoClaimItem {
  id?: string;
  claimName: string;
  claimType?: string;
  claimant: LaborRole;
  claimantRole?: LaborRole;
  claimantPartyId?: string;
  proceduralBasis?: ClaimProceduralBasis;
  supportStatus: ClaimSupportStatus;
  requestedAmount?: number;
  awardedAmount?: number;
  sourceText?: string;
  judgmentItems?: JudgmentActionItem[];
  referenceResolution?: ClaimReferenceCandidate;
  amount?: number;
  reason?: string;
}

/**
 * 当事人识别结果
 */
export interface PartyRecognitionResult {
  employeeParty: string | null;
  employerParty: string | null;
  applicantRole: ApplicantRole;
  parties?: CaseParty[];
  confidence: number; // 0 - 1.0
  reason?: string;
}

/**
 * 裁判结果四分类
 */
export type LegalOutcomeType = 'supported' | 'partially_supported' | 'not_supported' | 'unclear';

/**
 * 工劳网文书结构化解析结果 (扩展至 ArbitrationCase)
 */
export interface LaborInfoParsedResult {
  // 基础信息
  caseTitle: string;
  court: string;
  date: string;
  caseLevel: string;
  province: string;
  city: string;
  caseNumber: string;

  // 当事人识别
  employeeParty: string | null;
  employerParty: string | null;
  applicantRole: ApplicantRole;
  parties: CaseParty[];
  partyConfidence: number;

  // 争议类型
  disputeType: string[];

  // 诉求列表
  claims: LaborInfoClaimItem[];
  unresolvedReferences: ClaimReferenceCandidate[];
  semanticRelations?: AppliedSemanticRelation[];
  humanReviewCandidates?: ReviewableSemanticResolutionCandidate[];
  semanticResolutionStatus?: SemanticResolutionStatus;
  semanticResolutionErrorCode?: string;

  // 企业抗辩
  employerDefenses: EmployerDefenseItem[];

  // 证据列表
  evidence: EvidenceItem[];

  // 裁判理由与核心要点
  courtReasoning: string;
  keyLegalPoints: string[];

  // 结果四分类
  applicantOutcome: LegalOutcomeType;
  employeeOutcome: LegalOutcomeType;
  employerOutcome: LegalOutcomeType;
  /** @deprecated 兼容字段；语义等同 applicantOutcome，不是 employeeOutcome。 */
  overallResult: LegalOutcomeType;

  // 衍生 ArbitrationCase 对象
  arbitrationCase: ArbitrationCase;

  // 质检与性能统计
  rawTextLength: number;
  parseDurationMs: number;
  fieldCompleteness: {
    score: number; // 0 - 100
    filledFields: number;
    totalFields: number;
    details: Record<string, boolean>;
  };
}

/**
 * 完整度单项字段详情
 */
export interface FieldCompletenessItem {
  fieldName: string;
  label: string;
  isFilled: boolean;
  valueSummary?: string;
  weight: number;
}

/**
 * 完整度分类指标
 */
export interface FieldCompletenessCategory {
  categoryKey: string;
  categoryName: string;
  score: number; // 0 - 100
  weight: number;
  filledCount: number;
  totalCount: number;
  fields: FieldCompletenessItem[];
}

/**
 * 一致性检查问题定义
 */
export interface ConsistencyIssue {
  id: string;
  type: 'conflict' | 'missing' | 'possible_false_positive' | 'warning';
  level: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  field?: string;
  suggestion?: string;
}

/**
 * 一致性检查结果
 */
export interface ConsistencyCheckResult {
  hasConflicts: boolean;
  issues: ConsistencyIssue[];
  conflictCount: number;
  missingCount: number;
  falsePositiveCount: number;
  passed: boolean;
}

/**
 * Parser 质量评估总报告
 */
export interface ParserEvaluationReport {
  rawDocId: string;
  caseTitle: string;
  completenessScore: number; // 0 - 100
  grade: 'excellent' | 'good' | 'fair' | 'poor';
  categories: {
    baseInfo: FieldCompletenessCategory;
    parties: FieldCompletenessCategory;
    disputes: FieldCompletenessCategory;
    claims: FieldCompletenessCategory;
    defenses: FieldCompletenessCategory;
    evidence: FieldCompletenessCategory;
    reasoning: FieldCompletenessCategory;
  };
  consistency: ConsistencyCheckResult;
  evaluatedAt: string;
}

/**
 * 人工审核状态
 */
export type ReviewStatus = 'pending' | 'approved' | 'modified';

/**
 * 人工反馈记录 (parserReview) - 严禁覆盖 rawText
 */
export interface ParserReviewRecord {
  id: string;
  rawDocumentId: string;
  caseTitle: string;
  reviewStatus: ReviewStatus;
  reviewerChanges: {
    employeeParty?: string | null;
    employerParty?: string | null;
    applicantRole?: ApplicantRole;
    applicantOutcome?: LegalOutcomeType;
    employeeOutcome?: LegalOutcomeType;
    employerOutcome?: LegalOutcomeType;
    claims?: LaborInfoClaimItem[];
    employerDefenses?: EmployerDefenseItem[];
    evidence?: EvidenceItem[];
    courtReasoning?: string;
    keyLegalPoints?: string[];
    /** @deprecated 兼容旧审核数据；语义为 applicantOutcome。 */
    overallResult?: LegalOutcomeType;
    disputeType?: string[];
    customNotes?: string;
  };
  reviewerName?: string;
  reviewTime: string;
  evaluationSnapshot?: {
    completenessScore: number;
    issueCount: number;
    conflictCount: number;
  };
}

/**
 * 珠三角劳动争议分析数据集案例记录 (AnalysisCaseRecord)
 * 组合自 RawDocument + ArbitrationCase (LaborInfoParsedResult) + ParserReviewRecord
 */
export interface AnalysisCaseRecord {
  // 基础字段 (Base)
  caseId: string;
  rawDocumentId: string;
  title: string;
  source: string;
  city: string; // 识别出的城市 (如: 深圳、广州、东莞、佛山、珠海、惠州、中山、江门、肇庆等)
  isPRD: boolean; // 是否属于珠三角九市 (Pearl River Delta)
  court: string;
  date: string;
  year: number | null;
  caseLevel: string; // 审级 / 机构类型

  // 争议分类 (Dispute)
  disputeType: string[];

  // 主体信息 (Parties)
  employeeParty: string | null;
  employerParty: string | null;
  applicantRole: ApplicantRole;
  parties: CaseParty[];

  // 裁判理由与核心要点
  courtReasoning: string;
  keyLegalPoints: string[];

  // 企业策略与抗辩 (Employer Strategy)
  employerDefenses: EmployerDefenseItem[];
  evidence: EvidenceItem[];

  // 诉求清单 (Claims)
  claims: LaborInfoClaimItem[];
  unresolvedReferences: ClaimReferenceCandidate[];
  semanticRelations?: AppliedSemanticRelation[];
  humanReviewCandidates?: ReviewableSemanticResolutionCandidate[];
  semanticResolutionStatus?: SemanticResolutionStatus;
  semanticResolutionErrorCode?: string;

  // 裁判结果四分类 (Outcomes)
  applicantOutcome: LegalOutcomeType;
  employeeOutcome: LegalOutcomeType;
  employerOutcome: LegalOutcomeType;
  /** @deprecated 兼容字段；语义等同 applicantOutcome，不是 employeeOutcome。 */
  overallResult: LegalOutcomeType;

  // 质量指标与审核状态 (Quality & Validation)
  parserScore: number; // 完整度评分 (0 - 100)
  reviewStatus: ReviewStatus; // 'pending' | 'approved' | 'modified'
  confidence: number; // 置信度 0.0 - 1.0

  // 过滤状态与归集
  isIncludedInAnalysisSet: boolean; // 是否进入正式分析集 (approved 或 score >= 80)
  filterReason: string; // 过滤决策理由

  // 人工修改与质检元数据
  hasReviewerChanges: boolean;
  reviewedAt?: string;
  reviewerNotes?: string;
}

/**
 * 数据集构建统计报告 (DatasetBuildSummary)
 */
export interface DatasetBuildSummary {
  totalRawDocs: number;
  totalConverted: number;
  includedInAnalysisSetCount: number;
  pendingOptimizationCount: number;
  filterRate: number; // 百分比 (如: 85.0)

  // 质量分布
  qualityDistribution: {
    range90_100: number;
    range80_89: number;
    range60_79: number;
    rangeBelow60: number;
    approvedCount: number;
    modifiedCount: number;
    pendingReviewCount: number;
  };

  // 城市分布
  cityDistribution: Record<string, number>;

  // 争议类型分布
  disputeTypeDistribution: Record<string, number>;

  // 珠三角统计
  prdCount: number;
  nonPrdCount: number;
}

/**
 * 裁判结果四分类明细及案号追踪 (OutcomeStats)
 */
export interface OutcomeStats {
  supported: number;
  partially_supported: number;
  not_supported: number;
  unclear: number;
  caseIds: {
    supported: string[];
    partially_supported: string[];
    not_supported: string[];
    unclear: string[];
  };
}

/**
 * 目标城市统计结构 (CityAnalyticsSummary)
 */
export interface CityAnalyticsSummary {
  city: '广州' | '深圳' | '东莞';
  caseCount: number;
  caseIds: string[];
  employeeOutcome: OutcomeStats;
  employerOutcome: OutcomeStats;
  employerWinRate: number; // 企业胜诉率 (百分比，如 35.5)
  employerPartialRate: number; // 企业部分支持率 (百分比)
  employeeWinRate: number; // 员工胜诉率 (百分比)
}

/**
 * 争议类型统计结构 (DisputeTypeAnalyticsItem)
 */
export interface DisputeTypeAnalyticsItem {
  disputeType: string;
  caseCount: number;
  caseIds: string[];
  employeeOutcome: OutcomeStats;
  employerOutcome: OutcomeStats;
  employerWinRate: number; // 企业胜诉率 (百分比)
  employeeWinRate: number; // 员工胜诉率 (百分比)
}

/**
 * 企业抗辩统计结构 (EmployerDefenseAnalyticsItem)
 */
export interface EmployerDefenseAnalyticsItem {
  defenseType: string;
  frequency: number; // 出现次数 (抗辩条目总频次)
  caseCount: number; // 涉及案件数
  caseIds: string[];
  employerSupportedCount: number; // 企业胜诉案件数
  employerSupportedCaseIds: string[];
  employerPartialCount: number; // 企业部分支持案件数
  employerPartialCaseIds: string[];
  employerNotSupportedCount: number; // 企业败诉案件数
  employerNotSupportedCaseIds: string[];
  supportRate: number; // 支持率 (百分比，排除 unclear)
}

/**
 * 证据统计结构 (EvidenceAnalyticsItem)
 */
export interface EvidenceAnalyticsItem {
  evidenceName: string;
  frequency: number; // 出现总频次
  caseCount: number; // 涉及案件数
  caseIds: string[];
  appearanceInEmployerSupportedCount: number; // 在支持企业结果案件中出现的案件数
  appearanceInEmployerSupportedCaseIds: string[];
  rateInEmployerSupported: number; // 在支持企业结果案件中的关联出现率 (百分比)
}

/**
 * 广深莞劳动争议统计分析报告 (LaborDisputeReport)
 */
export interface LaborDisputeReport {
  generatedAt: string;
  overall: {
    totalCases: number;
    includedCases: number;
    excludedCases: number;
    averageParserScore: number;
    reviewApprovedCount: number;
    modifiedReviewCount: number;
    pendingReviewCount: number;
  };
  targetCities: CityAnalyticsSummary[];
  disputeTypes: DisputeTypeAnalyticsItem[];
  employerDefenses: EmployerDefenseAnalyticsItem[];
  evidenceRanking: EvidenceAnalyticsItem[];
}

/**
 * v1.5 抗辩策略增强统计项 (DefenseStrategyEnhancedItem)
 */
export interface DefenseStrategyEnhancedItem {
  defenseName: string;
  caseCount: number;
  caseIds: string[];
  supportedCount: number;
  supportedCaseIds: string[];
  partiallySupportedCount: number;
  partiallySupportedCaseIds: string[];
  notSupportedCount: number;
  notSupportedCaseIds: string[];
  unclearCount: number;
  unclearCaseIds: string[];
  employerSupportRate: number; // 胜诉率 (百分比，排除 unclear)
}

/**
 * 缺失证据统计项
 */
export interface MissingEvidenceStat {
  evidenceName: string;
  missingCount: number;
  missingRate: number;
  caseIds: string[];
}

/**
 * 法院否定理由关键词统计
 */
export interface CourtReasoningKeywordStat {
  keyword: string;
  count: number;
  caseIds: string[];
}

/**
 * 失败抗辩专项归因分析 (FailedDefenseAnalysisItem)
 */
export interface FailedDefenseAnalysisItem {
  defense: string;
  failedCaseCount: number;
  failedCaseIds: string[];
  commonEvidenceMissing: MissingEvidenceStat[];
  commonCourtReasoning: CourtReasoningKeywordStat[];
  commonDisputeTypes: { disputeType: string; count: number; caseIds: string[] }[];
}

/**
 * 证据组合统计项 (EvidenceCombinationItem)
 */
export interface EvidenceCombinationItem {
  evidenceCombination: string[];
  combinationKey: string;
  appearanceCount: number; // 在企业获支持案件中出现次数
  appearanceRate: number; // 在企业获支持案件中的出现频率 (百分比)
  caseIds: string[];
}

/**
 * 争议类型 × 企业抗辩二维矩阵单元格 (DisputeDefenseMatrixCell)
 */
export interface DisputeDefenseMatrixCell {
  disputeType: string;
  defenseType: string;
  caseCount: number;
  caseIds: string[];
  employerSupportedCount: number;
  employerSupportedCaseIds: string[];
  employerSupportRate: number; // 胜诉率 (排除 unclear)
}

/**
 * 争议类型 × 企业抗辩二维矩阵
 */
export interface DisputeDefenseMatrixReport {
  disputeTypes: string[];
  defenseTypes: string[];
  cells: Record<string, Record<string, DisputeDefenseMatrixCell>>;
}

/**
 * 企业抗辩策略关联分析报告 (DefenseAnalysisReport)
 */
export interface DefenseAnalysisReport {
  generatedAt: string;
  analyzedCaseCount: number;
  employerSupportedCaseCount: number;
  employerNonSupportedCaseCount: number;
  defenseRanking: DefenseStrategyEnhancedItem[];
  failedDefenses: FailedDefenseAnalysisItem[];
  evidenceSingleRanking: EvidenceAnalyticsItem[];
  evidenceCombinations: EvidenceCombinationItem[];
  matrix: DisputeDefenseMatrixReport;
}



