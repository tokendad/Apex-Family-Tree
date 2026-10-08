import Database from 'better-sqlite3';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;
// Only getDatabase is swapped; registerCustomFunctions stays real, since the
// migration chain this fixture runs depends on the custom SQL functions.
vi.mock('../../db/connection.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../db/connection.js')>();
  return { ...actual, getDatabase: () => db };
});

const { registerCustomFunctions } = await import('../../db/connection.js');
const { runMigrations } = await import('../../db/migrator.js');
const { processImport, validateGedcom } = await import('./importService.js');
const { ImportRepository } = await import('../../repositories/ImportRepository.js');

const migrationsDir = path.resolve(process.cwd(), 'src/migrations');
const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

/**
 * A GEDCOM shaped like a real Ancestry-via-Gramps export: citations on the
 * individual, on its NAME, on an event, and on the family.
 */
const GED = [
  '0 HEAD',
  '1 GEDC',
  '2 VERS 5.5.1',
  '1 CHAR UTF-8',
  '0 @S0010@ SOUR',
  '1 TITL 1930 United States Federal Census',
  '1 AUTH Ancestry.com',
  '0 @S0017@ SOUR',
  '1 TITL Muster Rolls of U.S. Navy Ships',
  '0 @I0188@ INDI',
  '1 NAME Raymond Earl /LeFort/ Sr',
  '2 GIVN Raymond Earl',
  '2 SURN LeFort',
  '2 NSFX Sr',
  '2 SOUR @S0017@',
  '3 PAGE National Archives at College Park; Record Group 24',
  '3 _APID 1,1143::28098456',
  '1 SEX M',
  '1 BIRT',
  '2 DATE 5 JAN 1922',
  '2 PLAC Massachusetts',
  '2 SOUR @S0010@',
  '3 PAGE Year: 1930; Census Place: Worcester',
  '3 DATA',
  '4 TEXT Birth date: abt 1923 Birth place: Massachusetts',
  '1 FAMS @F0098@',
  '1 SOUR @S0010@',
  '2 PAGE Household record',
  '0 @I0189@ INDI',
  '1 NAME Eunice Louise /Lagor/',
  '1 SEX F',
  '1 FAMS @F0098@',
  '0 @F0098@ FAM',
  '1 HUSB @I0188@',
  '1 WIFE @I0189@',
  '1 MARR',
  '2 DATE 6 JUN 1945',
  '2 SOUR @S0010@',
  '3 PAGE Marriage certificate no. 42',
  '1 SOUR @S0017@',
  '2 PAGE Marriage register, p. 14',
  '0 TRLR',
].join('\n');

function startJob(filename: string, content: string) {
  return new ImportRepository().createJob({
    user_id: 'u1',
    filename,
    file_size: content.length,
  });
}

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  registerCustomFunctions(db);
  runMigrations(db, migrationsDir, logger);
  // import_jobs.user_id is a real foreign key.
  db.prepare(
    "INSERT INTO users (id, email, display_name, password_hash, role) VALUES ('u1', 'importer@example.com', 'Importer', 'x', 'admin')",
  ).run();
});

afterEach(() => {
  db.close();
});

