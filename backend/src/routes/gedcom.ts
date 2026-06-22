import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { requireRole } from '../middleware/auth.js';
import { ImportRepository } from '../repositories/ImportRepository.js';
import { getDataPath } from '../services/init.js';
import { validateGedcom, processImport, analyzeMerge } from '../services/gedcom/importService.js';
import { startExport, type ExportOptions } from '../services/gedcom/exportService.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.ged' || ext === '.gedcom') {
      cb(null, true);
    } else {
      cb(new Error('Only .ged or .gedcom files are accepted'));
    }
  },
});

export const gedcomRouter = Router();

// ─── Import Routes ──────────────────────────────────────────────────────────

// POST /gedcom/import — Upload and start import
gedcomRouter.post(
  '/import',
  requireRole('admin', 'editor'),
  upload.single('file'),
  (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const importRepo = new ImportRepository();
      const job = importRepo.createJob({
        user_id: req.user!.userId,
        filename: req.file.originalname,
        file_size: req.file.size,
      });

      const content = req.file.buffer.toString('utf-8');

      // Store file content for later processing
      const importsDir = getDataPath('imports');
      if (!fs.existsSync(importsDir)) {
        fs.mkdirSync(importsDir, { recursive: true });
      }
      fs.writeFileSync(path.join(importsDir, `${job.id}.ged`), content, 'utf-8');

      const mode = req.body?.mode === 'merge' ? 'merge' : 'new';

      // Validate
      const validation = validateGedcom(job.id, content);

      const responseBody: Record<string, unknown> = {
        job: importRepo.findJobById(job.id),
        validation: {
          valid: validation.valid,
          stats: validation.stats,
          version: validation.version,
          encoding: validation.encoding,
          warnings: validation.warnings,
          conflictCount: validation.conflicts.length,
        },
      };

      if (mode === 'merge') {
        responseBody.mergeAnalysis = analyzeMerge(job.id, content);
      }

      res.status(201).json(responseBody);
    } catch (error) {
      res.status(500).json({ error: 'Import failed: ' + String(error) });
    }
  },
);

// GET /gedcom/import/:jobId — Get import job status
gedcomRouter.get('/import/:jobId', (req: Request, res: Response) => {
  try {
    const importRepo = new ImportRepository();
    const job = importRepo.findJobById(String(req.params.jobId));
    if (!job) {
      res.status(404).json({ error: 'Import job not found' });
      return;
    }
    res.json({ job });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get import status' });
  }
});

// GET /gedcom/import/:jobId/conflicts — Get unresolved conflicts
gedcomRouter.get('/import/:jobId/conflicts', (req: Request, res: Response) => {
  try {
    const importRepo = new ImportRepository();
    const job = importRepo.findJobById(String(req.params.jobId));
    if (!job) {
      res.status(404).json({ error: 'Import job not found' });
      return;
    }
    const conflicts = importRepo.findUnresolvedConflicts(job.id);
    res.json({ conflicts });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get conflicts' });
  }
});

// POST /gedcom/import/:jobId/conflicts — Resolve conflicts (bulk)
gedcomRouter.post(
  '/import/:jobId/conflicts',
  requireRole('admin', 'editor'),
  (req: Request, res: Response) => {
    try {
      const importRepo = new ImportRepository();
      const job = importRepo.findJobById(String(req.params.jobId));
      if (!job) {
        res.status(404).json({ error: 'Import job not found' });
        return;
      }

      const resolutions = req.body.resolutions as { id: string; resolution: 'skip' | 'overwrite' | 'merge' }[];
      if (!Array.isArray(resolutions)) {
        res.status(400).json({ error: 'resolutions must be an array of { id, resolution }' });
        return;
      }

      for (const r of resolutions) {
        importRepo.resolveConflict(r.id, r.resolution);
      }

      const remaining = importRepo.findUnresolvedConflicts(job.id);
      res.json({ resolved: resolutions.length, remaining: remaining.length });
    } catch (error) {
      res.status(500).json({ error: 'Failed to resolve conflicts' });
    }
  },
);

