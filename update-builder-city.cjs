const fs = require('fs');
let code = fs.readFileSync('src/services/dataset/LaborCaseDatasetBuilder.ts', 'utf8');

// Add CityResolver import if not there
if (!code.includes('CityResolver')) {
   code = code.replace("import { LaborInfoParserAdapter }", "import { CityResolver } from '../parser/CityResolver';\nimport { LaborInfoParserAdapter }");
}

const newDetectCityLogic = `
  private static detectCityAndPRD(
    rawDoc: RawDocument,
    parsed: LaborInfoParsedResult
  ): { city: string; isPRD: boolean } {
    // 优先使用 Parser 内部的 CityResolver 结果
    if (parsed.arbitrationCase && (parsed.arbitrationCase as any).city) {
         let resolvedCity = (parsed.arbitrationCase as any).city;
         // 如果它是“xx市”，去掉“市”
         resolvedCity = resolvedCity.replace('市', '');
         const isPrd = PRD_CITIES.some(p => p.name === resolvedCity || p.aliases.includes(resolvedCity));
         return { city: resolvedCity, isPRD: isPrd };
    }

    const location = CityResolver.resolveCity({
        court: parsed.court,
        caseNumber: parsed.caseNumber,
        rawText: rawDoc.rawText
    });
    
    let city = location.city || '其他城市';
    city = city.replace('市', '');
    
    const isPRD = PRD_CITIES.some(p => p.name === city || p.aliases.includes(city));
    
    return { city, isPRD };
  }
`;

const regex = /private static detectCityAndPRD\([\s\S]*?return \{ city: '其他城市', isPRD: false \};\n  }/;
code = code.replace(regex, newDetectCityLogic.trim());
fs.writeFileSync('src/services/dataset/LaborCaseDatasetBuilder.ts', code);
console.log('Patched detectCityAndPRD in Builder');
