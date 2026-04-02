import { BaseRepository } from './base.js';
import type { Family, FamilyMember } from '../types/db.js';

export class FamilyRepository extends BaseRepository {
  findById(id: string): Family | undefined {
    return this.db.prepare('SELECT * FROM families WHERE id = ?').get(id) as Family | undefined;
  }

  findAll(options?: { limit?: number; cursor?: string }): { data: Family[]; next_cursor: string | null } {
    const limit = options?.limit || 50;
    const params: unknown[] = [];
    let query = 'SELECT * FROM families';

    if (options?.cursor) {
      query += ' WHERE id > ?';
      params.push(options.cursor);
    }

    query += ' ORDER BY id ASC LIMIT ?';
    params.push(limit + 1);

    const rows = this.db.prepare(query).all(...params) as Family[];
    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();

    return { data: rows, next_cursor: hasMore ? rows[rows.length - 1]?.id ?? null : null };
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
    return this.findById(id);
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM families WHERE id = ?').run(id).changes > 0;
  }

  addMember(familyId: string, personId: string, role: FamilyMember['role'] = 'child'): FamilyMember {
    const id = this.generateId();
    const maxOrder = this.db.prepare(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM family_members WHERE family_id = ?'
    ).get(familyId) as { next: number };
    this.db.prepare(
      'INSERT INTO family_members (id, family_id, person_id, role, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, familyId, personId, role, maxOrder.next, this.now());
    return this.db.prepare('SELECT * FROM family_members WHERE id = ?').get(id) as FamilyMember;
  }

  removeMember(familyId: string, personId: string): boolean {
    return this.db.prepare('DELETE FROM family_members WHERE family_id = ? AND person_id = ?').run(familyId, personId).changes > 0;
  }

  getMembers(familyId: string): FamilyMember[] {
    return this.db.prepare('SELECT * FROM family_members WHERE family_id = ? ORDER BY sort_order ASC').all(familyId) as FamilyMember[];
  }
}
