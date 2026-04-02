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

    logBackup(type, filename, 'failed', { error_message: msg, duration_ms: durationMs });
    logger.error(`Backup failed: ${msg}`);

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

  const files = fs.readdirSync(backupDir)
    .filter(f => f.endsWith('.bak'))
    .map(f => ({ name: f, path: path.join(backupDir, f), mtime: fs.statSync(path.join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length <= maxBackups) return;

  const toDelete = files.slice(maxBackups);
  for (const file of toDelete) {
    try {
      fs.unlinkSync(file.path);
      logger.info(`Deleted old backup: ${file.name}`);
    } catch (error) {
      logger.warn(`Failed to delete backup ${file.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
