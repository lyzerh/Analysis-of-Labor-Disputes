import { SEMANTIC_RESOLUTION_RESULT_JSON_SCHEMA } from './SemanticResultSchema';
import type { SemanticSchemaValidationError } from './SemanticResult';

type SchemaNode = {
  type?: string;
  enum?: readonly unknown[];
  required?: readonly string[];
  properties?: Record<string, SchemaNode>;
  additionalProperties?: boolean;
  items?: SchemaNode;
};

const actualType = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};

const redact = (value: string): string => value
  .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
  .replace(/(api[_-]?key|authorization)\s*["']?\s*[:=]\s*["']?[^,"'}\s]+/gi, '$1: [redacted]');

export const valuePreview = (value: unknown, limit = 180): string => {
  let text: string;
  try { text = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value)); } catch { text = String(value); }
  return redact(text).slice(0, limit);
};

const expectedFor = (node: SchemaNode): string | undefined => {
  if (node.enum) return node.enum.map((item) => String(item)).join('|');
  return node.type;
};

const pathFor = (path: string, key: string): string => path ? `${path}.${key}` : key;

const push = (errors: SemanticSchemaValidationError[], value: unknown, path: string, errorCode: string, node: SchemaNode, expected?: string): void => {
  errors.push({ path, errorCode, ...(expected || expectedFor(node) ? { expected: expected || expectedFor(node) } : {}), actualType: actualType(value), actualValuePreview: valuePreview(value) });
};

const walk = (value: unknown, node: SchemaNode, path: string, errors: SemanticSchemaValidationError[]): void => {
  if (errors.length >= 80) return;
  if (value === null) { push(errors, value, path, 'null_not_allowed', node); return; }
  if (node.type === 'object') {
    if (typeof value !== 'object' || Array.isArray(value)) { push(errors, value, path, 'wrong_type', node, 'object'); return; }
    const object = value as Record<string, unknown>;
    for (const required of node.required || []) if (!(required in object)) push(errors, undefined, pathFor(path, required), 'missing_required_field', node, 'present');
    if (node.additionalProperties === false) for (const key of Object.keys(object)) if (!node.properties?.[key]) push(errors, object[key], pathFor(path, key), 'extra_field_rejected', node);
    for (const [key, child] of Object.entries(node.properties || {})) if (key in object) walk(object[key], child, pathFor(path, key), errors);
    return;
  }
  if (node.type === 'array') {
    if (!Array.isArray(value)) { push(errors, value, path, 'wrong_type', node, 'array'); return; }
    value.forEach((item, index) => walk(item, node.items || {}, `${path}[${index}]`, errors));
    return;
  }
  if (node.enum && !node.enum.includes(value)) { push(errors, value, path, 'invalid_enum', node); return; }
  const typeMatches = node.type === 'number' ? typeof value === 'number' && Number.isFinite(value)
    : node.type === 'integer' ? typeof value === 'number' && Number.isInteger(value)
      : node.type === 'string' ? typeof value === 'string'
        : node.type === 'boolean' ? typeof value === 'boolean' : true;
  if (!typeMatches) push(errors, value, path, 'wrong_type', node);
};

export const collectSemanticSchemaValidationErrors = (value: unknown): SemanticSchemaValidationError[] => {
  const errors: SemanticSchemaValidationError[] = [];
  walk(value, SEMANTIC_RESOLUTION_RESULT_JSON_SCHEMA as unknown as SchemaNode, '', errors);
  return errors;
};

/**
 * Preserve the handwritten validator's original issue strings when the
 * generic schema walker cannot identify a nested path.  A non-empty
 * validator error must never be silently converted into an empty diagnostic.
 */
export const semanticSchemaIssuesToValidationErrors = (
  issues: readonly string[],
): SemanticSchemaValidationError[] => issues.map((issue) => {
  const normalized = issue.replace(/^result_/, '');
  const errorCode = normalized.includes('additional_properties')
    ? 'extra_field_rejected'
    : normalized.includes('not_object') || normalized.includes('not_array')
      ? 'wrong_type'
      : normalized.includes('missing')
        ? 'missing_required_field'
        : normalized.includes('enum')
          ? 'invalid_enum'
          : 'schema_validator_rejected';
  return {
    path: normalized || 'semanticResult',
    errorCode,
    actualType: 'unknown',
    actualValuePreview: valuePreview(issue),
  };
});

export const ensureSemanticSchemaValidationErrors = (
  collected: SemanticSchemaValidationError[],
  validatorIssues: readonly string[],
): SemanticSchemaValidationError[] => collected.length > 0
  ? collected
  : semanticSchemaIssuesToValidationErrors(validatorIssues);

export const boundedRawResponsePreview = (text: string, limit = 4000): string => redact(text).slice(0, limit);

export const boundedParsedJsonCandidate = (value: unknown, limit = 5000): unknown => {
  const serialized = valuePreview(value, Number.MAX_SAFE_INTEGER);
  if (serialized.length <= limit) return value;
  return { truncated: true, preview: serialized.slice(0, limit) };
};
