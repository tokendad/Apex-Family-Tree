import { BaseRepository } from './base.js';
import { PersonRepository } from './PersonRepository.js';
import type { Family, PersonWithNames } from '../types/db.js';

export interface TreePersonDto {
  id: string;
  displayName: string | null;
  display_name: string | null;
  given_name: string | null;
  middle_name: string | null;
  surname: string | null;
  sex: string;
  birth_date: string | null;
  death_date: string | null;
  is_living: boolean;
  is_private: boolean;
  photo_url: string | null;
}

export interface TreeFamilyDto {
  id: string;
  spouse1_id: string | null;
  spouse2_id: string | null;
  children_ids: string[];
  marriage_date: string | null;
}

interface TreeFamilyRow {
  id: string;
  spouse1_id: string | null;
  spouse2_id: string | null;
  marriage_date: string | null;
}

interface RelationshipMemberRow {
  relationship_id: string;
  date_text: string | null;
  object_id: string;
  role: 'partner' | 'child' | string;
  sort_order: number;
}

export class TreeRepository extends BaseRepository {
  private personRepo = new PersonRepository();

  private tableExists(name: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
  }

  private hasRelationshipTreeTables(): boolean {
    return ['archive_objects', 'relationship_types', 'relationships', 'relationship_members'].every((table) => this.tableExists(table));
  }

