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

function finiteCoord(value: unknown): number | undefined {
  if (typeof value !== 'number') return undefined;
  return Number.isFinite(value) ? value : undefined;
}

function parseRegionBody(body: Record<string, unknown>, partial = false): {
  person_id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  error?: string;
} {
  const personId = typeof body.person_id === 'string' ? body.person_id.trim() : undefined;
  const x = body.x === undefined ? undefined : finiteCoord(body.x);
  const y = body.y === undefined ? undefined : finiteCoord(body.y);
  const width = body.width === undefined ? undefined : finiteCoord(body.width);
  const height = body.height === undefined ? undefined : finiteCoord(body.height);

  if (!partial && !personId) return { error: 'person_id is required' };
  if (!partial && (x === undefined || y === undefined || width === undefined || height === undefined)) {
    return { error: 'x, y, width, and height are required' };
  }

  for (const [key, value] of Object.entries({ x, y })) {
    if (value !== undefined && (value < 0 || value > 1)) {
      return { error: `${key} must be between 0 and 1` };
    }
  }
  for (const [key, value] of Object.entries({ width, height })) {
    if (value !== undefined && (value <= 0 || value > 1)) {
      return { error: `${key} must be greater than 0 and no more than 1` };
    }
  }
  if (x !== undefined && width !== undefined && x + width > 1) {
    return { error: 'x + width must be no more than 1' };
  }
  if (y !== undefined && height !== undefined && y + height > 1) {
    return { error: 'y + height must be no more than 1' };
  }

  return { person_id: personId, x, y, width, height };
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

// GET /media/:id/regions — Get rectangular person tags for a media item
mediaRouter.get('/:id/regions', (req, res) => {
  try {
    const repo = new MediaRepository();
    const mediaId = paramStr(req.params.id);
    const media = repo.findById(mediaId);
    if (!media) {
      res.status(404).json({ error: 'Media not found' });
      return;
    }
    res.json({ regions: repo.findRegions(mediaId) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch media tags' });
  }
});

// POST /media/:id/regions — Create a rectangular person tag
mediaRouter.post(
  '/:id/regions',
  requireRole('admin', 'editor', 'limited_editor'),
  (req, res) => {
    try {
      const repo = new MediaRepository();
      const mediaId = paramStr(req.params.id);
      const media = repo.findById(mediaId);
      if (!media) {
        res.status(404).json({ error: 'Media not found' });
        return;
      }

      const body = parseRegionBody(req.body as Record<string, unknown>);
      if (body.error || !body.person_id || body.x === undefined || body.y === undefined || body.width === undefined || body.height === undefined) {
        res.status(400).json({ error: body.error ?? 'Invalid region' });
        return;
      }

      const region = repo.createRegion(mediaId, {
        person_id: body.person_id,
        x: body.x,
        y: body.y,
        width: body.width,
        height: body.height,
      });
      res.status(201).json({ region });
    } catch (error) {
      res.status(500).json({ error: 'Failed to create media tag' });
    }
  },
);

// PUT /media/:id/regions/:regionId — Update a rectangular person tag
mediaRouter.put(
  '/:id/regions/:regionId',
  requireRole('admin', 'editor', 'limited_editor'),
  (req, res) => {
    try {
      const repo = new MediaRepository();
      const mediaId = paramStr(req.params.id);
      const regionId = paramStr(req.params.regionId);
      const media = repo.findById(mediaId);
      if (!media) {
        res.status(404).json({ error: 'Media not found' });
        return;
      }

      const existing = repo.findRegionById(regionId);
      if (!existing || existing.media_id !== mediaId) {
        res.status(404).json({ error: 'Media tag not found' });
        return;
      }

      const body = parseRegionBody(req.body as Record<string, unknown>, true);
      if (body.error) {
        res.status(400).json({ error: body.error });
        return;
      }

      // Merge incoming partial values with persisted values before cross-field validation.
      const mergedX = body.x ?? existing.x;
      const mergedY = body.y ?? existing.y;
      const mergedW = body.width ?? existing.width;
      const mergedH = body.height ?? existing.height;
      if (mergedX + mergedW > 1) {
        res.status(400).json({ error: 'x + width must be no more than 1' });
        return;
      }
      if (mergedY + mergedH > 1) {
        res.status(400).json({ error: 'y + height must be no more than 1' });
        return;
      }

      const region = repo.updateRegion(regionId, {
        person_id: body.person_id,
        x: body.x,
        y: body.y,
        width: body.width,
        height: body.height,
      });
      res.json({ region });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update media tag' });
    }
  },
);

// DELETE /media/:id/regions/:regionId — Delete a rectangular person tag
mediaRouter.delete(
  '/:id/regions/:regionId',
  requireRole('admin', 'editor'),
  (req, res) => {
    try {
      const repo = new MediaRepository();
      const mediaId = paramStr(req.params.id);
      const regionId = paramStr(req.params.regionId);
      const existing = repo.findRegionById(regionId);
      if (!existing || existing.media_id !== mediaId) {
        res.status(404).json({ error: 'Media tag not found' });
        return;
      }

      repo.deleteRegion(regionId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete media tag' });
    }
  },
);

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
