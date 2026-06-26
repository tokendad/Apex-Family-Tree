import { Router, type Request, type Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import {
  applyPeopleMerge,
  previewPeopleMerge,
  scanPeopleDuplicates,
  type PeopleMergeInput,
} from '../services/tools/personDedup.js';
import {
  getTreeIssueSummary,
  listTreeIssues,
  scanTreeIssues,
  updateTreeIssue,
  type TreeIssueSeverity,
  type TreeIssueStatus,
} from '../services/tools/treeIssues.js';

export const toolsRouter = Router();

const editorOnly = requireRole('admin', 'editor');

function paramStr(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

toolsRouter.get('/people-dedup/scan', editorOnly, (_req: Request, res: Response) => {
  try {
    res.json(scanPeopleDuplicates());
  } catch (error) {
    res.status(500).json({ error: `Failed to scan people duplicates: ${String(error)}` });
  }
});

toolsRouter.post('/people-dedup/preview', editorOnly, (req: Request, res: Response) => {
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

toolsRouter.post('/people-dedup/apply', editorOnly, (req: Request, res: Response) => {
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

toolsRouter.get('/tree-issues/summary', (_req: Request, res: Response) => {
  try {
    res.json(getTreeIssueSummary());
  } catch (error) {
    res.status(500).json({ error: `Failed to summarize tree issues: ${String(error)}` });
  }
});

toolsRouter.get('/tree-issues', (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const status = typeof req.query.status === 'string' ? req.query.status as TreeIssueStatus : undefined;
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const severity = typeof req.query.severity === 'string' ? req.query.severity as TreeIssueSeverity : undefined;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

    res.json(listTreeIssues({ status, type, severity, cursor, limit }));
  } catch (error) {
    res.status(500).json({ error: `Failed to list tree issues: ${String(error)}` });
  }
});

toolsRouter.post('/tree-issues/scan', editorOnly, (_req: Request, res: Response) => {
  try {
    res.json(scanTreeIssues());
  } catch (error) {
    res.status(500).json({ error: `Failed to scan tree issues: ${String(error)}` });
  }
});

toolsRouter.patch('/tree-issues/:id', editorOnly, (req: Request, res: Response) => {
  try {
    const input = req.body as { status?: TreeIssueStatus; note?: string | null };
    if (input.status === 'dismissed' && !input.note?.trim()) {
      res.status(400).json({ error: 'Dismissed tree issues require a note' });
      return;
    }
    res.json(updateTreeIssue(paramStr(req.params.id), input));
  } catch (error) {
    res.status(400).json({ error: String(error instanceof Error ? error.message : error) });
  }
});
