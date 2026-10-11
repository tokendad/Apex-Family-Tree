import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { recordChange } from '../services/audit.js';
import { AuditRepository } from '../repositories/AuditRepository.js';
import { InviteCodeRepository, formatCode, type InviteCode } from '../repositories/InviteCodeRepository.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { generateRefreshToken, hashToken, hashPassword, validatePassword } from '../services/auth.js';
import { createEmailService } from '../services/email.js';
import { createLogger } from '../services/logger.js';
import { getDatabase } from '../db/connection.js';
import type { SafeUser } from '../types/db.js';

export const adminRouter = Router();
const userRepo = new UserRepository();
const logger = createLogger();
const emailService = createEmailService(logger);

// All admin routes require admin role
adminRouter.use(requireRole('admin'));

// GET /api/v1/admin/users — List all users
adminRouter.get('/users', (_req, res) => {
  try {
    const users = userRepo.findAll();
    const roleCounts: Record<string, number> = {};
    for (const u of users) {
      roleCounts[u.role] = (roleCounts[u.role] || 0) + 1;
    }
    res.json({ users, roleCounts });
  } catch (error) {
    logger.error('Failed to list users', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// POST /api/v1/admin/users/invite — Invite a new user
adminRouter.post('/users/invite', async (req, res) => {
  try {
    const { email, role, message } = req.body;

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const validRoles = ['editor', 'limited_editor', 'viewer'];
    if (!role || !validRoles.includes(role)) {
      res.status(400).json({ error: `Role must be one of: ${validRoles.join(', ')}` });
      return;
    }

    const existing = userRepo.findByEmail(email);
    if (existing) {
      res.status(409).json({ error: 'A user with this email already exists' });
      return;
    }

    const inviteToken = generateRefreshToken();
    const tokenHash = hashToken(inviteToken);
    const db = getDatabase();

    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const id = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '');

    db.prepare(
      'INSERT INTO invite_tokens (id, token, email, role, invited_by, message, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, tokenHash, email, role, req.user!.userId, message || null, expiresAt, now);

    const sent = await emailService.sendInvite(email, inviteToken, req.user!.email, message);

    res.status(201).json({
      invite: { id, email, role, expiresAt },
      emailSent: sent,
      // Include token in response when email is not configured so admin can share it manually
      ...(sent ? {} : { inviteToken }),
    });
  } catch (error) {
    logger.error('Failed to create invite', error);
    res.status(500).json({ error: 'Failed to create invite' });
  }
});

// POST /api/v1/admin/users/create — Create a new user directly (no invite flow)
adminRouter.post('/users/create', async (req, res) => {
  try {
    const { email, display_name, password, role } = req.body;

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    if (!display_name || typeof display_name !== 'string' || !display_name.trim()) {
      res.status(400).json({ error: 'Display name is required' });
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }

    const validRoles = ['admin', 'editor', 'limited_editor', 'viewer'];
    if (!role || !validRoles.includes(role)) {
      res.status(400).json({ error: `Role must be one of: ${validRoles.join(', ')}` });
      return;
    }

    const existing = userRepo.findByEmail(email);
    if (existing) {
      res.status(409).json({ error: 'A user with this email already exists' });
      return;
    }

    const password_hash = await hashPassword(password);
    const user = userRepo.create({ email, display_name: display_name.trim(), password_hash, role });

    const { password_hash: _, ...safeUser } = user;
    recordChange('create', 'user', user.id, null, safeUser, { label: user.email });
    res.status(201).json({ user: safeUser as SafeUser });
  } catch (error) {
    logger.error('Failed to create user', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// GET /api/v1/admin/users/:id — Get user details
adminRouter.get('/users/:id', (req, res) => {
  try {
    const user = userRepo.findById(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const { password_hash: _, ...safeUser } = user;
    res.json({ user: safeUser as SafeUser });
  } catch (error) {
    logger.error('Failed to get user', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// PUT /api/v1/admin/users/:id — Update user role/status
adminRouter.put('/users/:id', (req, res) => {
  try {
    const { role, status, display_name } = req.body;

    const user = userRepo.findById(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const update: Record<string, string> = {};

    if (role !== undefined) {
      const validRoles = ['admin', 'editor', 'limited_editor', 'viewer'];
      if (!validRoles.includes(role)) {
        res.status(400).json({ error: `Role must be one of: ${validRoles.join(', ')}` });
        return;
      }
      update.role = role;
    }

    if (status !== undefined) {
      const validStatuses = ['active', 'inactive', 'suspended'];
      if (!validStatuses.includes(status)) {
        res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
        return;
      }
      update.status = status;
    }

    if (display_name !== undefined) {
      if (typeof display_name !== 'string' || display_name.trim().length === 0) {
        res.status(400).json({ error: 'Display name cannot be empty' });
        return;
      }
      update.display_name = display_name.trim();
    }

    if (Object.keys(update).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    const { password_hash: _before, ...safeBefore } = user;
    const updated = userRepo.update(req.params.id, update);
    if (!updated) {
      res.status(500).json({ error: 'Failed to update user' });
      return;
    }

    const { password_hash: _, ...safeUser } = updated;
    recordChange('update', 'user', req.params.id as string, safeBefore, safeUser, { label: updated.email });
    res.json({ user: safeUser as SafeUser });
  } catch (error) {
    logger.error('Failed to update user', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /api/v1/admin/users/:id — Delete user (can't delete self)
adminRouter.delete('/users/:id', (req, res) => {
  try {
    if (req.params.id === req.user!.userId) {
      res.status(400).json({ error: 'Cannot delete your own account' });
      return;
    }

    const user = userRepo.findById(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Clean up refresh tokens for the deleted user
    const db = getDatabase();
    db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(req.params.id);

    const { password_hash: _, ...safeUser } = user;
    const deleted = userRepo.delete(req.params.id);
    if (!deleted) {
      res.status(500).json({ error: 'Failed to delete user' });
      return;
    }

    recordChange('delete', 'user', req.params.id as string, safeUser, null, { label: user.email });
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete user', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ─── Audit Log ──────────────────────────────────────────────────────────────

// GET /api/v1/admin/audit — Recent changes, newest first
adminRouter.get('/audit', (req, res) => {
  try {
    const repo = new AuditRepository();
    const result = repo.list({
      limit: parseInt(req.query.limit as string) || 20,
      cursor: req.query.cursor as string | undefined,
      q: req.query.q as string | undefined,
      entityType: req.query.entity_type as string | undefined,
      action: req.query.action as string | undefined,
      userId: req.query.user_id as string | undefined,
      includeSystem: req.query.include_system === 'true',
    });

    res.json(result);
  } catch (error) {
    logger.error('Failed to list audit log', error);
    res.status(500).json({ error: 'Failed to list audit log' });
  }
});

// GET /api/v1/admin/audit/facets — Distinct entity types and actions, for filters
adminRouter.get('/audit/facets', (_req, res) => {
  try {
    res.json(new AuditRepository().facets());
  } catch (error) {
    logger.error('Failed to load audit facets', error);
    res.status(500).json({ error: 'Failed to load audit facets' });
  }
});

// ─── Invite Codes ───────────────────────────────────────────────────────────

const VALID_INVITE_ROLES = ['admin', 'editor', 'limited_editor', 'viewer'] as const;

/** The stored code is normalised; everything leaving the API is formatted. */
function presentCode(row: InviteCode) {
  return {
    id: row.id,
    code: formatCode(row.code),
    role: row.role,
    note: row.note,
    max_uses: row.max_uses,
    use_count: row.use_count,
    uses_left: row.max_uses - row.use_count,
    expires_at: row.expires_at,
    created_at: row.created_at,
  };
}

// POST /api/v1/admin/invite-codes — Generate a code for someone to sign up with
adminRouter.post('/invite-codes', (req, res) => {
  try {
    const { role, note, expires_in_hours, max_uses } = req.body ?? {};

    const chosenRole = role ?? 'editor';
    if (!VALID_INVITE_ROLES.includes(chosenRole)) {
      res.status(400).json({ error: `Role must be one of: ${VALID_INVITE_ROLES.join(', ')}` });
      return;
    }

    const hours = Number(expires_in_hours ?? 24);
    if (!Number.isFinite(hours) || hours < 1 || hours > 720) {
      res.status(400).json({ error: 'Expiry must be between 1 and 720 hours' });
      return;
    }

    const uses = Number(max_uses ?? 1);
    if (!Number.isInteger(uses) || uses < 1 || uses > 50) {
      res.status(400).json({ error: 'Uses must be a whole number between 1 and 50' });
      return;
    }

    const created = new InviteCodeRepository().create({
      role: chosenRole,
      note: typeof note === 'string' ? note : null,
      expiresInHours: hours,
      maxUses: uses,
      createdBy: req.user!.userId,
    });

    recordChange('create', 'invite_code', created.id, null, presentCode(created), {
      label: created.note || formatCode(created.code),
      role: created.role,
    });

    res.status(201).json({ invite_code: presentCode(created) });
  } catch (error) {
    logger.error('Failed to create invite code', error);
    res.status(500).json({ error: 'Failed to create invite code' });
  }
});

// GET /api/v1/admin/invite-codes — Codes that can still be used
adminRouter.get('/invite-codes', (_req, res) => {
  try {
    res.json({ invite_codes: new InviteCodeRepository().findActive().map(presentCode) });
  } catch (error) {
    logger.error('Failed to list invite codes', error);
    res.status(500).json({ error: 'Failed to list invite codes' });
  }
});

// DELETE /api/v1/admin/invite-codes/:id — Revoke a code before it is used
adminRouter.delete('/invite-codes/:id', (req, res) => {
  try {
    const repo = new InviteCodeRepository();
    const before = repo.findById(req.params.id as string);
    if (!before) {
      res.status(404).json({ error: 'Invite code not found' });
      return;
    }

    if (!repo.revoke(before.id)) {
      res.status(404).json({ error: 'Invite code has already been revoked' });
      return;
    }

    recordChange('delete', 'invite_code', before.id, presentCode(before), null, {
      label: before.note || formatCode(before.code),
    });

    res.json({ message: 'Invite code revoked' });
  } catch (error) {
    logger.error('Failed to revoke invite code', error);
    res.status(500).json({ error: 'Failed to revoke invite code' });
  }
});
