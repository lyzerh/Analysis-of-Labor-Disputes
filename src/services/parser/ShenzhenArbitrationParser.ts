import { BaseParser } from './BaseParser';
import { RawDocument, ArbitrationCase, ParseStatus } from '../../types';
import { ParserUtils } from './ParserUtils';

export class ShenzhenArbitrationParser extends BaseParser {
  public canHandle(_doc: RawDocument): boolean {
    return true; // 默认通用解析器，兼容深圳及珠三角仲裁裁决与裁判
  }

  public async parse(doc: RawDocument): Promise<ArbitrationCase> {
    const rawText = doc.rawText || this.extractTextFromHtml(doc.rawHtml || '');
    const cleanContent = this.cleanText(rawText);

    // 1. 案号识别
    let caseNumber = ParserUtils.extractCaseNumber(cleanContent) || ParserUtils.extractCaseNumber(doc.title);
    if (!caseNumber) {
      caseNumber = '';
    }

    // 2. 仲裁委员会
    const arbitrationCommittee = ParserUtils.extractCommittee(cleanContent) || '';

    // 3. 日期与年份
    const { dateStr, year, month } = ParserUtils.extractDate(cleanContent);

    // 4. 当事人提取
    const { applicant, respondent, applicantIsEmployee } = ParserUtils.extractParties(cleanContent);

    // 5. 仲裁请求提取
    const claims = this.extractClaims(cleanContent);

    // 6. 查明事实提取
    const facts = this.extractFacts(cleanContent);

    // 7. 双方观点
    const applicantArguments = this.extractSection(cleanContent, [
      '申请人诉称',
      '申请人向本委提出',
      '申请人主张',
      '申请人申诉称',
      '申请人称',
    ], ['被申请人辩称', '被申请人答辩', '经审理查明', '本委查明', '经本委审理查明']);

    const respondentArguments = this.extractSection(cleanContent, [
      '被申请人辩称',
      '被申请人答辩称',
      '被申请人辩称：',
      '被申请人答辩',
      '被申请人称',
    ], ['经审理查明', '本委查明', '经本委审理查明', '本委认为', '裁决如下']);

    // 8. 仲裁庭认定与说理
    const tribunalReasoning = this.extractReasoning(cleanContent);

    // 9. 裁决结果
    const decision = this.extractDecision(cleanContent);

    // 10. 法律条文
    const legalBasis = ParserUtils.extractLegalBasis(cleanContent);

    // 11. 争议标签
    const disputeTags = ParserUtils.generateDisputeTags(cleanContent);

    // 12. 裁决金额计算
    const compensationAmount = decision ? this.extractCompensationAmount(decision) : undefined;

    // 13. 裁决倾向判定
    const decisionOutcome = ParserUtils.determineDecisionOutcome(decision || '', cleanContent);

    // 14. 质量评分计算
    const quality = ParserUtils.calculateQualityScore({
      caseNumber: !!caseNumber && caseNumber.length > 4,
      date: dateStr !== null,
      committee: !!arbitrationCommittee && arbitrationCommittee.length > 4,
      parties: !!applicant && applicant !== '未载明' && !!respondent && respondent !== '未载明',
      claims: claims.length > 0,
      facts: !!facts && facts.length > 15,
      reasoning: !!tribunalReasoning && tribunalReasoning.length > 15,
      decision: !!decision && decision.length > 8,
    });

    let parseStatus: ParseStatus = 'success';
    if (quality.overall < 40) {
      parseStatus = 'failed';
    } else if (quality.overall < 75) {
      parseStatus = 'partial';
    }

    const title =
      doc.title && doc.title.length > 3
        ? doc.title
        : applicant && respondent && applicant !== '未载明' && respondent !== '未载明'
        ? `${applicant}与${respondent}劳动争议仲裁案`
        : caseNumber || '未载明标题仲裁裁决书';

    return {
      id: doc.id,
      rawDocumentId: doc.id,
      source: doc.source || '深圳市人力资源和社会保障局',
      sourceUrl: doc.sourceUrl,
      title,
      caseNumber: caseNumber || '未载明案号',
      publishedDate: dateStr || doc.publishedAt || (year ? `${year}-01-01` : undefined),
      year: year || new Date().getFullYear(),
      month,
      arbitrationCommittee,
      applicant: applicant || '未载明',
      respondent: respondent || '未载明',
      applicantIsEmployee,
      claims,
      facts,
      applicantArguments: applicantArguments || undefined,
      respondentArguments: respondentArguments || undefined,
      tribunalReasoning,
      decision,
      compensationAmount,
      decisionOutcome,
      legalBasis,
      disputeTags,
      parseStatus,
      parseQuality: quality,
      parsedAt: new Date().toISOString(),
    };
  }