describe('GEDCOM import — source citations', () => {
  it('writes a citation for the individual, its name, its event and the family', () => {
    const job = startJob('citations.ged', GED);
    const stats = processImport(job.id, GED, 'u1', 'new');

    expect(stats.citations).toBe(5);

    const rows = db
      .prepare(
        `SELECT s.title, c.page, c.notes,
                c.person_id IS NOT NULL AS on_person,
                c.family_id IS NOT NULL AS on_family,
                c.event_id  IS NOT NULL AS on_event
           FROM source_citations c JOIN sources s ON s.id = c.source_id
          ORDER BY c.page`,
      )
      .all() as Array<Record<string, unknown>>;

    expect(rows).toHaveLength(5);

    // Subjects: two on the person (record-level and NAME-level), one on the
    // birth event, one on the family.
    expect(rows.filter((r) => r.on_person === 1)).toHaveLength(2);
    expect(rows.filter((r) => r.on_event === 1)).toHaveLength(2);
    expect(rows.filter((r) => r.on_family === 1)).toHaveLength(1);

    // Each citation resolves to the right source and keeps its locator.
    const byPage = new Map(rows.map((r) => [r.page as string, r]));
    expect(byPage.get('Household record')!.title).toBe('1930 United States Federal Census');
    expect(byPage.get('Marriage register, p. 14')!.title).toBe('Muster Rolls of U.S. Navy Ships');
    expect(byPage.get('Year: 1930; Census Place: Worcester')!.notes).toContain(
      'Birth date: abt 1923',
    );
  });

  it('keeps the Ancestry _APID pointer in the citation notes', () => {
    const job = startJob('apid.ged', GED);
    processImport(job.id, GED, 'u1', 'new');

    const row = db
      .prepare("SELECT notes FROM source_citations WHERE page LIKE 'National Archives%'")
      .get() as { notes: string };
    expect(row.notes).toContain('Ancestry _APID: 1,1143::28098456');
  });

  it('counts citations during validation, before anything is written', () => {
    const job = startJob('validate.ged', GED);
    const result = validateGedcom(job.id, GED);

    expect(result.valid).toBe(true);
    expect(result.stats.citations).toBe(5);
    expect(db.prepare('SELECT COUNT(*) c FROM source_citations').get()).toEqual({ c: 0 });
  });

  it('skips a citation whose source xref is unknown without failing the import', () => {
    const dangling = GED.replace('1 SOUR @S0010@\n2 PAGE Household record', '1 SOUR @S9999@\n2 PAGE Household record');
    const job = startJob('dangling.ged', dangling);
    const stats = processImport(job.id, dangling, 'u1', 'new');

    // The other three still land, and the person is still imported.
    expect(stats.citations).toBe(4);
    expect(stats.persons).toBe(2);
    expect(stats.warnings.join(' ')).toContain('@S9999@');

    const skipped = db
      .prepare("SELECT details FROM import_audit_log WHERE action = 'skipped' AND xref = '@S9999@'")
      .get() as { details: string } | undefined;
    expect(skipped?.details).toContain('source xref did not resolve');
  });

  it('reports inline SOUR text as a warning instead of discarding it silently', () => {
    const inline = GED.replace(
      '1 SOUR @S0010@\n2 PAGE Household record',
      '1 SOUR Family bible in my possession\n2 PAGE Flyleaf',
    );
    const job = startJob('inline.ged', inline);
    const stats = processImport(job.id, inline, 'u1', 'new');

    expect(stats.citations).toBe(4);
    expect(stats.warnings.join(' ')).toMatch(/inline SOUR/i);
  });

  it('keeps a MARR citation even though the marriage event is written twice', () => {
    const job = startJob('marr.ged', GED);
    processImport(job.id, GED, 'u1', 'new');

    // A marriage arrives both as marriageDate/marriagePlace and inside
    // family.events. The second pass finds the event already created and must
    // attach the citation to it rather than skipping both.
    const row = db
      .prepare(
        `SELECT e.event_type, e.family_id IS NOT NULL AS on_family_event, s.title
           FROM source_citations c
           JOIN events e ON e.id = c.event_id
           JOIN sources s ON s.id = c.source_id
          WHERE c.page = 'Marriage certificate no. 42'`,
      )
      .get() as { event_type: string; on_family_event: number; title: string } | undefined;

    expect(row).toBeDefined();
    expect(row!.event_type).toBe('marriage');
    expect(row!.on_family_event).toBe(1);
    expect(row!.title).toBe('1930 United States Federal Census');

    // And the marriage itself is still a single event.
    expect(db.prepare("SELECT COUNT(*) c FROM events WHERE event_type = 'marriage'").get()).toEqual({ c: 1 });
  });

  it('does not duplicate a person\'s citations when an overwrite replaces their records', () => {
    const countFor = (gedcomId: string) =>
      (
        db
          .prepare(
            `SELECT COUNT(*) c FROM source_citations c
               JOIN persons p ON p.id = c.person_id
              WHERE p.gedcom_id = ?`,
          )
          .get(gedcomId) as { c: number }
      ).c;

    const first = startJob('first.ged', GED);
    processImport(first.id, GED, 'u1', 'new');
    expect(countFor('@I0188@')).toBe(2);

    // A second import of the same file, resolving the xref conflict as overwrite.
    const second = startJob('second.ged', GED);
    const validation = validateGedcom(second.id, GED);
    const importRepo = new ImportRepository();
    for (const conflict of validation.conflicts) {
      importRepo.resolveConflict(conflict.id, 'overwrite');
    }
    processImport(second.id, GED, 'u1', 'new');

    // Still 2, not 4: the overwrite clears the person's citations before
    // rewriting them, the same way it clears their names and events.
    expect(countFor('@I0188@')).toBe(2);

    // The event citation rode along with its event via ON DELETE CASCADE.
    const orphaned = db
      .prepare(
        `SELECT COUNT(*) c FROM source_citations
          WHERE event_id IS NOT NULL
            AND event_id NOT IN (SELECT id FROM events)`,
      )
      .get() as { c: number };
    expect(orphaned.c).toBe(0);
  });
});
