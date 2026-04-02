import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { generateRefreshToken, hashToken } from '../services/auth.js';
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

    const updated = userRepo.update(req.params.id, update);
    if (!updated) {
      res.status(500).json({ error: 'Failed to update user' });
      return;
    }

    const { password_hash: _, ...safeUser } = updated;
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

    const deleted = userRepo.delete(req.params.id);
    if (!deleted) {
      res.status(500).json({ error: 'Failed to delete user' });
      return;
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete user', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});
