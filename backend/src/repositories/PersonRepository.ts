import { BaseRepository } from './base.js';
import { recordChange } from '../services/audit.js';

/** The name as written, so a log entry about a name says which name. */
function nameLabel(name?: { given_name?: string | null; middle_name?: string | null; surname?: string | null } | null): string | null {
  if (!name) return null;
  return [name.given_name, name.middle_name, name.surname].filter(Boolean).join(' ') || null;
}
import { ArchiveObjectRepository } from './ArchiveObjectRepository.js';
import { soundex } from '../utils/soundex.js';
import { formatName, normalizeToNull, sanitizeDisplayName, sanitizeNameField } from '../utils/nameFormatter.js';
import type { Person, Name, Family, PersonWithNames } from '../types/db.js';
import type { MatchPersonInput } from '../services/gedcom/matcher.js';

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

/** A primary-name summary, carrying every component the display name needs. */
export interface RelationshipNameSummary {
  id?: string;
  prefix: string | null;
  given_name: string | null;
  middle_name: string | null;
  surname: string | null;
  suffix: string | null;
}

/** One row of a family's child list: the membership plus the child's name. */
export type RelationshipChildRow = { id: string; family_id: string; person_id: string; role: string } & RelationshipNameSummary;

/**
 * Children of one of the subject's parents by someone else. `via` is always
 * the subject's own parent, because "half-siblings" is not interpretable when
 * both parents remarried -- the reader has to be told which side it runs
 * through.
 */
export interface HalfSiblingGroup {
  via: RelationshipNameSummary;
  children: RelationshipChildRow[];
}

/**
 * Children of a parent's later spouse by someone else -- no shared ancestry
 * with the subject at all, so they are kept apart from the half-siblings
 * rather than pooled with them. `via` is the subject's parent, `step_parent`
 * that parent's spouse whose children these are.
 */
export interface StepSiblingGroup {
  via: RelationshipNameSummary;
  step_parent: RelationshipNameSummary | null;
  children: RelationshipChildRow[];
}

/**
 * The people one of the subject's parents married apart from the other parent.
 * They are not ancestors of the subject, so they are listed apart from the
 * parents rather than alongside them, and `via` names the parent each one
 * married. A step-parent is worth showing whether or not they brought
 * children of their own -- they are who the subject grew up with.
 */
export interface StepParentGroup {
  via: RelationshipNameSummary;
  people: RelationshipNameSummary[];
}

export class PersonRepository extends BaseRepository {
  private archiveObjects = new ArchiveObjectRepository();

  /**
   * Recompute this person's archive_objects title from their current display
   * name / primary name, so relationship-connected views (Connect Person,
   * story/artifact "Connected To" panels) don't show a stale or missing title.
   * No-ops if the person has no archive_objects row (shouldn't happen for
   * anyone created after this write-through was added).
   */
  private refreshArchiveTitle(personId: string): void {
    const person = this.findById(personId);
    if (!person) return;
    this.archiveObjects.update(personId, { title: person.displayName?.trim() || 'Unknown Person' });
  }

  /**
   * Get the global name display format from settings (cached per repository instance).
   * Defaults to '%t %f %m %s %x' if not set.
   */
  private getNameDisplayFormat(): string {
    // Note: In a real app, you might cache this or inject SettingsRepository.
    // For simplicity, we'll fetch it directly each time. Consider optimization later.
    const row = this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get('name_display_format') as { value: string | null } | undefined;
    return row?.value || '%t %f %m %s %x';
  }

  /**
   * Enrich a PersonWithNames object with the formatted displayName.
   */
  private addDisplayName(person: PersonWithNames): PersonWithNames {
    const formatString = this.getNameDisplayFormat();
    const displayName = formatName({
      personDisplayName: person.display_name,
      primaryName: person.primary_name,
      names: person.names,
      formatString,
    });
    return { ...person, displayName };
  }

