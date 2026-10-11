import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import type { User, SafeUser } from '../types/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

export interface TokenPayload {
  userId: string;
  email: string;
  role: User['role'];
}

export function getRefreshExpiryMs(): number {
  const match = JWT_REFRESH_EXPIRY.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const num = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return num * (multipliers[unit] ?? 86_400_000);
}

/**
 * The one place the password rules live (#39: eight characters, one number).
 *
 * Returns the message to show, or null when the password is acceptable. The
 * rule was previously written out at each call site, which is how setup and
 * admin-create came to check length and nothing else.
 */
export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length === 0) return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/\d/.test(password)) return 'Password must contain at least one number';
  return null;
}

/**
 * Words for a temporary password an admin reads down the phone.
 *
 * Short, unambiguous when spoken, and nothing that sounds like anything else.
 * No proper nouns, no homophones (no "bear"/"bare"), nothing embarrassing to
 * say to a relative.
 */
const RESET_WORDS = [
  'river', 'maple', 'stone', 'amber', 'cedar', 'harbor', 'meadow', 'willow',
  'copper', 'quartz', 'lantern', 'anchor', 'orchard', 'thistle', 'marble', 'cobalt',
  'juniper', 'pebble', 'harvest', 'beacon', 'birch', 'clover', 'granite', 'hollow',
  'ivory', 'lagoon', 'summit', 'timber', 'violet', 'walnut', 'canyon', 'ember',
];

/**
 * A temporary password that can be dictated and typed on a phone.
 *
 * Two words and three digits, e.g. `cedar-harbor-482`. Deliberately far weaker
 * than a password someone chooses for themselves: it exists to be read aloud
 * once and replaced. Login is rate limited, which is what makes a password this
 * guessable tolerable for the short time it should live.
 */
export function generateTemporaryPassword(): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);

  const first = RESET_WORDS[bytes[0] % RESET_WORDS.length];
  let second = RESET_WORDS[bytes[1] % RESET_WORDS.length];
  // Two of the same word reads like a mistake and halves the choice.
  if (second === first) second = RESET_WORDS[(bytes[1] + 1) % RESET_WORDS.length];

  const digits = String(100 + (bytes[2] % 900));
  return `${first}-${second}-${digits}`;
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_ACCESS_EXPIRY as jwt.SignOptions['expiresIn'],
  });
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export function toSafeUser(user: User): SafeUser {
  const { password_hash: _, ...safe } = user;
  return safe;
}
