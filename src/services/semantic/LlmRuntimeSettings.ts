import { useEffect, useState } from 'react';

export interface LlmRuntimeSettings {
  enabled: boolean;
  apiKey: string | null;
}

export const LLM_RUNTIME_SETTINGS_STORAGE_KEY = 'labor-analysis-llm-runtime-settings-v1';
const SETTINGS_EVENT = 'labor-analysis-llm-runtime-settings-changed';
const DEFAULT_SETTINGS: LlmRuntimeSettings = { enabled: false, apiKey: null };
let memorySettings: LlmRuntimeSettings = { ...DEFAULT_SETTINGS };

const normalize = (value: unknown): LlmRuntimeSettings => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_SETTINGS };
  const candidate = value as { enabled?: unknown; apiKey?: unknown };
  return {
    enabled: candidate.enabled === true,
    apiKey: typeof candidate.apiKey === 'string' && candidate.apiKey.trim() ? candidate.apiKey : null,
  };
};

const emit = (): void => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SETTINGS_EVENT));
};

export const readLlmRuntimeSettings = (): LlmRuntimeSettings => {
  if (typeof window === 'undefined') return { ...memorySettings };
  try {
    const stored = window.sessionStorage.getItem(LLM_RUNTIME_SETTINGS_STORAGE_KEY);
    memorySettings = stored ? normalize(JSON.parse(stored)) : { ...DEFAULT_SETTINGS };
  } catch {
    // Private browsing or blocked storage keeps the current settings in memory only.
  }
  return { ...memorySettings };
};

export const writeLlmRuntimeSettings = (next: LlmRuntimeSettings): LlmRuntimeSettings => {
  const normalized = normalize(next);
  memorySettings = normalized;
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(LLM_RUNTIME_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Keep the setting for this page session when sessionStorage is unavailable.
    }
    emit();
  }
  return { ...normalized };
};

export const clearLlmRuntimeSettings = (): void => {
  memorySettings = { ...DEFAULT_SETTINGS };
  if (typeof window !== 'undefined') {
    try { window.sessionStorage.removeItem(LLM_RUNTIME_SETTINGS_STORAGE_KEY); } catch { /* memory fallback */ }
    emit();
  }
};

export const isLlmAvailable = (settings: LlmRuntimeSettings): boolean =>
  settings.enabled && Boolean(settings.apiKey?.trim());

export const useLlmRuntimeSettings = (): {
  settings: LlmRuntimeSettings;
  setSettings: (next: LlmRuntimeSettings) => void;
  clearSettings: () => void;
} => {
  const [settings, setSettingsState] = useState<LlmRuntimeSettings>(() => readLlmRuntimeSettings());

  useEffect(() => {
    const refresh = () => setSettingsState(readLlmRuntimeSettings());
    window.addEventListener(SETTINGS_EVENT, refresh);
    return () => window.removeEventListener(SETTINGS_EVENT, refresh);
  }, []);

  return {
    settings,
    setSettings: (next) => setSettingsState(writeLlmRuntimeSettings(next)),
    clearSettings: () => {
      clearLlmRuntimeSettings();
      setSettingsState({ ...DEFAULT_SETTINGS });
    },
  };
};