  findById(id: string): PersonWithNames | undefined {
    const person = this.db.prepare('SELECT * FROM persons WHERE id = ?').get(id) as Person | undefined;
    if (!person) return undefined;

    const names = this.db.prepare(
      'SELECT * FROM names WHERE person_id = ? ORDER BY is_primary DESC, sort_order ASC'
    ).all(id) as Name[];
    
    const personWithNames = { ...person, names, primary_name: names.find(n => n.is_primary) || names[0] };
    return this.addDisplayName(personWithNames);
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
      const personWithNames: PersonWithNames = {
        ...person,
        names,
        primary_name: primaryName,
        // Flat convenience fields expected by the People list UI
        given_name: primaryName?.given_name ?? null,
        surname: primaryName?.surname ?? null,
      };
      return this.addDisplayName(personWithNames);
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

  findAllForMatch(): MatchPersonInput[] {
    const rows = this.db.prepare(`
      SELECT p.id AS id,
        (SELECT given_name FROM names WHERE person_id = p.id ORDER BY is_primary DESC LIMIT 1) AS givenName,
        (SELECT surname    FROM names WHERE person_id = p.id ORDER BY is_primary DESC LIMIT 1) AS surname,
        (SELECT event_date FROM events WHERE person_id = p.id AND event_type = 'birth' ORDER BY event_date_sort_key ASC, id ASC LIMIT 1) AS birthDate,
        (SELECT event_date FROM events WHERE person_id = p.id AND event_type = 'death' ORDER BY event_date_sort_key DESC, id ASC LIMIT 1) AS deathDate
      FROM persons p
    `).all() as MatchPersonInput[];
    return rows;
  }

  create(data: {
    sex?: Person['sex'];
    is_living?: number;
    is_private?: number;
    notes?: string;
    display_name?: string | null;
    created_by?: string;
    gedcom_id?: string;
  }): Person {
    const id = this.generateId();
    const now = this.now();
    const displayName = sanitizeDisplayName(data.display_name);

    const createPerson = this.db.transaction(() => {
      // Every person needs a matching archive_objects row so relationship
      // validation (Connect Person, story/artifact connections, etc.) can
      // resolve them as a member — see RelationshipService.validateMembers.
      this.archiveObjects.create({
        id,
        object_type: 'person',
        title: displayName || 'Unknown Person',
        summary: normalizeToNull(data.notes) ?? null,
        privacy_level: (data.is_private ?? 0) === 1 ? 'private' : 'family',
        created_by: data.created_by ?? null,
      });

      this.db.prepare(
        'INSERT INTO persons (id, sex, is_living, is_private, notes, display_name, created_by, gedcom_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        id,
        data.sex || 'U',
        data.is_living ?? 1,
        data.is_private ?? 0,
        normalizeToNull(data.notes),
        displayName,
        data.created_by || null,
        data.gedcom_id || null,
        now,
        now,
      );
    });

    createPerson();

    const created = this.db.prepare('SELECT * FROM persons WHERE id = ?').get(id) as Person;
    recordChange('create', 'person', id, null, created, { label: this.auditLabel(id, created) });
    return created;
  }

  update(id: string, data: Partial<Pick<Person, 'sex' | 'is_living' | 'is_private' | 'notes' | 'display_name'>>): Person | undefined {
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(key === 'display_name' ? sanitizeDisplayName(value as string | null) : value);
      }
    }

    if (fields.length === 0) return this.db.prepare('SELECT * FROM persons WHERE id = ?').get(id) as Person | undefined;

    const before = this.db.prepare('SELECT * FROM persons WHERE id = ?').get(id) as Person | undefined;

    fields.push('updated_at = ?');
    values.push(this.now());
    values.push(id);

    const updatePerson = this.db.transaction(() => {
      this.db.prepare(`UPDATE persons SET ${fields.join(', ')} WHERE id = ?`).run(...values);

      const archiveUpdate: { summary?: string | null; privacy_level?: 'private' | 'family' } = {};
      if (data.notes !== undefined) archiveUpdate.summary = normalizeToNull(data.notes) ?? null;
      if (data.is_private !== undefined) archiveUpdate.privacy_level = data.is_private === 1 ? 'private' : 'family';
      if (Object.keys(archiveUpdate).length > 0) this.archiveObjects.update(id, archiveUpdate);

      if (data.display_name !== undefined) this.refreshArchiveTitle(id);
    });

    updatePerson();

