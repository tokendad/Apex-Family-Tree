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
  app.use(express.static(frontendDist));
  app.get('*', (_req, res) => {
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
    pruneExpiredTokens(logger);

    logger.info(`Starting AFT server on port ${PORT}`);
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`AFT server running at http://0.0.0.0:${PORT}`);
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
