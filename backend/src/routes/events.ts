import { Router } from 'express';
import type { Event } from '../types/db.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { EventRepository } from '../repositories/EventRepository.js';
import { FamilyRepository } from '../repositories/FamilyRepository.js';
import { PersonRepository } from '../repositories/PersonRepository.js';

export const eventsRouter = Router();

function paramStr(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

/** Thrown for a source URL the client should fix rather than retry. */
class InvalidSourceUrl extends Error {}

/**
 * Normalise an event's source URL, or reject it (#41).
 *
 * The value is rendered as a link, so the scheme is restricted to http and
 * https: a `javascript:` or `data:` URL in an href would run in the viewer's
 * session. Anything unparseable is refused rather than quietly blanked, so a
 * mistyped address is reported instead of silently discarded.
 */
function cleanSourceUrl(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw new InvalidSourceUrl('source_url must be a string');

  const trimmed = value.trim();
  if (trimmed === '') return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new InvalidSourceUrl('source_url must be a complete http or https address');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new InvalidSourceUrl('source_url must use http or https');
  }

  return parsed.toString();
}

/**
 * The day the link was last confirmed to resolve: a plain calendar date the
 * user asserts, not an event date, so it is never parsed as a GEDCOM date.
 */
function cleanCheckedAt(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw new InvalidSourceUrl('source_url_checked_at must be a string');

  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new InvalidSourceUrl('source_url_checked_at must be a YYYY-MM-DD date');
  }
  return trimmed;
}

function toPersonSummary(person: ReturnType<PersonRepository['findById']> | null | undefined) {
  if (!person) return null;
  return {
    id: person.id,
    displayName: person.displayName ?? null,
    display_name: person.display_name ?? null,
    given_name: person.primary_name?.given_name ?? null,
    middle_name: person.primary_name?.middle_name ?? null,
    surname: person.primary_name?.surname ?? null,
  };
}

/**
 * Every event belongs to exactly one subject — a person or a family — but the
 * row carries only its id, which left clients unable to name it. Resolve that
 * subject so a single event can be rendered on its own.
 */
function withSubject(event: Event) {
  const personRepo = new PersonRepository();
  const person = event.person_id ? toPersonSummary(personRepo.findById(event.person_id)) : null;

  let family = null;
  if (event.family_id) {
    const row = new FamilyRepository().findById(event.family_id);
    if (row) {
      family = {
        id: row.id,
        spouse1: toPersonSummary(row.spouse1_id ? personRepo.findById(row.spouse1_id) : null),
        spouse2: toPersonSummary(row.spouse2_id ? personRepo.findById(row.spouse2_id) : null),
      };
    }
  }

  return { ...event, person, family };
}

// GET /events — List all events
eventsRouter.get('/', (req, res) => {
  try {
    const repo = new EventRepository();
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 500, 1), 1000);
    const cursor = req.query.cursor as string | undefined;
    const result = repo.findAll({ limit, cursor });
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to list events' });
  }
});

// GET /events/:id — Get event detail
eventsRouter.get('/:id', (req, res) => {
  try {
    const repo = new EventRepository();
    const event = repo.findById(paramStr(req.params.id));
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    res.json(withSubject(event));
  } catch {
    res.status(500).json({ error: 'Failed to get event' });
  }
});

// POST /events — Create event for a person or family
eventsRouter.post(
  '/',
  requireRole('admin', 'editor', 'limited_editor'),
  validate([
    { field: 'event_type', required: true, type: 'string', maxLength: 100 },
    { field: 'source_url', type: 'string', maxLength: 2048 },
  ]),
  (req, res) => {
    try {
      const repo = new EventRepository();
      const { person_id, family_id, event_type, event_date, event_place, description } = req.body;
      if ((person_id ? 1 : 0) + (family_id ? 1 : 0) !== 1) {
        res.status(400).json({ error: 'Event must belong to exactly one person or family' });
        return;
      }

      const event = repo.create({
        person_id,
        family_id,
        event_type,
        event_date,
        event_place,
        description,
        source_url: cleanSourceUrl(req.body.source_url),
        source_url_checked_at: cleanCheckedAt(req.body.source_url_checked_at),
      });

      res.status(201).json(event);
    } catch (error) {
      if (error instanceof InvalidSourceUrl) {
        res.status(400).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: 'Failed to create event' });
    }
  },
);

// POST /people/:personId/events — Add event to person
eventsRouter.post(
  '/people/:personId/events',
  requireRole('admin', 'editor', 'limited_editor'),
  validate([
    { field: 'event_type', required: true, type: 'string', maxLength: 100 },
    { field: 'source_url', type: 'string', maxLength: 2048 },
  ]),
  (req, res) => {
    try {
      const personRepo = new PersonRepository();
      const eventRepo = new EventRepository();

      const personId = paramStr(req.params.personId);
      const person = personRepo.findById(personId);
      if (!person) {
        res.status(404).json({ error: 'Person not found' });
        return;
      }

      const { event_type, event_date, event_place, description } = req.body;
      const event = eventRepo.create({
        person_id: personId,
        event_type,
        event_date,
        event_place,
        description,
        source_url: cleanSourceUrl(req.body.source_url),
        source_url_checked_at: cleanCheckedAt(req.body.source_url_checked_at),
      });

      res.status(201).json(event);
    } catch (error) {
      if (error instanceof InvalidSourceUrl) {
        res.status(400).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: 'Failed to create event' });
    }
  },
);

// PUT /events/:id — Update event
eventsRouter.put(
  '/:id',
  requireRole('admin', 'editor'),
  validate([
    { field: 'source_url', type: 'string', maxLength: 2048 },
  ]),
  (req, res) => {
    try {
      const repo = new EventRepository();
      const { event_type, event_date, event_place, description } = req.body;

      const event = repo.update(paramStr(req.params.id), {
        event_type,
        event_date,
        event_place,
        description,
        source_url: cleanSourceUrl(req.body.source_url),
        source_url_checked_at: cleanCheckedAt(req.body.source_url_checked_at),
      });
      if (!event) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }

      res.json(withSubject(event));
    } catch (error) {
      if (error instanceof InvalidSourceUrl) {
        res.status(400).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: 'Failed to update event' });
    }
  },
);

// DELETE /events/:id — Delete event
eventsRouter.delete(
  '/:id',
  requireRole('admin', 'editor'),
  (req, res) => {
    try {
      const repo = new EventRepository();
      const deleted = repo.delete(paramStr(req.params.id));
      if (!deleted) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }

      res.status(204).send();
    } catch {
      res.status(500).json({ error: 'Failed to delete event' });
    }
  },
);
