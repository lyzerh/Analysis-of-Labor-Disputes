export const RESEARCH_NAVIGATION_STORAGE_KEY = 'labor-disputes:research-navigation:v1';

export const RESEARCH_PAGES = [
  'caseLibrary',
  'caseAnalysis',
  'researchWorkspace',
  'caseResearch',
  'defenseReference',
  'dataManagement',
  'settings',
  'userGuide',
] as const;

export type ResearchNavigationPage = typeof RESEARCH_PAGES[number];

export interface ResearchNavigationContext {
  page: ResearchNavigationPage;
  selectedSnapshotId: string;
  selectedAnalysisRunId: string;
}

export interface ResearchNavigationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const EMPTY_RESEARCH_NAVIGATION_CONTEXT: ResearchNavigationContext = {
  page: 'caseLibrary',
  selectedSnapshotId: '',
  selectedAnalysisRunId: '',
};

function isPage(value: unknown): value is ResearchNavigationPage {
  return typeof value === 'string' && (RESEARCH_PAGES as readonly string[]).includes(value);
}

function id(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function loadResearchNavigationContext(storage?: ResearchNavigationStorage): ResearchNavigationContext {
  const target = storage ?? (typeof window !== 'undefined' ? window.sessionStorage : undefined);
  if (!target) return { ...EMPTY_RESEARCH_NAVIGATION_CONTEXT };
  try {
    const raw = target.getItem(RESEARCH_NAVIGATION_STORAGE_KEY);
    if (!raw) return { ...EMPTY_RESEARCH_NAVIGATION_CONTEXT };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      page: isPage(parsed.page) ? parsed.page : EMPTY_RESEARCH_NAVIGATION_CONTEXT.page,
      selectedSnapshotId: id(parsed.selectedSnapshotId),
      selectedAnalysisRunId: id(parsed.selectedAnalysisRunId),
    };
  } catch {
    return { ...EMPTY_RESEARCH_NAVIGATION_CONTEXT };
  }
}

export function saveResearchNavigationContext(
  storage: ResearchNavigationStorage | undefined,
  context: ResearchNavigationContext,
): void {
  const target = storage ?? (typeof window !== 'undefined' ? window.sessionStorage : undefined);
  if (!target) return;
  try {
    target.setItem(RESEARCH_NAVIGATION_STORAGE_KEY, JSON.stringify({
      page: context.page,
      selectedSnapshotId: context.selectedSnapshotId,
      selectedAnalysisRunId: context.selectedAnalysisRunId,
    }));
  } catch {
    // Navigation persistence is optional; storage denial must never block rendering.
  }
}

export function reconcilePersistedSelection(selectedId: string, availableIds: readonly string[]): string {
  if (!selectedId) return '';
  return availableIds.includes(selectedId) ? selectedId : '';
}
