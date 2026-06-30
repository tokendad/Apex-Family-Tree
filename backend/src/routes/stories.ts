import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { StoryRepository } from '../repositories/StoryRepository.js';
import { RelationshipService, RelationshipValidationError } from '../services/relationship.js';
import type { ArchivePrivacyLevel } from '../types/archive.js';
import type { StoryType } from '../types/story.js';

export const storiesRouter = Router();

const PRIVACY_LEVELS: ArchivePrivacyLevel[] = ['public', 'family', 'private', 'restricted'];
const STORY_TYPES: StoryType[] = ['story', 'memory', 'oral_history', 'note'];

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

function storyBody(body: Record<string, unknown>) {
  return {
    title: typeof body.title === 'string' ? body.title.trim() : undefined,
    summary: cleanOptional(body.summary),
    privacy_level: typeof body.privacy_level === 'string' ? body.privacy_level as ArchivePrivacyLevel : undefined,
    story_type: typeof body.story_type === 'string' ? body.story_type as StoryType : undefined,
    body_markdown: typeof body.body_markdown === 'string' ? body.body_markdown : undefined,
    narrator_person_id: cleanOptional(body.narrator_person_id),
    date_text: cleanOptional(body.date_text),
    date_start: cleanOptional(body.date_start),
    date_end: cleanOptional(body.date_end),
    notes: cleanOptional(body.notes),
  };
}

storiesRouter.get('/', (req, res) => {
  try {
    const repo = new StoryRepository();
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const cursor = req.query.cursor as string | undefined;
    const search = req.query.q as string | undefined;
    res.json(repo.findAll({ limit, cursor, search }));
  } catch (error) {
    res.status(500).json({ error: 'Failed to list stories' });
  }
});

storiesRouter.get('/:id', (req, res) => {
  try {
    const repo = new StoryRepository();
    const story = repo.findDetail(paramStr(req.params.id));
    if (!story) {
      res.status(404).json({ error: 'Story not found' });
      return;
    }
    res.json(story);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get story' });
  }
});

storiesRouter.post(
  '/',
  requireRole('admin', 'editor', 'limited_editor'),
  validate([
    { field: 'title', required: true, type: 'string', maxLength: 500 },
    { field: 'body_markdown', required: true, type: 'string', maxLength: 50000 },
    { field: 'privacy_level', type: 'string', enum: PRIVACY_LEVELS },
    { field: 'story_type', type: 'string', enum: STORY_TYPES },
  ]),
  (req, res) => {
    try {
      const repo = new StoryRepository();
      const body = storyBody(req.body as Record<string, unknown>);
      if (!body.title || !body.body_markdown) {
        res.status(400).json({ error: 'title and body_markdown are required' });
        return;
      }
      const story = repo.create({
        ...body,
        title: body.title,
        body_markdown: body.body_markdown,
        recorded_by_user_id: req.user?.userId ?? null,
        created_by: req.user?.userId ?? null,
      });
      res.status(201).json(story);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create story' });
    }
  },
);

storiesRouter.put(
  '/:id',
  requireRole('admin', 'editor', 'limited_editor'),
  validate([
    { field: 'title', type: 'string', maxLength: 500 },
    { field: 'body_markdown', type: 'string', maxLength: 50000 },
    { field: 'privacy_level', type: 'string', enum: PRIVACY_LEVELS },
    { field: 'story_type', type: 'string', enum: STORY_TYPES },
  ]),
  (req, res) => {
    try {
      const repo = new StoryRepository();
      const story = repo.update(paramStr(req.params.id), {
        ...storyBody(req.body as Record<string, unknown>),
        updated_by: req.user?.userId ?? null,
      });
      if (!story) {
        res.status(404).json({ error: 'Story not found' });
        return;
      }
      res.json(story);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to update story' });
    }
  },
);

storiesRouter.delete('/:id', requireRole('admin', 'editor'), (req, res) => {
  try {
    const repo = new StoryRepository();
    const deleted = repo.delete(paramStr(req.params.id), req.user?.userId ?? null);
    if (!deleted) {
      res.status(404).json({ error: 'Story not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete story' });
  }
});

storiesRouter.post('/:id/connections', requireRole('admin', 'editor', 'limited_editor'), (req, res) => {
  try {
    const objectId = cleanOptional((req.body as Record<string, unknown>).object_id);
    if (!objectId) {
      res.status(400).json({ error: 'object_id is required' });
      return;
    }
    const storyId = paramStr(req.params.id);
    const relationship = new RelationshipService().create({
      relationship_type_code: 'describes',
      label: 'Story describes archive object',
      created_by: req.user?.userId ?? null,
      members: [
        { object_id: storyId, role: 'story' },
        { object_id: objectId, role: 'subject' },
      ],
    });
    res.status(201).json(relationship);
  } catch (error) {
    if (error instanceof RelationshipValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Failed to connect story' });
  }
});
