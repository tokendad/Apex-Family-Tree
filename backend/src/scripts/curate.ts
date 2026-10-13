/**
 * Applies a reviewed set of archive changes from a file.
 *
 * Some corrections are too long to type into a form and too careful to do with
 * raw SQL: three certificates name two people who are not in the tree, a birth
 * place, a death place, an occupation and a residence, and every one of those
 * rows needs an archive_objects row, a sort key, an audit entry and a primary
 * name beside it. This runs the same repository methods the API does, so a
 * person created here is indistinguishable from one created through the UI.
 *
 * Usage:
 *   npm run curate -w backend -- <changeset.json>              # dry run
 *   npm run curate -w backend -- <changeset.json> --apply --as you@example.com
 *
 * A dry run is the default and is a real run: the whole change set is applied
 * inside a transaction, reported, and then rolled back. Nothing is simulated,
 * so a constraint that would fail on apply fails in the dry run too.
 *
 * --as names the user the audit log will attribute the changes to, and is
 * required for --apply: the archive's history should say who asked for a
 * change, not that it appeared from nowhere.
 *
 * RESTART THE APPLICATION AFTERWARDS. This writes from outside the container
 * while the server holds the same file open, and the server's connection maps
 * 256MB of it (mmap_size in db/connection.ts). After an outside write its view
 * of the full-text index went stale: every search of people returned 500 while
 * a fresh connection on the same file served them, and the handler threw the
 * error away rather than saying so. A recreate clears it, which is why the
 * script says so when it finishes.
 */
import fs from 'fs';
import path from 'path';
import { createLogger } from '../services/logger.js';
import { initializeDatabase, getDatabase, closeDatabase } from '../db/connection.js';
import { runWithContext } from '../services/requestContext.js';
import { PersonRepository } from '../repositories/PersonRepository.js';
import { FamilyRepository } from '../repositories/FamilyRepository.js';
import { EventRepository } from '../repositories/EventRepository.js';
import { MediaRepository } from '../repositories/MediaRepository.js';
import { UserRepository } from '../repositories/UserRepository.js';

// ─── The change-set format ───────────────────────────────────────────────────

/** How an op names a person: an id, a ref created earlier in this set, or a
    name that must match exactly one person already in the archive. */
interface PersonRef {
  id?: string;
  ref?: string;
  given_name?: string;
  surname?: string;
}

interface CreatePersonOp {
  op: 'person.create';
  /** A handle later ops in this set can use to point at this person. */
  ref: string;
  /** Who counts as "already here". Defaults to this op's own given name and
      surname, so re-running a set reuses the person rather than making a
      second one. */
  match?: PersonRef;
  /** Create even though somebody of this name exists. Two people really can
      share a name, but it has to be said out loud. */
  allow_duplicate?: boolean;
  given_name?: string;
  middle_name?: string;
  surname?: string;
  suffix?: string;
  nickname?: string;
  sex?: 'M' | 'F' | 'U';
  is_living?: 0 | 1;
  notes?: string;
  note?: string;
}

interface AddNameOp {
  op: 'person.addName';
  person: PersonRef;
  name_type?: 'birth' | 'married' | 'aka' | 'nickname' | 'formal' | 'religious';
  prefix?: string;
  given_name?: string;
  middle_name?: string;
  surname?: string;
  suffix?: string;
  nickname?: string;
  note?: string;
}

interface UpdatePersonOp {
  op: 'person.update';
  person: PersonRef;
  /** What the archive calls them, which is not always what a document does.
      Set it where a family name differs from the registered one. */
  display_name?: string;
  sex?: 'M' | 'F' | 'U';
  is_living?: 0 | 1;
  notes?: string;
  note?: string;
}

interface SetPrimaryNameOp {
  op: 'person.setName';
  person: PersonRef;
  prefix?: string;
  given_name?: string;
  middle_name?: string;
  surname?: string;
  suffix?: string;
  nickname?: string;
  note?: string;
}

interface SetEventOp {
  op: 'event.set';
  person: PersonRef;
  event_type: string;
  event_date?: string | null;
  event_place?: string | null;
  plot?: string | null;
  description?: string | null;
  /** Add another event of this type rather than updating the existing one. */
  allow_duplicate?: boolean;
  note?: string;
}

interface SetFamilyOp {
  op: 'family.set';
  ref?: string;
  spouse1?: PersonRef;
  spouse2?: PersonRef;
  marriage_date?: string;
  marriage_place?: string;
  children?: PersonRef[];
  note?: string;
}

