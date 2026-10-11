import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hasPendingMigrations } from './migrator.js';

let db: Database.Database;
let migrationsDir: string;
const tempDirs: string[] = [];

function writeMigration(name: string, sql = 'SELECT 1;'): void {
  fs.writeFileSync(path.join(migrationsDir, name), sql);
}

function markApplied(version: string): void {
  db.prepare(
    "INSERT INTO schema_migrations (version, filename, checksum, applied_at) VALUES (?, ?, 'x', datetime('now'))",
  ).run(version, `${version}.sql`);
}

function createMigrationsTable(): void {
  db.exec(`
    CREATE TABLE schema_migrations (
      version TEXT PRIMARY KEY, filename TEXT NOT NULL, checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL, execution_time_ms INTEGER
    )
  `);
}

beforeEach(() => {
  migrationsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aft-migrations-'));
  tempDirs.push(migrationsDir);
  db = new Database(':memory:');
});

afterEach(() => {
  db.close();
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('hasPendingMigrations', () => {
  it('is true when a migration file has not been applied', () => {
    createMigrationsTable();
    writeMigration('001_initial.sql');
    writeMigration('002_add_thing.sql');
    markApplied('001_initial');

    expect(hasPendingMigrations(db, migrationsDir)).toBe(true);
  });

  /* The case that keeps a backup off every ordinary restart. */
  it('is false when every migration has already been applied', () => {
    createMigrationsTable();
    writeMigration('001_initial.sql');
    writeMigration('002_add_thing.sql');
    markApplied('001_initial');
    markApplied('002_add_thing');

    expect(hasPendingMigrations(db, migrationsDir)).toBe(false);
  });

  /* No schema_migrations means the database is being created right now, so
     there is nothing in it to preserve. */
  it('is false on a database that does not yet have a migrations table', () => {
    writeMigration('001_initial.sql');

    expect(hasPendingMigrations(db, migrationsDir)).toBe(false);
  });

  it('ignores rollback files, which are never applied forward', () => {
    createMigrationsTable();
    writeMigration('001_initial.sql');
    writeMigration('001_initial-down.sql');
    markApplied('001_initial');

    expect(hasPendingMigrations(db, migrationsDir)).toBe(false);
  });

  it('is false when there are no migration files at all', () => {
    createMigrationsTable();

    expect(hasPendingMigrations(db, migrationsDir)).toBe(false);
  });
});
