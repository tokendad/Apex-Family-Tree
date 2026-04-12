import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { requireRole } from '../middleware/auth.js';
import { MediaRepository } from '../repositories/MediaRepository.js';
import { PersonRepository } from '../repositories/PersonRepository.js';
import { getMediaPath } from '../services/init.js';

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
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  },
});

// POST /media/upload — Upload media file (with optional entity linking)
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
      const { title, description, date_taken, person_id, family_id, event_id } = req.body;

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

      // Atomically link to entities if provided
      if (person_id) repo.linkToPerson(media.id, person_id);
      if (family_id) repo.linkToFamily(media.id, family_id);
      if (event_id) repo.linkToEvent(media.id, event_id);

      res.status(201).json(media);
    } catch (error) {
      res.status(500).json({ error: 'Failed to upload media' });
    }
  },
);

// POST /media/scan — Scan MEDIA_PATH for pre-existing files
mediaRouter.post(
  '/scan',
  requireRole('admin', 'editor'),
  (_req, res) => {
    try {
      const repo = new MediaRepository();
      const mediaPath = process.env.MEDIA_PATH || getMediaPath();
      const result = repo.scanDirectory(mediaPath);
      res.json({ message: `Scan complete: ${result.added} added, ${result.skipped} skipped`, ...result });
    } catch (error) {
      res.status(500).json({ error: 'Failed to scan media directory' });
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
    const filter = req.query.filter as string | undefined;

    const result = repo.findAll({ limit, cursor, search, filter });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list media' });
  }
});

// PUT /media/:id — Update media metadata
mediaRouter.put(
  '/:id',
  requireRole('admin', 'editor', 'limited_editor'),
  (req, res) => {
    try {
      const repo = new MediaRepository();
      const media = repo.findById(paramStr(req.params.id));
      if (!media) {
        res.status(404).json({ error: 'Media not found' });
        return;
      }

      const { title, description, date_taken } = req.body;
      const updated = repo.update(paramStr(req.params.id), { title, description, date_taken });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update media' });
    }
  },
);

// GET /media/:id/links — Get all entity links for a media item
mediaRouter.get('/:id/links', (req, res) => {
  try {
    const repo = new MediaRepository();
    const media = repo.findById(paramStr(req.params.id));
    if (!media) {
      res.status(404).json({ error: 'Media not found' });
      return;
    }
    const links = repo.findLinks(paramStr(req.params.id));
    res.json(links);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch media links' });
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

// DELETE /media/:id — Delete media (protects external/scanned files)
mediaRouter.delete(
  '/:id',
  requireRole('admin', 'editor'),
  (req, res) => {
    try {
      const repo = new MediaRepository();
      const id = paramStr(req.params.id);
      const result = repo.delete(id);
      if (!result.deleted) {
        res.status(404).json({ error: 'Media not found' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete media' });
    }
  },
);

// ─── Entity link routes ────────────────────────────────────────────────────

// POST /media/:id/links/:type/:targetId — Link media to an entity
mediaRouter.post(
  '/:id/links/:type/:targetId',
  requireRole('admin', 'editor', 'limited_editor'),
  (req, res) => {
    try {
      const repo = new MediaRepository();
      const mediaId = paramStr(req.params.id);
      const linkType = paramStr(req.params.type);
      const targetId = paramStr(req.params.targetId);

      const media = repo.findById(mediaId);
      if (!media) {
        res.status(404).json({ error: 'Media not found' });
        return;
      }

      let link;
      switch (linkType) {
        case 'person':
          link = repo.linkToPerson(mediaId, targetId, req.body?.is_primary ?? false);
          break;
        case 'family':
          link = repo.linkToFamily(mediaId, targetId);
          break;
        case 'event':
          link = repo.linkToEvent(mediaId, targetId);
          break;
        default:
          res.status(400).json({ error: 'Invalid link type. Must be person, family, or event' });
          return;
      }

      res.status(201).json(link);
    } catch (error) {
      res.status(500).json({ error: 'Failed to link media' });
    }
  },
);

// DELETE /media/:id/links/:type/:targetId — Unlink media from an entity
mediaRouter.delete(
  '/:id/links/:type/:targetId',
  requireRole('admin', 'editor'),
  (req, res) => {
    try {
      const repo = new MediaRepository();
      const mediaId = paramStr(req.params.id);
      const linkType = paramStr(req.params.type);
      const targetId = paramStr(req.params.targetId);

      let removed = false;
      switch (linkType) {
        case 'person':
          removed = repo.unlinkFromPerson(mediaId, targetId);
          break;
        case 'family':
          removed = repo.unlinkFromFamily(mediaId, targetId);
          break;
        case 'event':
          removed = repo.unlinkFromEvent(mediaId, targetId);
          break;
        default:
          res.status(400).json({ error: 'Invalid link type. Must be person, family, or event' });
          return;
      }

      if (!removed) {
        res.status(404).json({ error: 'Link not found' });
        return;
      }

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to unlink media' });
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
