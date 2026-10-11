import { BaseRepository } from './base.js';

export type SettingValue = string | number | boolean | null;

interface Row {
  key: string;
  value: string | null;
  value_type: 'string' | 'number' | 'boolean' | 'json';
}

/**
 * Per-user preferences (#16).
 *
 * Deliberately separate from app_settings, which is instance-wide. The two are
 * easy to confuse and the consequences of confusing them run in one direction:
 * someone's personal choice silently becoming everybody's.
 */
export class UserSettingsRepository extends BaseRepository {
  all(userId: string): Record<string, SettingValue> {
    const rows = this.db.prepare(
      'SELECT key, value, value_type FROM user_settings WHERE user_id = ?',
    ).all(userId) as Row[];

    const out: Record<string, SettingValue> = {};
    for (const row of rows) out[row.key] = this.decode(row);
    return out;
  }

  private decode(row: Row): SettingValue {
    if (row.value === null) return null;
    switch (row.value_type) {
      case 'number': return Number(row.value);
      case 'boolean': return row.value === 'true';
      case 'json': {
        try {
          return JSON.parse(row.value) as SettingValue;
        } catch {
          // A value that cannot be read is not worth failing a page load over.
          return null;
        }
      }
      default: return row.value;
    }
  }

  /** Writes the given keys and leaves every other key alone. */
  setMany(userId: string, values: Record<string, SettingValue>): void {
    const upsert = this.db.prepare(
      `INSERT INTO user_settings (user_id, key, value, value_type, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value,
                                               value_type = excluded.value_type,
                                               updated_at = excluded.updated_at`,
    );
    const now = this.now();

    this.db.transaction(() => {
      for (const [key, value] of Object.entries(values)) {
        const type = typeof value === 'number' ? 'number'
          : typeof value === 'boolean' ? 'boolean'
          : 'string';
        upsert.run(userId, key, value === null ? null : String(value), type, now);
      }
    })();
  }
}
