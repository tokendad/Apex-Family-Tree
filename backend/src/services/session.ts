import type { Response } from 'express';

/**
 * Where the auth cookie settings live, so routes that issue a session cannot
 * disagree about them. Two copies of `secure` or `sameSite` that drift apart
 * is a bug nobody notices until a cookie silently stops being sent.
 */
export const COOKIE_OPTIONS = {
  httpOnly: true,
  // Secure flag must be explicitly enabled via COOKIE_SECURE=true.
  // Defaults to false so the app works over plain HTTP (typical for self-hosted LAN installs).
  // Set COOKIE_SECURE=true only when serving over HTTPS.
  secure: process.env.COOKIE_SECURE === 'true',
  sameSite: 'strict' as const,
  path: '/',
};

/** Matches the access token's own lifetime in services/auth.ts. */
export const ACCESS_COOKIE_MAX_AGE_MS = 15 * 60 * 1000;

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  refreshExpiryMs: number,
): void {
  res.cookie('access_token', accessToken, { ...COOKIE_OPTIONS, maxAge: ACCESS_COOKIE_MAX_AGE_MS });
  res.cookie('refresh_token', refreshToken, { ...COOKIE_OPTIONS, maxAge: refreshExpiryMs });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie('access_token', COOKIE_OPTIONS);
  res.clearCookie('refresh_token', COOKIE_OPTIONS);
}