interface LinkMediaOp {
  op: 'media.link';
  /** A media id, or the tail of its file path — "Walter Higgins Sr Birth Cert". */
  media: string;
  to: { person?: PersonRef; event?: { person: PersonRef; event_type: string } };
  note?: string;
}

type Op =
  | CreatePersonOp
  | UpdatePersonOp
  | AddNameOp
  | SetPrimaryNameOp
  | SetEventOp
  | SetFamilyOp
  | LinkMediaOp;

interface ChangeSet {
  /** What this set is for, printed with the plan. */
  description?: string;
  ops: Op[];
}

// ─── Reporting ───────────────────────────────────────────────────────────────

type Outcome = 'create' | 'update' | 'skip';

interface Line {
  outcome: Outcome;
  what: string;
  detail?: string;
}

const lines: Line[] = [];
const record = (outcome: Outcome, what: string, detail?: string) =>
  lines.push({ outcome, what, detail });

// ─── Resolution ──────────────────────────────────────────────────────────────

const refs = new Map<string, string>();

function resolvePerson(people: PersonRepository, ref: PersonRef | undefined, label: string): string {
  if (!ref) throw new Error(`${label}: no person given`);
  if (ref.id) return ref.id;
  if (ref.ref) {
    const id = refs.get(ref.ref);
    if (!id) throw new Error(`${label}: ref "${ref.ref}" has not been created yet`);
    return id;
  }

  const matches = findByName(people, ref);
  if (matches.length === 0) throw new Error(`${label}: no person matches ${JSON.stringify(ref)}`);
  if (matches.length > 1) {
    throw new Error(`${label}: ${matches.length} people match ${JSON.stringify(ref)} — use an id`);
  }
  return matches[0];
}

/** Exact match on the primary name, because a near match is how the wrong
    person gets edited. */
function findByName(people: PersonRepository, ref: PersonRef): string[] {
  const db = getDatabase();
  const rows = db.prepare(
    `SELECT person_id FROM names
     WHERE is_primary = 1
       AND (? IS NULL OR given_name = ?)
       AND (? IS NULL OR surname = ?)`,
  ).all(
    ref.given_name ?? null, ref.given_name ?? null,
    ref.surname ?? null, ref.surname ?? null,
  ) as { person_id: string }[];
  void people;
  return rows.map((row) => row.person_id);
}

function personLabel(people: PersonRepository, id: string): string {
  const person = people.findById(id);
  return person?.displayName || person?.display_name || id.slice(0, 8);
}

// ─── The operations ──────────────────────────────────────────────────────────

function applyCreatePerson(op: CreatePersonOp): void {
  const people = new PersonRepository();

  /* Matching is on by default and matters more than it looks: these change
     sets arrive in waves, the same file is applied again with one more op in
     it, and a person.create that always created would quietly put a second
     Walter Higgins Sr in the tree every time. An ambiguous match stops the
     run instead of guessing which of two people was meant. */
  if (!op.allow_duplicate) {
    const match = op.match ?? { given_name: op.given_name, surname: op.surname };
    if (match.given_name || match.surname || match.id || match.ref) {
      const existing = match.id ? [match.id] : findByName(people, match);
      if (existing.length === 1) {
        refs.set(op.ref, existing[0]);
        record('skip', `person ${op.ref}`, `already in the archive as ${personLabel(people, existing[0])}`);
        return;
      }
      if (existing.length > 1) {
        throw new Error(
          `person ${op.ref}: ${existing.length} people already match ${JSON.stringify(match)} — ` +
          'give an explicit match, or allow_duplicate if there really are two',
        );
      }
    }
  }

  const person = people.create({
    sex: op.sex ?? 'U',
    is_living: op.is_living ?? 0,
    notes: op.notes,
  });
  people.addName(person.id, {
    name_type: 'birth',
    given_name: op.given_name,
    middle_name: op.middle_name,
    surname: op.surname,
    suffix: op.suffix,
    nickname: op.nickname,
    is_primary: 1,
  });

  refs.set(op.ref, person.id);
  record('create', `person ${personLabel(people, person.id)}`, op.note);
}

