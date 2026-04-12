import { BaseRepository } from './base.js';
import { soundex } from '../utils/soundex.js';
import type { Person, Name, Family, PersonWithNames } from '../types/db.js';

/** Sanitize user input for FTS5 MATCH: strip operators, build prefix query */
function buildFtsQuery(input: string): string | null {
  // Tokenize: keep only alphanumeric + unicode word chars, drop FTS operators
  const tokens = input
    .replace(/["""''()*:^{}~\-+]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 0);
  if (tokens.length === 0) return null;
  // Build prefix query: each token gets a trailing * for prefix matching
  return tokens.map(t => `"${t}"*`).join(' AND ');
}

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
    sex?: string;
    firstName?: string;
    lastName?: string;
    nameMatchType?: 'contains' | 'startsWith' | 'exact' | 'soundex';
    initial?: string;
    birthYearFrom?: number;
    birthYearTo?: number;
    deathYearFrom?: number;
    deathYearTo?: number;
    marriageYearFrom?: number;
    marriageYearTo?: number;
    missingBirthDate?: boolean;
    missingDeathDate?: boolean;
    missingMarriageDate?: boolean;
    dateQualifier?: 'exact' | 'approximate' | 'before' | 'after';
    place?: string;
    placeCountry?: string;
    placeState?: string;
    placeCity?: string;
    hasPhoto?: boolean;
    hasSources?: boolean;
    hasMissingData?: boolean;
    relationshipType?: 'ancestor' | 'descendant' | 'sibling' | 'spouse';
    homePersonId?: string;
  }): { data: PersonWithNames[]; next_cursor: string | null; total_count: number } {
    const limit = options?.limit || 50;
    const useSurnameSort = options?.sort === 'surname';
    const useUnconnectedFilter = options?.filter === 'unconnected';
    const nameMatch = options?.nameMatchType ?? 'contains';

    const joins: string[] = [];
    const conditions: string[] = [];
    const params: unknown[] = [];

    // Global search (FTS5 prefix match with LIKE fallback for very short terms)
    if (options?.search) {
      const term = options.search.trim();
      const ftsQuery = buildFtsQuery(term);
      if (ftsQuery && term.length >= 2) {
        conditions.push(
          'p.id IN (SELECT person_id FROM persons_fts WHERE persons_fts MATCH ?)'
        );
        params.push(ftsQuery);
      } else {
        // Fallback: single-char or un-tokenizable input
        const likeTerm = `%${term}%`;
        conditions.push(
          'EXISTS (SELECT 1 FROM names _sn WHERE _sn.person_id = p.id AND (_sn.given_name LIKE ? OR _sn.surname LIKE ?))'
        );
        params.push(likeTerm, likeTerm);
      }
    }

    // First name + last name search (combined in single EXISTS for correctness)
    if (options?.firstName || options?.lastName) {
      const nameConds: string[] = [];
      const nameParams: unknown[] = [];
      if (options?.firstName) {
        const term = options.firstName.trim();
        if (nameMatch === 'soundex') {
          const code = soundex(term);
          nameConds.push('soundex_code(_fn.given_name) = ?');
          nameParams.push(code);
        } else if (nameMatch === 'exact') {
          nameConds.push('_fn.given_name = ? COLLATE NOCASE');
          nameParams.push(term);
        } else if (nameMatch === 'startsWith') {
          nameConds.push('_fn.given_name LIKE ? COLLATE NOCASE');
          nameParams.push(`${term}%`);
        } else {
          nameConds.push('_fn.given_name LIKE ? COLLATE NOCASE');
          nameParams.push(`%${term}%`);
        }
      }
      if (options?.lastName) {
        const term = options.lastName.trim();
        if (nameMatch === 'soundex') {
          const code = soundex(term);
          nameConds.push('soundex_code(_fn.surname) = ?');
          nameParams.push(code);
        } else if (nameMatch === 'exact') {
          nameConds.push('_fn.surname = ? COLLATE NOCASE');
          nameParams.push(term);
        } else if (nameMatch === 'startsWith') {
          nameConds.push('_fn.surname LIKE ? COLLATE NOCASE');
          nameParams.push(`${term}%`);
        } else {
          nameConds.push('_fn.surname LIKE ? COLLATE NOCASE');
          nameParams.push(`%${term}%`);
        }
      }
      conditions.push(
        `EXISTS (SELECT 1 FROM names _fn WHERE _fn.person_id = p.id AND ${nameConds.join(' AND ')})`
      );
      params.push(...nameParams);
    }

    // Sex filter
    if (options?.sex) {
      conditions.push('p.sex = ?');
      params.push(options.sex);
    }

    // Date qualifier SQL fragments (applied to birth/death events and marriage families)
    let eventQualifierSql = '';
    let marriageQualifierSql = '';
    const eventQualifierParams: unknown[] = [];
    const marriageQualifierParams: unknown[] = [];
    if (options?.dateQualifier) {
      const dq = options.dateQualifier;
      if (dq === 'exact') {
        eventQualifierSql = " AND COALESCE(event_date_qualifier, 'exact') = 'exact'";
        marriageQualifierSql = " AND COALESCE(marriage_date_qualifier, 'exact') = 'exact'";
      } else if (dq === 'approximate') {
        eventQualifierSql = " AND COALESCE(event_date_qualifier, 'exact') IN ('about','estimated','calculated','between')";
        marriageQualifierSql = " AND COALESCE(marriage_date_qualifier, 'exact') IN ('about','estimated','calculated','between')";
      } else if (dq === 'before') {
        eventQualifierSql = " AND event_date_qualifier = 'before'";
        marriageQualifierSql = " AND marriage_date_qualifier = 'before'";
      } else if (dq === 'after') {
        eventQualifierSql = " AND event_date_qualifier = 'after'";
        marriageQualifierSql = " AND marriage_date_qualifier = 'after'";
      }
    }

    // Birth year range (event_date_sort_key is YYYYMMDD integer)
    if (options?.birthYearFrom !== undefined || options?.birthYearTo !== undefined) {
      const from = options?.birthYearFrom !== undefined ? options.birthYearFrom * 10000 + 101 : 0;
      const to = options?.birthYearTo !== undefined ? options.birthYearTo * 10000 + 1231 : 99991231;
      conditions.push(
        `EXISTS (SELECT 1 FROM events _eb WHERE _eb.person_id = p.id AND _eb.event_type = 'birth' AND _eb.event_date_sort_key BETWEEN ? AND ?${eventQualifierSql})`
      );
      params.push(from, to, ...eventQualifierParams);
    }

    // Death year range
    if (options?.deathYearFrom !== undefined || options?.deathYearTo !== undefined) {
      const from = options?.deathYearFrom !== undefined ? options.deathYearFrom * 10000 + 101 : 0;
      const to = options?.deathYearTo !== undefined ? options.deathYearTo * 10000 + 1231 : 99991231;
      conditions.push(
        `EXISTS (SELECT 1 FROM events _ed WHERE _ed.person_id = p.id AND _ed.event_type = 'death' AND _ed.event_date_sort_key BETWEEN ? AND ?${eventQualifierSql})`
      );
      params.push(from, to, ...eventQualifierParams);
    }

    // Place filter (freetext LIKE on any event)
    if (options?.place) {
      const placeTerm = `%${options.place.trim()}%`;
      conditions.push(
        'EXISTS (SELECT 1 FROM events _ep WHERE _ep.person_id = p.id AND _ep.event_place LIKE ?)'
      );
      params.push(placeTerm);
    }

    // Structured place filters — each independently LIKEs against event_place (AND logic)
    for (const placeField of ['placeCountry', 'placeState', 'placeCity'] as const) {
      const val = options?.[placeField];
      if (val) {
        const term = `%${val.trim()}%`;
        conditions.push(
          'EXISTS (SELECT 1 FROM events _ep WHERE _ep.person_id = p.id AND _ep.event_place LIKE ?)'
        );
        params.push(term);
      }
    }

    // Has photo filter
    if (options?.hasPhoto) {
      conditions.push(
        'EXISTS (SELECT 1 FROM person_media _pm WHERE _pm.person_id = p.id)'
      );
    }

    // Has sources filter (check direct person citations AND citations on person's events)
    if (options?.hasSources) {
      conditions.push(
        `EXISTS (
          SELECT 1 FROM source_citations _sc
          WHERE _sc.person_id = p.id
          UNION ALL
          SELECT 1 FROM source_citations _sc2
          INNER JOIN events _se ON _sc2.event_id = _se.id
          WHERE _se.person_id = p.id
          LIMIT 1
        )`
      );
    }

    // Missing data filter: no usable name, no birth event, or no death when deceased
    if (options?.hasMissingData) {
      conditions.push(`(
        NOT EXISTS (SELECT 1 FROM names _nm WHERE _nm.person_id = p.id AND _nm.given_name IS NOT NULL AND _nm.given_name != '')
        OR NOT EXISTS (SELECT 1 FROM events _bm WHERE _bm.person_id = p.id AND _bm.event_type = 'birth')
        OR (p.is_living = 0 AND NOT EXISTS (SELECT 1 FROM events _dm WHERE _dm.person_id = p.id AND _dm.event_type = 'death'))
      )`);
    }

    // Initial / middle name search (matches any non-first token in given_name)
    if (options?.initial) {
      const term = options.initial.trim();
      conditions.push(
        `EXISTS (SELECT 1 FROM names _in WHERE _in.person_id = p.id AND _in.given_name LIKE ? COLLATE NOCASE)`
      );
      params.push(`% ${term}%`);
    }

    // Marriage year range (through families table)
    if (options?.marriageYearFrom !== undefined || options?.marriageYearTo !== undefined) {
      const from = options?.marriageYearFrom !== undefined ? options.marriageYearFrom * 10000 + 101 : 0;
      const to = options?.marriageYearTo !== undefined ? options.marriageYearTo * 10000 + 1231 : 99991231;
      conditions.push(
        `EXISTS (SELECT 1 FROM families _fm WHERE (_fm.spouse1_id = p.id OR _fm.spouse2_id = p.id) AND _fm.marriage_date_sort_key BETWEEN ? AND ?${marriageQualifierSql})`
      );
      params.push(from, to, ...marriageQualifierParams);
    }

    // Missing date filters ("Unknown" date mode)
    if (options?.missingBirthDate) {
      conditions.push(
        `NOT EXISTS (SELECT 1 FROM events _mb WHERE _mb.person_id = p.id AND _mb.event_type = 'birth' AND _mb.event_date_sort_key IS NOT NULL AND _mb.event_date_sort_key > 0)`
      );
    }
    if (options?.missingDeathDate) {
      conditions.push(
        `NOT EXISTS (SELECT 1 FROM events _md WHERE _md.person_id = p.id AND _md.event_type = 'death' AND _md.event_date_sort_key IS NOT NULL AND _md.event_date_sort_key > 0)`
      );
    }
    if (options?.missingMarriageDate) {
      conditions.push(
        `NOT EXISTS (SELECT 1 FROM families _mm WHERE (_mm.spouse1_id = p.id OR _mm.spouse2_id = p.id) AND _mm.marriage_date_sort_key IS NOT NULL AND _mm.marriage_date_sort_key > 0)`
      );
    }

    // Standalone date qualifier (when set without any year ranges, matches any event with that qualifier)
    if (options?.dateQualifier && eventQualifierSql) {
      const hasBirthRange = options.birthYearFrom !== undefined || options.birthYearTo !== undefined;
      const hasDeathRange = options.deathYearFrom !== undefined || options.deathYearTo !== undefined;
      const hasMarriageRange = options.marriageYearFrom !== undefined || options.marriageYearTo !== undefined;
      if (!hasBirthRange && !hasDeathRange && !hasMarriageRange) {
        const stParts: string[] = [];
        stParts.push(`EXISTS (SELECT 1 FROM events _qb WHERE _qb.person_id = p.id AND _qb.event_type = 'birth'${eventQualifierSql})`);
        stParts.push(`EXISTS (SELECT 1 FROM events _qd WHERE _qd.person_id = p.id AND _qd.event_type = 'death'${eventQualifierSql})`);
        stParts.push(`EXISTS (SELECT 1 FROM families _qm WHERE (_qm.spouse1_id = p.id OR _qm.spouse2_id = p.id)${marriageQualifierSql})`);
        conditions.push(`(${stParts.join(' OR ')})`);
      }
    }

    // Relationship type filter (pre-computed ID set via BFS)
    if (options?.relationshipType && options?.homePersonId) {
      const relatedIds = this.computeRelatedPersonIds(
        options.homePersonId,
        options.relationshipType,
      );
      if (relatedIds.length === 0) {
        // No matches — short-circuit by adding an impossible condition
        conditions.push('1 = 0');
      } else {
        const placeholders = relatedIds.map(() => '?').join(',');
        conditions.push(`p.id IN (${placeholders})`);
        params.push(...relatedIds);
      }
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

    // Build the WHERE clause once (shared by count + data queries)
    const whereClause = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    const countParams = [...params];

    // Total count query (without cursor/limit)
    const countQuery = `SELECT COUNT(*) as cnt FROM persons p${joins.length ? ' ' + joins.join(' ') : ''}${whereClause}`;
    const countRow = this.db.prepare(countQuery).get(...countParams) as { cnt: number };
    const totalCount = countRow.cnt;

    // Cursor for pagination (added after count)
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

    const fullWhereClause = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';

    let query = 'SELECT p.* FROM persons p';
    if (joins.length) query += ' ' + joins.join(' ');
    query += fullWhereClause;

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

    return { data, next_cursor: hasMore ? rows[rows.length - 1]?.id ?? null : null, total_count: totalCount };
  }

  /**
   * BFS traversal to compute person IDs related to homePersonId by the given relationship type.
   */
  private computeRelatedPersonIds(
    homePersonId: string,
    type: 'ancestor' | 'descendant' | 'sibling' | 'spouse',
  ): string[] {
    if (type === 'spouse') {
      const rows = this.db.prepare(
        `SELECT CASE WHEN spouse1_id = ? THEN spouse2_id ELSE spouse1_id END AS pid
         FROM families WHERE spouse1_id = ? OR spouse2_id = ?`
      ).all(homePersonId, homePersonId, homePersonId) as { pid: string | null }[];
      return rows.filter(r => r.pid !== null).map(r => r.pid!);
    }

    if (type === 'sibling') {
      // Find families where home person is a child, then get other children
      const familyIds = this.db.prepare(
        'SELECT family_id FROM family_members WHERE person_id = ?'
      ).all(homePersonId) as { family_id: string }[];

      const siblings = new Set<string>();
      for (const { family_id } of familyIds) {
        const members = this.db.prepare(
          'SELECT person_id FROM family_members WHERE family_id = ? AND person_id != ?'
        ).all(family_id, homePersonId) as { person_id: string }[];
        for (const m of members) siblings.add(m.person_id);
      }
      return [...siblings];
    }

    if (type === 'ancestor') {
      return this.bfsAncestors(homePersonId);
    }

    // descendant
    return this.bfsDescendants(homePersonId);
  }

  private bfsAncestors(startId: string): string[] {
    const visited = new Set<string>();
    const queue = [startId];

    while (queue.length > 0) {
      const personId = queue.shift()!;
      // Find families where this person is a child
      const parentFamilies = this.db.prepare(
        'SELECT family_id FROM family_members WHERE person_id = ?'
      ).all(personId) as { family_id: string }[];

      for (const { family_id } of parentFamilies) {
        const family = this.db.prepare(
          'SELECT spouse1_id, spouse2_id FROM families WHERE id = ?'
        ).get(family_id) as { spouse1_id: string | null; spouse2_id: string | null } | undefined;
        if (!family) continue;

        for (const parentId of [family.spouse1_id, family.spouse2_id]) {
          if (parentId && !visited.has(parentId)) {
            visited.add(parentId);
            queue.push(parentId);
          }
        }
      }
    }

    return [...visited];
  }

  private bfsDescendants(startId: string): string[] {
    const visited = new Set<string>();
    const queue = [startId];

    while (queue.length > 0) {
      const personId = queue.shift()!;
      // Find families where this person is a spouse
      const spouseFamilies = this.db.prepare(
        'SELECT id FROM families WHERE spouse1_id = ? OR spouse2_id = ?'
      ).all(personId, personId) as { id: string }[];

      for (const { id: familyId } of spouseFamilies) {
        const children = this.db.prepare(
          'SELECT person_id FROM family_members WHERE family_id = ?'
        ).all(familyId) as { person_id: string }[];

        for (const { person_id: childId } of children) {
          if (!visited.has(childId)) {
            visited.add(childId);
            queue.push(childId);
          }
        }
      }
    }

    return [...visited];
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

  getRelationshipsForDetail(personId: string): {
    family_id: string;
    type: 'parent_family' | 'child_family';
    role: 'spouse1' | 'spouse2' | 'child';
    spouse1: { id: string; given_name: string | null; surname: string | null } | null;
    spouse2: { id: string; given_name: string | null; surname: string | null } | null;
    children: { id: string; person_id: string; role: string; given_name: string | null; surname: string | null }[];
  }[] {
    const nameSummary = (pid: string | null) => {
      if (!pid) return null;
      const row = this.db.prepare(
        'SELECT given_name, surname FROM names WHERE person_id = ? AND is_primary = 1 LIMIT 1'
      ).get(pid) as { given_name: string | null; surname: string | null } | undefined;
      return { id: pid, given_name: row?.given_name ?? null, surname: row?.surname ?? null };
    };

    const childMembers = (familyId: string) =>
      (this.db.prepare(
        `SELECT fm.id, fm.person_id, fm.role,
          (SELECT given_name FROM names WHERE person_id = fm.person_id AND is_primary = 1 LIMIT 1) AS given_name,
          (SELECT surname  FROM names WHERE person_id = fm.person_id AND is_primary = 1 LIMIT 1) AS surname
         FROM family_members fm WHERE fm.family_id = ?`
      ).all(familyId) as { id: string; person_id: string; role: string; given_name: string | null; surname: string | null }[]);

    const asChild = this.db.prepare(
      'SELECT f.* FROM families f INNER JOIN family_members fm ON f.id = fm.family_id WHERE fm.person_id = ?'
    ).all(personId) as Family[];

    const asSpouse = this.db.prepare(
      'SELECT * FROM families WHERE spouse1_id = ? OR spouse2_id = ?'
    ).all(personId, personId) as Family[];

    return [
      ...asChild.map(f => ({
        family_id: f.id,
        type: 'child_family' as const,
        role: 'child' as const,
        spouse1: nameSummary(f.spouse1_id),
        spouse2: nameSummary(f.spouse2_id),
        children: childMembers(f.id),
      })),
      ...asSpouse.map(f => ({
        family_id: f.id,
        type: 'parent_family' as const,
        role: (f.spouse1_id === personId ? 'spouse1' : 'spouse2') as 'spouse1' | 'spouse2',
        spouse1: nameSummary(f.spouse1_id),
        spouse2: nameSummary(f.spouse2_id),
        children: childMembers(f.id),
      })),
    ];
  }
}
