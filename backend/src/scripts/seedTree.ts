/**
 * Applies a GEDCOM file to a database as development seed data.
 *
 * Run with:  npm run seed:tree -w backend
 *            npm run seed:tree -w backend -- /path/to/tree.ged
 *            DATA_DIR=/path/to/data npm run seed:tree -w backend
 *
 * Replaces the hand-written British monarchy seed, which was 25 people and too
 * small to show what the app does with a real archive: paging, the tree
 * renderer at depth, duplicate detection, the places and events pages. The
 * default file is the example Queen tree -- see src/seeds/README.md for where
 * it comes from and how to regenerate it.
 *
 * WHY THIS IS A SCRIPT AND NOT A MIGRATION. Anything in src/migrations runs
 * automatically on every instance the moment the image is pulled, production
 * included. Demo data must never arrive that way, so it is applied on purpose
 * or not at all.
 *
 * THE GUARD IS ABOUT CONTENT, NOT ENVIRONMENT. The development container runs
 * with NODE_ENV=production and its data directory IS /app/data, so checking
 * either would block the one database this is for while still allowing a
 * misdirected DATA_DIR to overwrite a real one. What is asked instead is
 * whether the target already holds people. It must be empty.
 *
 * The monarchy seed could be re-run over itself, because it knew the id of
 * every row it wrote and could guard each insert. This one goes through the
 * GEDCOM importer, which mints fresh ids on every run, so a second run would
 * silently double the archive. Refusing a non-empty database is what replaces
 * that guard -- which also means it refuses to overwrite a real one.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../services/logger.js';
import { initializeDataDirectories } from '../services/init.js';
import { initializeDatabase, closeDatabase, getDatabase } from '../db/connection.js';
import { runMigrations } from '../db/migrator.js';
import { ImportRepository } from '../repositories/ImportRepository.js';
import { validateGedcom, processImport } from '../services/gedcom/importService.js';
import { runWithFlags } from '../services/requestContext.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = createLogger();

/** The tree used when no file is named. */
const DEFAULT_SEED = path.join(__dirname, '..', 'seeds', 'queen.ged');

function resolveSeedPath(): string {
  return process.argv[2] || process.env.SEED_GEDCOM || DEFAULT_SEED;
}

/**
 * The import is recorded against a real account, the way an upload through the
 * UI would be: import_jobs.user_id is a foreign key, and the audit trail should
 * name somebody. The oldest admin is the instance owner in every case this
 * script is for.
 */
function findSeedUserId(): string | null {
  const row = getDatabase().prepare(
    `SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC, id ASC LIMIT 1`,
  ).get() as { id: string } | undefined;
  return row?.id ?? null;
}

function main(): void {
  const seedPath = resolveSeedPath();

  if (!fs.existsSync(seedPath)) {
    logger.error(
      `Seed file not found at ${seedPath}. ` +
      'Put a GEDCOM there, or name one: npm run seed:tree -w backend -- /path/to/tree.ged. ' +
      'src/seeds/README.md says where the default tree comes from.',
    );
    process.exitCode = 1;
    return;
  }

  initializeDataDirectories(logger);
  const db = initializeDatabase(logger);

  try {
    // A fresh development directory has no schema yet, and the seed should work
    // there without starting the server first.
    runMigrations(db, path.join(__dirname, '..', 'migrations'), logger);

    const existing = db.prepare('SELECT COUNT(*) AS n FROM persons').get() as { n: number };
    if (existing.n > 0) {
      logger.error(
        `Refusing to seed: this database already holds ${existing.n} ${existing.n === 1 ? 'person' : 'people'}. ` +
        'The GEDCOM importer mints new ids on every run, so seeding over them would duplicate the whole tree ' +
        'rather than update it. Point DATA_DIR at an empty database, or remove the existing one first ' +
        '(the schema is recreated on the next start).',
      );
      process.exitCode = 1;
      return;
    }

    const userId = findSeedUserId();
    if (!userId) {
      logger.error(
        'Refusing to seed: no admin account exists to record the import against. ' +
        'Run npm run seed:dev -w backend first, or create the owner account through the setup page.',
      );
      process.exitCode = 1;
      return;
    }

    const content = fs.readFileSync(seedPath, 'utf-8');
    const importRepo = new ImportRepository();
    const job = importRepo.createJob({
      user_id: userId,
      filename: path.basename(seedPath),
      file_size: Buffer.byteLength(content),
    });

    const validation = validateGedcom(job.id, content);
    for (const warning of validation.warnings) logger.warn(`GEDCOM warning: ${warning}`);

    if (!validation.valid) {
      logger.error(`Refusing to seed: ${seedPath} did not validate as GEDCOM.`);
      process.exitCode = 1;
      return;
    }

    logger.info(
      `Seeding ${path.basename(seedPath)}: ${validation.stats.persons} people, ` +
      `${validation.stats.families} families.`,
    );

    /* The same bulk context the import route uses. processImport writes
       thousands of rows through the repositories, and one audit entry per row
       would bury every hand edit made afterwards; the per-record detail is
       already in import_audit_log. */
    const stats = runWithFlags(
      { bulkSource: 'import' },
      () => processImport(job.id, content, userId, 'new'),
    );

    const counts = db.prepare(
      `SELECT (SELECT COUNT(*) FROM persons) AS people,
              (SELECT COUNT(*) FROM families) AS families,
              (SELECT COUNT(*) FROM events) AS events`,
    ).get() as { people: number; families: number; events: number };

    logger.info(
      `Seeded ${path.basename(seedPath)}: ${counts.people} people, ${counts.families} families, ` +
      `${counts.events} events (importer reported ${stats.persons} people, ${stats.citations} citations).`,
    );
  } finally {
    closeDatabase(logger);
  }
}

main();
