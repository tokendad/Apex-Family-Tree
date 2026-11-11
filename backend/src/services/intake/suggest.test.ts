import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../../db/connection.js', () => ({ getDatabase: () => db }));

const extractMock = vi.fn();
vi.mock('../../providers/llm/factory.js', () => ({
  createLLMProvider: async () => ({ extract: extractMock }),
}));

const { scanForSuggestions } = await import('./suggest.js');

function seedSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE archive_objects (
      id TEXT PRIMARY KEY, object_type TEXT NOT NULL, title TEXT NOT NULL, summary TEXT,
      privacy_level TEXT NOT NULL DEFAULT 'family', is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT, updated_by TEXT
    );
    CREATE TABLE artifacts (
      id TEXT PRIMARY KEY, artifact_type_id TEXT, transcription TEXT
    );
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT, value_type TEXT NOT NULL DEFAULT 'string');
    CREATE TABLE ai_jobs (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      requested_by TEXT, provider TEXT NOT NULL, model TEXT NOT NULL,
      input_ref TEXT, result_json TEXT, error_message TEXT, input_tokens INTEGER, output_tokens INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), started_at TEXT, completed_at TEXT
    );
    CREATE TABLE intake_items (
      id TEXT PRIMARY KEY, created_by TEXT, source_text TEXT NOT NULL, source_artifact_id TEXT,
      source_hash TEXT NOT NULL, ai_job_id TEXT, status TEXT NOT NULL DEFAULT 'pending', trigger TEXT NOT NULL DEFAULT 'manual',
      source_file_path TEXT, source_file_mime_type TEXT, source_file_original_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), committed_at TEXT
    );
    CREATE TABLE intake_proposals (
      id TEXT PRIMARY KEY, intake_item_id TEXT NOT NULL, proposal_type TEXT NOT NULL,
      payload TEXT NOT NULL, confidence INTEGER, decision TEXT, edited_payload TEXT,
      committed_object_id TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), decided_at TEXT
    );
  `);
}

function seedArtifact(id: string, transcription: string | null) {
  db.prepare(`INSERT INTO archive_objects (id, object_type, title) VALUES (?, 'artifact', ?)`).run(id, id);
  db.prepare(`INSERT INTO artifacts (id, transcription) VALUES (?, ?)`).run(id, transcription);
}

beforeEach(() => {
  db = new Database(':memory:');
  seedSchema(db);
  extractMock.mockReset();
  extractMock.mockResolvedValue({ data: { proposals: [] }, inputTokens: 1, outputTokens: 1 });
});

describe('scanForSuggestions', () => {
  it('queues one suggested intake item per transcribed artifact, up to the limit', async () => {
    seedArtifact('a1', 'John Smith was born in 1920.');
    seedArtifact('a2', 'Jane Doe married in 1945.');
    seedArtifact('a3', null); // no transcription -- not a candidate
    seedArtifact('a4', '   '); // blank -- not a candidate

    const result = scanForSuggestions('user-1', 5);

    expect(result.queued).toBe(2);
    const items = db.prepare("SELECT * FROM intake_items WHERE trigger = 'suggested'").all() as { source_artifact_id: string; source_text: string }[];
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.source_artifact_id).sort()).toEqual(['a1', 'a2']);
  });

  it('respects the limit', () => {
    seedArtifact('a1', 'text one');
    seedArtifact('a2', 'text two');
    seedArtifact('a3', 'text three');

    const result = scanForSuggestions('user-1', 2);

    expect(result.queued).toBe(2);
  });

  it('does not re-suggest an artifact already scanned before', () => {
    seedArtifact('a1', 'John Smith was born in 1920.');
    scanForSuggestions('user-1', 5);

    const second = scanForSuggestions('user-1', 5);

    expect(second.queued).toBe(0);
  });

  it('sets source_artifact_id immediately, unlike a manual submission', () => {
    seedArtifact('a1', 'John Smith was born in 1920.');

    scanForSuggestions('user-1', 5);

    const item = db.prepare("SELECT * FROM intake_items WHERE trigger = 'suggested'").get() as { source_artifact_id: string };
    expect(item.source_artifact_id).toBe('a1');
  });

  it('does not re-scan an artifact a committed manual intake already created (its transcription is that submission\'s own pasted text)', () => {
    seedArtifact('a1', 'John Smith was born in 1920.');
    db.prepare(
      `INSERT INTO intake_items (id, created_by, source_text, source_hash, source_artifact_id, trigger, status)
       VALUES ('item1', 'user-1', 'John Smith was born in 1920.', 'hash1', 'a1', 'manual', 'committed')`,
    ).run();

    const result = scanForSuggestions('user-1', 5);

    expect(result.queued).toBe(0);
  });

  it('retries an artifact whose earlier suggestion scan never got anywhere (status failed)', () => {
    seedArtifact('a1', 'John Smith was born in 1920.');
    db.prepare(
      `INSERT INTO intake_items (id, created_by, source_text, source_hash, source_artifact_id, trigger, status)
       VALUES ('item1', 'user-1', 'John Smith was born in 1920.', 'hash1', 'a1', 'suggested', 'failed')`,
    ).run();

    const result = scanForSuggestions('user-1', 5);

    expect(result.queued).toBe(1);
  });
});
