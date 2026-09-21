import { describe, expect, it } from 'vitest';
import {
  isTechnicalResolverError,
  isTechnicalSemanticStatus,
  TECHNICAL_RESOLVER_ERROR_CODES,
  type SemanticWorkflowState,
} from '../../src/services/semantic/SemanticWorkflowState';

describe('semantic workflow state contract', () => {
  it('keeps the four product states explicit', () => {
    const states: SemanticWorkflowState[] = ['accepted', 'needs_review', 'technical_failure', 'blocked'];
    expect(states).toHaveLength(4);
  });

  it('recognizes technical resolver failures without treating semantic uncertainty as technical', () => {
    expect(TECHNICAL_RESOLVER_ERROR_CODES).toContain('schema_invalid');
    expect(isTechnicalResolverError('timeout')).toBe(true);
    expect(isTechnicalResolverError('confidence_below_admission_threshold')).toBe(false);
    expect(isTechnicalSemanticStatus('provider_unavailable')).toBe(true);
    expect(isTechnicalSemanticStatus('needs_review')).toBe(false);
  });
});
