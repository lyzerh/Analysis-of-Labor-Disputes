import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearLlmRuntimeSettings,
  isLlmAvailable,
  LLM_RUNTIME_SETTINGS_STORAGE_KEY,
  readLlmRuntimeSettings,
  writeLlmRuntimeSettings,
} from '../../src/services/semantic/LlmRuntimeSettings';
import { testDeepSeekConnection } from '../../src/services/semantic/BrowserDeepSeekSemanticClient';
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
    expect(settingsSource).not.toContain('localStorage');
    expect(settingsSource).not.toContain('indexedDB');
    expect(viewSource).toMatch(/type="password"/);
    expect(viewSource).toContain('测试连接');
    expect(viewSource).toContain('清除 Key');
    expect(viewSource).toContain('SEMANTIC_LLM_MODEL');
    expect(viewSource).toContain('DeepSeek API Key');
    expect(viewSource).toContain('DeepSeek V4.1 Flash');
    expect(viewSource).toContain('testDeepSeekConnection()');
    expect(viewSource).toContain('onChange={(event) => persistApiKeyInput(event.target.value)}');
    expect(viewSource).toContain('onBlur={(event) => persistApiKeyInput(event.currentTarget.value)}');
    expect(viewSource).not.toContain('if (!settings.enabled');
    expect(SEMANTIC_LLM_PROVIDER).toBe('deepseek');
    expect(SEMANTIC_LLM_MODEL).toBe('deepseek-flash');
    expect(viewSource).toContain('不代表绝对安全');
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
    const settings = { enabled: true, apiKey: 'sk-or-runtime-test' };

    writeLlmRuntimeSettings(settings);
    expect(values.has(LLM_RUNTIME_SETTINGS_STORAGE_KEY)).toBe(true);
    expect(JSON.parse(values.get(LLM_RUNTIME_SETTINGS_STORAGE_KEY) || '{}')).toEqual(settings);
    expect(readLlmRuntimeSettings()).toEqual(settings);

    clearLlmRuntimeSettings();
    expect(values.has(LLM_RUNTIME_SETTINGS_STORAGE_KEY)).toBe(false);
    expect(readLlmRuntimeSettings()).toEqual({ enabled: false, apiKey: null });
  });

  it('uses the restored runtime key for the DeepSeek connection header', async () => {
    const values = new Map<string, string>();
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
      dispatchEvent: vi.fn(),
    });
    writeLlmRuntimeSettings({ enabled: true, apiKey: 'sk-restored-test' });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const restored = readLlmRuntimeSettings();
    await expect(testDeepSeekConnection()).resolves.toBe('available');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.deepseek.com/chat/completions');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer sk-restored-test');
  });
});
