import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../../db/connection.js', () => ({ getDatabase: () => db }));
vi.mock('../../services/encryption.js', () => ({
  encrypt: (v: string) => `enc:${v}`,
  decrypt: (v: string) => v.replace(/^enc:/, ''),
}));

const { createLLMProvider } = await import('./factory.js');
const { ClaudeProvider } = await import('./ClaudeProvider.js');
const { LLMProviderError } = await import('./LLMProvider.js');

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT, value_type TEXT NOT NULL DEFAULT 'string');
  `);
});

afterEach(() => db.close());

describe('createLLMProvider', () => {
  it('throws an auth LLMProviderError when no key is configured', async () => {
    db.prepare("INSERT INTO app_settings (key, value, value_type) VALUES ('llm_provider', 'anthropic', 'string')").run();

    await expect(createLLMProvider()).rejects.toMatchObject({ kind: 'auth' });
  });

  it('builds a ClaudeProvider for provider "anthropic", decrypting the stored key', async () => {
    db.prepare("INSERT INTO app_settings (key, value, value_type) VALUES ('llm_provider', 'anthropic', 'string')").run();
    db.prepare("INSERT INTO app_settings (key, value, value_type) VALUES ('llm_model', 'claude-opus-5-5', 'string')").run();
    db.prepare("INSERT INTO app_settings (key, value, value_type) VALUES ('llm_api_key', 'enc:sk-test', 'encrypted')").run();

    const provider = await createLLMProvider();

    expect(provider).toBeInstanceOf(ClaudeProvider);
  });

  it('defaults to anthropic/claude-opus-5-5 when provider/model are unset', async () => {
    db.prepare("INSERT INTO app_settings (key, value, value_type) VALUES ('llm_api_key', 'enc:sk-test', 'encrypted')").run();

    const provider = await createLLMProvider();

    expect(provider).toBeInstanceOf(ClaudeProvider);
  });

  it('rejects an unknown provider id', async () => {
    db.prepare("INSERT INTO app_settings (key, value, value_type) VALUES ('llm_provider', 'not-a-real-provider', 'string')").run();
    db.prepare("INSERT INTO app_settings (key, value, value_type) VALUES ('llm_api_key', 'enc:sk-test', 'encrypted')").run();

    await expect(createLLMProvider()).rejects.toMatchObject({ kind: 'provider' });
    try {
      await createLLMProvider();
    } catch (error) {
      expect(error).toBeInstanceOf(LLMProviderError);
    }
  });
});
