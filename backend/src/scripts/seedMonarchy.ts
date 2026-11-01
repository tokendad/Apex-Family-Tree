/**
 * Applies the British monarchy demonstration tree to a database.
 *
 * Run with:  npm run seed:monarchy -w backend
 *            DATA_DIR=/path/to/data npm run seed:monarchy -w backend
 *
 * WHY THIS IS A SCRIPT AND NOT A MIGRATION. Anything in src/migrations runs
 * automatically on every instance the moment the image is pulled, production
 * included. Demo data must never arrive that way, so it is applied on purpose
 * or not at all.
 *
 * THE GUARD IS ABOUT CONTENT, NOT ENVIRONMENT. seedDevUser refuses to run
 * outside NODE_ENV=development and refuses to touch /app/data, which is right
 * for minting an admin account but wrong here: the development container runs
 * with NODE_ENV=production and its data directory IS /app/data. Checking the
 * environment would block the one database this is for while still allowing a
 * misdirected DATA_DIR to overwrite a real one.
 *
 * So the question asked instead is whether the target already holds somebody
 * else's people. Every row this seed writes has an id beginning `mon-`. If the
 * database contains a person that does not, it is somebody's archive and the
 * script stops. That is true wherever it is pointed and whatever NODE_ENV says.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../services/logger.js';
import { initializeDatabase, closeDatabase } from '../db/connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = createLogger();

/** Every id the seed writes carries this prefix. */
const SEED_PREFIX = 'mon-';

function main(): void {
  const db = initializeDatabase(logger);

  try {
    const foreign = db.prepare(
      `SELECT COUNT(*) AS n FROM persons WHERE id NOT LIKE '${SEED_PREFIX}%'`,
    ).get() as { n: number };

    if (foreign.n > 0) {
      logger.error(
        `Refusing to seed: this database already holds ${foreign.n} ${foreign.n === 1 ? 'person' : 'people'} ` +
        `that the demo seed did not create. It looks like a real archive. ` +
        `Point DATA_DIR at a database meant for development.`,
      );
      process.exitCode = 1;
      return;
    }

    const sqlPath = path.join(__dirname, '..', 'seeds', 'british-monarchy.sql');
    if (!fs.existsSync(sqlPath)) {
      logger.error(`Seed file not found at ${sqlPath}`);
      process.exitCode = 1;
      return;
    }

    /* The seed guards every insert on its own id, so this is safe to re-run:
       applying it twice adds nothing and changes nothing. */
    db.exec(fs.readFileSync(sqlPath, 'utf8'));

    const counts = db.prepare(
      `SELECT (SELECT COUNT(*) FROM persons) AS people,
              (SELECT COUNT(*) FROM families) AS families,
              (SELECT COUNT(*) FROM events) AS events,
              (SELECT COUNT(*) FROM claims) AS claims`,
    ).get() as { people: number; families: number; events: number; claims: number };

    logger.info(
      `Seeded the monarchy tree: ${counts.people} people, ${counts.families} families, ` +
      `${counts.events} events, ${counts.claims} claims.`,
    );
  } finally {
    closeDatabase(logger);
  }
}

main();
