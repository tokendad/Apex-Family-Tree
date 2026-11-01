import fs from 'fs';
import path from 'path';
import { getDatabase } from '../db/connection.js';
import { getDataPath } from './init.js';
import type { Logger } from './logger.js';
import type { BackupLogEntry } from '../types/db.js';

const BACKUP_DIR = 'backups';
const DB_FILENAME = 'treeroots.db';

function generateTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
}

function logBackup(
  type: BackupLogEntry['backup_type'],
  filename: string,
  status: BackupLogEntry['status'],
  opts?: { file_size?: number; error_message?: string; duration_ms?: number },
): void {
  const db = getDatabase();

  /* backup_log arrives with migration 027, and the startup backup is taken
     before runMigrations -- so on a database being created right now the table
     does not exist yet. Writing the audit row used to throw SQLITE_ERROR from
     here, and because createBackup's own catch called this function again
     before reaching its logger, the second throw escaped uncaught and the
     process exited: AFT could not start on an empty database at all. An
     install's very first boot is exactly the case nobody tests.

     A missing audit row is never worth failing a boot for. Once 027 has run
     this table exists for the rest of the instance's life. */
  const table = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'backup_log'",
  ).get();
  if (!table) return;

  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  db.prepare(
    'INSERT INTO backup_log (backup_type, filename, file_size, status, error_message, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(type, filename, opts?.file_size || null, status, opts?.error_message || null, opts?.duration_ms || null, now);
}

export function createBackup(type: BackupLogEntry['backup_type'], logger: Logger): string | null {
  const db = getDatabase();
  const backupDir = getDataPath(BACKUP_DIR);
  const filename = `${DB_FILENAME}.${type}.${generateTimestamp()}.bak`;
  const destPath = path.join(backupDir, filename);
  const srcPath = getDataPath(DB_FILENAME);

  logBackup(type, filename, 'started');
  const startTime = Date.now();

  try {
    // Checkpoint WAL so the main db file is up-to-date
    db.pragma('wal_checkpoint(TRUNCATE)');

    fs.copyFileSync(srcPath, destPath);

    const stats = fs.statSync(destPath);
    const durationMs = Date.now() - startTime;

    logBackup(type, filename, 'completed', { file_size: stats.size, duration_ms: durationMs });
    logger.info(`Backup created: ${filename} (${stats.size} bytes, ${durationMs}ms)`);

    return destPath;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - startTime;

    /* Report before recording. This order is deliberate: writing the audit row
       touches the database, which is where the failure may have come from, and
       the reason the first-boot crash was invisible was that this log line sat
       behind a logBackup call that threw. Whatever happens to the row, the
       operator gets told, and a failed backup still returns null rather than
       taking the process down with it. */
    logger.error(`Backup failed: ${msg}`);
    try {
      logBackup(type, filename, 'failed', { error_message: msg, duration_ms: durationMs });
    } catch (logError) {
      logger.error(`Backup log write also failed: ${logError instanceof Error ? logError.message : String(logError)}`);
    }

    return null;
  }
}

export function createStartupBackup(logger: Logger): string | null {
  return createBackup('startup', logger);
}

export function createPreMigrationBackup(logger: Logger): string | null {
  return createBackup('pre_migration', logger);
}

export function createPreImportBackup(logger: Logger): string | null {
  return createBackup('pre_import', logger);
}

export function applyRetentionPolicy(logger: Logger, maxBackups = 10): void {
  const backupDir = getDataPath(BACKUP_DIR);

  if (!fs.existsSync(backupDir)) return;

  /* Retention is per backup type, not across the whole directory. A shared cap
     would let a run of restarts evict the snapshot taken before an import or a
     migration -- precisely the one worth keeping -- because startup backups are
     by far the most frequent. Each type keeps its own last `maxBackups`. */
  const byType = new Map<string, { name: string; path: string; mtime: number }[]>();

  for (const name of fs.readdirSync(backupDir)) {
    const match = /^treeroots\.db\.([a-z_]+)\..*\.bak$/.exec(name);
    // Anything this policy did not create is left alone, including the
    // hand-made snapshots someone took before a risky operation.
    if (!match) continue;

    const full = path.join(backupDir, name);
    const bucket = byType.get(match[1]) ?? [];
    bucket.push({ name, path: full, mtime: fs.statSync(full).mtimeMs });
    byType.set(match[1], bucket);
  }

  for (const [type, files] of byType) {
    if (files.length <= maxBackups) continue;

    files.sort((a, b) => b.mtime - a.mtime);
    for (const file of files.slice(maxBackups)) {
      try {
        fs.unlinkSync(file.path);
        logger.info(`Deleted old ${type} backup: ${file.name}`);
      } catch (error) {
        logger.warn(`Failed to delete backup ${file.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}
