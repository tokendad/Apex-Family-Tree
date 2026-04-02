import type Database from 'better-sqlite3';
import { getDatabase } from '../db/connection.js';

export abstract class BaseRepository {
  protected get db(): Database.Database {
    return getDatabase();
  }

  protected generateId(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  protected now(): string {
    return new Date().toISOString().replace('T', ' ').replace('Z', '');
  }
}
