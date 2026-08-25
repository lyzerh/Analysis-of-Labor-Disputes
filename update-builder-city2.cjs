const fs = require('fs');
let code = fs.readFileSync('src/services/dataset/LaborCaseDatasetBuilder.ts', 'utf8');

const newDetectCityLogic = `
  private static detectCityAndPRD(
    rawDoc: RawDocument,
    parsed: LaborInfoParsedResult
  ): { city: string; isPRD: boolean } {
    let city = parsed.city || '其他城市';
    city = city.replace('市', '');
    const isPRD = PRD_CITIES.some(p => p.name === city || p.aliases.includes(city));
    return { city, isPRD };
  }
`;

const regex = /private static detectCityAndPRD\([\s\S]*?return \{ city, isPRD \};\n  }/;
code = code.replace(regex, newDetectCityLogic.trim());
fs.writeFileSync('src/services/dataset/LaborCaseDatasetBuilder.ts', code);
console.log('Patched detectCityAndPRD properly in Builder');
