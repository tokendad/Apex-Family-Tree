import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ClaimRepository } from '../repositories/ClaimRepository.js';
import type { ArchivePrivacyLevel } from '../types/archive.js';
import type { ClaimStatus, EvidenceRole } from '../types/claim.js';

export const claimsRouter = Router();

const PRIVACY_LEVELS: ArchivePrivacyLevel[] = ['public', 'family', 'private', 'restricted'];
const CLAIM_STATUSES: ClaimStatus[] = ['open', 'supported', 'conflicted', 'rejected', 'unknown'];
const EVIDENCE_ROLES: EvidenceRole[] = ['supports', 'contradicts', 'mentions', 'uncertain'];

function paramStr(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

function cleanOptional(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function numberOptional(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function claimBody(body: Record<string, unknown>) {
  return {
    statement: typeof body.statement === 'string' ? body.statement.trim() : undefined,
    title: typeof body.title === 'string' ? body.title.trim() : undefined,
    summary: cleanOptional(body.summary),
    privacy_level: typeof body.privacy_level === 'string' ? body.privacy_level as ArchivePrivacyLevel : undefined,
    claim_type: cleanOptional(body.claim_type),
    subject_object_id: cleanOptional(body.subject_object_id),
    date_text: cleanOptional(body.date_text),
    date_start: cleanOptional(body.date_start),
    date_end: cleanOptional(body.date_end),
    confidence_level_id: cleanOptional(body.confidence_level_id),
    confidence_score: numberOptional(body.confidence_score),
    status: typeof body.status === 'string' ? body.status as ClaimStatus : undefined,
    notes: cleanOptional(body.notes),
  };
}

claimsRouter.get('/confidence-levels', (_req, res) => {
  try {
    const repo = new ClaimRepository();
    res.json({ data: repo.findConfidenceLevels() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list confidence levels' });
  }
});

claimsRouter.get('/evidence/:objectId', (req, res) => {
  try {
    const repo = new ClaimRepository();
    res.json({ data: repo.findClaimsForEvidence(paramStr(req.params.objectId)) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list claims for evidence' });
  }
});

claimsRouter.get('/', (req, res) => {
  try {
    const repo = new ClaimRepository();
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const cursor = req.query.cursor as string | undefined;
    const search = req.query.q as string | undefined;
    res.json(repo.findAll({ limit, cursor, search }));
  } catch (error) {
    res.status(500).json({ error: 'Failed to list claims' });
  }
});

claimsRouter.get('/:id', (req, res) => {
  try {
    const repo = new ClaimRepository();
    const id = paramStr(req.params.id);
    const claim = repo.findById(id);
    if (!claim) {
      res.status(404).json({ error: 'Claim not found' });
      return;
    }
    res.json({ ...claim, subjects: repo.findSubjects(id), evidence: repo.findEvidence(id) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get claim' });
  }
});

claimsRouter.post(
  '/',
  requireRole('admin', 'editor', 'limited_editor'),
  validate([
    { field: 'statement', required: true, type: 'string', maxLength: 1000 },
    { field: 'privacy_level', type: 'string', enum: PRIVACY_LEVELS },
    { field: 'status', type: 'string', enum: CLAIM_STATUSES },
  ]),
  (req, res) => {
    try {
      const repo = new ClaimRepository();
      const body = claimBody(req.body as Record<string, unknown>);
      if (!body.statement) {
        res.status(400).json({ error: 'statement is required' });
        return;
      }
      const claim = repo.create({ ...body, statement: body.statement, created_by: req.user?.userId ?? null });
      res.status(201).json(claim);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create claim' });
    }
  },
);

claimsRouter.put(
  '/:id',
  requireRole('admin', 'editor', 'limited_editor'),
  validate([
    { field: 'statement', type: 'string', maxLength: 1000 },
    { field: 'privacy_level', type: 'string', enum: PRIVACY_LEVELS },
    { field: 'status', type: 'string', enum: CLAIM_STATUSES },
  ]),
  (req, res) => {
    try {
      const repo = new ClaimRepository();
      const claim = repo.update(paramStr(req.params.id), {
        ...claimBody(req.body as Record<string, unknown>),
        updated_by: req.user?.userId ?? null,
      });
      if (!claim) {
        res.status(404).json({ error: 'Claim not found' });
        return;
      }
      res.json(claim);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to update claim' });
    }
  },
);

claimsRouter.delete('/:id', requireRole('admin', 'editor'), (req, res) => {
  try {
    const repo = new ClaimRepository();
    const deleted = repo.delete(paramStr(req.params.id), req.user?.userId ?? null);
    if (!deleted) {
      res.status(404).json({ error: 'Claim not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete claim' });
  }
});

claimsRouter.post('/:id/evidence', requireRole('admin', 'editor', 'limited_editor'), (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const evidenceObjectId = cleanOptional(body.evidence_object_id);
    const role = typeof body.evidence_role === 'string' ? body.evidence_role as EvidenceRole : undefined;
    if (!evidenceObjectId) {
      res.status(400).json({ error: 'evidence_object_id is required' });
      return;
    }
    if (role && !EVIDENCE_ROLES.includes(role)) {
      res.status(400).json({ error: 'Invalid evidence role' });
      return;
    }
    const repo = new ClaimRepository();
    const evidence = repo.addEvidence(paramStr(req.params.id), {
      evidence_object_id: evidenceObjectId,
      evidence_role: role,
      evidence_classification_id: cleanOptional(body.evidence_classification_id),
      excerpt: cleanOptional(body.excerpt),
      locator: cleanOptional(body.locator),
      weight_score: numberOptional(body.weight_score),
      confidence_contribution: numberOptional(body.confidence_contribution),
      notes: cleanOptional(body.notes),
    });
    res.status(201).json(evidence);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to add claim evidence' });
  }
});

claimsRouter.delete('/:id/evidence/:evidenceId', requireRole('admin', 'editor'), (req, res) => {
  try {
    const repo = new ClaimRepository();
    const deleted = repo.removeEvidence(paramStr(req.params.id), paramStr(req.params.evidenceId));
    if (!deleted) {
      res.status(404).json({ error: 'Claim evidence not found' });
      return;
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove claim evidence' });
  }
});
