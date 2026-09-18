import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { shouldCollapseText } from '../../src/components/CollapsibleText';

describe('collapsible text presentation contract', () => {
  it('does not add a toggle for short text', () => {
    expect(shouldCollapseText('法院支持该项请求。', 4)).toBe(false);
  });

  it('collapses long text using a bounded line estimate', () => {
    const longText = Array.from({ length: 6 }, (_, index) => `第${index + 1}段：法院认定相关事实并说明裁判理由。`).join('\n');
    expect(shouldCollapseText(longText, 4)).toBe(true);
  });

  it('exposes expand/collapse behavior without changing business data', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/CollapsibleText.tsx'), 'utf8');
    expect(source).toContain("useState(false)");
    expect(source).toContain('aria-expanded={expanded}');
    expect(source).toContain("{expanded ? collapseLabel : expandLabel}");
    expect(source).toContain('WebkitLineClamp: lines');
  });

  it('is used for long evidence and analysis snippets in the three target workspaces', () => {
    const sources = [
      'src/components/PipelineWorkspace.tsx',
      'src/components/SemanticReviewWorkspace.tsx',
      'src/components/CaseAnalysisView.tsx',
    ].map((file) => readFileSync(resolve(process.cwd(), file), 'utf8'));
    for (const source of sources) expect(source).toContain('<CollapsibleText');
  });

  it('keeps the semantic review evidence and context labels intact', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/SemanticReviewWorkspace.tsx'), 'utf8');
    expect(source).toContain('可核对的原文依据');
    expect(source).toContain('相关上下文');
    expect(source).toContain('claim.claimText');
    expect(source).toContain('selected.context');
  });
});

