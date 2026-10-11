import { Router } from 'express';
import { UserRepository } from '../repositories/UserRepository.js';
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  toSafeUser,
  getRefreshExpiryMs,
  validatePassword,
  type TokenPayload,
} from '../services/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { setAuthCookies, clearAuthCookies } from '../services/session.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { InviteCodeRepository } from '../repositories/InviteCodeRepository.js';
import { recordChange } from '../services/audit.js';
import { clientIp, runWithContext } from '../services/requestContext.js';
import { getDatabase } from '../db/connection.js';

export const authRouter = Router();
const userRepo = new UserRepository();

// POST /api/auth/setup — Create admin account (first-run only)
authRouter.post('/setup', async (req, res) => {
  try {
    if (userRepo.hasAdmin()) {
      res.status(409).json({ error: 'Admin account already exists' });
      return;
    }

    const { email, display_name, password } = req.body;

    if (!email || !display_name || !password) {
      res.status(400).json({ error: 'Email, display_name, and password are required' });
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = userRepo.create({ email, display_name, password_hash: passwordHash, role: 'admin' });

    const payload: TokenPayload = { userId: user.id, email: user.email, role: user.role };
    const accessToken = generateAccessToken(payload);
    const rawRefreshToken = generateRefreshToken();
    const refreshExpiryMs = getRefreshExpiryMs();

    const db = getDatabase();
    const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
    const expiresAt = new Date(Date.now() + refreshExpiryMs).toISOString().replace('T', ' ').replace('Z', '');
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const tokenId = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

    db.prepare(
      'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(tokenId, user.id, hashToken(rawRefreshToken), expiresAt, now);

    userRepo.updateLastLogin(user.id);
    setAuthCookies(res, accessToken, rawRefreshToken, refreshExpiryMs);
    res.status(201).json({ user: toSafeUser(user) });
  } catch {
    res.status(500).json({ error: 'Failed to create admin account' });
  }
});


/* Guessing an eight-character code is the whole attack on self-registration, so
   the endpoint is slowed down rather than the code lengthened past what anyone
   will type. Login gets the same treatment: it had no limit at all. */
const registerLimiter = rateLimit({
  limit: 5,
  windowMs: 15 * 60 * 1000,
  message: 'Too many sign-up attempts. Please wait 15 minutes and try again.',
});

/**
 * POST /api/auth/register
 *
 * Accepts either the short invite code an admin reads out, or the long token
 * from an emailed invitation link. They are the same transaction from here on:
 * both say which role the new account gets, and both are spent as the account
 * is created.
 */
authRouter.post('/register', registerLimiter, async (req, res) => {
  try {
    const { code, token, email, display_name, password } = req.body ?? {};

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ error: 'A valid email address is required' });
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

    const db = getDatabase();
    const codeRepo = new InviteCodeRepository();

    // Resolve whichever credential was offered into a role to grant.
    let role: string;
    let via: 'invite_code' | 'invite_token';
    let inviteCodeId: string | null = null;
    let inviteTokenId: string | null = null;

    if (typeof code === 'string' && code.trim()) {
      const invite = codeRepo.findByCode(code);
      const reason = codeRepo.rejectionReason(invite);
      if (reason || !invite) {
        res.status(400).json({ error: reason ?? 'That invite code is not valid' });
        return;
      }
      role = invite.role;
      via = 'invite_code';
      inviteCodeId = invite.id;
    } else if (typeof token === 'string' && token.trim()) {
      // invite_tokens stores the hash; the raw token is what was emailed.
      const invite = db.prepare(
        'SELECT id, email, role, expires_at, used_at FROM invite_tokens WHERE token = ?',
      ).get(hashToken(token.trim())) as
        { id: string; email: string; role: string; expires_at: string; used_at: string | null } | undefined;

      const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
      if (!invite || invite.used_at || invite.expires_at <= now) {
        res.status(400).json({ error: 'That invitation is not valid or has expired' });
        return;
      }
      // The invitation named an address; it is not transferable.
      if (invite.email.toLowerCase() !== email.trim().toLowerCase()) {
        res.status(400).json({ error: 'This invitation was issued to a different email address' });
        return;
      }
      role = invite.role;
      via = 'invite_token';
      inviteTokenId = invite.id;
    } else {
      res.status(400).json({ error: 'An invite code is required' });
      return;
    }

    if (userRepo.findByEmail(email.trim())) {
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }

    const passwordHash = await hashPassword(password as string);
    const now = new Date().toISOString().replace('T', ' ').replace('Z', '');

    /* Spending the invitation and creating the account are one write. If they
       were not, a failure between them would either consume a code without
       producing an account or -- worse -- leave a single-use code spendable
       twice. consume() carries its own conditions, so two people redeeming the
       last use at the same moment cannot both succeed. */
    const rawRefreshToken = generateRefreshToken();
    const refreshExpiryMs = getRefreshExpiryMs();
    const refreshExpiresAt = new Date(Date.now() + refreshExpiryMs).toISOString().replace('T', ' ').replace('Z', '');
    const refreshBytes = new Uint8Array(16);
    crypto.getRandomValues(refreshBytes);
    const refreshTokenId = Array.from(refreshBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    let user: ReturnType<typeof userRepo.create> | undefined;
    const redeem = db.transaction(() => {
      if (inviteCodeId && !codeRepo.consume(inviteCodeId)) {
        throw new Error('invite_spent');
      }
      if (inviteTokenId) {
        const spent = db.prepare(
          'UPDATE invite_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL',
        ).run(now, inviteTokenId).changes > 0;
        if (!spent) throw new Error('invite_spent');
      }

      user = userRepo.create({
        email: email.trim(),
        display_name: (display_name as string).trim(),
        password_hash: passwordHash,
        role: role as 'admin' | 'editor' | 'limited_editor' | 'viewer',
      });

      /* Inside the transaction with the rest. Written afterwards, a failure
         here would leave the account created and the code spent while the
         caller got a 500 and no cookie -- unable to sign in, unable to sign
         up again, and holding a code that now says it has been used. */
      db.prepare(
        'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(refreshTokenId, user.id, hashToken(rawRefreshToken), refreshExpiresAt, now);
    });

    try {
      redeem();
    } catch (error) {
      if (error instanceof Error && error.message === 'invite_spent') {
        res.status(400).json({ error: 'That invite code has already been used' });
        return;
      }
      throw error;
    }

    const created = user!;
    const payload: TokenPayload = { userId: created.id, email: created.email, role: created.role };
    const accessToken = generateAccessToken(payload);

    /* /auth is mounted before the context middleware, so the audit layer would
       otherwise record no address at all. The actor is genuinely nobody: the
       account did not exist when the request began. */
    runWithContext({ userId: null, ipAddress: clientIp(req) }, () => {
      recordChange('create', 'user', created.id, null, toSafeUser(created), {
        label: created.email,
        via,
        role: created.role,
      });
    });

    userRepo.updateLastLogin(created.id);
    setAuthCookies(res, accessToken, rawRefreshToken, refreshExpiryMs);
    res.status(201).json({ user: toSafeUser(created) });
  } catch {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
authRouter.post(
  '/login',
  rateLimit({ limit: 10, windowMs: 15 * 60 * 1000, message: 'Too many sign-in attempts. Please wait and try again.' }),
  async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const user = userRepo.findByEmail(email);
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    if (user.status !== 'active') {
      res.status(403).json({ error: 'Account is disabled' });
      return;
    }

    const validPassword = await verifyPassword(user.password_hash, password);
    if (!validPassword) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const payload: TokenPayload = { userId: user.id, email: user.email, role: user.role };
    const accessToken = generateAccessToken(payload);
    const rawRefreshToken = generateRefreshToken();
    const refreshExpiryMs = getRefreshExpiryMs();

    const db = getDatabase();
    const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
    const expiresAt = new Date(Date.now() + refreshExpiryMs).toISOString().replace('T', ' ').replace('Z', '');
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const tokenId = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

    db.prepare(
      'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(tokenId, user.id, hashToken(rawRefreshToken), expiresAt, now);

    userRepo.updateLastLogin(user.id);
    setAuthCookies(res, accessToken, rawRefreshToken, refreshExpiryMs);
    res.json({ user: toSafeUser(user) });
  } catch {
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/logout
authRouter.post('/logout', (req, res) => {
  try {
    const refreshToken = req.cookies?.refresh_token;
    if (refreshToken) {
      const db = getDatabase();
      db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').run(hashToken(refreshToken));
    }

    clearAuthCookies(res);
    res.json({ message: 'Logged out' });
  } catch {
    clearAuthCookies(res);
    res.json({ message: 'Logged out' });
  }
});

// POST /api/auth/refresh
authRouter.post('/refresh', (req, res) => {
  try {
    const rawRefreshToken = req.cookies?.refresh_token;
    if (!rawRefreshToken) {
      res.status(401).json({ error: 'Refresh token required' });
      return;
    }

    const db = getDatabase();
    const tokenHash = hashToken(rawRefreshToken);
    const storedToken = db
      .prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?')
      .get(tokenHash) as { id: string; user_id: string; expires_at: string } | undefined;

    if (!storedToken) {
      clearAuthCookies(res);
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
    if (storedToken.expires_at < now) {
      db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(storedToken.id);
      clearAuthCookies(res);
      res.status(401).json({ error: 'Refresh token expired' });
      return;
    }

    const user = userRepo.findById(storedToken.user_id);
    if (!user || user.status !== 'active') {
      db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(storedToken.id);
      clearAuthCookies(res);
      res.status(401).json({ error: 'User not found or disabled' });
      return;
    }

    // Rotate refresh token
    db.prepare('DELETE FROM refresh_tokens WHERE id = ?').run(storedToken.id);

    const payload: TokenPayload = { userId: user.id, email: user.email, role: user.role };
    const newAccessToken = generateAccessToken(payload);
    const newRawRefreshToken = generateRefreshToken();
    const refreshExpiryMs = getRefreshExpiryMs();

    const expiresAt = new Date(Date.now() + refreshExpiryMs).toISOString().replace('T', ' ').replace('Z', '');
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const tokenId = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

    db.prepare(
      'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(tokenId, user.id, hashToken(newRawRefreshToken), expiresAt, now);

    setAuthCookies(res, newAccessToken, newRawRefreshToken, refreshExpiryMs);
    res.json({ user: toSafeUser(user) });
  } catch {
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// GET /api/auth/me
authRouter.get('/me', requireAuth, (req, res) => {
  try {
    const user = userRepo.findById(req.user!.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user: toSafeUser(user) });
  } catch {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});
