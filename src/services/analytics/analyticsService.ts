import { db } from '../../db';
import { ArbitrationCase } from '../../types';

export class AnalyticsService {
  /**
   * 获取首页仪表盘统计总览
   */
  public static async getDashboardOverview() {
    const allCases = await db.arbitrationCases.toArray();
    const allDocs = await db.rawDocuments.toArray();

    const totalCases = allCases.length;
    const totalDocs = allDocs.length;

    if (totalCases === 0) {
      return {
        totalCases: 0,
        totalDocs: 0,
        totalCommittees: 0,
        yearRange: `${new Date().getFullYear()}`,
        topDisputeTag: '暂无数据',
        companyWinCount: 0,
        companyLossCount: 0,
        partialWinCount: 0,
        settlementCount: 0,
        companyWinRate: 0,
        employeeWinRate: 0,
        partialRate: 0,
        settlementRate: 0,
        totalCompensation: 0,
        avgQualityScore: 0,
        recentCases: [],
      };
    }

    const committees = new Set(allCases.map((c) => c.arbitrationCommittee).filter(Boolean));
    const years = allCases.map((c) => c.year).filter((y) => y && y > 1990 && y < 2050);
    const minYear = years.length > 0 ? Math.min(...years) : new Date().getFullYear();
    const maxYear = years.length > 0 ? Math.max(...years) : new Date().getFullYear();

    let companyWinCount = 0;
    let companyLossCount = 0;
    let partialWinCount = 0;
    let settlementCount = 0;
    let totalCompensation = 0;
    let totalQuality = 0;

    const tagCounts: Record<string, number> = {};

    allCases.forEach((c) => {
      if (c.decisionOutcome === '用人单位胜诉') companyWinCount++;
      else if (c.decisionOutcome === '用人单位败诉') companyLossCount++;
      else if (c.decisionOutcome === '部分支持') partialWinCount++;
      else settlementCount++;

      if (c.compensationAmount) totalCompensation += c.compensationAmount;
      if (c.parseQuality) totalQuality += c.parseQuality.overall;

      if (Array.isArray(c.disputeTags)) {
        c.disputeTags.forEach((t) => {
          tagCounts[t] = (tagCounts[t] || 0) + 1;
        });
      }
    });

    let topDisputeTag = '劳动报酬争议';
    let maxTagCount = 0;
    Object.entries(tagCounts).forEach(([tag, count]) => {
      if (count > maxTagCount) {
        maxTagCount = count;
        topDisputeTag = tag;
      }
    });

    const recentCases = await db.arbitrationCases.orderBy('parsedAt').reverse().limit(6).toArray();

    return {
      totalCases,
      totalDocs,
      totalCommittees: committees.size,
      yearRange: minYear === maxYear ? `${minYear}年` : `${minYear} - ${maxYear}年`,
      topDisputeTag,
      companyWinCount,
      companyLossCount,
      partialWinCount,
      settlementCount,
      companyWinRate: Math.round((companyWinCount / totalCases) * 100),
      employeeWinRate: Math.round((companyLossCount / totalCases) * 100),
      partialRate: Math.round((partialWinCount / totalCases) * 100),
      settlementRate: Math.round((settlementCount / totalCases) * 100),
      totalCompensation: Math.round(totalCompensation),
      avgQualityScore: Math.round(totalQuality / totalCases),
      recentCases,
    };
  }

  /**
   * 按年度趋势统计
   */
  public static async getCasesByYear() {
    const allCases = await db.arbitrationCases.toArray();
    const yearMap: Record<number, { year: number; total: number; win: number; loss: number; partial: number }> = {};

    allCases.forEach((c) => {
      const y = c.year || 2024;
      if (!yearMap[y]) {
        yearMap[y] = { year: y, total: 0, win: 0, loss: 0, partial: 0 };
      }
      yearMap[y].total++;
      if (c.decisionOutcome === '用人单位胜诉') yearMap[y].win++;
      else if (c.decisionOutcome === '用人单位败诉') yearMap[y].loss++;
      else yearMap[y].partial++;
    });

    return Object.values(yearMap).sort((a, b) => a.year - b.year);
  }

