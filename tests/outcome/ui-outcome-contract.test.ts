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
});
