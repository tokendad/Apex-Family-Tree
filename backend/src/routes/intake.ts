import crypto from 'crypto';
import { Router } from 'express';
import { requireRole, requireFlag } from '../middleware/auth.js';
import { IntakeRepository } from '../repositories/IntakeRepository.js';
import { AiJobRepository } from '../repositories/AiJobRepository.js';
import { SettingsRepository } from '../repositories/SettingsRepository.js';
import { runAiJob } from '../services/aiJobs.js';
import { extractProposals } from '../services/intake/extraction.js';
import { commitIntakeItem, IntakeCommitError } from '../services/intake/commitService.js';
import type { ProposalDecision, ProposalPayload } from '../types/intake.js';

export const intakeRouter = Router();

function paramStr(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// GET /intake — recent submissions, for the AI Assistant panel's history.
intakeRouter.get('/', requireRole('admin', 'editor'), requireFlag('ai_intake'), (_req, res) => {
  const items = new IntakeRepository().findAllItems();
  res.json({ items });
});

// GET /intake/:id — poll status while extraction runs.
intakeRouter.get('/:id', requireRole('admin', 'editor'), requireFlag('ai_intake'), (req, res) => {
  const item = new IntakeRepository().findItemById(paramStr(req.params.id));
  if (!item) {
    res.status(404).json({ error: 'Intake item not found' });
    return;
  }
  const job = item.ai_job_id ? new AiJobRepository().findById(item.ai_job_id) : undefined;
  res.json({ item, error: job?.error_message ?? null });
});

// GET /intake/:id/proposals — for the review cards.
intakeRouter.get('/:id/proposals', requireRole('admin', 'editor'), requireFlag('ai_intake'), (req, res) => {
  const repo = new IntakeRepository();
  const id = paramStr(req.params.id);
  const item = repo.findItemById(id);
  if (!item) {
    res.status(404).json({ error: 'Intake item not found' });
    return;
  }
  res.json({ proposals: repo.findProposalsByItem(id), conflicts: repo.findConflictsByItem(id) });
});

// POST /intake — body { text }. Paste text, extract proposals async.
//
// Deliberately creates no artifact here. An artifact is a visible row in the
// Artifacts list, and most submissions never get that far intact (no API key
// configured, every proposal rejected, a restart orphaning the job) -- #73's
// "no silent writes" rule means nothing lands in the archive before a human
// accepts something. commitService.ts creates the citable source artifact
// itself, inside the same transaction as the first thing it commits.
intakeRouter.post('/', requireRole('admin', 'editor'), requireFlag('ai_intake'), (req, res) => {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) {
      res.status(400).json({ error: 'text is required' });
      return;
    }

    const intakeRepo = new IntakeRepository();
    const hash = hashText(text);

    const existing = intakeRepo.findPendingByHash(hash);
    if (existing) {
      res.status(202).json({ intakeItemId: existing.id });
      return;
    }

    const item = intakeRepo.createItem({ created_by: req.user!.userId, source_text: text, source_hash: hash });
    intakeRepo.setStatus(item.id, 'extracting');

    const settings = new SettingsRepository();
    const providerId = settings.getSettingValue('llm_provider') || 'anthropic';
    const model = settings.getSettingValue('llm_model') || 'unknown';

    const job = runAiJob('extract', req.user!.userId, providerId, model, item.id, async () => {
      try {
        const result = await extractProposals(text);
        intakeRepo.createProposals(item.id, result.proposals);
        intakeRepo.setStatus(item.id, 'awaiting_review');
        return {
          data: { proposalCount: result.proposals.length },
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        };
      } catch (error) {
        intakeRepo.setStatus(item.id, 'failed');
        throw error;
      }
    });
    intakeRepo.setAiJob(item.id, job.id);

    res.status(202).json({ intakeItemId: item.id });
  } catch (error) {
    res.status(500).json({ error: 'Submission failed: ' + String(error instanceof Error ? error.message : error) });
  }
});

// POST /intake/:id/proposals/:proposalId — body { decision, editedPayload? }
intakeRouter.post('/:id/proposals/:proposalId', requireRole('admin', 'editor'), requireFlag('ai_intake'), (req, res) => {
  const repo = new IntakeRepository();
  const itemId = paramStr(req.params.id);
  const proposalId = paramStr(req.params.proposalId);

  const proposal = repo.findProposalById(proposalId);
  if (!proposal || proposal.intake_item_id !== itemId) {
    res.status(404).json({ error: 'Proposal not found' });
    return;
  }

  const decision = req.body?.decision as ProposalDecision | undefined;
  if (decision !== 'accept' && decision !== 'edit' && decision !== 'reject') {
    res.status(400).json({ error: "decision must be 'accept', 'edit', or 'reject'" });
    return;
  }
  if (decision === 'edit' && !req.body?.editedPayload) {
    res.status(400).json({ error: 'editedPayload is required when decision is edit' });
    return;
  }
  if (decision === 'edit' && (req.body.editedPayload as ProposalPayload)?.type !== proposal.proposal_type) {
    res.status(400).json({ error: 'editedPayload.type must match the proposal type' });
    return;
  }

  const editedPayload = decision === 'edit' ? (req.body.editedPayload as ProposalPayload) : null;
  repo.recordDecision(proposalId, decision, editedPayload);
  res.json({ proposal: repo.findProposalById(proposalId) });
});

// POST /intake/:id/commit
intakeRouter.post('/:id/commit', requireRole('admin', 'editor'), requireFlag('ai_intake'), (req, res) => {
  try {
    const result = commitIntakeItem(paramStr(req.params.id), req.user!.userId);
    res.json(result);
  } catch (error) {
    if (error instanceof IntakeCommitError) {
      res.status(409).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Commit failed: ' + String(error instanceof Error ? error.message : error) });
  }
});