function applyUpdatePerson(op: UpdatePersonOp): void {
  const people = new PersonRepository();
  const personId = resolvePerson(people, op.person, 'person.update');
  const before = people.findById(personId)!;

  const changes: Record<string, unknown> = {};
  const described: string[] = [];
  for (const field of ['display_name', 'sex', 'is_living', 'notes'] as const) {
    const wanted = op[field];
    if (wanted === undefined) continue;
    if ((before as unknown as Record<string, unknown>)[field] === wanted) continue;
    changes[field] = wanted;
    described.push(`${field}: ${(before as unknown as Record<string, unknown>)[field] ?? '—'} → ${wanted}`);
  }

  if (described.length === 0) {
    record('skip', `person ${personLabel(people, personId)}`, 'already as described');
    return;
  }

  people.update(personId, changes);
  record('update', `person ${personLabel(people, personId)}`, described.join('; '));
}

function applyAddName(op: AddNameOp): void {
  const people = new PersonRepository();
  const personId = resolvePerson(people, op.person, 'person.addName');
  const db = getDatabase();

  const existing = db.prepare(
    `SELECT id FROM names
     WHERE person_id = ?
       AND COALESCE(given_name, '') = COALESCE(?, '')
       AND COALESCE(surname, '') = COALESCE(?, '')
       AND COALESCE(middle_name, '') = COALESCE(?, '')`,
  ).get(personId, op.given_name ?? null, op.surname ?? null, op.middle_name ?? null);

  const label = [op.given_name, op.middle_name, op.surname, op.suffix].filter(Boolean).join(' ');
  if (existing) {
    record('skip', `name "${label}" on ${personLabel(people, personId)}`, 'already recorded');
    return;
  }

  people.addName(personId, {
    name_type: op.name_type ?? 'aka',
    prefix: op.prefix,
    given_name: op.given_name,
    middle_name: op.middle_name,
    surname: op.surname,
    suffix: op.suffix,
    nickname: op.nickname,
    is_primary: 0,
  });
  record('create', `name "${label}" on ${personLabel(people, personId)}`, op.note);
}

/** Corrects the name a person is known by, rather than recording another one
    beside it: a middle name finally explained is the same name, better known,
    and adding it as an alias would leave the archive showing the poorer form. */
function applySetPrimaryName(op: SetPrimaryNameOp): void {
  const people = new PersonRepository();
  const personId = resolvePerson(people, op.person, 'person.setName');
  const db = getDatabase();

  const primary = db.prepare(
    'SELECT * FROM names WHERE person_id = ? AND is_primary = 1 LIMIT 1',
  ).get(personId) as Record<string, unknown> | undefined;
  if (!primary) throw new Error(`person.setName: ${personLabel(people, personId)} has no primary name`);

  const fields = ['prefix', 'given_name', 'middle_name', 'surname', 'suffix', 'nickname'] as const;
  const changes: Record<string, string> = {};
  const described: string[] = [];
  for (const field of fields) {
    const wanted = op[field];
    if (wanted === undefined) continue;
    if ((primary[field] ?? null) === wanted) continue;
    changes[field] = wanted;
    described.push(`${field}: ${primary[field] ?? '—'} → ${wanted}`);
  }

  if (described.length === 0) {
    record('skip', `name of ${personLabel(people, personId)}`, 'already as described');
    return;
  }

  people.updateName(primary.id as string, changes);
  record('update', `name of ${personLabel(people, personId)}`, described.join('; '));
}

function applySetEvent(op: SetEventOp): void {
  const people = new PersonRepository();
  const events = new EventRepository();
  const personId = resolvePerson(people, op.person, `event.set ${op.event_type}`);
  const who = personLabel(people, personId);

  const existing = op.allow_duplicate
    ? undefined
    : (getDatabase().prepare(
        'SELECT * FROM events WHERE person_id = ? AND event_type = ? ORDER BY created_at ASC LIMIT 1',
      ).get(personId, op.event_type) as Record<string, unknown> | undefined);

  const fields = ['event_date', 'event_place', 'plot', 'description'] as const;

  if (existing) {
    const changes: Record<string, unknown> = {};
    const described: string[] = [];
    for (const field of fields) {
      const wanted = op[field];
      if (wanted === undefined) continue;
      if ((existing[field] ?? null) === (wanted ?? null)) continue;
      changes[field] = wanted;
      described.push(`${field}: ${existing[field] ?? '—'} → ${wanted ?? '—'}`);
    }

    if (described.length === 0) {
      record('skip', `${op.event_type} for ${who}`, 'already as described');
      return;
    }

    events.update(existing.id as string, changes);
    record('update', `${op.event_type} for ${who}`, described.join('; '));
    return;
  }

  events.create({
    person_id: personId,
    event_type: op.event_type,
    event_date: op.event_date ?? null,
    event_place: op.event_place ?? null,
    plot: op.plot ?? null,
    description: op.description ?? null,
  });
  record('create', `${op.event_type} for ${who}`,
    [op.event_date, op.event_place, op.description].filter(Boolean).join(' · ') || op.note);
}

