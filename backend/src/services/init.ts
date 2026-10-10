import fs from 'fs';
import path from 'path';
import type { Logger } from './logger.js';

const DATA_DIR = process.env.DATA_DIR || '/app/data';
const MEDIA_PATH = process.env.MEDIA_PATH || path.join(DATA_DIR, 'media');

/**
 * Generated thumbnails go under DATA_DIR, not under MEDIA_PATH.
 *
 * MEDIA_PATH may be the user's own photo library -- here it is
 * /media/Personal/PersonalImages/Ancestry -- and AFT should not scatter
 * derived files through it. It also keeps them out of scanDirectory's reach:
 * .webp is a scannable extension and the walk recurses every subdirectory, so
 * a thumbnails folder inside MEDIA_PATH would be re-imported as 93 new
 * external media items on the next scan, each becoming its own artifact.
 */
export const THUMBNAIL_DIR_NAME = 'thumbnails';

const REQUIRED_DIRS = [
  DATA_DIR,
  MEDIA_PATH,
  path.join(MEDIA_PATH, 'photos'),
  path.join(MEDIA_PATH, 'documents'),
  path.join(DATA_DIR, THUMBNAIL_DIR_NAME),
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

/** Where generated thumbnails live. See THUMBNAIL_DIR_NAME. */
export function getThumbnailPath(...segments: string[]): string {
  return path.join(DATA_DIR, THUMBNAIL_DIR_NAME, ...segments);
}
