import { AsyncLocalStorage } from 'async_hooks';
import type { Request, Response, NextFunction } from 'express';

/**
 * Who is behind the write currently being performed, and where from.
 *
 * Repositories are several calls below the route that triggered them and have
 * no access to `req`. Threading a user id down through every signature would
 * mean changing every caller of every repository method, so the context rides
 * alongside the call stack instead.
 */
export interface RequestContext {
  userId: string | null;
  ipAddress: string | null;
  /** Set while a bulk job runs, so per-row writes can be summarised instead of logged one by one. */
  bulkSource?: 'import' | 'merge' | 'scan';
  /** Set while derived rows are being rebuilt from a record already being audited. */
  inSync?: boolean;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Runs `fn` with the given context. Used by the middleware and by bulk jobs. */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/**
 * Runs `fn` with a flag merged into the current context, restoring it after.
 *
 * Used to mark a region as derived work (`inSync`) or as part of a bulk job, so
 * the audit layer can stay quiet for writes that a single higher-level entry
 * already describes.
 */
export function runWithFlags<T>(flags: Partial<RequestContext>, fn: () => T): T {
  const current = storage.getStore();
  if (!current) return runWithContext({ userId: null, ipAddress: null, ...flags }, fn);
  return storage.run({ ...current, ...flags }, fn);
}

/**
 * The caller's address, as best it can be known.
 *
 * Everything arrives through the cloudflared container, so `req.ip` is always
 * the tunnel and never the visitor. Cloudflare sets `cf-connecting-ip` and the
 * tunnel overwrites any value a client tried to send, so it is trustworthy for
 * traffic that came that way -- but the health-check port is reachable on the
 * LAN, where the header could be set by hand. Treat a recorded address as a
 * hint, never as proof of who did something.
 */
function clientIp(req: Request): string | null {
  const forwarded = req.headers['cf-connecting-ip'] ?? req.headers['x-forwarded-for'];
  const header = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = header?.split(',')[0]?.trim();
  return first || req.ip || null;
}

/** Mounted after requireAuth, so req.user is populated. */
export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  runWithContext({ userId: req.user?.userId ?? null, ipAddress: clientIp(req) }, next);
}
