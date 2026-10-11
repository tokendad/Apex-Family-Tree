import type { Request, Response, NextFunction } from 'express';
import { clientIp } from '../services/requestContext.js';

interface Window {
  /** Timestamps of the attempts still inside the window. */
  hits: number[];
}

/**
 * A sliding-window limiter held in memory.
 *
 * AFT runs as a single container with a single process, so a shared store would
 * be ceremony around a Map. The cost is that limits reset on restart; for
 * slowing down guesses at an eight-character invite code that is acceptable,
 * since the codes expire in a day anyway.
 */
export function rateLimit(options: { limit: number; windowMs: number; message?: string }) {
  const buckets = new Map<string, Window>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = clientIp(req) ?? 'unknown';
    const bucket = buckets.get(key) ?? { hits: [] };

    bucket.hits = bucket.hits.filter((at) => now - at < options.windowMs);

    if (bucket.hits.length >= options.limit) {
      const retryAfterMs = options.windowMs - (now - bucket.hits[0]);
      res.setHeader('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
      res.status(429).json({
        error: options.message ?? 'Too many attempts. Please wait and try again.',
      });
      return;
    }

    bucket.hits.push(now);
    buckets.set(key, bucket);

    /* Buckets are only pruned when their own key is next seen, so a burst from
       many addresses would otherwise be remembered for ever. Sweeping on the
       way past keeps the map proportional to recent traffic. */
    if (buckets.size > 1000) {
      for (const [bucketKey, value] of buckets) {
        if (value.hits.every((at) => now - at >= options.windowMs)) buckets.delete(bucketKey);
      }
    }

    next();
  };
}
