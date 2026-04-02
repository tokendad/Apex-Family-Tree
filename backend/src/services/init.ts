import fs from 'fs';
import path from 'path';
import type { Logger } from './logger.js';

const DATA_DIR = process.env.DATA_DIR || '/app/data';

const REQUIRED_DIRS = [
  '',           // /app/data itself
  'media',
  'media/photos',
  'media/documents',
  'logs',
  'imports',
  'exports',
  'backups',
];

export function initializeDataDirectories(logger: Logger): void {
  for (const dir of REQUIRED_DIRS) {
    const fullPath = path.join(DATA_DIR, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      logger.info(`Created directory: ${fullPath}`);
    }
  }
  logger.info('Data directories initialized');
}

export function getDataPath(...segments: string[]): string {
  return path.join(DATA_DIR, ...segments);
}
