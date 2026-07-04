import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { CollectionRepository } from '../repositories/CollectionRepository.js';
import type { ArchivePrivacyLevel } from '../types/archive.js';

export const collectionsRouter = Router();

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

function numberOptional(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function collectionBody(body: Record<string, unknown>) {
  return {
    title: typeof body.title === 'string' ? body.title.trim() : undefined,
    summary: cleanOptional(body.summary),
    privacy_level: typeof body.privacy_level === 'string' ? body.privacy_level as ArchivePrivacyLevel : undefined,
    collection_type: body.collection_type === 'smart' ? 'smart' as const : body.collection_type === 'manual' ? 'manual' as const : undefined,
    description: cleanOptional(body.description),
    cover_artifact_id: cleanOptional(body.cover_artifact_id),
    sort_order: numberOptional(body.sort_order),
  };
}

collectionsRouter.get('/tags', (_req, res) => {
  try {
    const repo = new CollectionRepository();
    res.json({ data: repo.findTags() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list tags' });
  }
});

collectionsRouter.post('/objects/:objectId/tags', requireRole('admin', 'editor', 'limited_editor'), (req, res) => {
  try {
    const name = typeof (req.body as Record<string, unknown>).name === 'string' ? (req.body as Record<string, string>).name : '';
    const repo = new CollectionRepository();
    const tag = repo.addTagToObject(paramStr(req.params.objectId), name);
    res.status(201).json(tag);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to add tag' });
  }
});

collectionsRouter.delete('/objects/:objectId/tags/:tagId', requireRole('admin', 'editor'), (req, res) => {
  try {
    const repo = new CollectionRepository();
    const deleted = repo.removeTagFromObject(paramStr(req.params.objectId), paramStr(req.params.tagId));
    if (!deleted) {
      res.status(404).json({ error: 'Tag assignment not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove tag' });
  }
});

collectionsRouter.get('/', (req, res) => {
  try {
    const repo = new CollectionRepository();
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const cursor = req.query.cursor as string | undefined;
    const search = req.query.q as string | undefined;
    res.json(repo.findAll({ limit, cursor, search }));
  } catch (error) {
    res.status(500).json({ error: 'Failed to list collections' });
  }
});

collectionsRouter.get('/:id', (req, res) => {
  try {
    const repo = new CollectionRepository();
    const id = paramStr(req.params.id);
    const collection = repo.findById(id);
    if (!collection) {
      res.status(404).json({ error: 'Collection not found' });
      return;
    }
    res.json({ ...collection, items: repo.findItems(id), tags: repo.findTagsForObject(id) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get collection' });
  }
});

collectionsRouter.post(
  '/',
  requireRole('admin', 'editor', 'limited_editor'),
  validate([
    { field: 'title', required: true, type: 'string', maxLength: 500 },
    { field: 'privacy_level', type: 'string', enum: PRIVACY_LEVELS },
  ]),
  (req, res) => {
    try {
      const repo = new CollectionRepository();
      const body = collectionBody(req.body as Record<string, unknown>);
      if (!body.title) {
        res.status(400).json({ error: 'title is required' });
        return;
      }
      const collection = repo.create({ ...body, title: body.title, created_by: req.user?.userId ?? null });
      res.status(201).json(collection);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create collection' });
    }
  },
);

collectionsRouter.put(
  '/:id',
  requireRole('admin', 'editor', 'limited_editor'),
  validate([
    { field: 'title', type: 'string', maxLength: 500 },
    { field: 'privacy_level', type: 'string', enum: PRIVACY_LEVELS },
  ]),
  (req, res) => {
    try {
      const repo = new CollectionRepository();
      const collection = repo.update(paramStr(req.params.id), {
        ...collectionBody(req.body as Record<string, unknown>),
        updated_by: req.user?.userId ?? null,
      });
      if (!collection) {
        res.status(404).json({ error: 'Collection not found' });
        return;
      }
      res.json(collection);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update collection' });
    }
  },
);

collectionsRouter.delete('/:id', requireRole('admin', 'editor'), (req, res) => {
  try {
    const repo = new CollectionRepository();
    const deleted = repo.delete(paramStr(req.params.id), req.user?.userId ?? null);
    if (!deleted) {
      res.status(404).json({ error: 'Collection not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete collection' });
  }
});

collectionsRouter.post('/:id/items', requireRole('admin', 'editor', 'limited_editor'), (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const itemObjectId = cleanOptional(body.item_object_id);
    if (!itemObjectId) {
      res.status(400).json({ error: 'item_object_id is required' });
      return;
    }
    const repo = new CollectionRepository();
    const item = repo.addItem(paramStr(req.params.id), {
      item_object_id: itemObjectId,
      caption: cleanOptional(body.caption),
      sort_order: numberOptional(body.sort_order),
      added_by: req.user?.userId ?? null,
    });
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to add collection item' });
  }
});

collectionsRouter.put('/:id/items/:itemId', requireRole('admin', 'editor', 'limited_editor'), (req, res) => {
  try {
    const repo = new CollectionRepository();
    const item = repo.updateItem(paramStr(req.params.id), paramStr(req.params.itemId), {
      caption: cleanOptional((req.body as Record<string, unknown>).caption),
      sort_order: numberOptional((req.body as Record<string, unknown>).sort_order),
    });
    if (!item) {
      res.status(404).json({ error: 'Collection item not found' });
      return;
    }
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update collection item' });
  }
});

collectionsRouter.delete('/:id/items/:itemId', requireRole('admin', 'editor'), (req, res) => {
  try {
    const repo = new CollectionRepository();
    const deleted = repo.removeItem(paramStr(req.params.id), paramStr(req.params.itemId));
    if (!deleted) {
      res.status(404).json({ error: 'Collection item not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove collection item' });
  }
});
