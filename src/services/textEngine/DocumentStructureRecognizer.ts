/**
 * 深圳劳动仲裁文书本地研究库 - 文书结构识别器 (DocumentStructureRecognizer)
 * 采用规则 + 正则 + 标题/段落模式多重判定，无法识别时返回 null。
 */

import { TextProcessor } from './TextProcessor';

export interface DocumentStructure {
  caseNumber: string | null;
  committee: string | null;
  applicant: string | null;
  respondent: string | null;
  claims: string[] | null;
  applicantArguments: string | null;
  respondentArguments: string | null;
  evidenceText: string | null;
  facts: string | null;
  tribunalReasoning: string | null;
  decision: string | null;
  legalBasis: string[] | null;
}

export class DocumentStructureRecognizer {
  /**
   * 结构化识别全文内容
   */
  public static recognize(text: string): DocumentStructure {
    if (!text || text.trim().length === 0) {
      return {
        caseNumber: null,
        committee: null,
        applicant: null,
        respondent: null,
        claims: null,
        applicantArguments: null,
        respondentArguments: null,
        evidenceText: null,
        facts: null,
        tribunalReasoning: null,
        decision: null,
        legalBasis: null,
      };
    }

    const clean = TextProcessor.normalizePunctuation(TextProcessor.removeBoilerplate(text));
    const sections = TextProcessor.recognizeSections(clean);
    const entities = TextProcessor.extractEntities(clean);

    // 仲裁请求切分
    let claims: string[] | null = null;
    if (sections.claims) {
      const splitClaims = sections.claims
        .split(/(?:[1-9一二三四五六七八九十][、\.：:]|\n)/)
        .map((c) => c.trim())
        .filter((c) => c.length >= 4 && !c.startsWith('仲裁请求'));
      if (splitClaims.length > 0) {
        claims = splitClaims;
      } else {
        claims = [sections.claims.slice(0, 300)];
      }
    }

    // 法律依据提取
    const legalArticles = TextProcessor.extractLegalArticles(clean);
    const legalBasisList = legalArticles.length > 0
      ? Array.from(new Set(legalArticles.map((a) => `《${a.lawName}》${a.article}`)))
      : null;

    return {
      caseNumber: entities.caseNumber || null,
      committee: entities.committee || null,
      applicant: entities.applicantName || null,
      respondent: entities.respondentName || null,
      claims: claims && claims.length > 0 ? claims : null,
      applicantArguments: sections.applicantArguments || null,
      respondentArguments: sections.respondentArguments || null,
      evidenceText: sections.evidence || null,
      facts: sections.facts || null,
      tribunalReasoning: sections.reasoning || null,
      decision: sections.decision || null,
      legalBasis: legalBasisList,
    };
  }
}