function applySetFamily(op: SetFamilyOp): void {
  const people = new PersonRepository();
  const families = new FamilyRepository();
  const db = getDatabase();

  const spouse1 = op.spouse1 ? resolvePerson(people, op.spouse1, 'family.set spouse1') : undefined;
  const spouse2 = op.spouse2 ? resolvePerson(people, op.spouse2, 'family.set spouse2') : undefined;

  // Either order: who is spouse1 is an accident of how the row was written.
  const existing = db.prepare(
    `SELECT * FROM families
     WHERE (spouse1_id IS ? AND spouse2_id IS ?) OR (spouse1_id IS ? AND spouse2_id IS ?)`,
  ).get(spouse1 ?? null, spouse2 ?? null, spouse2 ?? null, spouse1 ?? null) as
    { id: string; marriage_date: string | null; marriage_place: string | null } | undefined;

  const couple = [spouse1, spouse2].filter(Boolean).map((id) => personLabel(people, id!)).join(' & ');

  let familyId: string;
  if (existing) {
    familyId = existing.id;
    const changes: Record<string, string> = {};
    if (op.marriage_date && existing.marriage_date !== op.marriage_date) changes.marriage_date = op.marriage_date;
    if (op.marriage_place && existing.marriage_place !== op.marriage_place) changes.marriage_place = op.marriage_place;
    if (Object.keys(changes).length > 0) {
      families.update(familyId, changes);
      record('update', `family ${couple}`, JSON.stringify(changes));
    } else {
      record('skip', `family ${couple}`, 'already recorded');
    }
  } else {
    const family = families.create({
      spouse1_id: spouse1,
      spouse2_id: spouse2,
      marriage_date: op.marriage_date,
      marriage_place: op.marriage_place,
    });
    familyId = family.id;
    record('create', `family ${couple}`, op.note);
  }

  if (op.ref) refs.set(op.ref, familyId);

  for (const childRef of op.children ?? []) {
    const childId = resolvePerson(people, childRef, 'family.set child');
    const member = db.prepare(
      'SELECT 1 FROM family_members WHERE family_id = ? AND person_id = ?',
    ).get(familyId, childId);
    if (member) {
      record('skip', `${personLabel(people, childId)} as a child of ${couple}`, 'already a member');
      continue;
    }
    families.addMember(familyId, childId, 'child');
    record('create', `${personLabel(people, childId)} as a child of ${couple}`);
  }
}

function applyLinkMedia(op: LinkMediaOp): void {
  const people = new PersonRepository();
  const media = new MediaRepository();
  const db = getDatabase();

  const found = db.prepare(
    'SELECT id, file_path FROM media_items WHERE id = ? OR file_path LIKE ?',
  ).all(op.media, `%${op.media}%`) as { id: string; file_path: string }[];

  if (found.length === 0) throw new Error(`media.link: nothing matches "${op.media}"`);
  if (found.length > 1) {
    throw new Error(`media.link: ${found.length} files match "${op.media}" — be more specific`);
  }
  const item = found[0];
  const name = path.basename(item.file_path);

  if (op.to.person) {
    const personId = resolvePerson(people, op.to.person, 'media.link');
    const already = db.prepare(
      'SELECT 1 FROM person_media WHERE media_id = ? AND person_id = ?',
    ).get(item.id, personId);
    if (already) {
      record('skip', `${name} → ${personLabel(people, personId)}`, 'already linked');
      return;
    }
    media.linkToPerson(item.id, personId);
    record('create', `${name} → ${personLabel(people, personId)}`, op.note);
    return;
  }

  if (op.to.event) {
    const personId = resolvePerson(people, op.to.event.person, 'media.link');
    const event = db.prepare(
      'SELECT id FROM events WHERE person_id = ? AND event_type = ? ORDER BY created_at ASC LIMIT 1',
    ).get(personId, op.to.event.event_type) as { id: string } | undefined;
    if (!event) {
      throw new Error(`media.link: ${personLabel(people, personId)} has no ${op.to.event.event_type} event`);
    }
    const already = db.prepare(
      'SELECT 1 FROM event_media WHERE media_id = ? AND event_id = ?',
    ).get(item.id, event.id);
    if (already) {
      record('skip', `${name} → ${op.to.event.event_type} of ${personLabel(people, personId)}`, 'already linked');
      return;
    }
    media.linkToEvent(item.id, event.id);
    record('create', `${name} → ${op.to.event.event_type} of ${personLabel(people, personId)}`, op.note);
    return;
  }

  throw new Error(`media.link: "${op.media}" has no target`);
}

