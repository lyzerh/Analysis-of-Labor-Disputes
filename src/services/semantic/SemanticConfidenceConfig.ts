/**
 * Confidence policy shared by the production semantic admission paths.
 *
 * This is intentionally a policy value, not a replacement for the other
 * audit and validation gates. A result must still be resolved, structurally
 * valid, evidence-backed, and free of unresolved required targets before it
 * can be admitted automatically.
 */
export const SEMANTIC_AUTO_ACCEPT_CONFIDENCE = 0.80;

export const SEMANTIC_HUMAN_REVIEW_CONFIDENCE = 0.70;
