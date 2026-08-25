/**
 * 深圳劳动仲裁文书本地研究库 - 词语共现分析引擎 (CooccurrenceEngine)
 * 分析抗辩策略、证据类型、败诉原因与裁决结果之间的关联共现关系
 */

import { CooccurrenceCell, ArbitrationCase } from '../../types';
import { LocalAnalysisService } from './LocalAnalysisService';

export class CooccurrenceEngine {
  /**
   * 计算一组案件中的高频词共现关系
   */
  public static analyze(cases: ArbitrationCase[]): CooccurrenceCell[] {
    if (!cases || cases.length === 0) return [];

    const pairCounts: Record<string, { count: number; caseIds: Set<string>; wordA: string; wordB: string }> = {};
    const singleCounts: Record<string, number> = {};

    for (const c of cases) {
      const profile = LocalAnalysisService.generateCaseProfile(c, c.facts + '\n' + c.tribunalReasoning);

      // 提取核心研究维度标签
      const features: string[] = [];

      // 1. 争议类型
      for (const d of profile.disputeTypes.slice(0, 3)) {
        features.push(`[争议]${d}`);
      }

      // 2. 企业抗辩
      for (const def of profile.employerDefenses) {
        features.push(`[抗辩]${def.defenseType}`);
      }

      // 3. 证据
      for (const ev of profile.evidence) {
        features.push(`[证据]${ev.name}`);
      }

      // 4. 败诉原因
      for (const lr of profile.lossReasons) {
        features.push(`[败因]${lr.reason}`);
      }

      // 5. 裁决结果
      if (c.decisionOutcome) {
        features.push(`[结果]${c.decisionOutcome}`);
      }

      const uniqueFeatures = Array.from(new Set(features));

      // 统计单个特征频次
      for (const f of uniqueFeatures) {
        singleCounts[f] = (singleCounts[f] || 0) + 1;
      }

      // 统计两两组合共现
      for (let i = 0; i < uniqueFeatures.length; i++) {
        for (let j = i + 1; j < uniqueFeatures.length; j++) {
          const wA = uniqueFeatures[i];
          const wB = uniqueFeatures[j];
          // 保证键值有序
          const key = wA < wB ? `${wA}___${wB}` : `${wB}___${wA}`;

          if (!pairCounts[key]) {
            pairCounts[key] = {
              count: 0,
              caseIds: new Set(),
              wordA: wA < wB ? wA : wB,
              wordB: wA < wB ? wB : wA,
            };
          }

          pairCounts[key].count += 1;
          pairCounts[key].caseIds.add(c.id);
        }
      }
    }

    const totalDocs = cases.length;
    const results: CooccurrenceCell[] = [];

    for (const [_, data] of Object.entries(pairCounts)) {
      if (data.count >= 1) {
        const countA = singleCounts[data.wordA] || 1;
        const countB = singleCounts[data.wordB] || 1;

        // Jaccard 相似系数 / 相关度
        const union = countA + countB - data.count;
        const correlation = union > 0 ? Number((data.count / union).toFixed(3)) : 0;

        results.push({
          wordA: data.wordA,
          wordB: data.wordB,
          count: data.count,
          correlation,
          sourceCaseIds: Array.from(data.caseIds),
        });
      }
    }

    return results
      .sort((a, b) => b.count - a.count || b.correlation - a.correlation)
      .slice(0, 80);
  }
}
