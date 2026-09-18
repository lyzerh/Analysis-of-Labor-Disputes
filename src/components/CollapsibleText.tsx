import React, { useState } from 'react';

export interface CollapsibleTextProps {
  text?: string | null;
  collapsedLines?: number;
  className?: string;
  expandLabel?: string;
  collapseLabel?: string;
}

const clampCollapsedLines = (value: number | undefined): number => {
  const lines = Number.isFinite(value) ? Math.round(value as number) : 4;
  return Math.min(5, Math.max(3, lines));
};

/**
 * Uses a deterministic estimate so short snippets do not get an unnecessary
 * toggle, without introducing DOM measurement or layout-dependent state.
 */
export function shouldCollapseText(text: string | null | undefined, collapsedLines = 4): boolean {
  const normalized = text?.trim() || '';
  if (!normalized) return false;
  const lines = clampCollapsedLines(collapsedLines);
  const estimatedLines = normalized.split(/\r?\n/).reduce(
    (total, line) => total + Math.max(1, Math.ceil(line.length / 72)),
    0,
  );
  return estimatedLines > lines;
}

export const CollapsibleText: React.FC<CollapsibleTextProps> = ({
  text,
  collapsedLines = 4,
  className = '',
  expandLabel = '展开',
  collapseLabel = '收起',
}) => {
  const normalized = text?.trim() || '';
  const lines = clampCollapsedLines(collapsedLines);
  const collapsible = shouldCollapseText(normalized, lines);
  const [expanded, setExpanded] = useState(false);

  if (!collapsible) {
    return <span className={`whitespace-pre-wrap break-words ${className}`.trim()}>{normalized}</span>;
  }

  return (
    <span className={`block ${className}`.trim()}>
      <span
        className="block whitespace-pre-wrap break-words"
        style={expanded ? undefined : {
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: lines,
          overflow: 'hidden',
        }}
      >
        {normalized}
      </span>
      <button
        type="button"
        className="mt-1 text-[10px] font-medium text-indigo-700 hover:text-indigo-900"
        aria-expanded={expanded}
        onClick={(event) => {
          event.stopPropagation();
          setExpanded((current) => !current);
        }}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {expanded ? collapseLabel : expandLabel}
      </button>
    </span>
  );
};