function applyOp(op: Op): void {
  switch (op.op) {
    case 'person.create': return applyCreatePerson(op);
    case 'person.update': return applyUpdatePerson(op);
    case 'person.addName': return applyAddName(op);
    case 'person.setName': return applySetPrimaryName(op);
    case 'event.set': return applySetEvent(op);
    case 'family.set': return applySetFamily(op);
    case 'media.link': return applyLinkMedia(op);
    default: throw new Error(`unknown op: ${JSON.stringify(op)}`);
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/** Thrown to roll a dry run back. Carries no failure. */
class DryRun extends Error {}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const file = args.find((arg) => !arg.startsWith('--'));
  const apply = args.includes('--apply');
  const asIndex = args.indexOf('--as');
  const asEmail = asIndex >= 0 ? args[asIndex + 1] : undefined;

  if (!file) {
    console.error('usage: curate <changeset.json> [--apply] [--as <email>]');
    process.exit(1);
  }

  const logger = createLogger();
  const changeSet = JSON.parse(fs.readFileSync(file, 'utf-8')) as ChangeSet;

  initializeDatabase(logger);
  const db = getDatabase();

  // This script never migrates: bringing a schema forward is the
  // application's job at startup, and a maintenance script quietly altering a
  // production database's shape is exactly the surprise nobody wants. It only
  // refuses to work against one that has not been migrated yet.
  const migrated = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
  ).get();
  if (!migrated) {
    console.error(`${db.name} has no schema. Start the application against it first.`);
    process.exit(1);
  }

  let userId: string | null = null;
  if (apply) {
    if (!asEmail) {
      console.error('--apply needs --as <email>: the audit log records who asked for a change.');
      process.exit(1);
    }
    const user = new UserRepository().findByEmail(asEmail);
    if (!user) {
      console.error(`No user with the email ${asEmail}.`);
      process.exit(1);
    }
    userId = user.id;

    const backup = `${db.name}.pre-curate.${new Date().toISOString().replace(/[:.]/g, '-')}.bak`;
    await db.backup(backup);
    console.log(`Backup: ${backup}\n`);
  }

  if (changeSet.description) console.log(`${changeSet.description}\n`);
  console.log(`${apply ? 'APPLYING to' : 'Dry run against'} ${db.name}\n`);

  const run = db.transaction(() => {
    for (const op of changeSet.ops) applyOp(op);
    if (!apply) throw new DryRun();
  });

  let failed = false;
  try {
    runWithContext({ userId, ipAddress: null }, () => run());
  } catch (error) {
    if (!(error instanceof DryRun)) {
      failed = true;
      console.error(`\nFailed: ${(error as Error).message}`);
      console.error('Nothing was written — the whole set is one transaction.\n');
    }
  }

  const width = Math.max(...lines.map((line) => line.what.length), 0);
  for (const line of lines) {
    const mark = { create: '+', update: '~', skip: '·' }[line.outcome];
    console.log(`${mark} ${line.what.padEnd(width)}  ${line.detail ?? ''}`.trimEnd());
  }

  const counts = lines.reduce<Record<string, number>>((acc, line) => {
    acc[line.outcome] = (acc[line.outcome] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `\n${counts.create ?? 0} created, ${counts.update ?? 0} updated, ${counts.skip ?? 0} unchanged`,
  );
  if (!apply && !failed) {
    console.log('Dry run — rolled back. Re-run with --apply --as <email> to keep it.');
  } else if (apply && !failed) {
    console.log(
      '\nThe running application still has this database open and its view of ' +
      'the search index may be stale.\nRestart it:  docker compose -f ' +
      '/data/DockerConfigs/docker-compose.yaml up -d --force-recreate aft',
    );
  }

  closeDatabase(logger);
  if (failed) process.exit(1);
}

void main();
