import type { SemanticResolverErrorCode } from './types';

export type SemanticTechnicalFailureStage = 'runtime' | 'provider' | 'response' | 'validation';

export interface SemanticTechnicalFailure {
  id?: string;
  caseId: string;
  failureStage: SemanticTechnicalFailureStage;
  failureCode: SemanticResolverErrorCode | string;
  httpStatus?: number;
  errorSummary: string;
  timestamp: string;
  attempt: number;
}

export const semanticTechnicalFailureStorageKey = 'labor-analysis-semantic-technical-failures-v1';

const defaultStorage = (): Storage | undefined => {
  try {
    return typeof globalThis !== 'undefined' ? globalThis.localStorage : undefined;
  } catch {
    return undefined;
  }
};

const redact = (value: string): string => value
  .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
  .replace(/(authorization|api[-_]?key)\s*[:=]\s*["']?[^,;\s"']+/gi, '$1: [redacted]')
  .replace(/(?:sk|xai|deepseek|openrouter)-[A-Za-z0-9._-]+/gi, '[redacted-key]')
  .slice(0, 240);

const sanitizeFailure = (value: unknown): SemanticTechnicalFailure | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Partial<SemanticTechnicalFailure>;
  if (typeof item.caseId !== 'string' || !item.caseId.trim()
    || !['runtime', 'provider', 'response', 'validation'].includes(item.failureStage || '')
    || typeof item.failureCode !== 'string' || !item.failureCode.trim()
    || typeof item.errorSummary !== 'string'
    || typeof item.timestamp !== 'string'
    || typeof item.attempt !== 'number' || !Number.isInteger(item.attempt) || item.attempt < 1) return null;
  return {
    caseId: item.caseId,
    failureStage: item.failureStage as SemanticTechnicalFailureStage,
    failureCode: item.failureCode,
    ...(typeof item.httpStatus === 'number' ? { httpStatus: item.httpStatus } : {}),
    errorSummary: redact(item.errorSummary || '未提供技术错误摘要'),
    timestamp: item.timestamp,
    attempt: item.attempt,
  };
};

export const failureStageForCode = (code: string): SemanticTechnicalFailureStage => {
  if (['timeout', 'network_error', 'rate_limited', 'provider_error'].includes(code)) return 'provider';
  if (['invalid_json', 'empty_response', 'output_truncated'].includes(code)) return 'response';
  return 'validation';
};

export function readSemanticTechnicalFailures(
  storage: Storage | undefined = defaultStorage(),
): SemanticTechnicalFailure[] {
  if (!storage) return [];
  try {
    const value: unknown = JSON.parse(storage.getItem(semanticTechnicalFailureStorageKey) || '[]');
    return Array.isArray(value)
      ? value.map(sanitizeFailure).filter((item): item is SemanticTechnicalFailure => item !== null)
      : [];
  } catch {
    return [];
  }
}

export function writeSemanticTechnicalFailures(
  failures: SemanticTechnicalFailure[],
  storage: Storage | undefined = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(semanticTechnicalFailureStorageKey, JSON.stringify(failures.map(sanitizeFailure).filter((item): item is SemanticTechnicalFailure => item !== null)));
  } catch {
    // Failure diagnostics must never break the semantic workflow.
  }
}

export function appendSemanticTechnicalFailure(
  failure: Omit<SemanticTechnicalFailure, 'attempt'>,
  storage?: Storage,
): SemanticTechnicalFailure {
  const existing = readSemanticTechnicalFailures(storage);
  const attempt = existing.filter((item) => item.caseId === failure.caseId).length + 1;
  const next = sanitizeFailure({ ...failure, attempt })!;
  writeSemanticTechnicalFailures([...existing, next], storage);
  return next;
}

export function latestSemanticTechnicalFailure(
  caseId: string,
  storage?: Storage,
): SemanticTechnicalFailure | undefined {
  return readSemanticTechnicalFailures(storage)
    .filter((item) => item.caseId === caseId)
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp) || left.attempt - right.attempt)
    .at(-1);
}

export function semanticTechnicalFailureHistory(
  caseId: string,
  storage?: Storage,
): SemanticTechnicalFailure[] {
  return readSemanticTechnicalFailures(storage).filter((item) => item.caseId === caseId);
}

export function clearSemanticTechnicalFailures(
  caseId: string,
  storage?: Storage,
): void {
  writeSemanticTechnicalFailures(
    readSemanticTechnicalFailures(storage).filter((item) => item.caseId !== caseId),
    storage,
  );
}
