import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { RelationshipRepository } from '../repositories/RelationshipRepository.js';
import { RelationshipService, RelationshipValidationError } from '../services/relationship.js';
import type { RelationshipMemberInput } from '../types/relationship.js';

export const relationshipsRouter = Router();

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

function parseMembers(value: unknown): RelationshipMemberInput[] | null {
  if (!Array.isArray(value)) return null;
  const members: RelationshipMemberInput[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.object_id !== 'string' || typeof candidate.role !== 'string') return null;
    members.push({
      object_id: candidate.object_id,
      role: candidate.role,
      sort_order: typeof candidate.sort_order === 'number' ? candidate.sort_order : undefined,
      notes: cleanOptional(candidate.notes),
    });
  }
  return members;
}

relationshipsRouter.get('/objects/:objectId', (req, res) => {
  try {
    const repo = new RelationshipRepository();
    const objectId = paramStr(req.params.objectId);
    res.json({ data: repo.findForObject(objectId) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list relationships' });
  }
});

relationshipsRouter.get('/objects/:objectId/connected', (req, res) => {
  try {
    const repo = new RelationshipRepository();
    const objectId = paramStr(req.params.objectId);
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    res.json({ data: repo.findConnectedObjects(objectId, type) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list connected objects' });
  }
});

relationshipsRouter.post('/', requireRole('admin', 'editor', 'limited_editor'), (req, res) => {
  try {
    const members = parseMembers((req.body as Record<string, unknown>).members);
    if (!members) {
      res.status(400).json({ error: 'members must be an array of relationship members' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const service = new RelationshipService();
    const relationship = service.create({
      relationship_type_id: cleanOptional(body.relationship_type_id) ?? undefined,
      relationship_type_code: cleanOptional(body.relationship_type_code) ?? undefined,
      label: cleanOptional(body.label),
      description: cleanOptional(body.description),
      date_text: cleanOptional(body.date_text),
      date_start: cleanOptional(body.date_start),
      date_end: cleanOptional(body.date_end),
      date_precision: cleanOptional(body.date_precision),
      date_qualifier: cleanOptional(body.date_qualifier),
      confidence_level_id: cleanOptional(body.confidence_level_id) ?? undefined,
      confidence_score: typeof body.confidence_score === 'number' ? body.confidence_score : null,
      notes: cleanOptional(body.notes),
      created_by: req.user?.userId ?? null,
      members,
    });

    res.status(201).json(relationship);
  } catch (error) {
    if (error instanceof RelationshipValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Failed to create relationship' });
  }
});

relationshipsRouter.get('/:id', (req, res) => {
  try {
    const repo = new RelationshipRepository();
    const relationship = repo.findById(paramStr(req.params.id));
    if (!relationship) {
      res.status(404).json({ error: 'Relationship not found' });
      return;
    }
    res.json(relationship);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get relationship' });
  }
});

relationshipsRouter.delete('/:id', requireRole('admin', 'editor'), (req, res) => {
  try {
    const repo = new RelationshipRepository();
    const deleted = repo.softDelete(paramStr(req.params.id), req.user?.userId ?? null);
    if (!deleted) {
      res.status(404).json({ error: 'Relationship not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete relationship' });
  }
});
