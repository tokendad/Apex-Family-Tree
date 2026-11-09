import { Router } from 'express';
import { getDatabase } from '../db/connection.js';
import { createLogger } from '../services/logger.js';
import { SettingsRepository } from '../repositories/SettingsRepository.js';

export const instanceRouter = Router();
const logger = createLogger();

/* Everything about this instance that any signed-in person may see.
   Deliberately a list of keys and not a filter over getAllSettings(): the same
   table holds smtp_pass, and a whitelist that has to be *added to* cannot leak
   a setting somebody introduces later. */
const PUBLIC_KEYS = ['instance_name', 'instance_timezone', 'gedcom_default_version'] as const;

const DEFAULTS: Record<(typeof PUBLIC_KEYS)[number], string> = {
  instance_name: 'Apex Family Tree',
  instance_timezone: 'UTC',
  gedcom_default_version: '5.5.1',
};

/* Same reasoning as PUBLIC_KEYS, for feature_flags instead of app_settings:
   GET /admin/features is admin-only, so this is the only way a non-admin's
   browser can learn whether an opt-in feature is on before showing its UI
   (e.g. the Transcribe/AI Assistant buttons). An explicit list, not every
   flag, so a future admin-only flag isn't accidentally exposed by default. */
const PUBLIC_FLAGS = ['ai_transcription', 'ai_intake'] as const;

// GET /api/v1/instance — the instance's own description, for the About page.
instanceRouter.get('/', (_req, res) => {
  try {
    const placeholders = PUBLIC_KEYS.map(() => '?').join(', ');
    const rows = getDatabase().prepare(
      `SELECT key, value FROM app_settings WHERE key IN (${placeholders})`,
    ).all(...PUBLIC_KEYS) as { key: string; value: string | null }[];

    const stored = new Map(rows.map(row => [row.key, row.value]));
    const settings = Object.fromEntries(
      PUBLIC_KEYS.map(key => [key, stored.get(key)?.trim() || DEFAULTS[key]]),
    );

    const settingsRepo = new SettingsRepository();
    const features = Object.fromEntries(
      PUBLIC_FLAGS.map(key => [key, settingsRepo.isFlagEnabled(key)]),
    );

    res.json({ ...settings, features });
  } catch (error) {
    logger.error('Failed to read instance settings', error);
    res.status(500).json({ error: 'Failed to read instance settings' });
  }
});
