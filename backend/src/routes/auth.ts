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
  type TokenPayload,
} from '../services/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { getDatabase } from '../db/connection.js';

export const authRouter = Router();
const userRepo = new UserRepository();

const COOKIE_OPTIONS = {
  httpOnly: true,
  // Secure flag must be explicitly enabled via COOKIE_SECURE=true.
  // Defaults to false so the app works over plain HTTP (typical for self-hosted LAN installs).
  // Set COOKIE_SECURE=true only when serving over HTTPS.
  secure: process.env.COOKIE_SECURE === 'true',
  sameSite: 'strict' as const,
  path: '/',
};

function setAuthCookies(
  res: import('express').Response,
  accessToken: string,
  refreshToken: string,
  refreshExpiryMs: number,
): void {
  res.cookie('access_token', accessToken, {
    ...COOKIE_OPTIONS,
    maxAge: 15 * 60 * 1000, // 15 minutes
  });
  res.cookie('refresh_token', refreshToken, {
    ...COOKIE_OPTIONS,
    maxAge: refreshExpiryMs,
  });
}

function clearAuthCookies(res: import('express').Response): void {
  res.clearCookie('access_token', COOKIE_OPTIONS);
  res.clearCookie('refresh_token', COOKIE_OPTIONS);
}

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

    if (typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
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
  } catch (error) {
    res.status(500).json({ error: 'Failed to create admin account' });
  }
});

// POST /api/auth/login
authRouter.post('/login', async (req, res) => {
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
  } catch (error) {
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
  } catch (error) {
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
  } catch (error) {
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
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});
