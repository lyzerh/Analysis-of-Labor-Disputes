/**
 * 深圳劳动仲裁文书本地研究库 - 本地分析引擎综合服务 (LocalAnalysisService)
 * 纯本地浏览器执行，严禁接入任何 LLM / Gemini API
 * 所有分析结论均可追溯至具体案例 (sourceCaseIds)
 */

import {
  ArbitrationCase,
  CaseProfile,
  DefenseOutcomeStat,
  DefenseEvidenceComboStat,
  LossReasonStat,
  SimilarCaseResult,
  LocalResearchReport,
  DecisionOutcome,
} from '../../types';
import { TextProcessor } from './TextProcessor';
import { DocumentStructureRecognizer } from './DocumentStructureRecognizer';
import { DisputeElementExtractor } from './DisputeElementExtractor';
import { EmployerDefenseRecognizer } from './EmployerDefenseRecognizer';
import { EvidenceRecognizer } from './EvidenceRecognizer';
import { LossReasonRecognizer } from './LossReasonRecognizer';
import { TfIdfEngine } from './TfIdfEngine';
import { CooccurrenceEngine } from './CooccurrenceEngine';

export class LocalAnalysisService {
  /**
   * 1. 为单个案件生成结构化案件画像 (CaseProfile)
   * 纯本地规则分析，不修改 rawText
   */
  public static generateCaseProfile(
    caseItem: ArbitrationCase,
    fullText?: string
  ): CaseProfile {
    const textToScan =
      fullText ||
      `${caseItem.title}\n${caseItem.claims.join('\n')}\n${caseItem.applicantArguments || ''}\n${
        caseItem.respondentArguments || ''
      }\n${caseItem.facts}\n${caseItem.tribunalReasoning}\n${caseItem.decision}`;

    const sections = TextProcessor.recognizeSections(textToScan);

    // 1. 争议要素
    const disputeMatches = DisputeElementExtractor.extract(textToScan);
    const disputeTypes = Array.from(
      new Set([...(caseItem.disputeTags || []), ...disputeMatches.map((d) => d.tag)])
    );

    // 2. 企业抗辩（优先从答辩区域识别）
    const defenses = EmployerDefenseRecognizer.recognize(
      textToScan,
      caseItem.respondentArguments || sections.respondentArguments
    );

    // 3. 证据识别
    const evidence = EvidenceRecognizer.recognize(textToScan);

    // 4. 败诉原因识别（优先扫描说理与事实区）
    const lossReasons = LossReasonRecognizer.recognize(
      textToScan,
      caseItem.tribunalReasoning || sections.reasoning,
      caseItem.facts || sections.facts
    );

    // 5. TF-IDF 关键词抽取单篇 Top 10
    const tokens = TfIdfEngine.tokenize(textToScan);
    const tf = TfIdfEngine.computeTf(tokens);
    const keywords = Object.entries(tf)
      .map(([word, weight]) => ({ word, weight: Number(weight.toFixed(4)) }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10);

    return {
      caseId: caseItem.id,
      caseNumber: caseItem.caseNumber,
      title: caseItem.title,
      disputeTypes,
      employerDefenses: defenses,
      evidence,
      lossReasons,
      legalBasis: caseItem.legalBasis || [],
      outcome: caseItem.decisionOutcome,
      compensationAmount: caseItem.compensationAmount,
      keywords,
      sectionsFound: {
        hasApplicantArguments: !!(caseItem.applicantArguments || sections.applicantArguments),
        hasRespondentArguments: !!(caseItem.respondentArguments || sections.respondentArguments),
        hasFacts: !!(caseItem.facts || sections.facts),
        hasReasoning: !!(caseItem.tribunalReasoning || sections.reasoning),
        hasDecision: !!(caseItem.decision || sections.decision),
      },
    };
  }

  /**
   * 2. 抗辩效果分析 (DefenseOutcomeAnalyzer)
   * 计算各抗辩类型的案件数、企业支持数、未支持数与支持率
   */
  public static analyzeDefenseOutcomes(cases: ArbitrationCase[]): DefenseOutcomeStat[] {
    const defenseMap: Record<
      string,
      {
        total: number;
        supported: number;
        unsupported: number;
        partial: number;
        allIds: Set<string>;
        supportedIds: Set<string>;
        unsupportedIds: Set<string>;
        evidenceCounts: Record<string, number>;
        lossReasonCounts: Record<string, number>;
      }
    > = {};

    for (const c of cases) {
      const profile = this.generateCaseProfile(c);

      for (const def of profile.employerDefenses) {
        const type = def.defenseType;
        if (!defenseMap[type]) {
          defenseMap[type] = {
            total: 0,
            supported: 0,
            unsupported: 0,
            partial: 0,
            allIds: new Set(),
            supportedIds: new Set(),
            unsupportedIds: new Set(),
            evidenceCounts: {},
            lossReasonCounts: {},
          };
        }

        defenseMap[type].total += 1;
        defenseMap[type].allIds.add(c.id);

        if (c.decisionOutcome === '用人单位胜诉') {
          defenseMap[type].supported += 1;
          defenseMap[type].supportedIds.add(c.id);
        } else if (c.decisionOutcome === '部分支持') {
          defenseMap[type].partial += 1;
          defenseMap[type].unsupported += 1;
          defenseMap[type].unsupportedIds.add(c.id);
        } else {
          defenseMap[type].unsupported += 1;
          defenseMap[type].unsupportedIds.add(c.id);
        }

        // 收集该抗辩搭配的证据
        for (const ev of profile.evidence) {
          defenseMap[type].evidenceCounts[ev.name] =
            (defenseMap[type].evidenceCounts[ev.name] || 0) + 1;
        }

        // 收集该抗辩败诉时的原因
        if (c.decisionOutcome !== '用人单位胜诉') {
          for (const lr of profile.lossReasons) {
            defenseMap[type].lossReasonCounts[lr.reason] =
              (defenseMap[type].lossReasonCounts[lr.reason] || 0) + 1;
          }
        }
      }
    }

    const results: DefenseOutcomeStat[] = Object.entries(defenseMap).map(([type, data]) => {
      const winRate = data.total > 0 ? Number(((data.supported / data.total) * 100).toFixed(2)) : 0;

      const topEvidence = Object.entries(data.evidenceCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([name]) => name);

      const commonLossReasons = Object.entries(data.lossReasonCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([reason]) => reason);

      return {
        defenseType: type,
        totalCount: data.total,
        supportedCount: data.supported,
        unsupportedCount: data.unsupported,
        partialCount: data.partial,
        winRate,
        sourceCaseIds: Array.from(data.allIds),
        supportedCaseIds: Array.from(data.supportedIds),
        unsupportedCaseIds: Array.from(data.unsupportedIds),
        topEvidence,
        commonLossReasons,
      };
    });

    return results.sort((a, b) => b.totalCount - a.totalCount);
  }

  /**
   * 3. 抗辩 + 证据组合效果分析 (Defense × Evidence × Outcome)
   */
  public static analyzeDefenseEvidenceCombo(cases: ArbitrationCase[]): DefenseEvidenceComboStat[] {
    const comboMap: Record<
      string,
      {
        defenseType: string;
        evidenceList: string[];
        total: number;
        supported: number;
        unsupported: number;
        caseIds: Set<string>;
        sampleCaseNumber?: string;
      }
    > = {};

    for (const c of cases) {
      const profile = this.generateCaseProfile(c);
      const defenses = profile.employerDefenses.map((d) => d.defenseType);
      const evidences = profile.evidence.map((e) => e.name);

      if (defenses.length === 0 || evidences.length === 0) continue;

      for (const def of defenses) {
        // 单证据组合
        for (const ev of evidences) {
          const comboKey = `${def} + ${ev}`;
          if (!comboMap[comboKey]) {
            comboMap[comboKey] = {
              defenseType: def,
              evidenceList: [ev],
              total: 0,
              supported: 0,
              unsupported: 0,
              caseIds: new Set(),
              sampleCaseNumber: c.caseNumber,
            };
          }

          comboMap[comboKey].total += 1;
          comboMap[comboKey].caseIds.add(c.id);

          if (c.decisionOutcome === '用人单位胜诉') {
            comboMap[comboKey].supported += 1;
          } else {
            comboMap[comboKey].unsupported += 1;
          }
        }

        // 双证据组合 (如有 2 个及以上证据)
        if (evidences.length >= 2) {
          for (let i = 0; i < evidences.length; i++) {
            for (let j = i + 1; j < evidences.length; j++) {
              const evPair = [evidences[i], evidences[j]].sort();
              const comboKey = `${def} + ${evPair[0]} + ${evPair[1]}`;

              if (!comboMap[comboKey]) {
                comboMap[comboKey] = {
                  defenseType: def,
                  evidenceList: evPair,
                  total: 0,
                  supported: 0,
                  unsupported: 0,
                  caseIds: new Set(),
                  sampleCaseNumber: c.caseNumber,
                };
              }

              comboMap[comboKey].total += 1;
              comboMap[comboKey].caseIds.add(c.id);

              if (c.decisionOutcome === '用人单位胜诉') {
                comboMap[comboKey].supported += 1;
              } else {
                comboMap[comboKey].unsupported += 1;
              }
            }
          }
        }
      }
    }

    const results: DefenseEvidenceComboStat[] = Object.entries(comboMap).map(
      ([comboKey, data], idx) => {
        const winRate = data.total > 0 ? Number(((data.supported / data.total) * 100).toFixed(2)) : 0;
        return {
          id: `combo_${idx}`,
          defenseType: data.defenseType,
          evidenceList: data.evidenceList,
          comboKey,
          totalCount: data.total,
          supportedCount: data.supported,
          unsupportedCount: data.unsupported,
          winRate,
          sourceCaseIds: Array.from(data.caseIds),
          sampleCaseNumber: data.sampleCaseNumber,
        };
      }
    );

    return results
      .filter((r) => r.totalCount >= 1)
      .sort((a, b) => b.totalCount - a.totalCount || b.winRate - a.winRate);
  }

  /**
   * 4. 败诉原因统计 (LossReasonStats)
   * 统计公司败诉案件中各败诉原因的数量、占比及关联抗辩
   */
  public static analyzeLossReasons(cases: ArbitrationCase[]): LossReasonStat[] {
    const lossCases = cases.filter(
      (c) => c.decisionOutcome === '用人单位败诉' || c.decisionOutcome === '部分支持'
    );
    const totalLossCount = lossCases.length || 1;

    const reasonMap: Record<
      string,
      {
        count: number;
        caseIds: Set<string>;
        involvedDefenses: Record<string, number>;
        sampleCases: Array<{ caseId: string; caseNumber: string; title: string; snippet?: string }>;
      }
    > = {};

    for (const c of lossCases) {
      const profile = this.generateCaseProfile(c);

      for (const lr of profile.lossReasons) {
        if (!reasonMap[lr.reason]) {
          reasonMap[lr.reason] = {
            count: 0,
            caseIds: new Set(),
            involvedDefenses: {},
            sampleCases: [],
          };
        }

        reasonMap[lr.reason].count += 1;
        reasonMap[lr.reason].caseIds.add(c.id);

        if (reasonMap[lr.reason].sampleCases.length < 5) {
          reasonMap[lr.reason].sampleCases.push({
            caseId: c.id,
            caseNumber: c.caseNumber,
            title: c.title,
            snippet: lr.reasoningSnippet || lr.matchedText,
          });
        }

        for (const def of profile.employerDefenses) {
          reasonMap[lr.reason].involvedDefenses[def.defenseType] =
            (reasonMap[lr.reason].involvedDefenses[def.defenseType] || 0) + 1;
        }
      }
    }

    const results: LossReasonStat[] = Object.entries(reasonMap).map(([reason, data]) => {
      const percentage = Number(((data.count / totalLossCount) * 100).toFixed(2));
      const involvedDefenses = Object.entries(data.involvedDefenses)
        .sort((a, b) => b[1] - a[1])
        .map(([defense, count]) => ({ defense, count }));

      return {
        reason,
        count: data.count,
        percentage,
        involvedDefenses,
        sourceCaseIds: Array.from(data.caseIds),
        sampleCases: data.sampleCases,
      };
    });

    return results.sort((a, b) => b.count - a.count);
  }

  /**
   * 5. 查找相似案件 (SimilarCaseFinder)
   * 基于 TF-IDF 向量 + Cosine Similarity，并结合争议、抗辩、证据加权
   */
  public static findSimilarCases(
    targetCase: ArbitrationCase,
    allCases: ArbitrationCase[],
    limit: number = 10
  ): SimilarCaseResult[] {
    if (!targetCase || !allCases || allCases.length <= 1) return [];

    const targetProfile = this.generateCaseProfile(targetCase);
    const targetText = `${targetCase.title} ${targetCase.claims.join(' ')} ${targetCase.facts} ${targetCase.tribunalReasoning}`;
    const targetDefenses = new Set(targetProfile.employerDefenses.map((d) => d.defenseType));
    const targetEvidence = new Set(targetProfile.evidence.map((e) => e.name));
    const targetDisputes = new Set(targetProfile.disputeTypes);

    const scores: SimilarCaseResult[] = [];

    for (const other of allCases) {
      if (other.id === targetCase.id) continue;

      const otherProfile = this.generateCaseProfile(other);
      const otherText = `${other.title} ${other.claims.join(' ')} ${other.facts} ${other.tribunalReasoning}`;

      // 1. TF-IDF 文本余弦相似度 (基准权重 0.5)
      const textSim = TfIdfEngine.calculateCosineSimilarity(targetText, otherText);

      // 2. 争议类型重合度 (权重 0.2)
      const commonDisputes = otherProfile.disputeTypes.filter((d) => targetDisputes.has(d));
      const disputeSim =
        targetDisputes.size > 0 ? commonDisputes.length / targetDisputes.size : 0;

      // 3. 抗辩重合度 (权重 0.15)
      const otherDefenses = otherProfile.employerDefenses.map((d) => d.defenseType);
      const commonDefenses = otherDefenses.filter((d) => targetDefenses.has(d));
      const defenseSim =
        targetDefenses.size > 0 ? commonDefenses.length / Math.max(1, targetDefenses.size) : 0;

      // 4. 证据重合度 (权重 0.15)
      const otherEvidence = otherProfile.evidence.map((e) => e.name);
      const commonEvidence = otherEvidence.filter((e) => targetEvidence.has(e));
      const evidenceSim =
        targetEvidence.size > 0 ? commonEvidence.length / Math.max(1, targetEvidence.size) : 0;

      // 综合相似度得分 (0 - 100%)
      const finalScore = Math.min(
        99,
        Math.max(
          10,
          Math.round(
            (textSim * 0.5 + disputeSim * 0.2 + defenseSim * 0.15 + evidenceSim * 0.15) * 100
          )
        )
      );

      scores.push({
        caseItem: other,
        similarity: finalScore,
        commonDisputes,
        commonDefenses,
        commonEvidence,
        outcome: other.decisionOutcome,
      });
    }

    return scores.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  }

  /**
   * 6. 生成本地研究报告 (ResearchReportGenerator)
   * 纯本地统计分析，包含完整的12项要素及数据溯源
   */
  public static generateResearchReport(
    selectedCases: ArbitrationCase[],
    options: {
      disputeTypeFilter?: string;
      yearRange?: string;
    } = {}
  ): LocalResearchReport {
    const sampleSize = selectedCases.length;
    const now = new Date().toLocaleString('zh-CN', { hour12: false });

    // 1. 年度分布
    const yearDistribution: Record<string, number> = {};
    for (const c of selectedCases) {
      const y = c.year ? `${c.year}年` : '未知年份';
      yearDistribution[y] = (yearDistribution[y] || 0) + 1;
    }

    // 2. 争议类型分布
    const disputeCounts: Record<string, number> = {};
    for (const c of selectedCases) {
      const p = this.generateCaseProfile(c);
      for (const d of p.disputeTypes) {
        disputeCounts[d] = (disputeCounts[d] || 0) + 1;
      }
    }
    const disputeTypeDistribution = Object.entries(disputeCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({
        type,
        count,
        percentage: Number(((count / (sampleSize || 1)) * 100).toFixed(1)),
      }));

    // 3. 企业抗辩分布
    const defenseCounts: Record<string, number> = {};
    for (const c of selectedCases) {
      const p = this.generateCaseProfile(c);
      for (const def of p.employerDefenses) {
        defenseCounts[def.defenseType] = (defenseCounts[def.defenseType] || 0) + 1;
      }
    }
    const employerDefenseDistribution = Object.entries(defenseCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([defense, count]) => ({
        defense,
        count,
        percentage: Number(((count / (sampleSize || 1)) * 100).toFixed(1)),
      }));

    // 4. 证据分布
    const evidenceCounts: Record<string, number> = {};
    for (const c of selectedCases) {
      const p = this.generateCaseProfile(c);
      for (const ev of p.evidence) {
        evidenceCounts[ev.name] = (evidenceCounts[ev.name] || 0) + 1;
      }
    }
    const evidenceDistribution = Object.entries(evidenceCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([evidence, count]) => ({
        evidence,
        count,
        percentage: Number(((count / (sampleSize || 1)) * 100).toFixed(1)),
      }));

    // 5. 裁决结果分布
    const outcomeDistribution: Record<DecisionOutcome, number> = {
      用人单位胜诉: 0,
      用人单位败诉: 0,
      部分支持: 0,
      '调解/其他': 0,
    };
    for (const c of selectedCases) {
      if (outcomeDistribution[c.decisionOutcome] !== undefined) {
        outcomeDistribution[c.decisionOutcome] += 1;
      }
    }

    // 6. 抗辩成功率
    const defenseOutcomes = this.analyzeDefenseOutcomes(selectedCases);

    // 7. 组合效果
    const comboOutcomes = this.analyzeDefenseEvidenceCombo(selectedCases).slice(0, 15);

    // 8. 败诉原因
    const lossReasons = this.analyzeLossReasons(selectedCases);

    // 9. TF-IDF 关键词
    const docCorpus = selectedCases.map((c) => ({
      id: c.id,
      text: `${c.title} ${c.claims.join(' ')} ${c.facts} ${c.tribunalReasoning}`,
    }));
    const topKeywords = TfIdfEngine.computeCorpusTfIdf(docCorpus, 30, 1);

    // 10. 高频共现词
    const topCooccurrences = CooccurrenceEngine.analyze(selectedCases).slice(0, 20);

    // 11. 代表性案例
    const representativeCases = selectedCases.slice(0, 8).map((c) => {
      const p = this.generateCaseProfile(c);
      return {
        caseId: c.id,
        caseNumber: c.caseNumber,
        title: c.title,
        outcome: c.decisionOutcome,
        defenses: p.employerDefenses.map((d) => d.defenseType),
        evidence: p.evidence.map((e) => e.name),
        lossReasons: p.lossReasons.map((lr) => lr.reason),
      };
    });

    return {
      generatedAt: now,
      filterSummary: {
        totalSampleCount: sampleSize,
        disputeTypeFilter: options.disputeTypeFilter || '全部争议类型',
        yearRange: options.yearRange || '全部收录年份',
      },
      sampleSize,
      yearDistribution,
      disputeTypeDistribution,
      employerDefenseDistribution,
      evidenceDistribution,
      outcomeDistribution,
      defenseOutcomes,
      comboOutcomes,
      lossReasons,
      topKeywords,
      topCooccurrences,
      representativeCases,
      disclaimer: '本地文本分析结果仅用于案例研究和统计，不构成法律意见。',
    };
  }
}
