import { Router } from 'express';
import { APP_VERSION } from '../services/version.js';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'apex-family-tree',
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
  });
});
