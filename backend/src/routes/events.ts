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
      });

      res.status(201).json(event);
    } catch {
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
      });

      res.status(201).json(event);
    } catch {
      res.status(500).json({ error: 'Failed to create event' });
    }
  },
);

// PUT /events/:id — Update event
eventsRouter.put(
  '/:id',
  requireRole('admin', 'editor'),
  (req, res) => {
    try {
      const repo = new EventRepository();
      const { event_type, event_date, event_place, description } = req.body;

      const event = repo.update(paramStr(req.params.id), { event_type, event_date, event_place, description });
      if (!event) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }

      res.json(withSubject(event));
    } catch {
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
