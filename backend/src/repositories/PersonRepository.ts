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

  findAll(options?: {
    limit?: number;
    cursor?: string;
    search?: string;
    isLiving?: boolean;
    sort?: 'surname';
    filter?: 'unconnected';
  }): { data: PersonWithNames[]; next_cursor: string | null } {
    const limit = options?.limit || 50;
    const useSurnameSort = options?.sort === 'surname';
    const useUnconnectedFilter = options?.filter === 'unconnected';

    const joins: string[] = [];
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.search) {
      joins.push('INNER JOIN persons_fts fts ON p.id = fts.person_id');
      let searchTerm = options.search.trim();
      if (searchTerm && !searchTerm.endsWith('*') && !searchTerm.includes('"')) {
        searchTerm += '*';
      }
      conditions.push('persons_fts MATCH ?');
      params.push(searchTerm);
    }

    if (useUnconnectedFilter) {
      conditions.push('NOT EXISTS (SELECT 1 FROM families WHERE spouse1_id = p.id)');
      conditions.push('NOT EXISTS (SELECT 1 FROM families WHERE spouse2_id = p.id)');
      conditions.push('NOT EXISTS (SELECT 1 FROM family_members WHERE person_id = p.id)');
    }

    if (options?.isLiving !== undefined) {
      conditions.push('p.is_living = ?');
      params.push(options.isLiving ? 1 : 0);
    }

    if (options?.cursor) {
      if (useSurnameSort) {
        const cursorRow = this.db.prepare(
          `SELECT COALESCE(surname, '') AS sn, COALESCE(given_name, '') AS gn
           FROM names WHERE person_id = ? AND is_primary = 1 LIMIT 1`
        ).get(options.cursor) as { sn: string; gn: string } | undefined;
        const sn = cursorRow?.sn ?? '';
        const gn = cursorRow?.gn ?? '';
        conditions.push(`(
          (SELECT COALESCE(surname, '') FROM names WHERE person_id = p.id AND is_primary = 1 LIMIT 1) > ? OR
          ((SELECT COALESCE(surname, '') FROM names WHERE person_id = p.id AND is_primary = 1 LIMIT 1) = ? AND
           (SELECT COALESCE(given_name, '') FROM names WHERE person_id = p.id AND is_primary = 1 LIMIT 1) > ?) OR
          ((SELECT COALESCE(surname, '') FROM names WHERE person_id = p.id AND is_primary = 1 LIMIT 1) = ? AND
           (SELECT COALESCE(given_name, '') FROM names WHERE person_id = p.id AND is_primary = 1 LIMIT 1) = ? AND
           p.id > ?)
        )`);
        params.push(sn, sn, gn, sn, gn, options.cursor);
      } else {
        conditions.push('p.id > ?');
        params.push(options.cursor);
      }
    }

    let query = 'SELECT p.* FROM persons p';
    if (joins.length) query += ' ' + joins.join(' ');
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');

    if (useSurnameSort) {
      query += ` ORDER BY
        (SELECT COALESCE(surname, '') FROM names WHERE person_id = p.id AND is_primary = 1 LIMIT 1) ASC,
        (SELECT COALESCE(given_name, '') FROM names WHERE person_id = p.id AND is_primary = 1 LIMIT 1) ASC,
        p.id ASC`;
    } else {
      query += ' ORDER BY p.id ASC';
    }

    query += ' LIMIT ?';
    params.push(limit + 1);

    const rows = this.db.prepare(query).all(...params) as Person[];
    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();

    const data = rows.map(person => {
      const names = this.db.prepare(
        'SELECT * FROM names WHERE person_id = ? ORDER BY is_primary DESC, sort_order ASC'
      ).all(person.id) as Name[];
      const primaryName = names.find(n => n.is_primary) || names[0];
      return {
        ...person,
        names,
        primary_name: primaryName,
        // Flat convenience fields expected by the People list UI
        given_name: primaryName?.given_name ?? null,
        surname: primaryName?.surname ?? null,
      };
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

  findNameById(id: string): Name | undefined {
    return this.db.prepare('SELECT * FROM names WHERE id = ?').get(id) as Name | undefined;
  }

  updateName(nameId: string, data: {
    name_type?: Name['name_type'];
    prefix?: string;
    given_name?: string;
    surname?: string;
    suffix?: string;
    is_primary?: number;
  }): Name | undefined {
    const existing = this.findNameById(nameId);
    if (!existing) return undefined;

    if (data.is_primary) {
      this.db.prepare('UPDATE names SET is_primary = 0 WHERE person_id = ?').run(existing.person_id);
    }

    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return existing;

    fields.push('updated_at = ?');
    values.push(this.now());
    values.push(nameId);

    this.db.prepare(`UPDATE names SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.findNameById(nameId);
  }

  deleteName(nameId: string): boolean {
    return this.db.prepare('DELETE FROM names WHERE id = ?').run(nameId).changes > 0;
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
