import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, type TokenPayload } from '../services/auth.js';
import { SettingsRepository } from '../repositories/SettingsRepository.js';

declare global {
  // Augmenting Express's Request type requires its namespace; there is no
  // module-syntax equivalent for this declaration.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.access_token;

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const payload = verifyAccessToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.user = payload;
  next();
}

/**
 * Gates a route on a feature_flags row, which until this existed was
 * stored and toggleable in Admin Settings but checked nowhere. Flags gated
 * this way are opt-in, off-by-default switches for features with a real
 * cost or privacy implication (sending documents to a third-party LLM),
 * not a deploy-time kill switch -- an admin can flip it back off instantly
 * if something goes wrong, without a restart.
 */
export function requireFlag(key: string) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    if (!new SettingsRepository().isFlagEnabled(key)) {
      res.status(403).json({ error: 'Feature disabled' });
      return;
    }
    next();
  };
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}
