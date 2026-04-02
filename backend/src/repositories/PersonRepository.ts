import { BaseRepository } from './base.js';
import type { Person, Name, Family, PersonWithNames } from '../types/db.js';

export class PersonRepository extends BaseRepository {
  findById(id: string): PersonWithNames | undefined {
    const person = this.db.prepare('SELECT * FROM persons WHERE id = ?').get(id) as Person | undefined;
    if (!person) return undefined;

    const names = this.db.prepare(
      'SELECT * FROM names WHERE person_id = ? ORDER BY is_primary DESC, sort_order ASC'
    ).all(id) as Name[];
    return { ...person, names, primary_name: names.find(n => n.is_primary) || names[0] };
  }

  findAll(options?: { limit?: number; cursor?: string; search?: string; isLiving?: boolean }): { data: PersonWithNames[]; next_cursor: string | null } {
    const limit = options?.limit || 50;
    let query = 'SELECT p.* FROM persons p';
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (options?.search) {
      query = 'SELECT p.* FROM persons p INNER JOIN persons_fts fts ON p.id = fts.person_id';
      conditions.push('persons_fts MATCH ?');
      params.push(options.search);
    }

    if (options?.cursor) {
      conditions.push('p.id > ?');
      params.push(options.cursor);
    }

    if (options?.isLiving !== undefined) {
      conditions.push('p.is_living = ?');
      params.push(options.isLiving ? 1 : 0);
    }

    if (conditions.length) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY p.id ASC LIMIT ?';
    params.push(limit + 1);

    const rows = this.db.prepare(query).all(...params) as Person[];
    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();

    const data = rows.map(person => {
      const names = this.db.prepare(
        'SELECT * FROM names WHERE person_id = ? ORDER BY is_primary DESC, sort_order ASC'
      ).all(person.id) as Name[];
      return { ...person, names, primary_name: names.find(n => n.is_primary) || names[0] };
    });

    return { data, next_cursor: hasMore ? rows[rows.length - 1]?.id ?? null : null };
  }

  create(data: {
    sex?: Person['sex'];
    is_living?: number;
    is_private?: number;
    notes?: string;
    created_by?: string;
    gedcom_id?: string;
  }): Person {
    const id = this.generateId();
    const now = this.now();
    this.db.prepare(
      'INSERT INTO persons (id, sex, is_living, is_private, notes, created_by, gedcom_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, data.sex || 'U', data.is_living ?? 1, data.is_private ?? 0, data.notes || null, data.created_by || null, data.gedcom_id || null, now, now);
    return this.db.prepare('SELECT * FROM persons WHERE id = ?').get(id) as Person;
  }

  update(id: string, data: Partial<Pick<Person, 'sex' | 'is_living' | 'is_private' | 'notes'>>): Person | undefined {
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return this.db.prepare('SELECT * FROM persons WHERE id = ?').get(id) as Person | undefined;

    fields.push('updated_at = ?');
    values.push(this.now());
    values.push(id);

    this.db.prepare(`UPDATE persons SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.db.prepare('SELECT * FROM persons WHERE id = ?').get(id) as Person | undefined;
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM persons WHERE id = ?').run(id);
    return result.changes > 0;
  }

  addName(personId: string, data: {
    name_type?: Name['name_type'];
    prefix?: string;
    given_name?: string;
    surname?: string;
    suffix?: string;
    is_primary?: number;
  }): Name {
    const id = this.generateId();
    const now = this.now();

    if (data.is_primary) {
      this.db.prepare('UPDATE names SET is_primary = 0 WHERE person_id = ?').run(personId);
    }

    const maxOrder = this.db.prepare(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM names WHERE person_id = ?'
    ).get(personId) as { next: number };

    this.db.prepare(
      'INSERT INTO names (id, person_id, name_type, prefix, given_name, surname, suffix, is_primary, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      id, personId, data.name_type || 'birth',
      data.prefix || null, data.given_name || null, data.surname || null, data.suffix || null,
      data.is_primary ?? 0, maxOrder.next, now, now,
    );

    return this.db.prepare('SELECT * FROM names WHERE id = ?').get(id) as Name;
  }

  getRelationships(personId: string): { parents: PersonWithNames[]; spouses: PersonWithNames[]; children: PersonWithNames[] } {
    const asSpouse = this.db.prepare(
      'SELECT * FROM families WHERE spouse1_id = ? OR spouse2_id = ?'
    ).all(personId, personId) as Family[];

    const asChild = this.db.prepare(
      'SELECT f.* FROM families f INNER JOIN family_members fm ON f.id = fm.family_id WHERE fm.person_id = ?'
    ).all(personId) as Family[];

    const loadPerson = (id: string): PersonWithNames | undefined => this.findById(id);

    const parents: PersonWithNames[] = [];
    for (const family of asChild) {
      if (family.spouse1_id) { const p = loadPerson(family.spouse1_id); if (p) parents.push(p); }
      if (family.spouse2_id) { const p = loadPerson(family.spouse2_id); if (p) parents.push(p); }
    }

    const spouses: PersonWithNames[] = [];
    for (const family of asSpouse) {
      const spouseId = family.spouse1_id === personId ? family.spouse2_id : family.spouse1_id;
      if (spouseId) { const p = loadPerson(spouseId); if (p) spouses.push(p); }
    }

    const children: PersonWithNames[] = [];
    for (const family of asSpouse) {
      const members = this.db.prepare(
        'SELECT person_id FROM family_members WHERE family_id = ?'
      ).all(family.id) as { person_id: string }[];
      for (const member of members) {
        const p = loadPerson(member.person_id);
        if (p) children.push(p);
      }
    }

    return { parents, spouses, children };
  }
}