// POST /gedcom/import/:jobId/decisions — Save merge decisions
gedcomRouter.post(
  '/import/:jobId/decisions',
  requireRole('admin', 'editor'),
  (req: Request, res: Response) => {
    try {
      const repo = new ImportRepository();
      const jobId = req.params.jobId as string;
      const decisions = (req.body?.decisions ?? []) as Array<{
        xref: string;
        decision: 'same' | 'new';
        candidatePersonId: string | null;
        fieldResolutions: Record<string, 'old' | 'new'>;
      }>;
      for (const d of decisions) {
        repo.saveMergeDecision({
          import_job_id: jobId,
          xref: d.xref,
          decision: d.decision,
          candidate_person_id: d.candidatePersonId,
          field_resolutions: JSON.stringify(d.fieldResolutions ?? {}),
        });
      }
      res.json({ saved: decisions.length });
    } catch {
      res.status(500).json({ error: 'Failed to save decisions' });
    }
  },
);

// POST /gedcom/import/:jobId/process — Start processing after conflict resolution
gedcomRouter.post(
  '/import/:jobId/process',
  requireRole('admin', 'editor'),
  (req: Request, res: Response) => {
    try {
      const importRepo = new ImportRepository();
      const job = importRepo.findJobById(String(req.params.jobId));
      if (!job) {
        res.status(404).json({ error: 'Import job not found' });
        return;
      }

      if (job.status !== 'awaiting_review' && job.status !== 'processing') {
        res.status(400).json({ error: `Cannot process job in '${job.status}' status` });
        return;
      }

      // Read stored file
      const filePath = path.join(getDataPath('imports'), `${job.id}.ged`);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'Import file not found on disk' });
        return;
      }
      const content = fs.readFileSync(filePath, 'utf-8');

      const mode = req.body?.mode === 'merge' ? 'merge' : 'new';
      const stats = processImport(job.id, content, req.user!.userId, mode);
      const updatedJob = importRepo.findJobById(job.id);

      res.json({ job: updatedJob, stats });
    } catch (error) {
      res.status(500).json({ error: 'Processing failed: ' + String(error) });
    }
  },
);

// ─── Export Routes ──────────────────────────────────────────────────────────

// POST /gedcom/export — Start export
gedcomRouter.post(
  '/export',
  requireRole('admin', 'editor'),
  (req: Request, res: Response) => {
    try {
      const { gedcom_version, scope, media_option, scope_person_id, scope_start_date, scope_end_date } = req.body;

      if (!gedcom_version || !['5.5.1', '7.0'].includes(gedcom_version)) {
        res.status(400).json({ error: 'gedcom_version must be "5.5.1" or "7.0"' });
        return;
      }
      if (!scope || !['full', 'ancestors', 'descendants', 'date_range'].includes(scope)) {
        res.status(400).json({ error: 'scope must be one of: full, ancestors, descendants, date_range' });
        return;
      }

      const options: ExportOptions = {
        userId: req.user!.userId,
        gedcomVersion: gedcom_version,
        scope,
        mediaOption: media_option || 'links',
        scopePersonId: scope_person_id,
        scopeStartDate: scope_start_date,
        scopeEndDate: scope_end_date,
      };

      const job = startExport(options);
      res.status(201).json({ job });
    } catch (error) {
      res.status(500).json({ error: 'Export failed: ' + String(error) });
    }
  },
);

// GET /gedcom/export/:jobId — Get export status
gedcomRouter.get('/export/:jobId', (req: Request, res: Response) => {
  try {
    const importRepo = new ImportRepository();
    const job = importRepo.findExportById(String(req.params.jobId));
    if (!job) {
      res.status(404).json({ error: 'Export job not found' });
      return;
    }
    res.json({ job });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get export status' });
  }
});

// GET /gedcom/export/:jobId/download — Download export file
gedcomRouter.get('/export/:jobId/download', (req: Request, res: Response) => {
  try {
    const importRepo = new ImportRepository();
    const job = importRepo.findExportById(String(req.params.jobId));
    if (!job) {
      res.status(404).json({ error: 'Export job not found' });
      return;
    }
    if (job.status !== 'completed' || !job.file_path) {
      res.status(400).json({ error: 'Export not ready for download' });
      return;
    }
    if (!fs.existsSync(job.file_path)) {
      res.status(404).json({ error: 'Export file not found on disk' });
      return;
    }
    res.download(job.file_path, `export_${job.id}.ged`);
  } catch (error) {
    res.status(500).json({ error: 'Download failed' });
  }
});
