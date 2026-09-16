export interface CaseListScopeLabelInput {
  hasAnalysisRun: boolean;
  totalCount: number;
  visibleCount: number;
  isFiltered: boolean;
}

export function createCaseListScopeLabel({
  hasAnalysisRun,
  totalCount,
  visibleCount,
  isFiltered,
}: CaseListScopeLabelInput): string {
  const scopeLabel = hasAnalysisRun ? '当前分析集案例' : '本地案例浏览';
  if (isFiltered) return `${scopeLabel}：${totalCount} 个｜当前筛选显示：${visibleCount} 个`;
  return `${scopeLabel}：${visibleCount} 个`;
}

export function createCaseAnalysisScopeNotice(hasAnalysisRun: boolean): string {
  return hasAnalysisRun
    ? '当前显示的是本次分析集中的案例，不代表本地案例库总数。'
    : '当前为本地案例浏览，显示本地案例库中的案例。';
}

export function createReviewQueueScopeLabel(
  hasAnalysisRun: boolean,
  itemCount: number,
  caseCount: number,
): string {
  const counts = `待复核项：${itemCount} 项｜涉及案例：${caseCount} 个`;
  return hasAnalysisRun
    ? `${counts}｜待复核项来自当前分析集。`
    : `${counts}｜当前未选择分析集，暂为本地案例浏览。`;
}
