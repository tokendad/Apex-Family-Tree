import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type Database from 'better-sqlite3';
import type { Logger } from '../services/logger.js';

interface MigrationRecord {
  version: string;
  filename: string;
  checksum: string;
  applied_at: string;
}

export function runMigrations(db: Database.Database, migrationsDir: string, logger: Logger): void {
  // Ensure schema_migrations table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now')),
      execution_time_ms INTEGER
    )
  `);

  // Read all .sql files sorted by name; skip rollback files (named *-down.sql)
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql') && !f.endsWith('-down.sql'))
    .sort();

  if (files.length === 0) {
    logger.info('No migration files found');
    return;
  }

  // Get already-applied migrations
  const applied = new Map<string, MigrationRecord>();
  const rows = db.prepare('SELECT version, filename, checksum FROM schema_migrations').all() as MigrationRecord[];
  for (const row of rows) {
    applied.set(row.version, row);
  }

  let migrationsRun = 0;

  // FK enforcement cannot be changed inside a transaction. Disable it for the
  // migration run so DDL table-rebuild patterns (rename/copy/drop) work cleanly,
  // then restore it after all migrations complete.
  const fkWasOn = db.pragma('foreign_keys', { simple: true }) === 1;
  if (fkWasOn) db.pragma('foreign_keys = OFF');

  try {
    for (const file of files) {
      const version = file.replace('.sql', '');
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');

      const existing = applied.get(version);
      if (existing) {
        // Verify checksum hasn't changed
        if (existing.checksum !== checksum) {
          throw new Error(
            `Migration ${file} checksum mismatch! Expected ${existing.checksum}, got ${checksum}. ` +
            'Applied migrations must not be modified.'
          );
        }
        continue; // Already applied
      }

      // Run migration in a transaction
      logger.info(`Running migration: ${file}`);
      const start = Date.now();

      const runMigration = db.transaction(() => {
        db.exec(sql);
        db.prepare(
          'INSERT INTO schema_migrations (version, filename, checksum, execution_time_ms) VALUES (?, ?, ?, ?)'
        ).run(version, file, checksum, Date.now() - start);
      });

      runMigration();
      migrationsRun++;
      logger.info(`Migration ${file} applied in ${Date.now() - start}ms`);
    }
  } finally {
    if (fkWasOn) db.pragma('foreign_keys = ON');
  }

  logger.info(`Migrations complete: ${migrationsRun} new, ${applied.size} already applied`);
}
