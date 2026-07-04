import { BaseRepository } from './base.js';
import { TreeRepository } from './TreeRepository.js';
import type { Family, FamilyMember, FamilyWithSpouseNames, Name, SpouseNameSummary } from '../types/db.js';
import { formatName } from '../utils/nameFormatter.js';

export class FamilyRepository extends BaseRepository {
  private getNameDisplayFormat(): string {
    const row = this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get('name_display_format') as { value: string | null } | undefined;
    return row?.value || '%f %m %s';
  }

  findById(id: string): Family | undefined {
    return this.db.prepare('SELECT * FROM families WHERE id = ?').get(id) as Family | undefined;
  }

  findAll(options?: {
    limit?: number;
    cursor?: string;
    search?: string;
    sort?: 'surname';
    filter?: 'unlinked';
  }): { data: FamilyWithSpouseNames[]; next_cursor: string | null } {
    const limit = options?.limit || 50;
    const useSurnameSort = options?.sort === 'surname';
    const useUnlinkedFilter = options?.filter === 'unlinked';

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.search) {
      const term = `%${options.search}%`;
      conditions.push(
        '(EXISTS (SELECT 1 FROM names WHERE person_id = f.spouse1_id AND (surname LIKE ? OR given_name LIKE ?)) OR ' +
        'EXISTS (SELECT 1 FROM names WHERE person_id = f.spouse2_id AND (surname LIKE ? OR given_name LIKE ?)))'
      );
      params.push(term, term, term, term);
    }

    if (useUnlinkedFilter) {
      // A family is unlinked if none of its members (spouse1, spouse2, any child)
      // appear in any other family (as spouse or child).
      conditions.push(`NOT EXISTS (
        SELECT 1 FROM families other_f
        WHERE other_f.id != f.id AND (
          (f.spouse1_id IS NOT NULL AND (
            other_f.spouse1_id = f.spouse1_id OR
            other_f.spouse2_id = f.spouse1_id OR
            EXISTS (SELECT 1 FROM family_members om1 WHERE om1.family_id = other_f.id AND om1.person_id = f.spouse1_id)
          )) OR
          (f.spouse2_id IS NOT NULL AND (
            other_f.spouse1_id = f.spouse2_id OR
            other_f.spouse2_id = f.spouse2_id OR
            EXISTS (SELECT 1 FROM family_members om2 WHERE om2.family_id = other_f.id AND om2.person_id = f.spouse2_id)
          )) OR
          EXISTS (
            SELECT 1 FROM family_members fm
            WHERE fm.family_id = f.id AND (
              other_f.spouse1_id = fm.person_id OR
              other_f.spouse2_id = fm.person_id OR
              EXISTS (SELECT 1 FROM family_members om3 WHERE om3.family_id = other_f.id AND om3.person_id = fm.person_id)
            )
          )
        )
      )`);
    }

    if (options?.cursor) {
      if (useSurnameSort) {
        const cursorRow = this.db.prepare(
          `SELECT
             (SELECT COALESCE(surname, '') FROM names WHERE person_id = f.spouse1_id AND is_primary = 1 LIMIT 1) AS sn1,
             (SELECT COALESCE(surname, '') FROM names WHERE person_id = f.spouse2_id AND is_primary = 1 LIMIT 1) AS sn2
           FROM families f WHERE f.id = ?`
        ).get(options.cursor) as { sn1: string; sn2: string } | undefined;
        const sn1 = cursorRow?.sn1 ?? '';
        const sn2 = cursorRow?.sn2 ?? '';
        conditions.push(`(
          (SELECT COALESCE(surname, '') FROM names WHERE person_id = f.spouse1_id AND is_primary = 1 LIMIT 1) > ? OR
          ((SELECT COALESCE(surname, '') FROM names WHERE person_id = f.spouse1_id AND is_primary = 1 LIMIT 1) = ? AND
           (SELECT COALESCE(surname, '') FROM names WHERE person_id = f.spouse2_id AND is_primary = 1 LIMIT 1) > ?) OR
          ((SELECT COALESCE(surname, '') FROM names WHERE person_id = f.spouse1_id AND is_primary = 1 LIMIT 1) = ? AND
           (SELECT COALESCE(surname, '') FROM names WHERE person_id = f.spouse2_id AND is_primary = 1 LIMIT 1) = ? AND
           f.id > ?)
        )`);
        params.push(sn1, sn1, sn2, sn1, sn2, options.cursor);
      } else {
        conditions.push('f.id > ?');
        params.push(options.cursor);
      }
    }

    let query = 'SELECT f.* FROM families f';
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');

    if (useSurnameSort) {
      query += ` ORDER BY
        (SELECT COALESCE(surname, '') FROM names WHERE person_id = f.spouse1_id AND is_primary = 1 LIMIT 1) ASC,
        (SELECT COALESCE(surname, '') FROM names WHERE person_id = f.spouse2_id AND is_primary = 1 LIMIT 1) ASC,
        f.id ASC`;
    } else {
      query += ' ORDER BY f.id ASC';
    }

