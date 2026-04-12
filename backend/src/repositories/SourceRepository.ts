import { BaseRepository } from './base.js';
import type { Source, SourceCitation, SourceRepository as SourceRepoType } from '../types/db.js';

export class SourceRepository extends BaseRepository {
  // ─── Sources ────────────────────────────────────────────────────────────────

  findById(id: string): Source | undefined {
    return this.db.prepare('SELECT * FROM sources WHERE id = ?').get(id) as Source | undefined;
  }

  findAll(options?: { limit?: number; cursor?: string; search?: string }): { data: Source[]; next_cursor: string | null; total_count: number } {
    const limit = options?.limit || 50;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.search) {
      const term = `%${options.search.trim()}%`;
      conditions.push('(title LIKE ? OR author LIKE ? OR publisher LIKE ? OR notes LIKE ?)');
      params.push(term, term, term, term);
    }

    const whereClause = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    const countParams = [...params];
    const countRow = this.db.prepare(`SELECT COUNT(*) as cnt FROM sources${whereClause}`).get(...countParams) as { cnt: number };

    if (options?.cursor) {
      conditions.push('id > ?');
      params.push(options.cursor);
    }

    const fullWhere = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    let query = `SELECT * FROM sources${fullWhere}`;
    query += ' ORDER BY id ASC LIMIT ?';
    params.push(limit + 1);

    const rows = this.db.prepare(query).all(...params) as Source[];
    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();

    return { data: rows, next_cursor: hasMore ? rows[rows.length - 1]?.id ?? null : null, total_count: countRow.cnt };
  }

  create(data: {
    title: string;
    repository_id?: string;
    author?: string;
    publisher?: string;
    publication_date?: string;
    url?: string;
    notes?: string;
    gedcom_id?: string;
  }): Source {
    const id = this.generateId();
    const now = this.now();
    this.db.prepare(
      `INSERT INTO sources (id, repository_id, title, author, publisher, publication_date, url, notes, gedcom_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, data.repository_id || null, data.title, data.author || null,
      data.publisher || null, data.publication_date || null,
      data.url || null, data.notes || null, data.gedcom_id || null,
      now, now,
    );
    return this.findById(id)!;
  }

  update(id: string, data: Partial<Pick<Source, 'title' | 'author' | 'publisher' | 'publication_date' | 'url' | 'notes' | 'repository_id'>>): Source | undefined {
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

    this.db.prepare(`UPDATE sources SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.findById(id);
  }

  deleteSource(id: string): boolean {
    return this.db.prepare('DELETE FROM sources WHERE id = ?').run(id).changes > 0;
  }

  // ─── Source Repositories ────────────────────────────────────────────────────

  findRepoById(id: string): SourceRepoType | undefined {
    return this.db.prepare('SELECT * FROM source_repositories WHERE id = ?').get(id) as SourceRepoType | undefined;
  }

  findAllRepos(): SourceRepoType[] {
    return this.db.prepare('SELECT * FROM source_repositories ORDER BY name ASC').all() as SourceRepoType[];
  }

  createRepo(data: { name: string; address?: string; url?: string; notes?: string; gedcom_id?: string }): SourceRepoType {
    const id = this.generateId();
    const now = this.now();
    this.db.prepare(
      'INSERT INTO source_repositories (id, name, address, url, notes, gedcom_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, data.name, data.address || null, data.url || null, data.notes || null, data.gedcom_id || null, now, now);
    return this.findRepoById(id)!;
  }

  // ─── Citations ──────────────────────────────────────────────────────────────

  findCitationById(id: string): SourceCitation | undefined {
    return this.db.prepare('SELECT * FROM source_citations WHERE id = ?').get(id) as SourceCitation | undefined;
  }

  findCitationsByPerson(personId: string): SourceCitation[] {
    return this.db.prepare('SELECT * FROM source_citations WHERE person_id = ?').all(personId) as SourceCitation[];
  }

  findCitationsBySource(sourceId: string): SourceCitation[] {
    return this.db.prepare('SELECT * FROM source_citations WHERE source_id = ?').all(sourceId) as SourceCitation[];
  }

  createCitation(data: {
    source_id: string;
    person_id?: string;
    event_id?: string;
    page?: string;
    quality?: SourceCitation['quality'];
    notes?: string;
  }): SourceCitation {
    const id = this.generateId();
    this.db.prepare(
      'INSERT INTO source_citations (id, source_id, person_id, event_id, page, quality, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      id, data.source_id, data.person_id || null, data.event_id || null,
      data.page || null, data.quality || null, data.notes || null, this.now(),
    );
    return this.findCitationById(id)!;
  }

  deleteCitation(id: string): boolean {
    return this.db.prepare('DELETE FROM source_citations WHERE id = ?').run(id).changes > 0;
  }
}
