import { Router, type Request, type Response } from 'express';
import { AiJobRepository } from '../repositories/AiJobRepository.js';

export const aiJobsRouter = Router();

function paramStr(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

// GET /ai/jobs/:id — Poll an AI job's status. The owner (whoever requested
// it) or an admin may read it; nobody else can see what another user sent
// to the LLM or what came back.
aiJobsRouter.get('/jobs/:id', (req: Request, res: Response) => {
  try {
    const job = new AiJobRepository().findById(paramStr(req.params.id));
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    if (job.requested_by !== req.user!.userId && req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    res.json(job);
  } catch {
    res.status(500).json({ error: 'Failed to get job' });
  }
});
