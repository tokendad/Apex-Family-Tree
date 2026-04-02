import Database from 'better-sqlite3';
import type { Logger } from '../services/logger.js';
import { getDataPath } from '../services/init.js';

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

export function initializeDatabase(logger: Logger): Database.Database {
  const dbPath = getDataPath('treeroots.db');
  logger.info(`Initializing SQLite database at ${dbPath}`);

  db = new Database(dbPath);

  // Performance and safety PRAGMAs
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000');  // 64MB
  db.pragma('foreign_keys = ON');
  db.pragma('temp_store = MEMORY');
  db.pragma('mmap_size = 268435456');  // 256MB
  db.pragma('busy_timeout = 5000');

  // Verify WAL mode
  const journalMode = db.pragma('journal_mode', { simple: true });
  if (journalMode !== 'wal') {
    logger.warn(`Expected WAL journal mode, got: ${journalMode}`);
  } else {
    logger.info('SQLite WAL mode enabled');
  }

  logger.info('Database initialized successfully');
  return db;
}

export function closeDatabase(logger: Logger): void {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}
