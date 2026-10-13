import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';

/* The script is run end to end against a throwaway database rather than
   imported, because what is being tested is the thing that makes it safe to
   point at a real archive: a dry run writes nothing, an apply writes
   everything, and a second apply writes nothing again. None of that is
   visible from inside a function. */

const scriptPath = path.resolve(process.cwd(), 'src/scripts/curate.ts');
let dir: string;
let dbPath: string;

const run = (args: string[]) =>
  execFileSync('npx', ['tsx', scriptPath, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, DATA_DIR: dir, NODE_ENV: 'test' },
    encoding: 'utf-8',
  });

const changeSet = {
  description: 'Walter Higgins Sr, from his birth certificate',
  ops: [
    {
      op: 'person.create',
      ref: 'william',
      match: { given_name: 'William', surname: 'Higgins' },
      given_name: 'William',
      middle_name: 'Elliott',
      surname: 'Higgins',
      sex: 'M',
      note: "named as the father on Walter Sr's birth certificate",
    },
    {
      op: 'person.create',
      ref: 'walter',
      given_name: 'Walter',
      surname: 'Higgins',
      suffix: 'Sr',
      sex: 'M',
    },
    {
      op: 'event.set',
      person: { ref: 'walter' },
      event_type: 'birth',
      event_date: '1919-02-07',
      event_place: 'Worcester, Massachusetts',
    },
    {
      op: 'family.set',
      spouse1: { ref: 'william' },
      children: [{ ref: 'walter' }],
    },
    {
      op: 'person.addName',
      person: { ref: 'walter' },
      name_type: 'aka',
      given_name: 'Walter',
      middle_name: 'S.',
      surname: 'Higgins',
    },
  ],
};

const openDb = async () => {
  const Database = (await import('better-sqlite3')).default;
  return new Database(dbPath, { readonly: true });
};

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'curate-'));
  dbPath = path.join(dir, 'treeroots.db');
  fs.writeFileSync(path.join(dir, 'changes.json'), JSON.stringify(changeSet));

  // A real archive the script could be pointed at: migrated by the
  // application, which is the only thing that ever migrates it.
  const Database = (await import('better-sqlite3')).default;
  const { registerCustomFunctions } = await import('../db/connection.js');
  const { runMigrations } = await import('../db/migrator.js');
  const db = new Database(dbPath);
  registerCustomFunctions(db);
  runMigrations(db, path.resolve(process.cwd(), 'src/migrations'),
    { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} });
  // Somebody for the audit log to name.
  db.prepare(
    `INSERT INTO users (id, email, display_name, password_hash, role, status)
     VALUES ('u1', 'keeper@example.com', 'Keeper', 'x', 'admin', 'active')`,
  ).run();
  db.close();
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const countPeople = async () => {
  const db = await openDb();
  const row = db.prepare('SELECT COUNT(*) AS n FROM persons').get() as { n: number };
  db.close();
  return row.n;
};

describe('curate', () => {
  it('writes nothing on a dry run', async () => {
    const output = run([path.join(dir, 'changes.json')]);

    expect(output).toContain('Dry run');
    expect(output).toContain('rolled back');
    expect(await countPeople()).toBe(0);
  }, 60000);

  it('reports what it would do', async () => {
    const output = run([path.join(dir, 'changes.json')]);

    expect(output).toContain('person William Elliott Higgins');
    expect(output).toContain('birth for Walter Higgins Sr');
    expect(output).toContain('6 created, 0 updated, 0 unchanged');
  }, 60000);

  it('writes everything when applied, and nothing the second time', async () => {
    const applied = run([path.join(dir, 'changes.json'), '--apply', '--as', 'keeper@example.com']);
    expect(applied).toContain('6 created');
    expect(applied).toContain('Backup:');
    expect(await countPeople()).toBe(2);

    const db = await openDb();
    const birth = db.prepare(
      `SELECT e.event_date, e.event_place, e.event_date_sort_key FROM events e
       JOIN names n ON n.person_id = e.person_id AND n.is_primary = 1
       WHERE n.suffix = 'Sr' AND e.event_type = 'birth'`,
    ).get() as { event_date: string; event_place: string; event_date_sort_key: number };
    // Through the repository, so the sort key the UI orders on is derived --
    // the reason this is not a pile of INSERT statements.
    expect(birth).toMatchObject({
      event_date: '1919-02-07',
      event_place: 'Worcester, Massachusetts',
      event_date_sort_key: 19190207,
    });
    // And an archive object beside the person, as the API would have made.
    const objects = db.prepare(
      "SELECT COUNT(*) AS n FROM archive_objects WHERE object_type = 'person'",
    ).get() as { n: number };
    expect(objects.n).toBe(2);
    // Attributed, not anonymous.
    const audit = db.prepare(
      "SELECT COUNT(*) AS n FROM audit_log WHERE user_id = 'u1'",
    ).get() as { n: number };
    expect(audit.n).toBeGreaterThan(0);
    db.close();

    /* Re-running a change set must be safe: the notes arrive in waves and the
       same file gets applied again with one more op in it. */
    const again = run([path.join(dir, 'changes.json'), '--apply', '--as', 'keeper@example.com']);
    expect(again).toContain('0 created, 0 updated, 6 unchanged');
    expect(await countPeople()).toBe(2);
  }, 120000);

  it('refuses to apply without being told who is asking', () => {
    expect(() => run([path.join(dir, 'changes.json'), '--apply'])).toThrow(/--as/);
  }, 60000);

  it('refuses to apply as somebody who does not exist', () => {
    expect(() => run([path.join(dir, 'changes.json'), '--apply', '--as', 'nobody@example.com']))
      .toThrow(/No user/);
  }, 60000);
});
