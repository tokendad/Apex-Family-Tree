import { BaseRepository } from './base.js';
import { recordChange } from '../services/audit.js';
import { ArchiveObjectRepository } from './ArchiveObjectRepository.js';
import { PlaceRepository } from './PlaceRepository.js';
import type { Event } from '../types/db.js';
import { parseGedcomDate } from '../utils/gedcom-date.js';

export class EventRepository extends BaseRepository {
  private archiveObjects = new ArchiveObjectRepository();
  private places = new PlaceRepository();

  findById(id: string): Event | undefined {
    return this.db.prepare('SELECT * FROM events WHERE id = ?').get(id) as Event | undefined;
  }

  findAll(options?: { limit?: number; cursor?: string }): { data: Event[]; next_cursor: string | null } {
    const limit = options?.limit || 500;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.cursor) {
      conditions.push('id > ?');
      params.push(options.cursor);
    }

    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    const query = `SELECT * FROM events${where} ORDER BY id ASC LIMIT ?`;
    params.push(limit + 1);

    const rows = this.db.prepare(query).all(...params) as Event[];
    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();

    return { data: rows, next_cursor: hasMore ? rows[rows.length - 1]?.id ?? null : null };
  }

  findByPerson(personId: string): Event[] {
    return this.db.prepare(
      'SELECT * FROM events WHERE person_id = ? ORDER BY event_date_sort_key ASC NULLS LAST'
    ).all(personId) as Event[];
  }

  findByFamily(familyId: string): Event[] {
    return this.db.prepare(
      'SELECT * FROM events WHERE family_id = ? ORDER BY event_date_sort_key ASC NULLS LAST'
    ).all(familyId) as Event[];
  }

  findByFamilyAndType(familyId: string, eventType: string): Event | undefined {
    return this.db.prepare(
      'SELECT * FROM events WHERE family_id = ? AND event_type = ? ORDER BY created_at ASC, id ASC LIMIT 1'
    ).get(familyId, eventType) as Event | undefined;
  }

  findTimelineByPerson(personId: string): Event[] {
    const baseEvents = this.findByPerson(personId);
    // Only families this person is a spouse in. family_members holds the
    // children -- its role vocabulary is child/adopted/foster/step -- so
    // including it put a couple's marriage, divorce and anniversary on each of
    // their children's timelines, with Edit and Delete beside them as though
    // the child owned the event.
    const familyRows = this.db.prepare(`
      SELECT DISTINCT f.id
      FROM families f
      WHERE f.spouse1_id = ? OR f.spouse2_id = ?
    `).all(personId, personId) as { id: string }[];

    const familyIds = familyRows.map((row) => row.id);
    const familyEvents = familyIds.length === 0
      ? []
      : this.db.prepare(
          `SELECT * FROM events WHERE family_id IN (${familyIds.map(() => '?').join(',')})`
        ).all(...familyIds) as Event[];

    const combined = [...baseEvents, ...familyEvents];
    const deduped = new Map<string, Event>();
    for (const event of combined) {
      // source_url is deliberately absent from the key. Two records of the
      // same event that differ only in where they were read are still one
      // event, and keying on the URL would show both.
      const key = [
        event.event_type,
        event.event_date ?? '',
        event.event_place ?? '',
        event.description ?? '',
      ].join('|');
      if (!deduped.has(key)) deduped.set(key, event);
    }

    return [...deduped.values()].sort((a, b) => {
      const aSort = a.event_date_sort_key ?? Number.MAX_SAFE_INTEGER;
      const bSort = b.event_date_sort_key ?? Number.MAX_SAFE_INTEGER;
      if (aSort !== bSort) return aSort - bSort;
      if (a.created_at !== b.created_at) return a.created_at.localeCompare(b.created_at);
      return a.id.localeCompare(b.id);
    });
  }

  create(data: {
    person_id?: string;
    family_id?: string;
    event_type: string;
    event_date?: string | null;
    event_place?: string | null;
    description?: string | null;
    source_url?: string | null;
    source_url_checked_at?: string | null;
  }): Event {
    if ((data.person_id ? 1 : 0) + (data.family_id ? 1 : 0) !== 1) {
      throw new Error('Event must belong to exactly one subject');
    }

    const id = this.generateId();
    const now = this.now();
    const dateInfo = data.event_date ? parseGedcomDate(data.event_date) : null;

    const createEvent = this.db.transaction(() => {
      this.db.prepare(
        'INSERT INTO events (id, person_id, family_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, description, source_url, source_url_checked_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        id, data.person_id || null, data.family_id || null, data.event_type,
        data.event_date || null, dateInfo?.qualifier || 'exact', dateInfo?.sortKey || null,
        data.event_place || null, data.description || null,
        data.source_url || null, data.source_url_checked_at || null,
        now, now,
      );

      if (this.hasArchiveObjectsTable()) {
        this.archiveObjects.create({
          id,
          object_type: 'event',
          title: this.eventTitle(data.event_type, data.event_date ?? null),
          summary: data.description ?? null,
          privacy_level: 'family',
        });
        // After the archive object: the link is a relationship between two of
        // them, so the event has to exist as one first.
        this.syncEventPlace(id, data.event_place ?? null);
      }
    });

    createEvent();

    const created = this.findById(id)!;
    recordChange('create', 'event', id, null, created, { label: this.auditLabel(created) });
    return created;
  }

  syncFamilyEvent(
    familyId: string,
    eventType: string,
    data: {
      event_date?: string | null;
      event_place?: string | null;
      description?: string | null;
    },
  ): Event | undefined {
    const existing = this.findByFamilyAndType(familyId, eventType);
    const hasContent = Boolean(data.event_date || data.event_place || data.description);

    if (!hasContent) {
      if (existing) this.delete(existing.id);
      return undefined;
    }

    const payload = {
      event_type: eventType,
      event_date: data.event_date,
      event_place: data.event_place,
      description: data.description,
    };

    if (existing) {
      return this.update(existing.id, payload);
    }

    return this.create({
      family_id: familyId,
      ...payload,
    });
  }

  update(id: string, data: Partial<Pick<Event, 'event_type' | 'event_date' | 'event_place' | 'description' | 'source_url' | 'source_url_checked_at'>>): Event | undefined {
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (data.event_date !== undefined) {
      const dateInfo = data.event_date ? parseGedcomDate(data.event_date) : null;
      fields.push('event_date_qualifier = ?', 'event_date_sort_key = ?');
      values.push(dateInfo?.qualifier || 'exact', dateInfo?.sortKey || null);
    }

    if (fields.length === 0) return this.findById(id);

    const before = this.findById(id);

    fields.push('updated_at = ?');
    values.push(this.now());
    values.push(id);

    const updateEvent = this.db.transaction(() => {
      this.db.prepare(`UPDATE events SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      const event = this.findById(id);
      if (event && this.hasArchiveObjectsTable()) {
        this.archiveObjects.update(id, {
          title: this.eventTitle(event.event_type, event.event_date),
          summary: event.description,
        });
        // Only when the caller actually passed event_place. An update of just
        // the date must not touch the link.
        if (data.event_place !== undefined) this.syncEventPlace(id, event.event_place);
      }
    });

    updateEvent();

    const after = this.findById(id);
    recordChange('update', 'event', id, before, after, { label: this.auditLabel(after ?? before) });
    return after;
  }

  delete(id: string): boolean {
    const before = this.findById(id);

    const deleteEvent = this.db.transaction(() => {
      if (this.hasArchiveObjectsTable()) {
        // Before the archive object. Deleting that cascades the event's own
        // membership row away but leaves the relationship behind holding a
        // single member, which is an edge from nothing to the place.
        this.unlinkEventPlace(id);
        this.db.prepare('DELETE FROM archive_objects WHERE id = ?').run(id);
      }
      return this.db.prepare('DELETE FROM events WHERE id = ?').run(id).changes > 0;
    });

    const deleted = deleteEvent();
    // One entry for the event; the archive_objects row goes with it and is not
    // a separate thing anyone chose to delete.
    if (deleted) recordChange('delete', 'event', id, before, null, { label: this.auditLabel(before) });
    return deleted;
  }

  /** Reuses the archive title, so the log reads the way the record does. */
  private auditLabel(event?: { event_type: string; event_date?: string | null } | null): string | null {
    return event ? this.eventTitle(event.event_type, event.event_date ?? null) : null;
  }

  private eventTitle(eventType: string, eventDate?: string | null): string {
    const label = eventType
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    return eventDate ? `${label} - ${eventDate}` : label;
  }

  /** The id of an event's place edge. Deterministic, and the same form migration
      046 chose, so one event never accumulates two of them. */
  private placeRelationshipId(eventId: string): string {
    return `rel_event_place_${eventId}`;
  }

  /** Point this event's "occurred at" edge at the named place, or remove it.

      The event keeps event_place as the text that was typed; this is the
      reusable place record behind it, which is what the places pages, and any
      future map or merge, actually read. */
  private syncEventPlace(eventId: string, place: string | null): void {
    if (!this.hasPlaceTables()) return;

    if (!place || !place.trim()) {
      this.unlinkEventPlace(eventId);
      return;
    }

    const resolved = this.places.resolveOrCreate(place);
    if (!resolved) {
      this.unlinkEventPlace(eventId);
      return;
    }

    const relationshipId = this.placeRelationshipId(eventId);
    const now = this.now();

    this.db.prepare(
      `INSERT OR IGNORE INTO archive_objects (id, object_type, title, privacy_level, created_at, updated_at)
       VALUES (?, 'relationship', 'Occurred At', 'family', ?, ?)`,
    ).run(relationshipId, now, now);

    // No date is copied onto the edge. The event owns its date, and a second
    // copy here would be one more thing to keep in step on every edit.
    this.db.prepare(
      `INSERT OR IGNORE INTO relationships (id, relationship_type_id, label, notes)
       VALUES (?, 'rel_type_occurred_at', 'Occurred At', ?)`,
    ).run(relationshipId, 'Linked from events.event_place');

    this.db.prepare(
      `INSERT OR IGNORE INTO relationship_members (relationship_id, object_id, role, sort_order)
       VALUES (?, ?, 'event', 0)`,
    ).run(relationshipId, eventId);

    // Re-point rather than insert: an edited place must not leave the event
    // attached to both the old place and the new one.
    this.db.prepare(
      "DELETE FROM relationship_members WHERE relationship_id = ? AND role = 'place'",
    ).run(relationshipId);
    this.db.prepare(
      `INSERT INTO relationship_members (relationship_id, object_id, role, sort_order)
       VALUES (?, ?, 'place', 1)`,
    ).run(relationshipId, resolved.id);
  }

  /** The place record itself stays: other events may still point at it, and a
      place that has lost its last event is still a place. */
  private unlinkEventPlace(eventId: string): void {
    if (!this.hasPlaceTables()) return;

    const relationshipId = this.placeRelationshipId(eventId);
    // Explicit and in order. These cascades only fire when the connection has
    // foreign_keys on, which the migrator deliberately turns off and an
    // in-memory test database never turns on.
    this.db.prepare('DELETE FROM relationship_members WHERE relationship_id = ?').run(relationshipId);
    this.db.prepare('DELETE FROM relationships WHERE id = ?').run(relationshipId);
    this.db.prepare('DELETE FROM archive_objects WHERE id = ?').run(relationshipId);
  }

  /** Older fixtures build an events table by hand and have none of this. The
      link is an enrichment, so its absence must not fail a write. */
  private hasPlaceTables(): boolean {
    const tables = this.db.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table'
         AND name IN ('places', 'place_aliases', 'relationships', 'relationship_members')`,
    ).all() as { name: string }[];
    if (tables.length < 4) return false;

    // The relationship type is seeded by a migration, and the members carry a
    // foreign key to it.
    return Boolean(
      this.db.prepare("SELECT id FROM relationship_types WHERE id = 'rel_type_occurred_at'").get(),
    );
  }

  private hasArchiveObjectsTable(): boolean {
    return Boolean(this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'archive_objects'").get());
  }
}
