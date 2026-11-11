-- Shared foundation for #73 (AI Research Intake) and #75 (AI Transcript):
-- a place to configure an LLM provider and its key, two off-by-default
-- feature flags, and a generic async-job table. Nothing in this migration
-- is wired to anything yet -- the provider, the routes, and the flag
-- enforcement are application code, added alongside it.
--
-- llm_api_key is seeded 'encrypted' and must only ever be read through
-- LocalSecretProvider.getSecret(), never SettingsRepository.getSettingValue()
-- directly -- that method does not actually decrypt despite the column name
-- (see its own "Placeholder for future AES decryption" comment). Written
-- through routes/settings.ts, which does encrypt, once 'llm_api_key' is
-- added to its ENCRYPTED_KEYS set.
INSERT OR IGNORE INTO app_settings (key, value, value_type, description) VALUES
  ('llm_provider', 'anthropic', 'string', 'Active LLM provider id'),
  ('llm_model', 'claude-opus-5-5', 'string', 'Model id used for AI features'),
  ('llm_api_key', NULL, 'encrypted', 'API key for the active LLM provider');

-- Both off: this sends the owner's documents to a third-party API, so it
-- stays opt-in until an admin turns it on in Admin Settings.
INSERT OR IGNORE INTO feature_flags (key, enabled, description) VALUES
  ('ai_transcription', 0, 'Enable AI-assisted artifact transcription (issue #75)'),
  ('ai_intake', 0, 'Enable AI Research Intake (issue #73)');

-- Generic "call an LLM, come back later" job row. There is no background
-- worker anywhere in this app; the intended lifecycle is a route creating
-- this row and responding immediately, a setImmediate-deferred call doing
-- the actual work and updating the row when it resolves, and the client
-- polling GET /ai/jobs/:id. input_ref is deliberately untyped (an artifact
-- id for a transcribe job, an intake item id for an extract job) rather than
-- two nullable FK columns, since exactly one of several future kinds will
-- ever apply to a given row.
-- requested_by is nullable with ON DELETE SET NULL, not a hard NOT NULL FK:
-- import_jobs made that mistake (user_id TEXT NOT NULL REFERENCES users(id),
-- no ON DELETE) and 064's own comment calls it out as "actively harmful" for
-- audit_log -- deleting a user who ever ran a job would fail outright. A job
-- row with no 'who' still makes sense to keep; it just no longer says who.
CREATE TABLE IF NOT EXISTS ai_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('transcribe', 'extract')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  requested_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_ref TEXT,
  result_json TEXT,
  error_message TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_jobs_status ON ai_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_input_ref ON ai_jobs(input_ref);
