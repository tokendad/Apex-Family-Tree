import type { Request, Response, NextFunction } from 'express';
import { UserRepository } from '../repositories/UserRepository.js';

const userRepo = new UserRepository();

export function firstRunCheck(req: Request, res: Response, next: NextFunction): void {
  // Only gate API routes — let frontend static files and HTML through
  if (!req.path.startsWith('/api/') || req.path === '/api/auth/setup' || req.path === '/api/health') {
    next();
    return;
  }

  if (!userRepo.hasAdmin()) {
    res.status(503).json({ error: 'setup_required', message: 'Initial admin setup is required' });
    return;
  }

  next();
}
