import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_RESEARCH_NAVIGATION_CONTEXT,
  loadResearchNavigationContext,
  reconcilePersistedSelection,
  saveResearchNavigationContext,
  type ResearchNavigationStorage,
} from '../../src/services/research/ResearchNavigationContext';

class MemoryStorage implements ResearchNavigationStorage {
  value: string | null = null;
  getItem() { return this.value; }
  setItem(_key: string, value: string) { this.value = value; }
}

describe('BUG-010 research navigation context', () => {
  it('keeps Snapshot A after navigating away and back', () => {
    const storage = new MemoryStorage();
    saveResearchNavigationContext(storage, { page: 'caseResearch', selectedSnapshotId: 'snapshot-A', selectedAnalysisRunId: 'run-A' });
    expect(loadResearchNavigationContext(storage).selectedSnapshotId).toBe('snapshot-A');
    const workspaceSource = readFileSync(new URL('../../src/components/ResearchWorkspace.tsx', import.meta.url), 'utf8');
    expect(workspaceSource).toMatch(/当前 Snapshot：\{selectedSnapshot\.id\}/);
  });

  it('restores Snapshot A after a Workspace refresh', () => {
    const storage = new MemoryStorage();
    saveResearchNavigationContext(storage, { ...EMPTY_RESEARCH_NAVIGATION_CONTEXT, page: 'researchWorkspace', selectedSnapshotId: 'snapshot-A' });
    expect(reconcilePersistedSelection(loadResearchNavigationContext(storage).selectedSnapshotId, ['snapshot-A'])).toBe('snapshot-A');
  });

  it('restores Run A on Analytics refresh', () => {
    const storage = new MemoryStorage();
    saveResearchNavigationContext(storage, { ...EMPTY_RESEARCH_NAVIGATION_CONTEXT, page: 'caseResearch', selectedAnalysisRunId: 'run-A' });
    expect(loadResearchNavigationContext(storage)).toMatchObject({ page: 'caseResearch', selectedAnalysisRunId: 'run-A' });
  });

  it('keeps Run A from Analytics to Defense', () => {
    const storage = new MemoryStorage();
    saveResearchNavigationContext(storage, { ...EMPTY_RESEARCH_NAVIGATION_CONTEXT, page: 'defenseReference', selectedAnalysisRunId: 'run-A' });
    expect(loadResearchNavigationContext(storage).selectedAnalysisRunId).toBe('run-A');
  });

  it('keeps Run A from Defense back to Analytics', () => {
    const storage = new MemoryStorage();
    saveResearchNavigationContext(storage, { ...EMPTY_RESEARCH_NAVIGATION_CONTEXT, page: 'caseResearch', selectedAnalysisRunId: 'run-A' });
    expect(loadResearchNavigationContext(storage).selectedAnalysisRunId).toBe('run-A');
  });

  it('keeps an explicitly selected sampled Run B on refresh', () => {
    const storage = new MemoryStorage();
    saveResearchNavigationContext(storage, { ...EMPTY_RESEARCH_NAVIGATION_CONTEXT, page: 'caseResearch', selectedAnalysisRunId: 'sampled-run-B' });
    expect(loadResearchNavigationContext(storage).selectedAnalysisRunId).toBe('sampled-run-B');
  });

  it('clears a missing persisted run instead of substituting another run', () => {
    expect(reconcilePersistedSelection('missing-run', ['run-A', 'run-B'])).toBe('');
  });

  it('clears a missing persisted snapshot instead of substituting another snapshot', () => {
    expect(reconcilePersistedSelection('missing-snapshot', ['snapshot-A', 'snapshot-B'])).toBe('');
  });

  it('does not auto-select latest when no selection was persisted', () => {
    expect(reconcilePersistedSelection('', ['latest-run'])).toBe('');
  });

  it('uses session storage only and performs zero network requests', () => {
    const source = readFileSync(new URL('../../src/services/research/ResearchNavigationContext.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/fetch\(|XMLHttpRequest|localStorage|indexedDB/);
    expect(source).toMatch(/sessionStorage/);
  });

  it('persists IDs and page only without provenance or research objects', () => {
    const storage = new MemoryStorage();
    saveResearchNavigationContext(storage, { page: 'defenseReference', selectedSnapshotId: 'snapshot-A', selectedAnalysisRunId: 'run-A' });
    expect(JSON.parse(storage.value!)).toEqual({ page: 'defenseReference', selectedSnapshotId: 'snapshot-A', selectedAnalysisRunId: 'run-A' });
    expect(storage.value).not.toMatch(/provenance|fingerprint|inputCaseIds|records/);
  });
});
