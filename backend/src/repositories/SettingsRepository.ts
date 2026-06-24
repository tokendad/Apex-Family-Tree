import { BaseRepository } from './base.js';
import type { AppSetting, FeatureFlag } from '../types/db.js';
import { validateGlobalFormatString } from '../utils/nameFormatter.js';

export class SettingsRepository extends BaseRepository {
  // ─── App Settings ─────────────────────────────────────────────────────────

  getSetting(key: string): AppSetting | undefined {
    return this.db.prepare('SELECT * FROM app_settings WHERE key = ?').get(key) as AppSetting | undefined;
  }

  getSettingValue(key: string): string | null {
    const row = this.getSetting(key);
    if (!row) return null;

    if (row.value_type === 'encrypted') {
      // Placeholder for future AES decryption
      return row.value;
    }

    return row.value;
  }

  getSettingTyped<T>(key: string): T | null {
    const row = this.getSetting(key);
    if (!row || row.value === null) return null;

    switch (row.value_type) {
      case 'number': return Number(row.value) as T;
      case 'boolean': return (row.value === 'true') as T;
      case 'json': return JSON.parse(row.value) as T;
      default: return row.value as T;
    }
  }

  getAllSettings(): AppSetting[] {
    return this.db.prepare('SELECT * FROM app_settings ORDER BY key ASC').all() as AppSetting[];
  }

  setSetting(key: string, value: string | null, valueType: AppSetting['value_type'] = 'string', description?: string): void {
    let storedValue = value;

    if (valueType === 'encrypted' && value !== null) {
      // Placeholder for future AES encryption
      storedValue = value;
    }

    const existing = this.getSetting(key);
    if (existing) {
      this.db.prepare(
        'UPDATE app_settings SET value = ?, value_type = ?, updated_at = ? WHERE key = ?'
      ).run(storedValue, valueType, this.now(), key);
    } else {
      this.db.prepare(
        'INSERT INTO app_settings (key, value, value_type, description, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(key, storedValue, valueType, description || null, this.now());
    }
  }

  deleteSetting(key: string): boolean {
    return this.db.prepare('DELETE FROM app_settings WHERE key = ?').run(key).changes > 0;
  }

  /**
   * Set the global name display format with validation.
   * Rejects format strings containing %D token to prevent infinite recursion.
   * 
   * @throws Error if format string is invalid
   */
  setNameDisplayFormat(formatString: string): void {
    const error = validateGlobalFormatString(formatString);
    if (error) {
      throw new Error(error);
    }
    this.setSetting('name_display_format', formatString, 'string', 'Global name display format');
  }

  /**
   * Get the global name display format (defaults to '%f %m %s' if not set)
   */
  getNameDisplayFormat(): string {
    return this.getSettingValue('name_display_format') || '%f %m %s';
  }

  // ─── Feature Flags ────────────────────────────────────────────────────────

  getFlag(key: string): FeatureFlag | undefined {
    return this.db.prepare('SELECT * FROM feature_flags WHERE key = ?').get(key) as FeatureFlag | undefined;
  }

  isFlagEnabled(key: string): boolean {
    const flag = this.getFlag(key);
    return flag ? flag.enabled === 1 : false;
  }

  getAllFlags(): FeatureFlag[] {
    return this.db.prepare('SELECT * FROM feature_flags ORDER BY key ASC').all() as FeatureFlag[];
  }

  setFlag(key: string, enabled: boolean, description?: string): void {
    const existing = this.getFlag(key);
    if (existing) {
      this.db.prepare(
        'UPDATE feature_flags SET enabled = ?, updated_at = ? WHERE key = ?'
      ).run(enabled ? 1 : 0, this.now(), key);
    } else {
      this.db.prepare(
        'INSERT INTO feature_flags (key, enabled, description, updated_at) VALUES (?, ?, ?, ?)'
      ).run(key, enabled ? 1 : 0, description || null, this.now());
    }
  }

  toggleFlag(key: string): boolean {
    const current = this.isFlagEnabled(key);
    this.setFlag(key, !current);
    return !current;
  }

  deleteFlag(key: string): boolean {
    return this.db.prepare('DELETE FROM feature_flags WHERE key = ?').run(key).changes > 0;
  }
}
