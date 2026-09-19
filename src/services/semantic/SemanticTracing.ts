/**
 * Development-only tracing for the semantic pipeline.
 *
 * The helper deliberately accepts only bounded metadata. Callers must never
 * pass API keys, authorization headers, raw case text, or provider payloads.
 */
export const traceSemantic = (stage: string, details?: Record<string, unknown>): void => {
  const hostname = typeof window !== 'undefined' ? window.location?.hostname : undefined;
  if (hostname && /^(localhost|127\.0\.0\.1)$/.test(hostname)) {
    console.info(`[semantic] ${stage}${details ? ` ${JSON.stringify(details)}` : ''}`);
  }
};
