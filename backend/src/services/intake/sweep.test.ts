import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../../db/connection.js', () => ({ getDatabase: () => db }));

const { sweepOrphanedIntakeItems } = await import('./sweep.js');
const { IntakeRepository } = await import('../../repositories/IntakeRepository.js');

let tmpDir: string;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE intake_items (
      id TEXT PRIMARY KEY, created_by TEXT, source_text TEXT NOT NULL, source_artifact_id TEXT,
      source_hash TEXT NOT NULL, ai_job_id TEXT, status TEXT NOT NULL DEFAULT 'pending',
      source_file_path TEXT, source_file_mime_type TEXT, source_file_original_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), committed_at TEXT
    );
  `);
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aft-intake-sweep-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('sweepOrphanedIntakeItems', () => {
  it('marks a pending/extracting item failed, and leaves awaiting_review/committed alone', () => {
    const repo = new IntakeRepository();
    const pending = repo.createItem({ created_by: 'u1', source_text: 'a', source_hash: 'h1' });
    const extracting = repo.createItem({ created_by: 'u1', source_text: 'b', source_hash: 'h2' });
    repo.setStatus(extracting.id, 'extracting');
    const reviewing = repo.createItem({ created_by: 'u1', source_text: 'c', source_hash: 'h3' });
    repo.setStatus(reviewing.id, 'awaiting_review');

    sweepOrphanedIntakeItems();

    expect(repo.findItemById(pending.id)!.status).toBe('failed');
    expect(repo.findItemById(extracting.id)!.status).toBe('failed');
    expect(repo.findItemById(reviewing.id)!.status).toBe('awaiting_review');
  });

  it('deletes an orphaned staged upload and clears the reference', () => {
    const filePath = path.join(tmpDir, 'photo.jpg');
    fs.writeFileSync(filePath, 'bytes');

    const repo = new IntakeRepository();
    const item = repo.createItem({
      created_by: 'u1', source_text: '', source_hash: 'h1',
      source_file_path: filePath, source_file_mime_type: 'image/jpeg', source_file_original_name: 'photo.jpg',
    });
    repo.setStatus(item.id, 'extracting');

    sweepOrphanedIntakeItems();

    expect(fs.existsSync(filePath)).toBe(false);
    const updated = repo.findItemById(item.id)!;
    expect(updated.status).toBe('failed');
    expect(updated.source_file_path).toBeNull();
  });

  it('does nothing when there are no orphaned items', () => {
    expect(() => sweepOrphanedIntakeItems()).not.toThrow();
  });
});
