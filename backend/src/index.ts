import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDataDirectories } from './services/init.js';
import { createLogger } from './services/logger.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { apiRouter } from './routes/api.js';
import { initializeDatabase, closeDatabase } from './db/connection.js';
import { runMigrations } from './db/migrator.js';
import { pruneExpiredTokens } from './services/tokenPruning.js';
import { firstRunCheck } from './middleware/firstRun.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const logger = createLogger();

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan(process.env.LOG_FORMAT === 'json' ? 'combined' : 'dev'));
app.use(firstRunCheck);

// API routes
app.use('/api', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api', apiRouter);

// Serve frontend static files in production
if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.join(__dirname, '../../frontend/dist');
  // Hashed assets (e.g. /assets/PeoplePage-abc123.js) are safe to cache long-term.
  // index.html must never be cached — it references those hashed filenames and must
  // always be fresh so stale chunk errors don't occur after a redeploy.
  app.use(express.static(frontendDist, {
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    },
  }));
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Initialize and start
async function start() {
  try {
    initializeDataDirectories(logger);

    const db = initializeDatabase(logger);
    const migrationsDir = path.join(__dirname, 'migrations');
    runMigrations(db, migrationsDir, logger);

    // Data backfills (idempotent — only process rows missing computed values)
    const { backfillMarriageSortKeys } = await import('./db/backfill.js');
    backfillMarriageSortKeys(db, logger);

    pruneExpiredTokens(logger);

    logger.info(`Starting AFT server on port ${PORT}`);
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`AFT server running at http://0.0.0.0:${PORT}`);

      // Thumbnails are generated after the server is already answering
      // requests, never before: decoding a few hundred scans must not delay
      // startup, and every card falls back to the original until its
      // thumbnail lands. Idempotent, so it also self-heals any row whose
      // upload-time generation failed.
      import('./services/thumbnails.js')
        .then(({ backfillThumbnails }) => backfillThumbnails(logger))
        .catch((error) => logger.error('Thumbnail backfill failed to start:', error));
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  closeDatabase(logger);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();

export { app };
