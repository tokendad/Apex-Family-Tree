import { BaseRepository } from './base.js';
import type { User, SafeUser } from '../types/db.js';

export class UserRepository extends BaseRepository {
  findById(id: string): User | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
  }

  findByEmail(email: string): User | undefined {
    return this.db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email) as User | undefined;
  }

  findAll(): SafeUser[] {
    return this.db.prepare(
      'SELECT id, email, display_name, role, status, home_person_id, last_login_at, created_at, updated_at FROM users ORDER BY created_at DESC'
    ).all() as SafeUser[];
  }

  create(data: { email: string; display_name: string; password_hash: string; role?: User['role'] }): User {
    const id = this.generateId();
    const now = this.now();
    this.db.prepare(
      'INSERT INTO users (id, email, display_name, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, data.email, data.display_name, data.password_hash, data.role || 'viewer', now, now);
    return this.findById(id)!;
  }

  update(id: string, data: Partial<Pick<User, 'display_name' | 'role' | 'status' | 'home_person_id'>>): User | undefined {
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

    this.db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.findById(id);
  }

  updatePassword(id: string, passwordHash: string): void {
    this.db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(passwordHash, this.now(), id);
  }

  updateLastLogin(id: string): void {
    this.db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(this.now(), id);
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return result.changes > 0;
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    return row.count;
  }

  hasAdmin(): boolean {
    const row = this.db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number };
    return row.count > 0;
  }
}
