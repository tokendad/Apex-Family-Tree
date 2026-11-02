import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;
vi.mock('../db/connection.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/connection.js')>();
  return { ...actual, getDatabase: () => db };
});

const { registerCustomFunctions } = await import('../db/connection.js');
const { runMigrations } = await import('../db/migrator.js');
const { EventRepository } = await import('./EventRepository.js');
const { FamilyRepository } = await import('./FamilyRepository.js');
const { PersonRepository } = await import('./PersonRepository.js');
const { RelationshipRepository } = await import('./RelationshipRepository.js');

const migrationsDir = path.resolve(process.cwd(), 'src/migrations');
const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

let personId: string;

beforeEach(() => {
  db = new Database(':memory:');
  registerCustomFunctions(db);
  runMigrations(db, migrationsDir, logger);
  db.pragma('foreign_keys = ON');
  personId = new PersonRepository().create({ display_name: 'Test Subject' }).id;
});

afterEach(() => db.close());

/** What the Connections tab renders: the objects the graph says this one is
    joined to, read through the same repository the endpoint uses. */
const connections = (eventId: string) =>
  new RelationshipRepository().findConnectedObjects(eventId);

const subjectEdgeExists = (eventId: string) =>
  Boolean(db.prepare('SELECT id FROM relationships WHERE id = ?').get(`rel_event_subject_${eventId}`));

const memberCount = (eventId: string) =>
  (db.prepare(
    'SELECT COUNT(*) AS n FROM relationship_members WHERE relationship_id = ?',
  ).get(`rel_event_subject_${eventId}`) as { n: number }).n;

describe('EventRepository — the subject an event belongs to', () => {
  /* Issue #31: an occupation event sat on its person's timeline while its own
     Connections tab read 0, because the subject lived only in
     events.person_id and never in the relationship graph. */
  it('draws the person an event was recorded for', () => {
    const event = new EventRepository().create({
      person_id: personId,
      event_type: 'occupation',
      description: 'Segment Treater',
      event_date: '1982',
    });

    const connected = connections(event.id);
    expect(connected).toHaveLength(1);
    expect(connected[0].object_id).toBe(personId);
    expect(connected[0].object_type).toBe('person');
    expect(connected[0].relationship_type_code).toBe('event_subject');
    expect(connected[0].role).toBe('subject');
  });

  it('reads back from the person as well, so the edge is not one-way', () => {
    const event = new EventRepository().create({ person_id: personId, event_type: 'census' });

    const fromPerson = connections(personId).filter(o => o.relationship_type_code === 'event_subject');
    expect(fromPerson.map(o => o.object_id)).toContain(event.id);
  });

  it('draws the family union for a family event', () => {
    const spouse = new PersonRepository().create({ display_name: 'Test Spouse' }).id;
    const family = new FamilyRepository().create({ spouse1_id: personId, spouse2_id: spouse });

    const event = new EventRepository().create({ family_id: family.id, event_type: 'marriage' });

    const connected = connections(event.id).filter(o => o.relationship_type_code === 'event_subject');
    expect(connected).toHaveLength(1);
    expect(connected[0].object_id).toBe(family.id);
    // The family's archive object is its family union, which is why
    // EventDetailPage has to route this one to /families/:id.
    expect(connected[0].object_type).toBe('relationship');
  });

  it('leaves no edge when the subject has no archive object yet', () => {
    // A family written straight to the table, as the data migrations do, has
    // no family union and so nothing in the graph to point at. The event must
    // still be created, and must not leave a member row pointing at nothing.
    const familyId = 'fam-no-union';
    db.pragma('foreign_keys = OFF');
    db.prepare(
      "INSERT INTO families (id, created_at, updated_at) VALUES (?, datetime('now'), datetime('now'))",
    ).run(familyId);
    db.pragma('foreign_keys = ON');

    const event = new EventRepository().create({ family_id: familyId, event_type: 'marriage' });

    expect(event.family_id).toBe(familyId);
    expect(subjectEdgeExists(event.id)).toBe(false);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('re-points rather than accumulates when the subject changes', () => {
    const event = new EventRepository().create({ person_id: personId, event_type: 'residence' });
    const canonical = new PersonRepository().create({ display_name: 'Canonical Subject' }).id;

    // What personDedup does when it merges a duplicate into the canonical
    // person: the legacy column moves, and the edge has to follow.
    db.prepare('UPDATE events SET person_id = ? WHERE id = ?').run(canonical, event.id);
    new EventRepository().syncEventSubject(event.id, canonical, null);

    expect(memberCount(event.id)).toBe(2);
    const connected = connections(event.id).filter(o => o.relationship_type_code === 'event_subject');
    expect(connected.map(o => o.object_id)).toEqual([canonical]);
  });

  it('removes the edge with the event', () => {
    const event = new EventRepository().create({ person_id: personId, event_type: 'burial' });
    expect(subjectEdgeExists(event.id)).toBe(true);

    new EventRepository().delete(event.id);

    expect(subjectEdgeExists(event.id)).toBe(false);
    expect(memberCount(event.id)).toBe(0);
    expect(
      db.prepare('SELECT id FROM archive_objects WHERE id = ?').get(`rel_event_subject_${event.id}`),
    ).toBeUndefined();
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});

describe('migration 165 — the backfill', () => {
  const sql = (name: string) => fs.readFileSync(path.join(migrationsDir, name), 'utf-8');

  /** An event written straight to the table, the way migrations 077 onward
      did: no archive object, no edge, invisible to the graph. */
  const rawEvent = (id: string) => {
    db.pragma('foreign_keys = OFF');
    db.prepare(
      `INSERT INTO events (id, person_id, event_type, event_date, created_at, updated_at)
       VALUES (?, ?, 'occupation', '1982', datetime('now'), datetime('now'))`,
    ).run(id, personId);
    db.pragma('foreign_keys = ON');
  };

  it('gives a raw-inserted event both identity and an edge', () => {
    rawEvent('evt-raw-1');
    expect(db.prepare('SELECT id FROM archive_objects WHERE id = ?').get('evt-raw-1')).toBeUndefined();

    db.exec(sql('165-events-subject-edge.sql'));

    const object = db.prepare('SELECT object_type, title FROM archive_objects WHERE id = ?')
      .get('evt-raw-1') as { object_type: string; title: string };
    expect(object.object_type).toBe('event');
    expect(object.title).toBe('Occupation - 1982');
    expect(connections('evt-raw-1').map(o => o.object_id)).toEqual([personId]);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('is safe to run twice', () => {
    rawEvent('evt-raw-2');
    db.exec(sql('165-events-subject-edge.sql'));
    db.exec(sql('165-events-subject-edge.sql'));

    expect(memberCount('evt-raw-2')).toBe(2);
  });

  it('rolls back the edges and the type', () => {
    const event = new EventRepository().create({ person_id: personId, event_type: 'census' });

    db.exec(sql('165-events-subject-edge-down.sql'));

    expect(subjectEdgeExists(event.id)).toBe(false);
    expect(
      db.prepare("SELECT id FROM relationship_types WHERE id = 'rel_type_event_subject'").get(),
    ).toBeUndefined();
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM relationship_type_roles WHERE relationship_type_id = 'rel_type_event_subject'").get(),
    ).toEqual({ n: 0 });
    // The event keeps its own archive object and its legacy subject link:
    // nothing the edge added, and nothing the rollback should take away.
    expect(db.prepare('SELECT id FROM archive_objects WHERE id = ?').get(event.id)).toBeTruthy();
    expect(new EventRepository().findById(event.id)?.person_id).toBe(personId);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});