    const after = this.db.prepare('SELECT * FROM persons WHERE id = ?').get(id) as Person | undefined;
    recordChange('update', 'person', id, before, after, { label: this.auditLabel(id, before) });
    return after;
  }

  /**
   * A human-readable name for an audit entry.
   *
   * Recorded alongside the change because an id is useless in a log once the
   * row it points at has been deleted -- "deleted person 2512ea47" tells you
   * nothing, "deleted Eunice Louise Lagor" tells you everything.
   */
  private auditLabel(personId: string, person?: { display_name?: string | null } | null): string | null {
    if (person?.display_name) return person.display_name;

    const name = this.db.prepare(
      'SELECT given_name, middle_name, surname FROM names WHERE person_id = ? ORDER BY is_primary DESC LIMIT 1',
    ).get(personId) as { given_name?: string; middle_name?: string; surname?: string } | undefined;

    if (!name) return null;
    return [name.given_name, name.middle_name, name.surname].filter(Boolean).join(' ') || null;
  }

  delete(id: string): boolean {
    const before = this.db.prepare('SELECT * FROM persons WHERE id = ?').get(id) as Person | undefined;
    // Read the name while the row still exists.
    const label = this.auditLabel(id, before);

    const deletePerson = this.db.transaction(() => {
      const result = this.db.prepare('DELETE FROM persons WHERE id = ?').run(id);
      if (result.changes > 0) {
        // Cascades to relationship_members via ON DELETE CASCADE, so no
        // relationship keeps pointing at a person that no longer exists.
        this.db.prepare('DELETE FROM archive_objects WHERE id = ?').run(id);
      }
      return result.changes > 0;
    });

    const deleted = deletePerson();
    if (deleted) recordChange('delete', 'person', id, before, null, { label });
    return deleted;
  }

  addName(personId: string, data: {
    name_type?: Name['name_type'];
    prefix?: string;
    given_name?: string;
    middle_name?: string;
    surname?: string;
    suffix?: string;
    nickname?: string;
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

    // A person's first name is their primary name unless the caller says
    // otherwise. Without this a person created through a flow that does not send
    // is_primary — the add-person wizard, for one — ends up with no primary name
    // at all. findById tolerates that by falling back to the first row, but the
    // people list does not: its surname sort and keyset cursor both read
    // `WHERE is_primary = 1` and silently get an empty string, which misplaces
    // the person and corrupts pagination once there are enough of them.
    const isFirstName = maxOrder.next === 0;
    const isPrimary = data.is_primary ?? (isFirstName ? 1 : 0);

    this.db.prepare(
      'INSERT INTO names (id, person_id, name_type, prefix, given_name, middle_name, surname, suffix, nickname, is_primary, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      id, personId, data.name_type || 'birth',
      sanitizeNameField(data.prefix), sanitizeNameField(data.given_name), sanitizeNameField(data.middle_name),
      sanitizeNameField(data.surname), sanitizeNameField(data.suffix), sanitizeNameField(data.nickname),
      isPrimary, maxOrder.next, now, now,
    );

    this.refreshArchiveTitle(personId);

    const created = this.db.prepare('SELECT * FROM names WHERE id = ?').get(id) as Name;
    recordChange('create', 'name', id, null, created, { label: nameLabel(created), person_id: personId });
    return created;
  }

  findNameById(id: string): Name | undefined {
    return this.db.prepare('SELECT * FROM names WHERE id = ?').get(id) as Name | undefined;
  }

  updateName(nameId: string, data: {
    name_type?: Name['name_type'];
    prefix?: string;
    given_name?: string;
    middle_name?: string;
    surname?: string;
    suffix?: string;
    nickname?: string;
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
        values.push(typeof value === 'string' || value === null ? sanitizeNameField(value) : value);
      }
    }

    if (fields.length === 0) return existing;

    fields.push('updated_at = ?');
    values.push(this.now());
    values.push(nameId);

    this.db.prepare(`UPDATE names SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    this.refreshArchiveTitle(existing.person_id);

    const updated = this.findNameById(nameId);
    recordChange('update', 'name', nameId, existing, updated, { label: nameLabel(updated ?? existing), person_id: existing.person_id });
    return updated;
  }

  deleteName(nameId: string): boolean {
    const existing = this.findNameById(nameId);
    const deleted = this.db.prepare('DELETE FROM names WHERE id = ?').run(nameId).changes > 0;
    if (deleted && existing) {
      this.refreshArchiveTitle(existing.person_id);
      recordChange('delete', 'name', nameId, existing, null, { label: nameLabel(existing), person_id: existing.person_id });
    }
    return deleted;
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
    spouse1: RelationshipNameSummary | null;
    spouse2: RelationshipNameSummary | null;
    children: RelationshipChildRow[];
    step_parents: StepParentGroup[];
    half_siblings: HalfSiblingGroup[];
    step_siblings: StepSiblingGroup[];
  }[] {
    const nameSummary = (pid: string | null): RelationshipNameSummary | null => {
      if (!pid) return null;
      const row = this.db.prepare(
        'SELECT prefix, given_name, middle_name, surname, suffix FROM names WHERE person_id = ? AND is_primary = 1 LIMIT 1'
      ).get(pid) as Partial<Name> | undefined;
      return {
        id: pid,
        prefix: row?.prefix ?? null,
        given_name: row?.given_name ?? null,
        middle_name: row?.middle_name ?? null,
        surname: row?.surname ?? null,
        suffix: row?.suffix ?? null,
      };
    };

    /* Oldest first. The query had no ORDER BY at all, so children came back in
       whatever order the table happened to yield -- usually insertion order,
       which for an imported tree usually is birth order, which is why this
       looked correct in most families and wrong in the rest.

       Birth date leads. sort_order is the fallback rather than the rule
       because it only records the order children were entered; a child added
       years later sits at the end of it whenever they were born. Children with
       no recorded birth follow the dated ones rather than sorting as year
       zero. The subquery is used instead of a join so a person with two birth
       rows cannot duplicate themselves into the list. */
    const CHILD_ORDER = `ORDER BY
           (SELECT MIN(e.event_date_sort_key) FROM events e
             WHERE e.person_id = fm.person_id AND e.event_type = 'birth') IS NULL,
           (SELECT MIN(e.event_date_sort_key) FROM events e
             WHERE e.person_id = fm.person_id AND e.event_type = 'birth') ASC,
           fm.sort_order ASC,
           fm.id ASC`;

    /* Several families at a time, in one query rather than one call per
       family, because half-siblings have to be birth-ordered across all of a
       parent's other unions -- concatenating per-family lists would only sort
       within each union. */
    const membersOfFamilies = (familyIds: string[]): RelationshipChildRow[] => {
      if (familyIds.length === 0) return [];
      const placeholders = familyIds.map(() => '?').join(', ');
      return this.db.prepare(
        `SELECT fm.id, fm.family_id, fm.person_id, fm.role,
          n.prefix, n.given_name, n.middle_name, n.surname, n.suffix
         FROM family_members fm
         LEFT JOIN names n ON n.person_id = fm.person_id AND n.is_primary = 1
         WHERE fm.family_id IN (${placeholders})
         ${CHILD_ORDER}`
      ).all(...familyIds) as RelationshipChildRow[];
    };

    const childMembers = (familyId: string) => membersOfFamilies([familyId]);

    const familiesAsSpouse = (spouseId: string): Family[] =>
      this.db.prepare(
        'SELECT * FROM families WHERE spouse1_id = ? OR spouse2_id = ?'
      ).all(spouseId, spouseId) as Family[];

    const otherSpouseOf = (family: Family, spouseId: string): string | null =>
      family.spouse1_id === spouseId ? family.spouse2_id : family.spouse1_id;

    /* A `child | adopted | foster` membership says this is the couple's own
       child; `step` says the opposite -- the child came into the family with
       one of the spouses. So a `step` row in a parent's later family is not a
       half-sibling of the subject, it is one of that later spouse's children,
       which makes it a step-sibling.

       The line is drawn on the parent, not on biology: a child the parent
       adopted or fostered is the parent's own child and so a half-sibling,
       the same way an adopted child of the subject's own parents is listed as
       a sibling and not as something lesser. The role rides along on the row
       so the page can say which kind it is. */
    const isOwnChild = (role: string) => role !== 'step';

    /**
     * The relationships the panel was missing, for one of the subject's child
     * families.
     *
     * Step-parents: the people each parent married apart from the other
     * parent. Listed even when they brought no children, because the panel
     * otherwise gives no sign a parent remarried at all.
     *
     * Half-siblings: for each parent, the children of that parent's other
     * unions. A union with the same pair of spouses is skipped -- a couple
     * recorded twice produces full siblings, not half ones.
     *
     * Step-siblings: the children of the person that parent went on to marry,
     * by someone else. They share no ancestor with the subject, hence the
     * separate list.
     *
     * Dedup runs full -> half -> step, so the closest relationship a person
     * holds is the one they are listed under and nobody appears twice. Half is
     * collected for both parents before either step pass, because the passes
     * are not independent: if the father's later wife had an earlier child by
     * the subject's own mother, that child is a half-sibling through the
     * mother, and taking the father's side first would have fixed them as a
     * step-sibling.
     */
    const siblingsBeyondTheFamily = (
      family: Family,
      fullSiblings: RelationshipChildRow[]
    ): { stepParents: StepParentGroup[]; half: HalfSiblingGroup[]; step: StepSiblingGroup[] } => {
      const stepParents: StepParentGroup[] = [];
      const half: HalfSiblingGroup[] = [];
      const step: StepSiblingGroup[] = [];
      const seen = new Set<string>([personId, ...fullSiblings.map(c => c.person_id)]);

      const parentIds = [family.spouse1_id, family.spouse2_id].filter((p): p is string => !!p);

      /* The unions each parent had apart from this one, read once and shared
         by both passes. */
      const sides = parentIds.flatMap(parentId => {
        const via = nameSummary(parentId);
        if (!via) return [];
        const coParentId = otherSpouseOf(family, parentId);
        const otherUnions = familiesAsSpouse(parentId)
          .filter(f => f.id !== family.id && !(coParentId && otherSpouseOf(f, parentId) === coParentId))
          /* Earliest marriage first, undated unions last -- the same shape as
             the birth-date rule for children. Step-parents are read straight
             off this list, so its order is the order they are shown in. */
          .sort((a, b) => {
            const left = a.marriage_date_sort_key ?? null;
            const right = b.marriage_date_sort_key ?? null;
            if (left === right) return 0;
            if (left === null) return 1;
            if (right === null) return -1;
            return left - right;
          });
        return otherUnions.length > 0 ? [{ parentId, via, otherUnions }] : [];
      });

      for (const { parentId, via, otherUnions } of sides) {
        const people: RelationshipNameSummary[] = [];
        const added = new Set<string>();
        for (const union of otherUnions) {
          const stepParentId = otherSpouseOf(union, parentId);
          /* A couple can hold more than one union row, and a parent recorded
             as their own child's spouse is a data error, not a step-parent. */
          if (!stepParentId || stepParentId === personId || added.has(stepParentId)) continue;
          const summary = nameSummary(stepParentId);
          if (!summary) continue;
          added.add(stepParentId);
          people.push(summary);
        }
        if (people.length > 0) stepParents.push({ via, people });
      }

      for (const { via, otherUnions } of sides) {
        const children: RelationshipChildRow[] = [];
        for (const row of membersOfFamilies(otherUnions.map(f => f.id))) {
          if (seen.has(row.person_id)) continue;
          if (!isOwnChild(row.role)) continue;
          seen.add(row.person_id);
          children.push(row);
        }
        if (children.length > 0) half.push({ via, children });
      }

      for (const { parentId, via, otherUnions } of sides) {
        /* Keyed by the step-parent so each later spouse gets their own
           labelled list; '' covers a union whose other spouse is unrecorded. */
        const stepByParent = new Map<string, RelationshipChildRow[]>();

        for (const union of otherUnions) {
          const stepParentId = otherSpouseOf(union, parentId);
          const key = stepParentId ?? '';

          /* The later spouse's children by someone else, plus anyone recorded
             in this union as a step-child -- both are children of the spouse
             and not of the subject's parent. The two sets are read in one
             query so they interleave by birth date. */
          const sourceFamilyIds = [union.id];
          if (stepParentId) {
            for (const f of familiesAsSpouse(stepParentId)) {
              if (f.id === union.id) continue;
              if (f.spouse1_id === parentId || f.spouse2_id === parentId) continue;
              sourceFamilyIds.push(f.id);
            }
          }

          for (const row of membersOfFamilies(sourceFamilyIds)) {
            if (seen.has(row.person_id)) continue;
            if (row.family_id === union.id && isOwnChild(row.role)) continue;
            seen.add(row.person_id);
            const list = stepByParent.get(key);
            if (list) list.push(row);
            else stepByParent.set(key, [row]);
          }
        }

        for (const [stepParentId, children] of stepByParent) {
          if (children.length === 0) continue;
          step.push({ via, step_parent: stepParentId ? nameSummary(stepParentId) : null, children });
        }
      }

      return { stepParents, half, step };
    };

    const parentFamilies = this.db.prepare(
      'SELECT f.* FROM families f INNER JOIN family_members fm ON f.id = fm.family_id WHERE fm.person_id = ?'
    ).all(personId) as Family[];

    const ownFamilies = familiesAsSpouse(personId);

    return [
      ...parentFamilies.map(f => {
        const children = childMembers(f.id);
        const { stepParents, half, step } = siblingsBeyondTheFamily(f, children);
        return {
          family_id: f.id,
          type: 'child_family' as const,
          role: 'child' as const,
          spouse1: nameSummary(f.spouse1_id),
          spouse2: nameSummary(f.spouse2_id),
          children,
          step_parents: stepParents,
          half_siblings: half,
          step_siblings: step,
        };
      }),
      ...ownFamilies.map(f => ({
        family_id: f.id,
        type: 'parent_family' as const,
        role: (f.spouse1_id === personId ? 'spouse1' : 'spouse2') as 'spouse1' | 'spouse2',
        spouse1: nameSummary(f.spouse1_id),
        spouse2: nameSummary(f.spouse2_id),
        children: childMembers(f.id),
        step_parents: [],
        half_siblings: [],
        step_siblings: [],
      })),
    ];
  }
}
