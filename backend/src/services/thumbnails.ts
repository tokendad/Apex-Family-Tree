import fs from 'fs';
import path from 'path';
import { getThumbnailPath } from './init.js';
import type { Logger } from './logger.js';
import { MediaRepository } from '../repositories/MediaRepository.js';
import type { MediaItem } from '../types/db.js';

/**
 * Longest edge of a generated thumbnail. The Artifacts grid shows cards at
 * roughly 320px wide and full-bleed on a phone, so 640 covers a 2x display
 * without storing anything like the original.
 */
export const THUMBNAIL_WIDTH = 640;

/** WebP, not JPEG: it keeps PNG transparency instead of flattening it black. */
export const THUMBNAIL_MIME = 'image/webp';

/**
 * Types libvips decodes in sharp's prebuilt binaries. PDF is deliberately
 * absent -- it is an allowed upload type, but the bundled libvips carries no
 * poppler, so a PDF keeps its type glyph on the card rather than failing on
 * every pass of the backfill.
 */
const THUMBNAILABLE_MIME = /^image\/(jpeg|png|webp|gif|tiff|avif)$/i;

export function canThumbnail(mimeType: string | null | undefined): boolean {
  return Boolean(mimeType && THUMBNAILABLE_MIME.test(mimeType.trim()));
}

/**
 * Where a media item's thumbnail lives: under DATA_DIR, which is the declared
 * volume, rather than beside the originals in MEDIA_PATH. See
 * THUMBNAIL_DIR_NAME for why it must not sit under MEDIA_PATH.
 */
export function thumbnailPathFor(mediaId: string): string {
  return getThumbnailPath(`${mediaId}.webp`);
}

/**
 * sharp is imported lazily so that a missing or mismatched native binary
 * degrades to "no thumbnails" rather than taking the whole server down at
 * import time. The result is cached, including the failure.
 */
type SharpFactory = typeof import('sharp').default;

let sharpModule: SharpFactory | null | undefined;

async function loadSharp(): Promise<SharpFactory | null> {
  if (sharpModule !== undefined) return sharpModule;
  try {
    sharpModule = (await import('sharp')).default;
  } catch {
    sharpModule = null;
  }
  return sharpModule;
}

export type ThumbnailOutcome = 'generated' | 'exists' | 'unsupported' | 'source-missing' | 'failed';

/**
 * Generate the thumbnail for one media item unless it already has a usable
 * one. Idempotent: safe to call on every upload and on every startup.
 */
export async function ensureThumbnail(media: MediaItem): Promise<ThumbnailOutcome> {
  if (media.thumbnail_path?.trim() && fs.existsSync(media.thumbnail_path)) return 'exists';
  if (!canThumbnail(media.mime_type)) return 'unsupported';
  if (!media.file_path || !fs.existsSync(media.file_path)) return 'source-missing';

  const sharp = await loadSharp();
  if (!sharp) return 'failed';

  const target = thumbnailPathFor(media.id);
  // The database write is inside the try with the decode. Outside it, one
  // failing write would reject out of the backfill's loop and leave every
  // later item unprocessed -- on this boot and on every boot after, since it
  // would stop at the same row each time.
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    await sharp(media.file_path)
      // Bare rotate() applies the EXIF orientation tag. Without it, portraits
      // from a phone or a scanner render sideways on every card.
      .rotate()
      .resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(target);
    new MediaRepository().setThumbnail(media.id, target, THUMBNAIL_MIME);
  } catch {
    return 'failed';
  }

  return 'generated';
}

export interface BackfillCounts {
  generated: number;
  failed: number;
  skipped: number;
}

/**
 * Generate every missing thumbnail, one at a time. Sequential on purpose:
 * decoding a hundred multi-megabyte scans in parallel would spike memory on a
 * small self-hosted box for no gain, and this runs after the server is already
 * answering requests.
 */
export async function backfillThumbnails(logger: Logger): Promise<BackfillCounts> {
  const counts: BackfillCounts = { generated: 0, failed: 0, skipped: 0 };
  let pending: MediaItem[];
  try {
    pending = new MediaRepository().findWithoutThumbnail();
  } catch (error) {
    logger.error('Thumbnail backfill could not list media:', error);
    return counts;
  }
  if (pending.length === 0) return counts;

  logger.info(`Thumbnail backfill: ${pending.length} media item(s) to consider`);
  for (const media of pending) {
    const outcome = await ensureThumbnail(media);
    if (outcome === 'generated') counts.generated += 1;
    else if (outcome === 'failed') counts.failed += 1;
    else counts.skipped += 1;
  }

  logger.info(
    `Thumbnail backfill complete: ${counts.generated} generated, ` +
      `${counts.skipped} skipped, ${counts.failed} failed`,
  );
  return counts;
}
