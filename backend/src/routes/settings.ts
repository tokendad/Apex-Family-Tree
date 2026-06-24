import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { SettingsRepository } from '../repositories/SettingsRepository.js';
import { encrypt } from '../services/encryption.js';
import { createLogger } from '../services/logger.js';
import type { AppSetting } from '../types/db.js';

export const settingsRouter = Router();
const settingsRepo = new SettingsRepository();
const logger = createLogger();

// All settings routes require admin role
settingsRouter.use(requireRole('admin'));

// Sensitive keys that should be encrypted
const ENCRYPTED_KEYS = new Set(['smtp_pass']);

// GET /api/v1/admin/settings — Get all settings
settingsRouter.get('/settings', (_req, res) => {
  try {
    const settings = settingsRepo.getAllSettings();

    // Mask encrypted values in the response
    const masked = settings.map(s => ({
      ...s,
      value: s.value_type === 'encrypted' && s.value ? '••••••••' : s.value,
    }));

    res.json({ settings: masked });
  } catch (error) {
    logger.error('Failed to get settings', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// PUT /api/v1/admin/settings — Update settings (accepts key-value pairs)
settingsRouter.put('/settings', (req, res) => {
  try {
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      res.status(400).json({ error: 'Request body must contain a "settings" object with key-value pairs' });
      return;
    }

    const updated: Array<{ key: string; value: string | null }> = [];

    for (const [key, value] of Object.entries(settings)) {
      if (typeof key !== 'string' || key.trim().length === 0) continue;

      const stringValue = value === null || value === '' ? null : String(value);

      if (ENCRYPTED_KEYS.has(key) && stringValue !== null) {
        const encrypted = encrypt(stringValue);
        settingsRepo.setSetting(key, encrypted, 'encrypted');
        updated.push({ key, value: '••••••••' });
      } else if (key === 'name_display_format') {
        settingsRepo.setNameDisplayFormat(stringValue ?? '');
        updated.push({ key, value: stringValue });
      } else {
        // Detect type from value
        let valueType: AppSetting['value_type'] = 'string';
        if (typeof value === 'number') valueType = 'number';
        else if (typeof value === 'boolean') valueType = 'boolean';
        else if (typeof value === 'object' && value !== null) valueType = 'json';

        const storedValue = valueType === 'json' ? JSON.stringify(value) : stringValue;
        settingsRepo.setSetting(key, storedValue, valueType);
        updated.push({ key, value: storedValue });
      }
    }

    res.json({ updated });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('Global name format') || error.message.includes('Format string'))) {
      res.status(400).json({ error: error.message });
      return;
    }
    logger.error('Failed to update settings', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// GET /api/v1/admin/features — Get all feature flags
settingsRouter.get('/features', (_req, res) => {
  try {
    const flags = settingsRepo.getAllFlags();
    res.json({ flags });
  } catch (error) {
    logger.error('Failed to get feature flags', error);
    res.status(500).json({ error: 'Failed to get feature flags' });
  }
});

// PUT /api/v1/admin/features/:key — Toggle feature flag
settingsRouter.put('/features/:key', (req, res) => {
  try {
    const { key } = req.params;
    const { enabled, description } = req.body;

    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: '"enabled" must be a boolean' });
      return;
    }

    settingsRepo.setFlag(key, enabled, description);
    const flag = settingsRepo.getFlag(key);
    res.json({ flag });
  } catch (error) {
    logger.error('Failed to update feature flag', error);
    res.status(500).json({ error: 'Failed to update feature flag' });
  }
});
