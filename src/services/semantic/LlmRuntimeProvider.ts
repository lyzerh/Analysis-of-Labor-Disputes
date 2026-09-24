import {
  SEMANTIC_LLM_MODEL,
  SEMANTIC_LLM_PROVIDER,
} from './SemanticPrompt';
import {
  testXaiConnection,
  type XaiConnectionStatus,
} from './BrowserXaiSemanticClient';

export type LlmConnectionStatus = XaiConnectionStatus;

export interface LlmProviderPresentation {
  provider: string;
  providerLabel: string;
  model: string;
  modelLabel: string;
}

const providerLabels: Record<string, string> = {
  xai: 'xAI',
};

const modelLabels: Record<string, string> = {
  'grok-4.20-0309-reasoning': 'Grok 4.20 Reasoning',
};

export const createLlmProviderPresentation = (
  provider: string,
  model: string,
): LlmProviderPresentation => ({
  provider,
  providerLabel: providerLabels[provider] || provider,
  model,
  modelLabel: modelLabels[model] || model,
});

export const getConfiguredLlmProvider = (): LlmProviderPresentation =>
  createLlmProviderPresentation(SEMANTIC_LLM_PROVIDER, SEMANTIC_LLM_MODEL);

/**
 * Dispatches the connection check through the provider configured for the
 * active semantic runtime. The settings UI does not need provider-specific
 * endpoint or client details.
 */
export const testConfiguredLlmConnection = async (
  apiKey?: string,
): Promise<LlmConnectionStatus> => {
  if (SEMANTIC_LLM_PROVIDER === 'xai') return testXaiConnection(apiKey);
  return 'unknown_error';
};
