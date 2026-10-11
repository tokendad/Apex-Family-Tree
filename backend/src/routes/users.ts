import { Router } from 'express';
import { UserRepository } from '../repositories/UserRepository.js';
import { UserSettingsRepository } from '../repositories/UserSettingsRepository.js';
import { getDatabase } from '../db/connection.js';
import {
  hashPassword,
  verifyPassword,
  validatePassword,
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  getRefreshExpiryMs,
  toSafeUser,
  type TokenPayload,
} from '../services/auth.js';
import { setAuthCookies } from '../services/session.js';
import { recordChange } from '../services/audit.js';
import { createLogger } from '../services/logger.js';

export const usersRouter = Router();

const logger = createLogger();
const userRepo = new UserRepository();

function nowString(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

// GET /api/v1/users/me — The signed-in account
usersRouter.get('/me', (req, res) => {
  try {
    const user = userRepo.findById(req.user!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user: toSafeUser(user) });
  } catch (error) {
    logger.error('Failed to load profile', error);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// PATCH /api/v1/users/me — Change display name or email
usersRouter.patch('/me', async (req, res) => {
  try {
    const { display_name, email, current_password } = req.body ?? {};
    const user = userRepo.findById(req.user!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const update: { display_name?: string; email?: string } = {};

    if (display_name !== undefined) {
      if (typeof display_name !== 'string' || !display_name.trim()) {
        res.status(400).json({ error: 'Display name cannot be empty' });
        return;
      }
      update.display_name = display_name.trim();
    }

    if (email !== undefined && email !== user.email) {
      if (typeof email !== 'string' || !email.includes('@')) {
        res.status(400).json({ error: 'A valid email address is required' });
        return;
      }

      /* The email is the login. Changing it with a borrowed session would hand
         the account to whoever borrowed it, so it costs a password. */
      if (typeof current_password !== 'string' || !current_password) {
        res.status(400).json({ error: 'Your current password is required to change your email' });
        return;
      }
      if (!await verifyPassword(user.password_hash, current_password)) {
        res.status(401).json({ error: 'That password is not correct' });
        return;
      }

      const taken = userRepo.findByEmail(email.trim());
      if (taken && taken.id !== user.id) {
        res.status(409).json({ error: 'Another account already uses that email' });
        return;
      }
      update.email = email.trim();
    }

    if (Object.keys(update).length === 0) {
      res.json({ user: toSafeUser(user) });
      return;
    }

    const updated = userRepo.update(user.id, update);
    const { password_hash: _before, ...safeBefore } = user;
    const { password_hash: _after, ...safeAfter } = updated!;

    recordChange('update', 'user', user.id, safeBefore, safeAfter, { label: updated!.email });

    res.json({ user: toSafeUser(updated!) });
  } catch (error) {
    logger.error('Failed to update profile', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// POST /api/v1/users/me/password — Change your own password
usersRouter.post('/me/password', async (req, res) => {
  try {
    const { current_password, new_password } = req.body ?? {};

    const user = userRepo.findById(req.user!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (typeof current_password !== 'string' || !current_password) {
      res.status(400).json({ error: 'Your current password is required' });
      return;
    }
    if (!await verifyPassword(user.password_hash, current_password)) {
      res.status(401).json({ error: 'That password is not correct' });
      return;
    }

    const problem = validatePassword(new_password);
    if (problem) {
      res.status(400).json({ error: problem });
      return;
    }

    const passwordHash = await hashPassword(new_password as string);
    const db = getDatabase();

    const rawRefreshToken = generateRefreshToken();
    const refreshExpiryMs = getRefreshExpiryMs();
    const expiresAt = new Date(Date.now() + refreshExpiryMs).toISOString().replace('T', ' ').replace('Z', '');
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const tokenId = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

    /* Changing a password is how someone responds to thinking their account is
       compromised, so every other session has to end -- otherwise the one
       person it needs to lock out is the one still signed in. The current
       browser gets a fresh pair in the same breath, so the person doing it is
       not logged out of the page they are standing on. */
    db.transaction(() => {
      db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
        .run(passwordHash, nowString(), user.id);
      db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(user.id);
      db.prepare(
        'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(tokenId, user.id, hashToken(rawRefreshToken), expiresAt, nowString());
    })();

    // Never the password itself, old or new: only that it changed.
    recordChange('update', 'user', user.id, { password_changed: false }, { password_changed: true }, {
      label: user.email,
    });

    const payload: TokenPayload = { userId: user.id, email: user.email, role: user.role };
    setAuthCookies(res, generateAccessToken(payload), rawRefreshToken, refreshExpiryMs);

    res.json({ message: 'Password changed. Other devices have been signed out.' });
  } catch (error) {
    logger.error('Failed to change password', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// GET /api/v1/users/me/settings — Personal preferences
usersRouter.get('/me/settings', (req, res) => {
  try {
    res.json({ settings: new UserSettingsRepository().all(req.user!.userId) });
  } catch (error) {
    logger.error('Failed to load settings', error);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// PATCH /api/v1/users/me/settings — Write the given preferences, leave the rest
usersRouter.patch('/me/settings', (req, res) => {
  try {
    const body = req.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ error: 'Settings must be an object of keys and values' });
      return;
    }

    const repo = new UserSettingsRepository();
    const values: Record<string, string | number | boolean | null> = {};

    for (const [key, value] of Object.entries(body)) {
      if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
        res.status(400).json({ error: `Setting "${key}" must be a string, number, boolean or null` });
        return;
      }
      values[key] = value as string | number | boolean | null;
    }

    repo.setMany(req.user!.userId, values);
    res.json({ settings: repo.all(req.user!.userId) });
  } catch (error) {
    logger.error('Failed to save settings', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});
