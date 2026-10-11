import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;
let dataDir: string;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));
vi.mock('./init.js', () => ({
  getDataPath: (...segments: string[]) => path.join(dataDir, ...segments),
}));

const { createBackup, createPreImportBackup, applyRetentionPolicy } = await import('./backup.js');

const tempDirs: string[] = [];
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

/** Writes a backup file of the given type with a controllable mtime. */
function seedBackup(name: string, ageMs = 0): string {
  const full = path.join(dataDir, 'backups', name);
  fs.writeFileSync(full, 'backup bytes');
  const when = new Date(Date.now() - ageMs);
  fs.utimesSync(full, when, when);
  return full;
}

function listBackups(): string[] {
  return fs.readdirSync(path.join(dataDir, 'backups')).sort();
}

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aft-backup-'));
  tempDirs.push(dataDir);
  fs.mkdirSync(path.join(dataDir, 'backups'));

  // A real database file on disk: createBackup copies the file, not the handle.
  db = new Database(path.join(dataDir, 'treeroots.db'));
  db.exec(`
    CREATE TABLE backup_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, backup_type TEXT, filename TEXT,
      file_size INTEGER, status TEXT, error_message TEXT, duration_ms INTEGER, created_at TEXT
    );
    CREATE TABLE persons (id TEXT PRIMARY KEY);
  `);
  db.prepare("INSERT INTO persons (id) VALUES ('p1')").run();

  vi.clearAllMocks();
});

afterEach(() => {
  db.close();
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('createBackup', () => {
  it('writes a restorable copy of the database', () => {
    const dest = createBackup('startup', logger);

    expect(dest).not.toBeNull();
    expect(fs.existsSync(dest!)).toBe(true);

    // Readable as a database, with the data in it — not a truncated file.
    const restored = new Database(dest!, { readonly: true });
    expect(restored.prepare('SELECT id FROM persons').all()).toEqual([{ id: 'p1' }]);
    restored.close();
  });

  it('records the backup in backup_log', () => {
    createBackup('pre_import', logger);

    const rows = db.prepare('SELECT backup_type, status, file_size FROM backup_log ORDER BY id').all() as
      { backup_type: string; status: string; file_size: number | null }[];

    expect(rows.map((r) => r.status)).toEqual(['started', 'completed']);
    expect(rows[1].backup_type).toBe('pre_import');
    expect(rows[1].file_size).toBeGreaterThan(0);
  });

  /* The import route refuses to run when this returns null, so the failure has
     to be reported rather than thrown. */
  it('returns null and logs a failure when the copy cannot be written', () => {
    fs.rmSync(path.join(dataDir, 'backups'), { recursive: true, force: true });

    expect(createPreImportBackup(logger)).toBeNull();
    expect(logger.error).toHaveBeenCalled();

    const failed = db.prepare("SELECT COUNT(*) c FROM backup_log WHERE status = 'failed'").get() as { c: number };
    expect(failed.c).toBe(1);
  });
});

describe('applyRetentionPolicy', () => {
  it('keeps the newest backups of a type and deletes the rest', () => {
    for (let i = 0; i < 5; i++) {
      seedBackup(`treeroots.db.startup.2026-10-1${i}.bak`, (5 - i) * 1000);
    }

    applyRetentionPolicy(logger, 3);

    const kept = listBackups();
    expect(kept).toHaveLength(3);
    // The three most recent, i.e. the highest-numbered.
    expect(kept).toEqual([
      'treeroots.db.startup.2026-10-12.bak',
      'treeroots.db.startup.2026-10-13.bak',
      'treeroots.db.startup.2026-10-14.bak',
    ]);
  });

  /* The reason retention is per type. Startup backups are written on every
     boot, so a shared cap would let a run of restarts quietly evict the
     snapshot taken before an import -- the one actually worth keeping. */
  it('does not let frequent startup backups evict a pre-import snapshot', () => {
    seedBackup('treeroots.db.pre_import.2026-10-01.bak', 999_000);
    for (let i = 0; i < 10; i++) {
      seedBackup(`treeroots.db.startup.2026-10-1${i}.bak`, (10 - i) * 1000);
    }

    applyRetentionPolicy(logger, 3);

    const kept = listBackups();
    expect(kept).toContain('treeroots.db.pre_import.2026-10-01.bak');
    expect(kept.filter((f) => f.includes('.startup.'))).toHaveLength(3);
  });

  it('counts each type against its own cap', () => {
    for (let i = 0; i < 4; i++) {
      seedBackup(`treeroots.db.startup.2026-10-0${i}.bak`, (4 - i) * 1000);
      seedBackup(`treeroots.db.pre_migration.2026-10-0${i}.bak`, (4 - i) * 1000);
    }

    applyRetentionPolicy(logger, 2);

    const kept = listBackups();
    expect(kept.filter((f) => f.includes('.startup.'))).toHaveLength(2);
    expect(kept.filter((f) => f.includes('.pre_migration.'))).toHaveLength(2);
  });

  /* Hand-made snapshots live in the same directory and are not ours to delete. */
  it('leaves files it did not create alone', () => {
    seedBackup('treeroots-before-person-delete-20261007.db', 999_000);
    seedBackup('something-else.bak', 999_000);
    for (let i = 0; i < 4; i++) {
      seedBackup(`treeroots.db.startup.2026-10-0${i}.bak`, (4 - i) * 1000);
    }

    applyRetentionPolicy(logger, 1);

    const kept = listBackups();
    expect(kept).toContain('treeroots-before-person-delete-20261007.db');
    expect(kept).toContain('something-else.bak');
    expect(kept.filter((f) => f.includes('.startup.'))).toHaveLength(1);
  });

  it('does nothing when the backup directory does not exist', () => {
    fs.rmSync(path.join(dataDir, 'backups'), { recursive: true, force: true });

    expect(() => applyRetentionPolicy(logger, 3)).not.toThrow();
  });
});
