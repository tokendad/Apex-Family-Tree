import { Router, type Request, type Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import {
  applyPeopleMerge,
  previewPeopleMerge,
  scanPeopleDuplicates,
  type PeopleMergeInput,
} from '../services/tools/personDedup.js';

export const toolsRouter = Router();

toolsRouter.use(requireRole('admin', 'editor'));

toolsRouter.get('/people-dedup/scan', (_req: Request, res: Response) => {
  try {
    res.json(scanPeopleDuplicates());
  } catch (error) {
    res.status(500).json({ error: `Failed to scan people duplicates: ${String(error)}` });
  }
});

toolsRouter.post('/people-dedup/preview', (req: Request, res: Response) => {
  try {
    const input = req.body as PeopleMergeInput;
    if (!input?.canonicalPersonId) {
      res.status(400).json({ error: 'canonicalPersonId is required' });
      return;
    }
    if (!Array.isArray(input.duplicatePersonIds) || input.duplicatePersonIds.length === 0) {
      res.status(400).json({ error: 'duplicatePersonIds must include at least one person' });
      return;
    }
    res.json(previewPeopleMerge(input));
  } catch (error) {
    res.status(400).json({ error: String(error instanceof Error ? error.message : error) });
  }
});

toolsRouter.post('/people-dedup/apply', (req: Request, res: Response) => {
  try {
    const input = req.body as PeopleMergeInput;
    if (!input?.canonicalPersonId) {
      res.status(400).json({ error: 'canonicalPersonId is required' });
      return;
    }
    if (!Array.isArray(input.duplicatePersonIds) || input.duplicatePersonIds.length === 0) {
      res.status(400).json({ error: 'duplicatePersonIds must include at least one person' });
      return;
    }
    res.json(applyPeopleMerge(input));
  } catch (error) {
    res.status(400).json({ error: String(error instanceof Error ? error.message : error) });
  }
});