  /**
   * 按仲裁委统计
   */
  public static async getCasesByCommittee() {
    const allCases = await db.arbitrationCases.toArray();
    const map: Record<string, { committee: string; count: number; win: number; loss: number; partial: number }> = {};

    allCases.forEach((c) => {
      const comm = c.arbitrationCommittee || '其他仲裁机构';
      const shortName =
        comm.replace('深圳市', '').replace('劳动人事争议仲裁委员会', '').replace('劳动争议仲裁委员会', '') ||
        '市直属';
      if (!map[shortName]) {
        map[shortName] = { committee: shortName, count: 0, win: 0, loss: 0, partial: 0 };
      }
      map[shortName].count++;
      if (c.decisionOutcome === '用人单位胜诉') map[shortName].win++;
      else if (c.decisionOutcome === '用人单位败诉') map[shortName].loss++;
      else map[shortName].partial++;
    });

    return Object.values(map)
      .map((item) => ({
        ...item,
        winRate: item.count > 0 ? Math.round((item.win / item.count) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * 争议焦点类型分布
   */
  public static async getDisputeTagDistribution() {
    const allCases = await db.arbitrationCases.toArray();
    const total = allCases.length;
    const map: Record<string, number> = {};

    allCases.forEach((c) => {
      if (Array.isArray(c.disputeTags)) {
        c.disputeTags.forEach((t) => {
          map[t] = (map[t] || 0) + 1;
        });
      }
    });

    return Object.entries(map)
      .map(([tag, count]) => ({
        tag,
        count,
        percent: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  public static async getCasesByTag() {
    return this.getDisputeTagDistribution();
  }

  /**
   * 裁决结果分布
   */
  public static async getDecisionDistribution() {
    const allCases = await db.arbitrationCases.toArray();
    const map: Record<string, number> = {
      用人单位胜诉: 0,
      用人单位败诉: 0,
      部分支持: 0,
      '调解/其他': 0,
    };

    allCases.forEach((c) => {
      const outcome = c.decisionOutcome || '部分支持';
      map[outcome] = (map[outcome] || 0) + 1;
    });

    const colors: Record<string, string> = {
      用人单位胜诉: '#10b981', // 绿色
      部分支持: '#3b82f6', // 蓝色
      用人单位败诉: '#ef4444', // 红色
      '调解/其他': '#8b5cf6', // 紫色
    };

    return Object.entries(map).map(([name, value]) => ({
      name,
      value,
      color: colors[name] || '#64748b',
    }));
  }

  /**
   * 高频法务关键词词频统计
   */
  public static async getKeywordFrequency() {
    const allCases = await db.arbitrationCases.toArray();
    const targetKeywords = [
      { word: '严重违反规章制度', category: '劳动纪律' },
      { word: '旷工', category: '考勤管理' },
      { word: '通知工会', category: '法定程序' },
      { word: '员工手册', category: '规章制度' },
      { word: '电子签名', category: '合同订立' },
      { word: '加班费', category: '薪酬工时' },
      { word: '特殊工时制', category: '工时审批' },
      { word: '绩效考核', category: '薪酬激励' },
      { word: '年终奖', category: '薪酬福利' },
      { word: '调岗降薪', category: '用工自主' },
      { word: '经济补偿金', category: '合同解除' },
      { word: '未签劳动合同', category: '二倍工资' },
      { word: '竞业限制', category: '保密合规' },
      { word: '工伤待遇', category: '安全保障' },
    ];

    const results = targetKeywords.map((item) => {
      let count = 0;
      allCases.forEach((c) => {
        const fullContent = `${c.title} ${c.facts} ${c.tribunalReasoning} ${c.decision} ${c.applicantArguments || ''} ${c.respondentArguments || ''}`;
        if (fullContent.includes(item.word)) {
          count++;
        }
      });
      return {
        keyword: item.word,
        category: item.category,
        count,
        percent: allCases.length > 0 ? Math.round((count / allCases.length) * 100) : 0,
      };
    });

    return results.sort((a, b) => b.count - a.count);
  }

  /**
   * 法律法条援引排行榜
   */
  public static async getLegalBasisFrequency() {
    const allCases = await db.arbitrationCases.toArray();
    const map: Record<string, number> = {};

    allCases.forEach((c) => {
      if (Array.isArray(c.legalBasis)) {
        c.legalBasis.forEach((l) => {
          map[l] = (map[l] || 0) + 1;
        });
      }
    });

    return Object.entries(map)
      .map(([law, count]) => ({ law, count }))
      .sort((a, b) => b.count - a.count);
  }

  public static async getLegalBasisRanking() {
    return this.getLegalBasisFrequency();
  }

  /**
   * 数据质量诊断
   */
  public static async getDataQualityStats() {
    const allDocs = await db.rawDocuments.toArray();
    const allCases = await db.arbitrationCases.toArray();

    const totalDocs = allDocs.length;
    let perfectCases = 0;
    let partialCases = 0;
    let failedCases = 0;
    let duplicateDocs = 0;
    let emptyDocs = 0;

    let caseNumberCount = 0;
    let dateCount = 0;
    let partiesCount = 0;
    let claimsCount = 0;
    let factsCount = 0;
    let reasoningCount = 0;
    let decisionCount = 0;

    const issues: Array<{
      case: ArbitrationCase;
      score: number;
      unrecognized: string[];
    }> = [];

    allDocs.forEach((d) => {
      if (d.duplicateOf) duplicateDocs++;
      if (!d.rawText || d.rawText.length < 50) emptyDocs++;
    });

    allCases.forEach((c) => {
      const score = c.parseQuality?.overall || 0;
      if (score >= 80) perfectCases++;
      else if (score >= 60) partialCases++;
      else failedCases++;

      if (c.parseQuality) {
        if (c.parseQuality.caseNumber) caseNumberCount++;
        if (c.parseQuality.date) dateCount++;
        if (c.parseQuality.parties) partiesCount++;
        if (c.parseQuality.claims) claimsCount++;
        if (c.parseQuality.facts) factsCount++;
        if (c.parseQuality.reasoning) reasoningCount++;
        if (c.parseQuality.decision) decisionCount++;

        if (score < 80) {
          issues.push({
            case: c,
            score,
            unrecognized: c.parseQuality.unrecognizedFields || [],
          });
        }
      }
    });

    const totalCases = allCases.length || 1;

    return {
      totalDocs,
      perfectCases,
      partialCases,
      failedCases,
      duplicateDocs,
      emptyDocs,
      fieldAccuracy: {
        caseNumber: Math.round((caseNumberCount / totalCases) * 100),
        date: Math.round((dateCount / totalCases) * 100),
        parties: Math.round((partiesCount / totalCases) * 100),
        claims: Math.round((claimsCount / totalCases) * 100),
        facts: Math.round((factsCount / totalCases) * 100),
        reasoning: Math.round((reasoningCount / totalCases) * 100),
        decision: Math.round((decisionCount / totalCases) * 100),
      },
      issues: issues.sort((a, b) => a.score - b.score),
    };
  }
}
