import { BaseRepository } from './base.js';
import type { Event } from '../types/db.js';
import { parseGedcomDate } from '../utils/gedcom-date.js';

export class EventRepository extends BaseRepository {
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
    const familyRows = this.db.prepare(`
      SELECT DISTINCT f.id
      FROM families f
      WHERE f.spouse1_id = ? OR f.spouse2_id = ?
         OR EXISTS (
           SELECT 1
           FROM family_members fm
           WHERE fm.family_id = f.id
             AND fm.person_id = ?
         )
    `).all(personId, personId, personId) as { id: string }[];

    const familyIds = familyRows.map((row) => row.id);
    const familyEvents = familyIds.length === 0
      ? []
      : this.db.prepare(
          `SELECT * FROM events WHERE family_id IN (${familyIds.map(() => '?').join(',')})`
        ).all(...familyIds) as Event[];

    const combined = [...baseEvents, ...familyEvents];
    const deduped = new Map<string, Event>();
    for (const event of combined) {
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
  }): Event {
    if ((data.person_id ? 1 : 0) + (data.family_id ? 1 : 0) !== 1) {
      throw new Error('Event must belong to exactly one subject');
    }

    const id = this.generateId();
    const now = this.now();
    const dateInfo = data.event_date ? parseGedcomDate(data.event_date) : null;

    this.db.prepare(
      'INSERT INTO events (id, person_id, family_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      id, data.person_id || null, data.family_id || null, data.event_type,
      data.event_date || null, dateInfo?.qualifier || 'exact', dateInfo?.sortKey || null,
      data.event_place || null, data.description || null,
      now, now,
    );
    return this.findById(id)!;
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

  update(id: string, data: Partial<Pick<Event, 'event_type' | 'event_date' | 'event_place' | 'description'>>): Event | undefined {
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

    fields.push('updated_at = ?');
    values.push(this.now());
    values.push(id);

    this.db.prepare(`UPDATE events SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.findById(id);
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM events WHERE id = ?').run(id).changes > 0;
  }
}
