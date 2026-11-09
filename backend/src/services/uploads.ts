import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { getMediaPath } from './init.js';

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

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    const uploadDir = getMediaPath('photos');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueName = crypto.randomBytes(16).toString('hex') + ext;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter(_req, file, cb) {
    if (ALLOWED_UPLOAD_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  },
});

/** Express middleware that runs multer for a single file field and turns its
 *  errors into the same JSON shape every upload route already returns. */
export function handleSingleUpload(fieldName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ error: 'File too large. Maximum size is 10MB' });
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
