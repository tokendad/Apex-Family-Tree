import { BaseRepository } from './base.js';
import type { Event } from '../types/db.js';
import { parseGedcomDate } from '../utils/gedcom-date.js';

export class EventRepository extends BaseRepository {
  findById(id: string): Event | undefined {
    return this.db.prepare('SELECT * FROM events WHERE id = ?').get(id) as Event | undefined;
  }

  findByPerson(personId: string): Event[] {
    return this.db.prepare(
      'SELECT * FROM events WHERE person_id = ? ORDER BY event_date_sort_key ASC NULLS LAST'
    ).all(personId) as Event[];
  }

  create(data: {
    person_id: string;
    event_type: string;
    event_date?: string;
    event_place?: string;
    description?: string;
  }): Event {
    const id = this.generateId();
    const now = this.now();
    const dateInfo = data.event_date ? parseGedcomDate(data.event_date) : null;

    this.db.prepare(
      'INSERT INTO events (id, person_id, event_type, event_date, event_date_qualifier, event_date_sort_key, event_place, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      id, data.person_id, data.event_type,
      data.event_date || null, dateInfo?.qualifier || 'exact', dateInfo?.sortKey || null,
      data.event_place || null, data.description || null,
      now, now,
    );
    return this.findById(id)!;
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