  private extractClaims(text: string): string[] {
    const claims: string[] = [];
    const claimHeaderMatch = text.match(/(?:申请人向本委提出(?:如下)?仲裁请求|申请人的仲裁请求为|申请人诉求|仲裁请求)[：:\s]*([\s\S]*?)(?=(?:被申请人辩称|被申请人答辩|经本委审理查明|本委查明|经审理查明|双方确认的事实))/);

    if (claimHeaderMatch && claimHeaderMatch[1]) {
      const block = claimHeaderMatch[1].trim();
      const lines = block.split('\n');
      for (const line of lines) {
        const item = line.trim();
        if (/^[0-9一二三四五六七八九十]、?[\.、\s]/.test(item) || /^[（(][0-9一二三四五六七八九十]+[）)]/.test(item)) {
          claims.push(item);
        }
      }
      if (claims.length === 0 && block.length > 0) {
        claims.push(block.slice(0, 300));
      }
    }

    if (claims.length === 0) {
      const matches = text.match(/[0-9一二三四五六七八九十][、\.][^。\n]{5,100}。/g);
      if (matches && matches.length > 0) {
        return matches.slice(0, 8);
      }
    }

    return claims;
  }

  private extractFacts(text: string): string {
    const match = text.match(/(?:经(?:本委)?审理查明|本委查明事实如下|查明事实|双方无争议事实)[：:\s]*([\s\S]*?)(?=(?:本委认为|仲裁庭认为|仲裁庭评述|依照.*裁决如下|裁决如下))/);
    if (match && match[1]) {
      return match[1].trim().slice(0, 3000);
    }
    return '';
  }

  private extractReasoning(text: string): string {
    const match = text.match(/(?:本委认为|仲裁庭认为|仲裁庭评述|关于双方争议焦点)[：:\s]*([\s\S]*?)(?=(?:综上|依照.*裁决如下|据此.*裁决如下|裁决如下))/);
    if (match && match[1]) {
      return match[1].trim();
    }
    return '';
  }

  private extractDecision(text: string): string {
    const match = text.match(/(?:依照.*(?:规定)?裁决如下|裁决如下)[：:\s]*([\s\S]*?)(?=(?:本裁决为终局裁决|如不服本裁决|当事人对本裁决不服|仲裁员|书记员|$))/);
    if (match && match[1]) {
      return match[1].trim();
    }
    return '';
  }

  private extractSection(text: string, startKeywords: string[], stopKeywords: string[]): string | null {
    for (const start of startKeywords) {
      const idx = text.indexOf(start);
      if (idx !== -1) {
        const after = text.slice(idx + start.length);
        let endIdx = after.length;
        for (const stop of stopKeywords) {
          const sIdx = after.indexOf(stop);
          if (sIdx !== -1 && sIdx < endIdx) {
            endIdx = sIdx;
          }
        }
        return after.slice(0, endIdx).trim().replace(/^[:：\s]+/, '');
      }
    }
    return null;
  }

  private extractCompensationAmount(decisionText: string): number | undefined {
    // 匹配如：支付...人民币12,345.67元 / 支付...30000元
    const moneyMatches = Array.from(
      decisionText.matchAll(/(?:支付|赔偿|补偿|返还)[^0-9元]*?([0-9,]+(?:\.[0-9]{1,2})?)\s*元/g)
    );
    if (moneyMatches.length > 0) {
      let total = 0;
      for (const m of moneyMatches) {
        const numStr = m[1].replace(/,/g, '');
        const val = parseFloat(numStr);
        if (!isNaN(val) && val > 0 && val < 5000000) {
          total += val;
        }
      }
      return total > 0 ? Math.round(total * 100) / 100 : undefined;
    }
    return undefined;
  }
}