    query += ' LIMIT ?';
    params.push(limit + 1);

    const rows = this.db.prepare(query).all(...params) as Family[];
    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();

    /** Look up the primary name for a spouse, falling back to any name. */
    const getSpouseSummary = (spouseId: string | null): SpouseNameSummary | null => {
      if (!spouseId) return null;
      const row = (
        this.db.prepare(
          `SELECT n.*, p.display_name
           FROM names n
           JOIN persons p ON p.id = n.person_id
           WHERE n.person_id = ? AND n.is_primary = 1
           LIMIT 1`
        ).get(spouseId) ??
        this.db.prepare(
          `SELECT n.*, p.display_name
           FROM names n
           JOIN persons p ON p.id = n.person_id
           WHERE n.person_id = ?
           ORDER BY n.sort_order ASC
           LIMIT 1`
        ).get(spouseId)
      ) as (Name & { display_name: string | null }) | undefined;

      const displayName = row
        ? formatName({ personDisplayName: row.display_name, primaryName: row, names: [row], formatString: this.getNameDisplayFormat() })
        : '';

      return {
        id: spouseId,
        displayName,
        display_name: row?.display_name ?? null,
        given_name: row?.given_name ?? null,
        middle_name: row?.middle_name ?? null,
        surname: row?.surname ?? null,
      };
    };

    const data: FamilyWithSpouseNames[] = rows.map(row => ({
      ...row,
      spouse1: getSpouseSummary(row.spouse1_id),
      spouse2: getSpouseSummary(row.spouse2_id),
    }));

    return { data, next_cursor: hasMore ? rows[rows.length - 1]?.id ?? null : null };
  }

  create(data: {
    spouse1_id?: string;
    spouse2_id?: string;
    marriage_date?: string;
    marriage_place?: string;
    gedcom_id?: string;
  }): Family {
    const id = this.generateId();
    const now = this.now();
    this.db.prepare(
      'INSERT INTO families (id, spouse1_id, spouse2_id, marriage_date, marriage_place, gedcom_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, data.spouse1_id || null, data.spouse2_id || null, data.marriage_date || null, data.marriage_place || null, data.gedcom_id || null, now, now);
    new TreeRepository().syncFamilyUnionFromLegacyFamily(id);
    return this.findById(id)!;
  }

  update(id: string, data: Partial<Pick<Family, 'spouse1_id' | 'spouse2_id' | 'marriage_date' | 'marriage_place' | 'divorce_date' | 'divorce_place'>>): Family | undefined {
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return this.findById(id);

    fields.push('updated_at = ?');
    values.push(this.now());
    values.push(id);

    this.db.prepare(`UPDATE families SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    new TreeRepository().syncFamilyUnionFromLegacyFamily(id);
    return this.findById(id);
  }

  delete(id: string): boolean {
    const deleted = this.db.prepare('DELETE FROM families WHERE id = ?').run(id).changes > 0;
    if (deleted) new TreeRepository().deleteFamilyUnion(id);
    return deleted;
  }

  addMember(familyId: string, personId: string, role: FamilyMember['role'] = 'child'): FamilyMember {
    const id = this.generateId();
    const maxOrder = this.db.prepare(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM family_members WHERE family_id = ?'
    ).get(familyId) as { next: number };
    this.db.prepare(
      'INSERT INTO family_members (id, family_id, person_id, role, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, familyId, personId, role, maxOrder.next, this.now());
    new TreeRepository().syncFamilyUnionFromLegacyFamily(familyId);
    return this.db.prepare('SELECT * FROM family_members WHERE id = ?').get(id) as FamilyMember;
  }

  removeMember(familyId: string, personId: string): boolean {
    const removed = this.db.prepare('DELETE FROM family_members WHERE family_id = ? AND person_id = ?').run(familyId, personId).changes > 0;
    if (removed) new TreeRepository().syncFamilyUnionFromLegacyFamily(familyId);
    return removed;
  }

  getMembers(familyId: string): FamilyMember[] {
    return this.db.prepare('SELECT * FROM family_members WHERE family_id = ? ORDER BY sort_order ASC').all(familyId) as FamilyMember[];
  }

  findActiveByPerson(personId: string): { id: string; spouse1_id: string | null; spouse2_id: string | null; marriage_date: string | null }[] {
    return this.db.prepare(
      `SELECT id, spouse1_id, spouse2_id, marriage_date
       FROM families
       WHERE (spouse1_id = ? OR spouse2_id = ?)
         AND divorce_date IS NULL`
    ).all(personId, personId) as { id: string; spouse1_id: string | null; spouse2_id: string | null; marriage_date: string | null }[];
  }
}
