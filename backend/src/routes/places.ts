import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { PlaceRepository } from '../repositories/PlaceRepository.js';
import type { ArchivePrivacyLevel } from '../types/archive.js';

export const placesRouter = Router();

const PRIVACY_LEVELS: ArchivePrivacyLevel[] = ['public', 'family', 'private', 'restricted'];

function paramStr(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

function cleanOptional(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function numericOptional(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function parseAliases(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  return value.filter((alias): alias is string => typeof alias === 'string');
}

function placeBody(body: Record<string, unknown>) {
  return {
    title: typeof body.title === 'string' ? body.title.trim() : undefined,
    summary: cleanOptional(body.summary),
    privacy_level: typeof body.privacy_level === 'string' ? body.privacy_level as ArchivePrivacyLevel : undefined,
    normalized_name: cleanOptional(body.normalized_name),
    place_type: cleanOptional(body.place_type),
    address_text: cleanOptional(body.address_text),
    locality: cleanOptional(body.locality),
    region: cleanOptional(body.region),
    country: cleanOptional(body.country),
    latitude: numericOptional(body.latitude),
    longitude: numericOptional(body.longitude),
    notes: cleanOptional(body.notes),
    aliases: parseAliases(body.aliases),
  };
}

placesRouter.get('/', (req, res) => {
  try {
    const repo = new PlaceRepository();
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const cursor = req.query.cursor as string | undefined;
    const search = req.query.q as string | undefined;
    res.json(repo.findAll({ limit, cursor, search }));
  } catch (error) {
    res.status(500).json({ error: 'Failed to list places' });
  }
});

placesRouter.get('/:id', (req, res) => {
  try {
    const repo = new PlaceRepository();
    const id = paramStr(req.params.id);
    const place = repo.findById(id);
    if (!place) {
      res.status(404).json({ error: 'Place not found' });
      return;
    }

    res.json({ ...place, aliases: repo.findAliases(id) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get place' });
  }
});

placesRouter.post(
  '/',
  requireRole('admin', 'editor', 'limited_editor'),
  validate([
    { field: 'title', required: true, type: 'string', maxLength: 500 },
    { field: 'privacy_level', type: 'string', enum: PRIVACY_LEVELS },
  ]),
  (req, res) => {
    try {
      const repo = new PlaceRepository();
      const body = placeBody(req.body as Record<string, unknown>);
      if (!body.title) {
        res.status(400).json({ error: 'title is required' });
        return;
      }

      const place = repo.create({
        ...body,
        title: body.title,
        created_by: req.user?.userId ?? null,
      });
      res.status(201).json(place);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create place' });
    }
  },
);

placesRouter.put(
  '/:id',
  requireRole('admin', 'editor', 'limited_editor'),
  validate([
    { field: 'title', type: 'string', maxLength: 500 },
    { field: 'privacy_level', type: 'string', enum: PRIVACY_LEVELS },
  ]),
  (req, res) => {
    try {
      const repo = new PlaceRepository();
      const place = repo.update(paramStr(req.params.id), {
        ...placeBody(req.body as Record<string, unknown>),
        updated_by: req.user?.userId ?? null,
      });
      if (!place) {
        res.status(404).json({ error: 'Place not found' });
        return;
      }

      res.json(place);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update place' });
    }
  },
);

placesRouter.delete('/:id', requireRole('admin', 'editor'), (req, res) => {
  try {
    const repo = new PlaceRepository();
    const deleted = repo.delete(paramStr(req.params.id), req.user?.userId ?? null);
    if (!deleted) {
      res.status(404).json({ error: 'Place not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete place' });
  }
});
