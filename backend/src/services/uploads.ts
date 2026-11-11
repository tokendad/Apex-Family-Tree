import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { getDataPath, getMediaPath } from './init.js';

/**
 * Shared between the media upload route and the artifact file-attach route,
 * so the two doors a file can arrive through (the Media page, or attaching
 * straight to an artifact) agree on what is accepted and where it lands.
 */
export const ALLOWED_UPLOAD_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
];

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

function randomizedFilename(file: Express.Multer.File): string {
  const ext = path.extname(file.originalname);
  return crypto.randomBytes(16).toString('hex') + ext;
}

function fileFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (ALLOWED_UPLOAD_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed`));
  }
}

/** Turns multer's errors into the same JSON shape every upload route already
 *  returns, regardless of which multer instance (and so which destination)
 *  is behind it. */
function wrapMulter(multerMiddleware: (req: Request, res: Response, cb: (err: unknown) => void) => void) {
  return (req: Request, res: Response, next: NextFunction) => {
    multerMiddleware(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ error: `File too large. Maximum size is ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB` });
          return;
        }
        res.status(400).json({ error: err.message });
        return;
      }
      if (err) {
        res.status(400).json({ error: (err as Error).message });
        return;
      }
      next();
    });
  };
}

const upload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, cb) {
      const uploadDir = getMediaPath('photos');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename(_req, file, cb) {
      cb(null, randomizedFilename(file));
    },
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter,
});

/** Express middleware that runs multer for a single file field and turns its
 *  errors into the same JSON shape every upload route already returns. */
export function handleSingleUpload(fieldName: string) {
  return wrapMulter((req, res, cb) => upload.single(fieldName)(req, res, cb));
}

/**
 * For the AI Research Intake panel's file attachment (#73 Phase 2) only.
 * Deliberately a separate multer instance from `upload` above, staged under
 * DATA_DIR rather than MEDIA_PATH: MEDIA_PATH is the user's own photo
 * library, which a manual directory scan (routes/media.ts) re-adopts as new
 * artifacts, and an intake upload is not committed to the archive -- and may
 * never be -- until the reviewer accepts something. Same mime/size limits as
 * every other upload door, same filename randomization.
 */
const intakeUpload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, cb) {
      const uploadDir = getDataPath('intake-uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename(_req, file, cb) {
      cb(null, randomizedFilename(file));
    },
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter,
});

/** Express middleware for the intake file-attach field. Multer no-ops (calls
 *  next() without populating req.file) for a non-multipart request, so this
 *  is safe to mount unconditionally in front of a route that also accepts a
 *  plain JSON { text } body. */
export function handleIntakeUpload(fieldName: string) {
  return wrapMulter((req, res, cb) => intakeUpload.single(fieldName)(req, res, cb));
}
