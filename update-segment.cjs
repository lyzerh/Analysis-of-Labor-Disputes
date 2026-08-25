const fs = require('fs');
let code = fs.readFileSync('src/services/parser/LaborInfoParserAdapter.ts', 'utf8');

const newSegmentLogic = `
  private static segmentText(text: string): {
    applicantArgs?: string;
    respondentArgs?: string;
    facts?: string;
    reasoning?: string;
    decision?: string;
  } {
    const sections: {
      applicantArgs?: string;
      respondentArgs?: string;
      facts?: string;
      reasoning?: string;
      decision?: string;
    } = {};

    // 诉称
    const appArgsMatch = text.match(/(?:(?:原告|申请人|上诉人)(?:提出)?(?:诉称|称|上诉称|主张)|申请仲裁称|原告向本院提出诉讼请求：)[，：:\\s]+([\\s\\S]*?)(?=(?:(?:被告|被上诉人|被申请人)(?:辩称|答辩|称|主张)|经审理查明|本院经审理查明|查明|本案相关情况|仲裁庭查明|法院查明|本院认为))/);
    if (appArgsMatch) sections.applicantArgs = appArgsMatch[1].trim().slice(0, 1500);

    // 答辩
    const respArgsMatch = text.match(/(?:(?:被告|被上诉人|被申请人|公司|用人单位)(?:辩称|答辩称|答辩|称|主张))[，：:\\s]+([\\s\\S]*?)(?=(?:经审理查明|本院经审理查明|查明|本案相关情况|仲裁庭查明|法院查明|本院认为|仲裁庭认为|本院经审理认为|本庭认为))/);
    if (respArgsMatch) sections.respondentArgs = respArgsMatch[1].trim().slice(0, 1500);

    // 查明事实
    const factsMatch = text.match(/(?:经审理查明|本院经审理查明|查明|本案相关情况|仲裁庭查明|法院查明)[，：:\\s]+([\\s\\S]*?)(?=(?:本院认为|法院认为|本院经审理认为|本院认为：|经审理，本院认为|本院综合认为|综上|本院评析|裁判理由|仲裁庭认为|本庭认为|依照《))/);
    if (factsMatch) sections.facts = factsMatch[1].trim();

    // 裁判说理
    const reasoningMatch = text.match(/(?:本院认为|法院认为|本院经审理认为|本院认为：|经审理，本院认为|本院综合认为|本院评析|裁判理由|仲裁庭认为|本庭认为)[，：:\\s]+([\\s\\S]*?)(?=(?:判决如下|裁决如下|裁定如下|据此|综上，依照|综上所述，依照))/);
    if (reasoningMatch) {
       sections.reasoning = reasoningMatch[1].trim();
    } else {
       // fallback reasoning search
       const fallbackReason = text.match(/(?:综上)[，：:\\s]+([\\s\\S]*?)(?=(?:判决如下|裁决如下|裁定如下))/);
       if (fallbackReason) sections.reasoning = fallbackReason[1].trim();
    }

    // 裁判主文
    const decisionMatch = text.match(/(?:判决如下|裁决如下|裁定如下|本院判决|综上)[：:\\s]+([\\s\\S]*?)(?=(?:如不服|审\\s*判\\s*长|审\\s*判\\s*员|仲\\s*裁\\s*员|书\\s*记\\s*员|$))/);
    if (decisionMatch) sections.decision = decisionMatch[1].trim();

    return sections;
  }
`;

const regex = /private static segmentText\([\s\S]*?return sections;\n  }/;
code = code.replace(regex, newSegmentLogic.trim());
fs.writeFileSync('src/services/parser/LaborInfoParserAdapter.ts', code);
console.log('Patched segmentText');
