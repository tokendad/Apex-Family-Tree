import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ArtifactRepository } from '../repositories/ArtifactRepository.js';
import type { ArchivePrivacyLevel } from '../types/archive.js';

export const artifactsRouter = Router();

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

function artifactBody(body: Record<string, unknown>) {
  return {
    title: typeof body.title === 'string' ? body.title.trim() : undefined,
    summary: cleanOptional(body.summary),
    privacy_level: typeof body.privacy_level === 'string' ? body.privacy_level as ArchivePrivacyLevel : undefined,
    artifact_type_id: typeof body.artifact_type_id === 'string' ? body.artifact_type_id : undefined,
    evidence_classification_id: cleanOptional(body.evidence_classification_id),
    original_date_text: cleanOptional(body.original_date_text),
    original_date_start: cleanOptional(body.original_date_start),
    original_date_end: cleanOptional(body.original_date_end),
    date_precision: cleanOptional(body.date_precision),
    date_qualifier: cleanOptional(body.date_qualifier),
    creator_text: cleanOptional(body.creator_text),
    physical_location: cleanOptional(body.physical_location),
    original_format: cleanOptional(body.original_format),
    condition_notes: cleanOptional(body.condition_notes),
    language: cleanOptional(body.language),
    transcription: cleanOptional(body.transcription),
    notes: cleanOptional(body.notes),
  };
}

// GET /artifacts/types — List artifact type lookup values
artifactsRouter.get('/types', (_req, res) => {
  try {
    const repo = new ArtifactRepository();
    res.json({ data: repo.findArtifactTypes() });
  } catch {
    res.status(500).json({ error: 'Failed to list artifact types' });
  }
});

// GET /artifacts/type-counts — Artifact count per type, including empty types
artifactsRouter.get('/type-counts', (_req, res) => {
  try {
    const repo = new ArtifactRepository();
    res.json({ data: repo.countsByType() });
  } catch {
    res.status(500).json({ error: 'Failed to count artifacts by type' });
  }
});

// GET /artifacts/evidence-classifications — List evidence classification lookup values
artifactsRouter.get('/evidence-classifications', (_req, res) => {
  try {
    const repo = new ArtifactRepository();
    res.json({ data: repo.findEvidenceClassifications() });
  } catch {
    res.status(500).json({ error: 'Failed to list evidence classifications' });
  }
});

// GET /artifacts — List artifacts
artifactsRouter.get('/', (req, res) => {
  try {
    const repo = new ArtifactRepository();
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const cursor = req.query.cursor as string | undefined;
    const search = req.query.q as string | undefined;
    const typeId = req.query.type as string | undefined;

    res.json(repo.findAll({ limit, cursor, search, typeId }));
  } catch {
    res.status(500).json({ error: 'Failed to list artifacts' });
  }
});

// GET /artifacts/:id — Get artifact detail
artifactsRouter.get('/:id', (req, res) => {
  try {
    const repo = new ArtifactRepository();
    const artifact = repo.findById(paramStr(req.params.id));
    if (!artifact) {
      res.status(404).json({ error: 'Artifact not found' });
      return;
    }

    res.json(artifact);
  } catch {
    res.status(500).json({ error: 'Failed to get artifact' });
  }
});

// POST /artifacts — Create artifact metadata
artifactsRouter.post(
  '/',
  requireRole('admin', 'editor', 'limited_editor'),
  validate([
    { field: 'title', required: true, type: 'string', maxLength: 500 },
    { field: 'artifact_type_id', required: true, type: 'string', maxLength: 100 },
    { field: 'privacy_level', type: 'string', enum: PRIVACY_LEVELS },
  ]),
  (req, res) => {
    try {
      const repo = new ArtifactRepository();
      const body = artifactBody(req.body as Record<string, unknown>);

      if (!body.title || !body.artifact_type_id) {
        res.status(400).json({ error: 'title and artifact_type_id are required' });
        return;
      }

      const artifact = repo.create({
        ...body,
        title: body.title,
        artifact_type_id: body.artifact_type_id,
        created_by: req.user?.userId ?? null,
      });
      res.status(201).json(artifact);
    } catch {
      res.status(500).json({ error: 'Failed to create artifact' });
    }
  },
);

// PUT /artifacts/:id — Update artifact metadata
artifactsRouter.put(
  '/:id',
  requireRole('admin', 'editor', 'limited_editor'),
  validate([
    { field: 'title', type: 'string', maxLength: 500 },
    { field: 'artifact_type_id', type: 'string', maxLength: 100 },
    { field: 'privacy_level', type: 'string', enum: PRIVACY_LEVELS },
  ]),
  (req, res) => {
    try {
      const repo = new ArtifactRepository();
      const artifact = repo.update(paramStr(req.params.id), {
        ...artifactBody(req.body as Record<string, unknown>),
        updated_by: req.user?.userId ?? null,
      });

      if (!artifact) {
        res.status(404).json({ error: 'Artifact not found' });
        return;
      }

      res.json(artifact);
    } catch {
      res.status(500).json({ error: 'Failed to update artifact' });
    }
  },
);

// PATCH /artifacts/bulk-type — Reassign the type of many artifacts at once
artifactsRouter.patch(
  '/bulk-type',
  requireRole('admin', 'editor', 'limited_editor'),
  (req, res) => {
    try {
      const body = (req.body ?? {}) as { ids?: unknown; artifact_type_id?: unknown };

      // validate() only checks scalar fields, so the array is checked here.
      if (!Array.isArray(body.ids) || body.ids.some((id) => typeof id !== 'string')) {
        res.status(400).json({ error: 'ids must be an array of strings' });
        return;
      }
      if (typeof body.artifact_type_id !== 'string' || !body.artifact_type_id) {
        res.status(400).json({ error: 'artifact_type_id is required' });
        return;
      }
      // Bounded so a single request cannot pin the event loop on a huge batch.
      if (body.ids.length > 500) {
        res.status(400).json({ error: 'ids must contain at most 500 entries' });
        return;
      }

      const repo = new ArtifactRepository();
      if (!repo.findArtifactTypes().some((type) => type.id === body.artifact_type_id)) {
        res.status(400).json({ error: 'Unknown artifact_type_id' });
        return;
      }

      const updated = repo.bulkUpdateType(
        body.ids as string[],
        body.artifact_type_id,
        req.user?.userId ?? null,
      );

      res.json({ updated });
    } catch {
      res.status(500).json({ error: 'Failed to update artifact types' });
    }
  },
);

// DELETE /artifacts/:id — Soft delete artifact archive object
artifactsRouter.delete(
  '/:id',
  requireRole('admin', 'editor'),
  (req, res) => {
    try {
      const repo = new ArtifactRepository();
      const deleted = repo.delete(paramStr(req.params.id), req.user?.userId ?? null);
      if (!deleted) {
        res.status(404).json({ error: 'Artifact not found' });
        return;
      }

      res.status(204).send();
    } catch {
      res.status(500).json({ error: 'Failed to delete artifact' });
    }
  },
);