  private hasFamilyUnionType(): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM relationship_types WHERE id = ? OR code = ?').get('rel_type_family_union', 'family_union'));
  }

  private tableHasColumn(table: string, column: string): boolean {
    return (this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some((row) => row.name === column);
  }

  private ensurePersonArchiveObject(personId: string): void {
    if (!this.hasRelationshipTreeTables()) return;
    this.db.prepare(`
      INSERT OR IGNORE INTO archive_objects (id, object_type, title, summary, privacy_level, is_deleted, created_at, updated_at)
      SELECT
        p.id,
        'person',
        COALESCE(NULLIF(TRIM(p.display_name), ''), NULLIF(TRIM(COALESCE(n.given_name || ' ', '') || COALESCE(n.surname, '')), ''), 'Unknown Person'),
        p.notes,
        CASE WHEN p.is_private = 1 THEN 'private' ELSE 'family' END,
        0,
        COALESCE(p.created_at, datetime('now')),
        COALESCE(p.updated_at, datetime('now'))
      FROM persons p
      LEFT JOIN names n ON n.id = (
        SELECT n2.id FROM names n2 WHERE n2.person_id = p.id ORDER BY n2.is_primary DESC, n2.sort_order ASC, n2.created_at ASC, n2.id ASC LIMIT 1
      )
      WHERE p.id = ?
    `).run(personId);
  }

  syncFamilyUnionFromLegacyFamily(familyId: string): void {
    if (!this.hasRelationshipTreeTables() || !this.hasFamilyUnionType()) return;

    const family = this.db.prepare('SELECT * FROM families WHERE id = ?').get(familyId) as Family | undefined;
    if (!family) {
      this.deleteFamilyUnion(familyId);
      return;
    }

    const children = this.db.prepare('SELECT person_id, role, sort_order FROM family_members WHERE family_id = ? ORDER BY sort_order ASC').all(familyId) as Array<{
      person_id: string;
      role: string | null;
      sort_order: number | null;
    }>;

    const personIds = [family.spouse1_id, family.spouse2_id, ...children.map((child) => child.person_id)].filter((id): id is string => Boolean(id));
    for (const personId of personIds) this.ensurePersonArchiveObject(personId);

    const now = this.now();
    const sync = this.db.transaction(() => {
      this.db.prepare(`
        INSERT OR IGNORE INTO archive_objects (id, object_type, title, summary, privacy_level, is_deleted, created_at, updated_at)
        VALUES (?, 'relationship', 'Family Union', NULL, 'family', 0, ?, ?)
      `).run(family.id, family.created_at ?? now, family.updated_at ?? now);

      this.db.prepare(`
        UPDATE archive_objects
        SET title = 'Family Union', updated_at = ?
        WHERE id = ? AND object_type = 'relationship'
      `).run(now, family.id);

      this.db.prepare(`
        INSERT INTO relationships (id, relationship_type_id, label, date_text, notes)
        VALUES (?, 'rel_type_family_union', 'Family Union', ?, 'Synchronized from legacy family record.')
        ON CONFLICT(id) DO UPDATE SET date_text = excluded.date_text
      `).run(family.id, family.marriage_date ?? null);

      this.db.prepare('DELETE FROM relationship_members WHERE relationship_id = ?').run(family.id);

      const insertMember = this.db.prepare(`
        INSERT OR IGNORE INTO relationship_members (id, relationship_id, object_id, role, sort_order, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      if (family.spouse1_id) insertMember.run(`tree_${family.id}_partner_1`, family.id, family.spouse1_id, 'partner', 0, null);
      if (family.spouse2_id) insertMember.run(`tree_${family.id}_partner_2`, family.id, family.spouse2_id, 'partner', 1, null);

      children.forEach((child, index) => {
        const legacyRole = child.role && child.role !== 'child' ? `legacy_child_role:${child.role}` : null;
        insertMember.run(`tree_${family.id}_child_${child.person_id}`, family.id, child.person_id, 'child', child.sort_order ?? index, legacyRole);
      });
    });

    sync();
  }

  deleteFamilyUnion(familyId: string): void {
    if (!this.hasRelationshipTreeTables()) return;
    this.db.prepare('DELETE FROM archive_objects WHERE id = ? AND object_type = ?').run(familyId, 'relationship');
  }

  toTreePerson(person: PersonWithNames): TreePersonDto {
    const birthEvent = this.db.prepare(
      "SELECT event_date FROM events WHERE person_id = ? AND event_type = 'birth' LIMIT 1",
    ).get(person.id) as { event_date: string | null } | undefined;

    const deathEvent = this.db.prepare(
      "SELECT event_date FROM events WHERE person_id = ? AND event_type = 'death' LIMIT 1",
    ).get(person.id) as { event_date: string | null } | undefined;

    const primaryPhoto = this.db.prepare(
      'SELECT mi.id FROM media_items mi INNER JOIN person_media pm ON mi.id = pm.media_id WHERE pm.person_id = ? AND pm.is_primary = 1 LIMIT 1',
    ).get(person.id) as { id: string } | undefined;

    return {
      id: person.id,
      displayName: person.displayName ?? null,
      display_name: person.display_name ?? null,
      given_name: person.primary_name?.given_name ?? null,
      middle_name: person.primary_name?.middle_name ?? null,
      surname: person.primary_name?.surname ?? null,
      sex: person.sex,
      birth_date: birthEvent?.event_date ?? null,
      death_date: deathEvent?.event_date ?? null,
      is_living: person.is_living === 1,
      is_private: person.is_private === 1,
      photo_url: primaryPhoto ? `/api/v1/media/${primaryPhoto.id}` : null,
    };
  }

  getAllTreeFamilies(): TreeFamilyDto[] {
    if (!this.hasRelationshipTreeTables()) return this.getLegacyTreeFamilies();

    const rows = this.db.prepare(`
      SELECT r.id AS relationship_id, r.date_text, rm.object_id, rm.role, rm.sort_order
      FROM relationships r
      INNER JOIN relationship_types rt ON rt.id = r.relationship_type_id
      INNER JOIN relationship_members rm ON rm.relationship_id = r.id
      INNER JOIN archive_objects member_object ON member_object.id = rm.object_id AND member_object.object_type = 'person' AND member_object.is_deleted = 0
      LEFT JOIN archive_objects relationship_object ON relationship_object.id = r.id
      WHERE rt.code = 'family_union'
        AND COALESCE(relationship_object.is_deleted, 0) = 0
      ORDER BY r.id ASC, rm.role DESC, rm.sort_order ASC, rm.id ASC
    `).all() as RelationshipMemberRow[];

    const byRelationship = new Map<string, { id: string; date_text: string | null; partners: string[]; children: string[] }>();
    for (const row of rows) {
      const family = byRelationship.get(row.relationship_id) ?? { id: row.relationship_id, date_text: row.date_text, partners: [], children: [] };
      if (row.role === 'partner') family.partners.push(row.object_id);
      if (row.role === 'child') family.children.push(row.object_id);
      byRelationship.set(row.relationship_id, family);
    }

    const relationshipFamilies = [...byRelationship.values()].map((family) => ({
      id: family.id,
      spouse1_id: family.partners[0] ?? null,
      spouse2_id: family.partners[1] ?? null,
      children_ids: family.children,
      marriage_date: family.date_text,
    }));

    const relationshipIds = new Set(relationshipFamilies.map((family) => family.id));
    return [
      ...relationshipFamilies,
      ...this.getLegacyTreeFamilies().filter((family) => !relationshipIds.has(family.id)),
    ];
  }

  getLegacyTreeFamilies(): TreeFamilyDto[] {
    const rows = this.db.prepare('SELECT id, spouse1_id, spouse2_id, marriage_date FROM families ORDER BY id ASC').all() as TreeFamilyRow[];
    const childrenByFamily = new Map<string, string[]>();
    const childOrder = this.tableHasColumn('family_members', 'sort_order') ? 'sort_order ASC' : 'created_at ASC';
    const childRows = this.db.prepare(`SELECT family_id, person_id FROM family_members ORDER BY ${childOrder}`).all() as Array<{ family_id: string; person_id: string }>;
    for (const row of childRows) {
      childrenByFamily.set(row.family_id, [...(childrenByFamily.get(row.family_id) ?? []), row.person_id]);
    }

    return rows.map((row) => ({
      id: row.id,
      spouse1_id: row.spouse1_id,
      spouse2_id: row.spouse2_id,
      children_ids: childrenByFamily.get(row.id) ?? [],
      marriage_date: row.marriage_date,
    }));
  }

  getPersonIdsForFamily(family: TreeFamilyDto): string[] {
    return [family.spouse1_id, family.spouse2_id, ...family.children_ids].filter((id): id is string => Boolean(id));
  }

  getFamiliesForPerson(personId: string): TreeFamilyDto[] {
    return this.getAllTreeFamilies().filter((family) => this.getPersonIdsForFamily(family).includes(personId));
  }

  getTreePersonById(personId: string): TreePersonDto | null {
    const person = this.personRepo.findById(personId);
    return person ? this.toTreePerson(person) : null;
  }

  getFlatTree(rootPersonId: string, generations: number): { persons: TreePersonDto[]; families: TreeFamilyDto[] } {
    const allFamilies = this.getAllTreeFamilies();
    const familiesByPerson = new Map<string, TreeFamilyDto[]>();
    for (const family of allFamilies) {
      for (const personId of this.getPersonIdsForFamily(family)) {
        familiesByPerson.set(personId, [...(familiesByPerson.get(personId) ?? []), family]);
      }
    }

    const visitedPersons = new Set<string>();
    const visitedFamilies = new Set<string>();
    const persons: TreePersonDto[] = [];
    const families: TreeFamilyDto[] = [];
    const queue: Array<{ id: string; gen: number }> = [{ id: rootPersonId, gen: 0 }];

    while (queue.length > 0) {
      const item = queue.shift()!;
      if (visitedPersons.has(item.id)) continue;
      visitedPersons.add(item.id);

      const person = this.getTreePersonById(item.id);
      if (!person) continue;
      persons.push(person);

      if (item.gen >= generations) continue;

      for (const family of familiesByPerson.get(item.id) ?? []) {
        if (!visitedFamilies.has(family.id)) {
          visitedFamilies.add(family.id);
          families.push(family);
        }

        for (const relatedPersonId of this.getPersonIdsForFamily(family)) {
          if (relatedPersonId !== item.id && !visitedPersons.has(relatedPersonId)) {
            const nextGen = family.children_ids.includes(relatedPersonId) && !family.children_ids.includes(item.id)
              ? item.gen + 1
              : item.gen + 1;
            queue.push({ id: relatedPersonId, gen: nextGen });
          }
        }
      }
    }

    return { persons, families };
  }

  getReachablePersonIds(startId: string): Set<string> {
    const visited = new Set<string>();
    const queue = [startId];
    const allFamilies = this.getAllTreeFamilies();
    const familiesByPerson = new Map<string, TreeFamilyDto[]>();

    for (const family of allFamilies) {
      for (const personId of this.getPersonIdsForFamily(family)) {
        familiesByPerson.set(personId, [...(familiesByPerson.get(personId) ?? []), family]);
      }
    }

    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);

      for (const family of familiesByPerson.get(id) ?? []) {
        for (const relatedId of this.getPersonIdsForFamily(family)) {
          if (!visited.has(relatedId)) queue.push(relatedId);
        }
      }
    }

    return visited;
  }

  findConnectedComponents(ids: string[]): string[][] {
    const pool = new Set(ids);
    const visited = new Set<string>();
    const components: string[][] = [];
    const allFamilies = this.getAllTreeFamilies();
    const familiesByPerson = new Map<string, TreeFamilyDto[]>();

    for (const family of allFamilies) {
      for (const personId of this.getPersonIdsForFamily(family)) {
        familiesByPerson.set(personId, [...(familiesByPerson.get(personId) ?? []), family]);
      }
    }

    for (const startId of ids) {
      if (visited.has(startId)) continue;
      const component: string[] = [];
      const queue = [startId];

      while (queue.length > 0) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        component.push(id);

        for (const family of familiesByPerson.get(id) ?? []) {
          for (const relatedId of this.getPersonIdsForFamily(family)) {
            if (pool.has(relatedId) && !visited.has(relatedId)) queue.push(relatedId);
          }
        }
      }

      components.push(component);
    }

    return components;
  }

  personHasTreeConnection(personId: string): boolean {
    return this.getAllTreeFamilies().some((family) => this.getPersonIdsForFamily(family).includes(personId));
  }
}
