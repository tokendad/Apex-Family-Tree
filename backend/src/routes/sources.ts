import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { SourceRepository } from '../repositories/SourceRepository.js';

export const sourcesRouter = Router();

function paramStr(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

// GET /sources — List sources
sourcesRouter.get('/', (req, res) => {
  try {
    const repo = new SourceRepository();
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const cursor = req.query.cursor as string | undefined;

    const result = repo.findAll({ limit, cursor });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list sources' });
  }
});

// GET /sources/:id — Get source by ID
sourcesRouter.get('/:id', (req, res) => {
  try {
    const repo = new SourceRepository();
    const source = repo.findById(req.params.id as string);
    if (!source) {
      res.status(404).json({ error: 'Source not found' });
      return;
    }
    res.json(source);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get source' });
  }
});

// POST /sources — Create source
sourcesRouter.post(
  '/',
  requireRole('admin', 'editor', 'limited_editor'),
  validate([
    { field: 'title', required: true, type: 'string', maxLength: 500 },
  ]),
  (req, res) => {
    try {
      const repo = new SourceRepository();
      const { title, repository_id, author, publisher, publication_date, url, notes } = req.body;

      const source = repo.create({ title, repository_id, author, publisher, publication_date, url, notes });
      res.status(201).json(source);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create source' });
    }
  },
);

// PUT /sources/:id — Update source
sourcesRouter.put(
  '/:id',
  requireRole('admin', 'editor'),
  (req, res) => {
    try {
      const repo = new SourceRepository();
      const { title, author, publisher, publication_date, url, notes, repository_id } = req.body;

      const source = repo.update(paramStr(req.params.id), { title, author, publisher, publication_date, url, notes, repository_id });
      if (!source) {
        res.status(404).json({ error: 'Source not found' });
        return;
      }

      res.json(source);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update source' });
    }
  },
);

// DELETE /sources/:id — Delete source
sourcesRouter.delete(
  '/:id',
  requireRole('admin', 'editor'),
  (req, res) => {
    try {
      const repo = new SourceRepository();
      const deleted = repo.deleteSource(paramStr(req.params.id));
      if (!deleted) {
        res.status(404).json({ error: 'Source not found' });
        return;
      }

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete source' });
    }
  },
);

// GET /sources/:id/citations — List citations for a source
sourcesRouter.get('/:id/citations', (req, res) => {
  try {
    const repo = new SourceRepository();
    const sourceId = req.params.id as string;
    const source = repo.findById(sourceId);
    if (!source) {
      res.status(404).json({ error: 'Source not found' });
      return;
    }
    const citations = repo.findCitationsBySource(sourceId);
    res.json(citations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list citations' });
  }
});

// POST /sources/:id/citations — Create citation
sourcesRouter.post(
  '/:id/citations',
  requireRole('admin', 'editor', 'limited_editor'),
  validate([
    { field: 'quality', type: 'string', enum: ['primary', 'secondary', 'questionable', 'unreliable'] },
  ]),
  (req, res) => {
    try {
      const repo = new SourceRepository();
      const sourceId = paramStr(req.params.id);
      const source = repo.findById(sourceId);
      if (!source) {
        res.status(404).json({ error: 'Source not found' });
        return;
      }

      const { person_id, event_id, page, quality, notes } = req.body;
      const citation = repo.createCitation({
        source_id: sourceId,
        person_id,
        event_id,
        page,
        quality,
        notes,
      });

      res.status(201).json(citation);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create citation' });
    }
  },
);
