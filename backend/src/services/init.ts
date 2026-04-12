import fs from 'fs';
import path from 'path';
import type { Logger } from './logger.js';

const DATA_DIR = process.env.DATA_DIR || '/app/data';
const MEDIA_PATH = process.env.MEDIA_PATH || path.join(DATA_DIR, 'media');

const REQUIRED_DIRS = [
  DATA_DIR,
  MEDIA_PATH,
  path.join(MEDIA_PATH, 'photos'),
  path.join(MEDIA_PATH, 'documents'),
  path.join(DATA_DIR, 'logs'),
  path.join(DATA_DIR, 'imports'),
  path.join(DATA_DIR, 'exports'),
  path.join(DATA_DIR, 'backups'),
];

export function initializeDataDirectories(logger: Logger): void {
  for (const fullPath of REQUIRED_DIRS) {
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

export function getMediaPath(...segments: string[]): string {
  return path.join(MEDIA_PATH, ...segments);
}
