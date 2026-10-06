/**
 * Seeds a known development account so local UI work does not require anyone to
 * remember or reset a password. The credentials below are deliberately committed:
 * they are only ever usable against a local development database, and having them
 * in the repository is what makes the script useful.
 *
 * Run with:  npm run seed:dev -w backend
 *
 * This script mints an admin account, so the guards below matter more than the
 * convenience does. It refuses to run unless NODE_ENV is explicitly 'development'
 * or 'test', and it refuses to touch the container data directory that production
 * uses. Both checks fail closed — an unset NODE_ENV is treated as unsafe rather
 * than assumed to be development.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../services/logger.js';
import { initializeDataDirectories } from '../services/init.js';
import { initializeDatabase, closeDatabase } from '../db/connection.js';
import { runMigrations } from '../db/migrator.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { hashPassword } from '../services/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Throwaway development credentials. Not a secret — see the file header. */
export const DEV_USER = {
  email: 'dev@localhost.test',
  display_name: 'Dev Admin',
  password: 'devpassword123',
  role: 'admin' as const,
};

/** The path the production container mounts its data volume at. */
const PRODUCTION_DATA_DIR = '/app/data';

function assertSafeToSeed(resolvedDataDir: string): void {
  const env = process.env.NODE_ENV;

  if (env !== 'development' && env !== 'test') {
    throw new Error(
      `Refusing to seed: NODE_ENV is ${env ? `'${env}'` : 'unset'}, expected 'development' or 'test'. ` +
        'This script creates an admin account with a published password, so it fails closed.'
    );
  }

  const normalized = path.resolve(resolvedDataDir);
  if (normalized === PRODUCTION_DATA_DIR || normalized.startsWith(`${PRODUCTION_DATA_DIR}${path.sep}`)) {
    throw new Error(
      `Refusing to seed: DATA_DIR resolves to ${normalized}, which is the production data volume. ` +
        'Point DATA_DIR at a local development directory instead.'
    );
  }
}

async function seed(): Promise<void> {
  const logger = createLogger();
  const dataDir = process.env.DATA_DIR || PRODUCTION_DATA_DIR;

  assertSafeToSeed(dataDir);
  logger.info(`Seeding development account into ${path.resolve(dataDir)}`);

  initializeDataDirectories(logger);
  const db = initializeDatabase(logger);
  runMigrations(db, path.join(__dirname, '..', 'migrations'), logger);

  const users = new UserRepository();
  const passwordHash = await hashPassword(DEV_USER.password);
  const existing = users.findByEmail(DEV_USER.email);

  if (existing) {
    // Re-seeding resets the password rather than failing, so the account stays
    // usable even if someone has changed it while testing.
    users.updatePassword(existing.id, passwordHash);
    logger.info(`Reset password for existing development account ${DEV_USER.email}`);
  } else {
    users.create({
      email: DEV_USER.email,
      display_name: DEV_USER.display_name,
      password_hash: passwordHash,
      role: DEV_USER.role,
    });
    logger.info(`Created development account ${DEV_USER.email}`);
  }

  closeDatabase(logger);

  // Printed rather than logged so the credentials are obvious at the terminal.
  console.log(`\n  Sign in at http://localhost:5173/`);
  console.log(`    email:    ${DEV_USER.email}`);
  console.log(`    password: ${DEV_USER.password}\n`);
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
