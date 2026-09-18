import type { AnalysisEngineVersions, SemanticAnalysisConfig } from '../../types';
import {
  SEMANTIC_LLM_MODEL,
  SEMANTIC_LLM_PROVIDER,
  SEMANTIC_RESULT_PROMPT_VERSION,
} from '../semantic/SemanticPrompt';

/**
 * Version of the current LaborInfo party/claim/reference parser contract.
 * Bump manually whenever deterministic parsing semantics change.
 */
export const LABORINFO_PARSER_VERSION = 'laborinfo-parser-evidence-provider-v2' as const;

/**
 * Version of deterministic claim-level outcome mapping and aggregation rules.
 * This is not a UI or analytics presentation version.
 */
export const DETERMINISTIC_OUTCOME_RULESET_VERSION = 'deterministic-claim-outcome-v1' as const;

export const CURRENT_ANALYSIS_ENGINE_VERSIONS: Readonly<AnalysisEngineVersions> = Object.freeze({
  parserVersion: LABORINFO_PARSER_VERSION,
  rulesetVersion: DETERMINISTIC_OUTCOME_RULESET_VERSION,
});

export function getCurrentAnalysisEngineVersions(): AnalysisEngineVersions {
  return { ...CURRENT_ANALYSIS_ENGINE_VERSIONS };
}

export function getDefaultSemanticAnalysisConfig(): SemanticAnalysisConfig {
  return { enabled: false };
}

export function getSemanticAnalysisConfig(enabled: boolean): SemanticAnalysisConfig {
  return enabled
    ? {
        enabled: true,
        promptVersion: SEMANTIC_RESULT_PROMPT_VERSION,
        provider: SEMANTIC_LLM_PROVIDER,
        model: SEMANTIC_LLM_MODEL,
      }
    : getDefaultSemanticAnalysisConfig();
}
