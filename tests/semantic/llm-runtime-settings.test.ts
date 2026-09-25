import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearLlmRuntimeSettings,
  isLlmAvailable,
  LLM_RUNTIME_SETTINGS_STORAGE_KEY,
  XAI_RUNTIME_SETTINGS_STORAGE_KEY,
  readLlmRuntimeSettings,
  writeLlmRuntimeSettings,
} from '../../src/services/semantic/LlmRuntimeSettings';
import { testXaiConnection } from '../../src/services/semantic/BrowserXaiSemanticClient';
import {
  createLlmProviderPresentation,
  getConfiguredLlmProvider,
  testConfiguredLlmConnection,
} from '../../src/services/semantic/LlmRuntimeProvider';
import { SEMANTIC_LLM_MODEL, SEMANTIC_LLM_PROVIDER } from '../../src/services/semantic/SemanticPrompt';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('browser LLM runtime settings contract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('requires both the global switch and a non-empty key', () => {
    expect(isLlmAvailable({ enabled: false, apiKey: 'key' })).toBe(false);
    expect(isLlmAvailable({ enabled: true, apiKey: null })).toBe(false);
    expect(isLlmAvailable({ enabled: true, apiKey: '  ' })).toBe(false);
    expect(isLlmAvailable({ enabled: true, apiKey: 'key' })).toBe(true);
  });

  it('stores runtime credentials only in session storage and exposes the required settings controls', () => {
    const settingsSource = readFileSync(resolve(process.cwd(), 'src/services/semantic/LlmRuntimeSettings.ts'), 'utf8');
    const viewSource = readFileSync(resolve(process.cwd(), 'src/components/SettingsView.tsx'), 'utf8');
    expect(settingsSource).toContain('sessionStorage');
    expect(XAI_RUNTIME_SETTINGS_STORAGE_KEY).toBe('labor-analysis-xai-settings-v1');
    expect(LLM_RUNTIME_SETTINGS_STORAGE_KEY).toBe(XAI_RUNTIME_SETTINGS_STORAGE_KEY);
    expect(settingsSource).not.toContain('localStorage');
    expect(settingsSource).not.toContain('indexedDB');
    expect(viewSource).toMatch(/type="password"/);
    expect(viewSource).toContain('测试连接');
    expect(viewSource).toContain('清除 Key');
    expect(viewSource).toContain('xAI API Key');
    expect(viewSource).toContain('输入您的 xAI API Key');
    expect(viewSource).toContain('getConfiguredLlmProvider');
    expect(viewSource).toContain('testConfiguredLlmConnection()');
    expect(viewSource).not.toContain('DeepSeek API Key');
    expect(viewSource).not.toContain('调用 DeepSeek');
    expect(viewSource).toContain('onChange={(event) => persistApiKeyInput(event.target.value)}');
    expect(viewSource).toContain('onBlur={(event) => persistApiKeyInput(event.currentTarget.value)}');
    expect(viewSource).not.toContain('if (!settings.enabled');
    expect(SEMANTIC_LLM_PROVIDER).toBe('xai');
    expect(SEMANTIC_LLM_MODEL).toBe('grok-4.20-0309-reasoning');
    expect(viewSource).toContain('不代表绝对安全');
  });

  it('presents the configured provider dynamically without provider-specific component copy', () => {
    const sidebarSource = readFileSync(resolve(process.cwd(), 'src/components/Sidebar.tsx'), 'utf8');
    expect(getConfiguredLlmProvider()).toMatchObject({
      provider: 'xai',
      providerLabel: 'xAI',
      model: 'grok-4.20-0309-reasoning',
      modelLabel: 'Grok 4.20 Reasoning',
    });
    expect(createLlmProviderPresentation('xai', 'grok-4.20-0309-reasoning')).toMatchObject({
      provider: 'xai',
      providerLabel: 'xAI',
      model: 'grok-4.20-0309-reasoning',
      modelLabel: 'Grok 4.20 Reasoning',
    });
    expect(sidebarSource).toContain('llmProvider.providerLabel');
    expect(sidebarSource).not.toContain('DeepSeek 已启用');
  });

  it('writes, restores, and clears runtime settings in the dedicated session storage entry', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
      dispatchEvent: vi.fn(),
    });
    const settings = { enabled: true, apiKey: 'test-runtime-key' };

    writeLlmRuntimeSettings(settings);
    expect(values.has(LLM_RUNTIME_SETTINGS_STORAGE_KEY)).toBe(true);
    expect(JSON.parse(values.get(LLM_RUNTIME_SETTINGS_STORAGE_KEY) || '{}')).toEqual(settings);
    expect(readLlmRuntimeSettings()).toEqual(settings);

    clearLlmRuntimeSettings();
    expect(values.has(LLM_RUNTIME_SETTINGS_STORAGE_KEY)).toBe(false);
    expect(readLlmRuntimeSettings()).toEqual({ enabled: false, apiKey: null });
  });

  it('uses the restored runtime key for the xAI connection header', async () => {
    const values = new Map<string, string>();
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
      dispatchEvent: vi.fn(),
    });
    writeLlmRuntimeSettings({ enabled: true, apiKey: 'xai-restored-test' });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const restored = readLlmRuntimeSettings();
    await expect(testXaiConnection()).resolves.toBe('available');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.x.ai/v1/chat/completions');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer xai-restored-test');
  });

  it('routes the provider-neutral connection entry point to the configured provider', async () => {
    const values = new Map<string, string>();
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
      dispatchEvent: vi.fn(),
    });
    writeLlmRuntimeSettings({ enabled: true, apiKey: 'test-token' });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(testConfiguredLlmConnection()).resolves.toBe('available');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token');
  });
});
