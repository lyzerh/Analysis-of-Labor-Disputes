import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const formalOutcomeViews = [
  'src/components/LaborAnalysisCaseLibrary.tsx',
  'src/components/CaseAnalysisView.tsx',
  'src/components/LaborAnalyticsTest.tsx',
  'src/components/DefenseStrategyAnalysis.tsx',
];

describe('UI outcome enum contract', () => {
  it.each(formalOutcomeViews)('%s uses only AnalysisCaseRecord outcome values', (file) => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8');
    expect(source).not.toMatch(/['"](?:employee_win|employer_win|partial|rejected|unknown)['"]/);
  });

  it('does not classify unclear employer outcomes as non-supported drilldown cases', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/DefenseStrategyAnalysis.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(/employerOutcome\s*!==\s*['"]supported['"]/);
  });

  it.each([
    'src/components/LaborAnalyticsTest.tsx',
    'src/components/DefenseStrategyAnalysis.tsx',
  ])('%s preserves the four-state employer outcome in drilldown badges', (file) => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8');
    expect(source).toMatch(/getOutcomePresentation\(c\.employerOutcome\)/);
    expect(source).not.toMatch(
      /c\.employerOutcome === ['"]supported['"] \? ['"]获支持['"] : c\.employerOutcome === ['"]partially_supported['"] \? ['"]部分支持['"] : ['"]未支持['"]/,
    );
  });
});
