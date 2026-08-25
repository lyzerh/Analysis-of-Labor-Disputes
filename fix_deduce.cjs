const fs = require('fs');
let code = fs.readFileSync('src/services/analytics/DefenseStrategyAnalyzer.ts', 'utf-8');

const newDeduce = `  private static deduceDefenseOutcome(record: AnalysisCaseRecord, defenseType: string): LegalOutcomeType {
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
  }`;

// Use a cleaner regex to replace everything from "private static deduceDefenseOutcome" up to "private static analyzeEvidenceAssociations"
code = code.replace(/private static deduceDefenseOutcome[\s\S]*?(?=\/\*\*[\s\n\*]*证据及证据组合关联分析)/, newDeduce + '\n\n  ');

fs.writeFileSync('src/services/analytics/DefenseStrategyAnalyzer.ts', code);
