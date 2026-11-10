import Database from 'better-sqlite3';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;
let dataDir: string;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));

const extractMock = vi.fn();
vi.mock('../providers/llm/factory.js', () => ({
  createLLMProvider: async () => ({ extract: extractMock }),
}));
vi.mock('../services/backup.js', () => ({ createPreImportBackup: vi.fn(() => true) }));
// Real multer writes a real file for the multipart tests below -- staged
// under a throwaway tmpdir standing in for DATA_DIR, never the real one.
vi.mock('../services/init.js', () => ({
  getDataPath: (...segments: string[]) => path.join(dataDir, ...segments),
  getMediaPath: (...segments: string[]) => path.join(dataDir, 'media', ...segments),
}));

const { intakeRouter } = await import('./intake.js');

type Role = 'admin' | 'editor' | 'viewer';

function buildApp(role: Role = 'editor') {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { userId: 'user-1', email: 'test@example.com', role };
    next();
  });
  app.use('/api/v1/intake', intakeRouter);
  return app;
}

function seedSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE archive_objects (
      id TEXT PRIMARY KEY, object_type TEXT NOT NULL, title TEXT NOT NULL, summary TEXT,
      privacy_level TEXT NOT NULL DEFAULT 'family', is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT, updated_by TEXT
    );
    CREATE TABLE artifacts (
      id TEXT PRIMARY KEY, artifact_type_id TEXT, evidence_classification_id TEXT,
      original_date_text TEXT, original_date_start TEXT, original_date_end TEXT,
      date_precision TEXT, date_qualifier TEXT, creator_text TEXT, physical_location TEXT,
      original_format TEXT, condition_notes TEXT, language TEXT, transcription TEXT, notes TEXT
    );
    CREATE TABLE artifact_types (id TEXT PRIMARY KEY, name TEXT, sort_order INTEGER DEFAULT 0);
    CREATE TABLE evidence_classifications (id TEXT PRIMARY KEY, name TEXT, sort_order INTEGER DEFAULT 0);
    CREATE TABLE persons (
      id TEXT PRIMARY KEY, sex TEXT DEFAULT 'U', is_living INTEGER NOT NULL DEFAULT 1,
      is_private INTEGER NOT NULL DEFAULT 0, notes TEXT, display_name TEXT, created_by TEXT, gedcom_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE names (
      id TEXT PRIMARY KEY, person_id TEXT NOT NULL, name_type TEXT NOT NULL DEFAULT 'birth',
      prefix TEXT, given_name TEXT, middle_name TEXT, surname TEXT, suffix TEXT, nickname TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE events (
      id TEXT PRIMARY KEY, person_id TEXT, family_id TEXT, event_type TEXT NOT NULL,
      event_date TEXT, event_date_qualifier TEXT, event_date_sort_key INTEGER, event_place TEXT,
      plot TEXT, description TEXT, source_url TEXT, source_url_checked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE families (
      id TEXT PRIMARY KEY, spouse1_id TEXT, spouse2_id TEXT, marriage_date TEXT,
      marriage_date_qualifier TEXT, marriage_date_sort_key INTEGER, marriage_place TEXT,
      divorce_date TEXT, divorce_place TEXT, gedcom_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE family_members (
      id TEXT PRIMARY KEY, family_id TEXT NOT NULL, person_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'child', sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE claims (
      id TEXT PRIMARY KEY, statement TEXT NOT NULL, claim_type TEXT, subject_object_id TEXT,
      date_text TEXT, date_start TEXT, date_end TEXT, confidence_level_id TEXT, confidence_score INTEGER,
      status TEXT NOT NULL DEFAULT 'open', notes TEXT, research_section TEXT
    );
    CREATE TABLE claim_subjects (id TEXT PRIMARY KEY, claim_id TEXT, subject_object_id TEXT, role TEXT);
    CREATE TABLE claim_evidence (
      id TEXT PRIMARY KEY, claim_id TEXT, evidence_object_id TEXT, evidence_role TEXT,
      evidence_classification_id TEXT, excerpt TEXT, locator TEXT, weight_score INTEGER,
      confidence_contribution INTEGER, notes TEXT,
      UNIQUE (claim_id, evidence_object_id, evidence_role)
    );
    CREATE TABLE confidence_levels (id TEXT PRIMARY KEY, name TEXT, sort_order INTEGER DEFAULT 0);
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE media_items (
      id TEXT PRIMARY KEY, filename TEXT, original_filename TEXT, mime_type TEXT,
      file_size INTEGER, file_path TEXT, thumbnail_path TEXT, uploaded_by TEXT, is_external INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE artifact_files (
      id TEXT PRIMARY KEY, artifact_id TEXT, file_role TEXT, storage_provider TEXT DEFAULT 'local',
      storage_path TEXT, original_filename TEXT, mime_type TEXT, size_bytes INTEGER,
      width INTEGER, height INTEGER, duration_seconds REAL, created_at TEXT
    );
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT, value_type TEXT NOT NULL DEFAULT 'string');
    CREATE TABLE feature_flags (key TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0);

    CREATE TABLE ai_jobs (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      requested_by TEXT, provider TEXT NOT NULL, model TEXT NOT NULL,
      input_ref TEXT, result_json TEXT, error_message TEXT, input_tokens INTEGER, output_tokens INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), started_at TEXT, completed_at TEXT
    );
    CREATE TABLE intake_items (
      id TEXT PRIMARY KEY, created_by TEXT, source_text TEXT NOT NULL, source_artifact_id TEXT,
      source_hash TEXT NOT NULL, ai_job_id TEXT, status TEXT NOT NULL DEFAULT 'pending',
      source_file_path TEXT, source_file_mime_type TEXT, source_file_original_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), committed_at TEXT
    );
    CREATE TABLE intake_proposals (
      id TEXT PRIMARY KEY, intake_item_id TEXT NOT NULL, proposal_type TEXT NOT NULL,
      payload TEXT NOT NULL, confidence INTEGER, decision TEXT, edited_payload TEXT,
      committed_object_id TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), decided_at TEXT
    );
    CREATE TABLE intake_conflicts (
      id TEXT PRIMARY KEY, intake_item_id TEXT NOT NULL, proposal_id TEXT NOT NULL,
      record_type TEXT NOT NULL, field_name TEXT NOT NULL, existing_value TEXT, incoming_value TEXT,
      resolution TEXT, resolved_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO feature_flags (key, enabled) VALUES ('ai_intake', 1);
    INSERT INTO artifact_types (id, name) VALUES ('artifact_type_document', 'Document');
  `);
}

beforeEach(() => {
  db = new Database(':memory:');
  seedSchema(db);
  extractMock.mockReset();
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aft-intake-'));
});

afterEach(() => {
  vi.useRealTimers();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('intake routes', () => {
  it('403s for a viewer', async () => {
    const res = await request(buildApp('viewer')).post('/api/v1/intake').send({ text: 'John Smith was born in 1920.' });
    expect(res.status).toBe(403);
  });

  it('403s when the ai_intake flag is off', async () => {
    db.prepare("UPDATE feature_flags SET enabled = 0 WHERE key = 'ai_intake'").run();
    const res = await request(buildApp('editor')).post('/api/v1/intake').send({ text: 'John Smith was born in 1920.' });
    expect(res.status).toBe(403);
  });

  it('400s with no text', async () => {
    const res = await request(buildApp('editor')).post('/api/v1/intake').send({});
    expect(res.status).toBe(400);
  });

  it('submits text, extracts proposals, and allows a full accept + commit cycle', async () => {
    extractMock.mockResolvedValueOnce({
      data: {
        proposals: [{
          type: 'person',
          ref: 'person_1',
          givenName: 'John',
          surname: 'Smith',
          birthDate: '1920',
          citations: [{ quote: 'John Smith was born in 1920', locator: null }],
        }],
      },
      inputTokens: 50,
      outputTokens: 20,
    });

    const text = 'John Smith was born in 1920.';
    const submitRes = await request(buildApp('editor')).post('/api/v1/intake').send({ text });
    expect(submitRes.status).toBe(202);
    const intakeItemId = submitRes.body.intakeItemId as string;

    // runAiJob defers via setImmediate; let it run.
    await new Promise((resolve) => setImmediate(resolve));

    const getRes = await request(buildApp('editor')).get(`/api/v1/intake/${intakeItemId}`);
    expect(getRes.body.item.status).toBe('awaiting_review');

    const proposalsRes = await request(buildApp('editor')).get(`/api/v1/intake/${intakeItemId}/proposals`);
    expect(proposalsRes.body.proposals).toHaveLength(1);
    const proposalId = proposalsRes.body.proposals[0].id as string;

    const decideRes = await request(buildApp('editor'))
      .post(`/api/v1/intake/${intakeItemId}/proposals/${proposalId}`)
      .send({ decision: 'accept' });
    expect(decideRes.status).toBe(200);

    const commitRes = await request(buildApp('editor')).post(`/api/v1/intake/${intakeItemId}/commit`);
    expect(commitRes.status).toBe(200);
    expect(commitRes.body).toMatchObject({ committed: 1, conflicts: 0 });

    const person = db.prepare('SELECT * FROM persons').get() as { id: string } | undefined;
    expect(person).toBeTruthy();
  });

  it('409s a commit while a proposal is still undecided', async () => {
    extractMock.mockResolvedValueOnce({
      data: {
        proposals: [{
          type: 'person', ref: 'person_1', givenName: 'John', surname: 'Smith',
          citations: [{ quote: 'John Smith', locator: null }],
        }],
      },
      inputTokens: 10,
      outputTokens: 5,
    });

    const submitRes = await request(buildApp('editor')).post('/api/v1/intake').send({ text: 'John Smith.' });
    await new Promise((resolve) => setImmediate(resolve));

    const commitRes = await request(buildApp('editor')).post(`/api/v1/intake/${submitRes.body.intakeItemId}/commit`);
    expect(commitRes.status).toBe(409);
  });

  it('returns the same intake item for a resubmission of identical text while it is still pending review', async () => {
    extractMock.mockResolvedValueOnce({ data: { proposals: [] }, inputTokens: 1, outputTokens: 1 });

    const text = 'Duplicate submission text.';
    const first = await request(buildApp('editor')).post('/api/v1/intake').send({ text });
    await new Promise((resolve) => setImmediate(resolve));

    const second = await request(buildApp('editor')).post('/api/v1/intake').send({ text });
    expect(second.body.intakeItemId).toBe(first.body.intakeItemId);
    expect(extractMock).toHaveBeenCalledTimes(1);
  });

  it('accepts a multipart file upload, extracts via the file source, and commits with the file attached to the artifact', async () => {
    extractMock.mockResolvedValueOnce({
      data: {
        proposals: [
          {
            type: 'person', ref: 'person_1', givenName: 'Jane', surname: 'Doe',
            citations: [{ quote: 'anything -- not substring-checked for a file source', locator: null }],
          },
          {
            type: 'fact', statement: 'Shown in the photo.', subjectRef: 'person_1',
            citations: [{ quote: 'anything -- not substring-checked for a file source', locator: null }],
          },
        ],
      },
      inputTokens: 20,
      outputTokens: 10,
    });

    const submitRes = await request(buildApp('editor'))
      .post('/api/v1/intake')
      .attach('file', Buffer.from('fake-jpeg-bytes'), { filename: 'photo.jpg', contentType: 'image/jpeg' });
    expect(submitRes.status).toBe(202);
    const intakeItemId = submitRes.body.intakeItemId as string;

    await new Promise((resolve) => setImmediate(resolve));

    expect(extractMock).toHaveBeenCalledWith(
      expect.objectContaining({ file: { bytes: expect.any(Buffer), mediaType: 'image/jpeg' } }),
      expect.anything(),
    );

    const proposalsRes = await request(buildApp('editor')).get(`/api/v1/intake/${intakeItemId}/proposals`);
    expect(proposalsRes.body.proposals).toHaveLength(2);
    expect(proposalsRes.body.proposals[0].payload.citations[0].citationStatus).toBe('unconfirmed_image');

    for (const proposal of proposalsRes.body.proposals) {
      await request(buildApp('editor'))
        .post(`/api/v1/intake/${intakeItemId}/proposals/${proposal.id}`)
        .send({ decision: 'accept' });
    }

    const commitRes = await request(buildApp('editor')).post(`/api/v1/intake/${intakeItemId}/commit`);
    expect(commitRes.status).toBe(200);
    expect(commitRes.body).toMatchObject({ committed: 2, conflicts: 0 });

    const media = db.prepare('SELECT * FROM media_items').get() as { file_path: string; mime_type: string } | undefined;
    expect(media).toBeTruthy();
    expect(media!.mime_type).toBe('image/jpeg');
    expect(fs.existsSync(media!.file_path)).toBe(true);

    const item = (await request(buildApp('editor')).get(`/api/v1/intake/${intakeItemId}`)).body.item;
    expect(item.source_file_path).toBeNull(); // handed off to the artifact, no longer tracked as staged
  });

  it('deletes the staged upload when extraction fails for a file submission', async () => {
    extractMock.mockRejectedValueOnce(new Error('No LLM API key is configured.'));

    const submitRes = await request(buildApp('editor'))
      .post('/api/v1/intake')
      .attach('file', Buffer.from('fake-jpeg-bytes'), { filename: 'photo.jpg', contentType: 'image/jpeg' });
    const intakeItemId = submitRes.body.intakeItemId as string;

    await new Promise((resolve) => setImmediate(resolve));

    const uploadedFiles = fs.readdirSync(path.join(dataDir, 'intake-uploads'));
    expect(uploadedFiles).toHaveLength(0);

    const item = (await request(buildApp('editor')).get(`/api/v1/intake/${intakeItemId}`)).body.item;
    expect(item.status).toBe('failed');
    expect(item.source_file_path).toBeNull();
  });
});
