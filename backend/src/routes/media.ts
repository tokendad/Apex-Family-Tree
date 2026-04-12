import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { requireRole } from '../middleware/auth.js';
import { MediaRepository } from '../repositories/MediaRepository.js';
import { PersonRepository } from '../repositories/PersonRepository.js';
import { getDataPath } from '../services/init.js';

export const mediaRouter = Router();

function paramStr(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
];

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    const uploadDir = getDataPath('media', 'photos');
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
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  },
});

// POST /media/upload — Upload media file
mediaRouter.post(
  '/upload',
  requireRole('admin', 'editor', 'limited_editor'),
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ error: 'File too large. Maximum size is 10MB' });
          return;
        }
        res.status(400).json({ error: err.message });
        return;
      }
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }
      next();
    });
  },
  (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const repo = new MediaRepository();
      const { title, description, date_taken } = req.body;

      const media = repo.create({
        filename: req.file.filename,
        original_filename: req.file.originalname,
        mime_type: req.file.mimetype,
        file_size: req.file.size,
        file_path: req.file.path,
        title,
        description,
        date_taken,
        uploaded_by: req.user!.userId,
      });

      res.status(201).json(media);
    } catch (error) {
      res.status(500).json({ error: 'Failed to upload media' });
    }
  },
);

// GET /media — List all media (gallery)
mediaRouter.get('/', (req, res) => {
  try {
    const repo = new MediaRepository();
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const cursor = req.query.cursor as string | undefined;
    const search = req.query.q as string | undefined;

    const result = repo.findAll({ limit, cursor, search });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list media' });
  }
});

// GET /media/:id — Serve media file
mediaRouter.get('/:id', (req, res) => {
  try {
    const repo = new MediaRepository();
    const media = repo.findById(paramStr(req.params.id));
    if (!media) {
      res.status(404).json({ error: 'Media not found' });
      return;
    }

    if (!fs.existsSync(media.file_path)) {
      res.status(404).json({ error: 'Media file not found on disk' });
      return;
    }

    res.setHeader('Content-Type', media.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${media.original_filename}"`);
    res.sendFile(path.resolve(media.file_path));
  } catch (error) {
    res.status(500).json({ error: 'Failed to serve media' });
  }
});

// DELETE /media/:id — Delete media
mediaRouter.delete(
  '/:id',
  requireRole('admin', 'editor'),
  (req, res) => {
    try {
      const repo = new MediaRepository();
      const media = repo.findById(paramStr(req.params.id));
      if (!media) {
        res.status(404).json({ error: 'Media not found' });
        return;
      }

      // Remove file from disk
      if (fs.existsSync(media.file_path)) {
        fs.unlinkSync(media.file_path);
      }
      if (media.thumbnail_path && fs.existsSync(media.thumbnail_path)) {
        fs.unlinkSync(media.thumbnail_path);
      }

      repo.delete(paramStr(req.params.id));
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete media' });
    }
  },
);

// GET /people/:id/media — List media for person
mediaRouter.get('/people/:id/media', (req, res) => {
  try {
    const personRepo = new PersonRepository();
    const mediaRepo = new MediaRepository();

    const personId = paramStr(req.params.id);
    const person = personRepo.findById(personId);
    if (!person) {
      res.status(404).json({ error: 'Person not found' });
      return;
    }

    const media = mediaRepo.findByPerson(personId);
    res.json(media);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list media' });
  }
});

// POST /people/:id/media — Link media to person
mediaRouter.post(
  '/people/:id/media',
  requireRole('admin', 'editor', 'limited_editor'),
  (req, res) => {
    try {
      const personRepo = new PersonRepository();
      const mediaRepo = new MediaRepository();

      const personId = paramStr(req.params.id);
      const person = personRepo.findById(personId);
      if (!person) {
        res.status(404).json({ error: 'Person not found' });
        return;
      }

      const { media_id, is_primary } = req.body;
      if (!media_id) {
        res.status(400).json({ error: 'media_id is required' });
        return;
      }

      const media = mediaRepo.findById(media_id);
      if (!media) {
        res.status(404).json({ error: 'Media not found' });
        return;
      }

      const link = mediaRepo.linkToPerson(media_id, personId, is_primary ?? false);
      res.status(201).json(link);
    } catch (error) {
      res.status(500).json({ error: 'Failed to link media to person' });
    }
  },
);
