import { Router } from 'express';
import { SearchRepository } from '../repositories/SearchRepository.js';

export const searchRouter = Router();

function privacyForRole(role: string | undefined): string[] {
  if (role === 'admin' || role === 'editor') return ['public', 'family', 'private', 'restricted'];
  if (role === 'limited_editor') return ['public', 'family', 'private'];
  return ['public', 'family'];
}

searchRouter.get('/', (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
    const repo = new SearchRepository();
    repo.rebuildIndex();
    res.json(repo.search(q, { limit, allowedPrivacyLevels: privacyForRole(req.user?.role) }));
  } catch (error) {
    res.status(500).json({ error: 'Failed to search archive' });
  }
});
