import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let db: Database.Database;

vi.mock('../../db/connection.js', () => ({ getDatabase: () => db }));
vi.mock('../backup.js', () => ({ createPreImportBackup: vi.fn(() => true) }));

const { commitIntakeItem, IntakeCommitError } = await import('./commitService.js');
const { IntakeRepository } = await import('../../repositories/IntakeRepository.js');

function seedSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE archive_objects (
      id TEXT PRIMARY KEY, object_type TEXT NOT NULL, title TEXT NOT NULL, summary TEXT,
      privacy_level TEXT NOT NULL DEFAULT 'family', is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT, updated_by TEXT
    );
    CREATE TABLE persons (
      id TEXT PRIMARY KEY, sex TEXT DEFAULT 'U', is_living INTEGER NOT NULL DEFAULT 1,
      is_private INTEGER NOT NULL DEFAULT 0, notes TEXT, display_name TEXT, created_by TEXT, gedcom_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE names (
      id TEXT PRIMARY KEY, person_id TEXT NOT NULL, name_type TEXT NOT NULL DEFAULT 'birth',
      prefix TEXT, given_name TEXT, middle_name TEXT, surname TEXT, suffix TEXT, nickname TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE events (
      id TEXT PRIMARY KEY, person_id TEXT, family_id TEXT, event_type TEXT NOT NULL,
      event_date TEXT, event_date_qualifier TEXT, event_date_sort_key INTEGER,
      event_date_end TEXT, event_date_end_sort_key INTEGER, event_place TEXT,
      plot TEXT, description TEXT, source_url TEXT, source_url_checked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE families (
      id TEXT PRIMARY KEY, spouse1_id TEXT, spouse2_id TEXT, marriage_date TEXT,
      marriage_date_qualifier TEXT, marriage_date_sort_key INTEGER, marriage_place TEXT,
      divorce_date TEXT, divorce_place TEXT, gedcom_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE family_members (
      id TEXT PRIMARY KEY, family_id TEXT NOT NULL, person_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'child', sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE artifacts (
      id TEXT PRIMARY KEY, artifact_type_id TEXT, evidence_classification_id TEXT,
      original_date_text TEXT, original_date_start TEXT, original_date_end TEXT,
      date_precision TEXT, date_qualifier TEXT, creator_text TEXT, physical_location TEXT,
      original_format TEXT, condition_notes TEXT, language TEXT, transcription TEXT, notes TEXT
    );
    CREATE TABLE artifact_types (id TEXT PRIMARY KEY, name TEXT, sort_order INTEGER DEFAULT 0);
    INSERT INTO artifact_types (id, name) VALUES ('artifact_type_document', 'Document');
    CREATE TABLE claims (
      id TEXT PRIMARY KEY, statement TEXT NOT NULL, claim_type TEXT, subject_object_id TEXT,
      date_text TEXT, date_start TEXT, date_end TEXT, confidence_level_id TEXT, confidence_score INTEGER,
      status TEXT NOT NULL DEFAULT 'open', notes TEXT, research_section TEXT
    );
    CREATE TABLE claim_subjects (id TEXT PRIMARY KEY, claim_id TEXT, subject_object_id TEXT, role TEXT);
    CREATE TABLE claim_evidence (
      id TEXT PRIMARY KEY, claim_id TEXT, evidence_object_id TEXT, evidence_role TEXT,
      evidence_classification_id TEXT, excerpt TEXT, locator TEXT, weight_score INTEGER,
      confidence_contribution INTEGER, notes TEXT,
      UNIQUE (claim_id, evidence_object_id, evidence_role)
    );
    CREATE TABLE confidence_levels (id TEXT PRIMARY KEY, name TEXT, sort_order INTEGER DEFAULT 0);
    CREATE TABLE evidence_classifications (id TEXT PRIMARY KEY, name TEXT, sort_order INTEGER DEFAULT 0);
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE media_items (
      id TEXT PRIMARY KEY, filename TEXT, original_filename TEXT, mime_type TEXT,
      file_size INTEGER, file_path TEXT, thumbnail_path TEXT, uploaded_by TEXT, is_external INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE artifact_files (
      id TEXT PRIMARY KEY, artifact_id TEXT, file_role TEXT, storage_provider TEXT DEFAULT 'local',
      storage_path TEXT, original_filename TEXT, mime_type TEXT, size_bytes INTEGER,
      width INTEGER, height INTEGER, duration_seconds REAL, created_at TEXT
    );

    CREATE TABLE intake_items (
      id TEXT PRIMARY KEY, created_by TEXT, source_text TEXT NOT NULL, source_artifact_id TEXT,
      source_hash TEXT NOT NULL, ai_job_id TEXT, status TEXT NOT NULL DEFAULT 'pending', trigger TEXT NOT NULL DEFAULT 'manual',
      source_file_path TEXT, source_file_mime_type TEXT, source_file_original_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), committed_at TEXT
    );
    CREATE TABLE intake_proposals (
      id TEXT PRIMARY KEY, intake_item_id TEXT NOT NULL, proposal_type TEXT NOT NULL,
      payload TEXT NOT NULL, confidence INTEGER, decision TEXT, edited_payload TEXT,
      committed_object_id TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), decided_at TEXT
    );
    CREATE TABLE intake_conflicts (
      id TEXT PRIMARY KEY, intake_item_id TEXT NOT NULL, proposal_id TEXT NOT NULL,
      record_type TEXT NOT NULL, field_name TEXT NOT NULL, existing_value TEXT, incoming_value TEXT,
      resolution TEXT, resolved_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function seedIntakeItem(status: IntakeItemStatus = 'awaiting_review') {
  const repo = new IntakeRepository();
  const item = repo.createItem({ created_by: 'user-1', source_text: 'John Smith was born in 1920.', source_hash: 'hash1' });
  repo.setStatus(item.id, status);
  return { repo, item };
}

/** A #73 Phase 3 suggestion: the artifact already exists before the intake
 *  item does, unlike a manual submission's deferred-to-commit artifact. */
function seedSuggestedIntakeItem(status: IntakeItemStatus = 'awaiting_review') {
  db.prepare(`INSERT INTO archive_objects (id, object_type, title) VALUES ('existing_artifact', 'artifact', 'Letter from 1920')`).run();
  db.prepare(`INSERT INTO artifacts (id, artifact_type_id, transcription) VALUES ('existing_artifact', 'artifact_type_document', 'John Smith was born in 1920.')`).run();

  const repo = new IntakeRepository();
  const item = repo.createItem({
    created_by: 'user-1', source_text: 'John Smith was born in 1920.', source_hash: 'hash-suggested',
    source_artifact_id: 'existing_artifact', trigger: 'suggested',
  });
  repo.setStatus(item.id, status);
  return { repo, item };
}

let tmpDir: string;

function seedIntakeItemWithFile(status: IntakeItemStatus = 'awaiting_review') {
  const filePath = path.join(tmpDir, 'photo.jpg');
  fs.writeFileSync(filePath, 'fake-jpeg-bytes');

  const repo = new IntakeRepository();
  const item = repo.createItem({
    created_by: 'user-1',
    source_text: '',
    source_hash: 'filehash1',
    source_file_path: filePath,
    source_file_mime_type: 'image/jpeg',
    source_file_original_name: 'photo.jpg',
  });
  repo.setStatus(item.id, status);
  return { repo, item, filePath };
}

type IntakeItemStatus = 'pending' | 'extracting' | 'awaiting_review' | 'committed' | 'cancelled' | 'failed';

function verifiedCitation(quote: string) {
  return [{ quote, locator: null, region: null, citationStatus: 'verified' as const }];
}

function unconfirmedImageCitation(quote: string) {
  return [{ quote, locator: null, region: null, citationStatus: 'unconfirmed_image' as const }];
}

beforeEach(() => {
  db = new Database(':memory:');
  seedSchema(db);
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aft-intake-commit-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('commitIntakeItem', () => {
  it('rejects a commit while any proposal is still undecided', () => {
    const { repo, item } = seedIntakeItem();
    repo.createProposals(item.id, [{
      proposal_type: 'person',
      confidence: null,
      payload: { type: 'person', ref: 'person_1', givenName: 'John', surname: 'Smith', citations: verifiedCitation('John Smith'), matches: [] },
    }]);

    expect(() => commitIntakeItem(item.id, 'user-1')).toThrow(IntakeCommitError);
  });

  it('rejects a commit on an item not in awaiting_review status', () => {
    const { item } = seedIntakeItem('pending');
    expect(() => commitIntakeItem(item.id, 'user-1')).toThrow(IntakeCommitError);
  });

  it('creates a new person, name, birth event, and a cited identity claim on accept', () => {
    const { repo, item } = seedIntakeItem();
    const [proposal] = repo.createProposals(item.id, [{
      proposal_type: 'person',
      confidence: null,
      payload: {
        type: 'person', ref: 'person_1', givenName: 'John', surname: 'Smith', birthDate: '1920',
        citations: verifiedCitation('John Smith was born in 1920'), matches: [],
      },
    }]);
    repo.recordDecision(proposal.id, 'accept', null);

    const result = commitIntakeItem(item.id, 'user-1');

    expect(result).toMatchObject({ committed: 1, conflicts: 0 });

    const person = db.prepare('SELECT * FROM persons').get() as { id: string };
    expect(person).toBeTruthy();
    const name = db.prepare('SELECT * FROM names WHERE person_id = ?').get(person.id) as { given_name: string; surname: string };
    expect(name.given_name).toBe('John');
    expect(name.surname).toBe('Smith');
    const birthEvent = db.prepare("SELECT * FROM events WHERE person_id = ? AND event_type = 'birth'").get(person.id) as { event_date: string };
    expect(birthEvent.event_date).toBe('1920');

    const claim = db.prepare('SELECT * FROM claims WHERE subject_object_id = ?').get(person.id) as { claim_type: string };
    expect(claim.claim_type).toBe('identity');
    const evidence = db.prepare('SELECT * FROM claim_evidence').get() as { excerpt: string; evidence_object_id: string };
    expect(evidence.excerpt).toBe('John Smith was born in 1920');
    const sourceArtifact = db.prepare('SELECT id FROM artifacts').get() as { id: string };
    expect(evidence.evidence_object_id).toBe(sourceArtifact.id);
    expect(repo.findItemById(item.id)!.source_artifact_id).toBe(sourceArtifact.id);

    const committedProposal = repo.findProposalById(proposal.id)!;
    expect(committedProposal.committed_object_id).toBe(person.id);

    const updatedItem = repo.findItemById(item.id)!;
    expect(updatedItem.status).toBe('committed');
    expect(updatedItem.committed_at).toBeTruthy();
  });

  it('bundles multiple citable citations on one proposal into a single claim_evidence row (claim_evidence is UNIQUE per claim+artifact+role)', () => {
    // A file-based (unconfirmed_image) submission, same as what actually
    // triggered this bug live: a vision-extracted person proposal with both
    // a birth and a death quote.
    const { repo, item } = seedIntakeItemWithFile();
    const [proposal] = repo.createProposals(item.id, [{
      proposal_type: 'person',
      confidence: null,
      payload: {
        type: 'person', ref: 'person_1', givenName: 'John', surname: 'Smith', birthDate: '1920', deathDate: '1998',
        citations: [
          { quote: 'John Smith was born in 1920', locator: null, region: null, citationStatus: 'unconfirmed_image' },
          { quote: 'he died in 1998', locator: 'p. 2', region: null, citationStatus: 'unconfirmed_image' },
        ],
        matches: [],
      },
    }]);
    repo.recordDecision(proposal.id, 'accept', null);

    // The bug this guards: addEvidence per citation, all with the same
    // (claim_id, evidence_object_id, evidence_role), violates claim_evidence's
    // UNIQUE constraint on the second citation and throws out of the
    // transaction -- commitIntakeItem must not throw here.
    expect(() => commitIntakeItem(item.id, 'user-1')).not.toThrow();

    const evidenceRows = db.prepare('SELECT * FROM claim_evidence').all() as { excerpt: string }[];
    expect(evidenceRows).toHaveLength(1);
    expect(evidenceRows[0].excerpt).toContain('John Smith was born in 1920');
    expect(evidenceRows[0].excerpt).toContain('he died in 1998');
  });

  it('skips a rejected proposal entirely', () => {
    const { repo, item } = seedIntakeItem();
    const [proposal] = repo.createProposals(item.id, [{
      proposal_type: 'person',
      confidence: null,
      payload: { type: 'person', ref: 'person_1', givenName: 'John', surname: 'Smith', citations: verifiedCitation('John Smith'), matches: [] },
    }]);
    repo.recordDecision(proposal.id, 'reject', null);

    const result = commitIntakeItem(item.id, 'user-1');

    expect(result).toEqual({ committed: 0, conflicts: 0, sourceArtifactId: null });
    expect(db.prepare('SELECT COUNT(*) AS n FROM persons').get()).toEqual({ n: 0 });
    // No source artifact either -- an all-rejected turn leaves nothing behind.
    expect(db.prepare('SELECT COUNT(*) AS n FROM artifacts').get()).toEqual({ n: 0 });
    expect(repo.findItemById(item.id)!.source_artifact_id).toBeNull();
  });

  it('commits a relationship referencing an accepted person by ref, and a fact about them', () => {
    const { repo, item } = seedIntakeItem();
    const [personProposal, factProposal] = repo.createProposals(item.id, [
      {
        proposal_type: 'person',
        confidence: null,
        payload: { type: 'person', ref: 'person_1', givenName: 'John', surname: 'Smith', citations: verifiedCitation('John Smith'), matches: [] },
      },
      {
        proposal_type: 'fact',
        confidence: null,
        payload: { type: 'fact', statement: 'John Smith was a sailor.', subjectRef: 'person_1', citations: verifiedCitation('John Smith') },
      },
    ]);
    repo.recordDecision(personProposal.id, 'accept', null);
    repo.recordDecision(factProposal.id, 'accept', null);

    const result = commitIntakeItem(item.id, 'user-1');

    expect(result).toMatchObject({ committed: 2, conflicts: 0 });
    const factClaim = db.prepare("SELECT * FROM claims WHERE claim_type = 'fact'").get() as { statement: string };
    expect(factClaim.statement).toBe('John Smith was a sailor.');
  });

  it('records a conflict instead of committing when a ref cannot be resolved (e.g. its person was rejected)', () => {
    const { repo, item } = seedIntakeItem();
    const [personProposal, factProposal] = repo.createProposals(item.id, [
      {
        proposal_type: 'person',
        confidence: null,
        payload: { type: 'person', ref: 'person_1', givenName: 'John', surname: 'Smith', citations: verifiedCitation('John Smith'), matches: [] },
      },
      {
        proposal_type: 'fact',
        confidence: null,
        payload: { type: 'fact', statement: 'John Smith was a sailor.', subjectRef: 'person_1', citations: verifiedCitation('John Smith') },
      },
    ]);
    repo.recordDecision(personProposal.id, 'reject', null);
    repo.recordDecision(factProposal.id, 'accept', null);

    const result = commitIntakeItem(item.id, 'user-1');

    expect(result).toMatchObject({ committed: 0, conflicts: 1 });
    const conflicts = repo.findConflictsByItem(item.id);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].field_name).toBe('subjectRef');
  });

  it('writes a conflict instead of committing when existingPersonId no longer exists (TOCTOU)', () => {
    const { repo, item } = seedIntakeItem();
    const [proposal] = repo.createProposals(item.id, [{
      proposal_type: 'person',
      confidence: null,
      payload: {
        type: 'person', ref: 'person_1', givenName: 'John', surname: 'Smith',
        citations: verifiedCitation('John Smith'), matches: [{ personId: 'gone', score: 80, reasons: [], displayName: 'John Smith', birthYear: null }],
      },
    }]);
    repo.recordDecision(proposal.id, 'edit', {
      type: 'person', ref: 'person_1', givenName: 'John', surname: 'Smith',
      citations: verifiedCitation('John Smith'), matches: [], existingPersonId: 'gone',
    });

    const result = commitIntakeItem(item.id, 'user-1');

    expect(result).toMatchObject({ committed: 0, conflicts: 1 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM persons').get()).toEqual({ n: 0 });
  });

  it('commits against an existing person rather than creating a new one when existingPersonId is set', () => {
    db.prepare(`INSERT INTO archive_objects (id, object_type, title) VALUES ('p_existing', 'person', 'John Smith')`).run();
    db.prepare(`INSERT INTO persons (id) VALUES ('p_existing')`).run();

    const { repo, item } = seedIntakeItem();
    const [proposal] = repo.createProposals(item.id, [{
      proposal_type: 'person',
      confidence: null,
      payload: {
        type: 'person', ref: 'person_1', givenName: 'John', surname: 'Smith',
        citations: verifiedCitation('John Smith'), matches: [{ personId: 'p_existing', score: 90, reasons: [], displayName: 'John Smith', birthYear: null }],
      },
    }]);
    repo.recordDecision(proposal.id, 'edit', {
      type: 'person', ref: 'person_1', givenName: 'John', surname: 'Smith',
      citations: verifiedCitation('John Smith'), matches: [], existingPersonId: 'p_existing',
    });

    const result = commitIntakeItem(item.id, 'user-1');

    expect(result).toMatchObject({ committed: 1, conflicts: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM persons').get()).toEqual({ n: 1 });
    const committedProposal = repo.findProposalById(proposal.id)!;
    expect(committedProposal.committed_object_id).toBe('p_existing');
  });

  it('commits a spouse_of relationship as a family union between two accepted persons', () => {
    const { repo, item } = seedIntakeItem();
    const proposals = repo.createProposals(item.id, [
      { proposal_type: 'person', confidence: null, payload: { type: 'person', ref: 'p1', givenName: 'John', surname: 'Smith', citations: verifiedCitation('John Smith'), matches: [] } },
      { proposal_type: 'person', confidence: null, payload: { type: 'person', ref: 'p2', givenName: 'Jane', surname: 'Smith', citations: verifiedCitation('John Smith'), matches: [] } },
      { proposal_type: 'relationship', confidence: null, payload: { type: 'relationship', personARef: 'p1', personBRef: 'p2', relType: 'spouse_of', citations: verifiedCitation('John Smith') } },
    ]);
    for (const proposal of proposals) repo.recordDecision(proposal.id, 'accept', null);

    const result = commitIntakeItem(item.id, 'user-1');

    expect(result).toMatchObject({ committed: 3, conflicts: 0 });
    const family = db.prepare('SELECT * FROM families').get() as { spouse1_id: string; spouse2_id: string };
    expect([family.spouse1_id, family.spouse2_id].sort()).toEqual(
      (db.prepare('SELECT id FROM persons ORDER BY id').all() as { id: string }[]).map((r) => r.id).sort(),
    );
  });

  it('commits a parent_of relationship, attaching the child to the parent-only family created for them', () => {
    const { repo, item } = seedIntakeItem();
    const proposals = repo.createProposals(item.id, [
      { proposal_type: 'person', confidence: null, payload: { type: 'person', ref: 'parent', givenName: 'John', surname: 'Smith', citations: verifiedCitation('John Smith'), matches: [] } },
      { proposal_type: 'person', confidence: null, payload: { type: 'person', ref: 'child', givenName: 'Jane', surname: 'Smith', citations: verifiedCitation('John Smith'), matches: [] } },
      { proposal_type: 'relationship', confidence: null, payload: { type: 'relationship', personARef: 'parent', personBRef: 'child', relType: 'parent_of', citations: verifiedCitation('John Smith') } },
    ]);
    for (const proposal of proposals) repo.recordDecision(proposal.id, 'accept', null);

    const result = commitIntakeItem(item.id, 'user-1');

    expect(result).toMatchObject({ committed: 3, conflicts: 0 });
    const family = db.prepare('SELECT * FROM families').get() as { id: string };
    const members = db.prepare('SELECT * FROM family_members WHERE family_id = ?').all(family.id) as { role: string }[];
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe('child');
  });

  it('writes a conflict instead of guessing when a matched parent already has more than one family and the child is in neither', () => {
    // A parent who already has two families on file (e.g. two prior marriages),
    // neither of which the incoming child belongs to -- attaching the child to
    // either would be a guess, not a resolution.
    db.prepare(`INSERT INTO archive_objects (id, object_type, title) VALUES ('p_parent', 'person', 'John Smith')`).run();
    db.prepare(`INSERT INTO persons (id) VALUES ('p_parent')`).run();
    db.prepare(`INSERT INTO families (id, spouse1_id) VALUES ('fam_a', 'p_parent')`).run();
    db.prepare(`INSERT INTO families (id, spouse1_id) VALUES ('fam_b', 'p_parent')`).run();

    const { repo, item } = seedIntakeItem();
    const proposals = repo.createProposals(item.id, [
      { proposal_type: 'person', confidence: null, payload: { type: 'person', ref: 'parent', givenName: 'John', surname: 'Smith', citations: verifiedCitation('John Smith'), matches: [{ personId: 'p_parent', score: 100, reasons: [], displayName: 'John Smith', birthYear: null }] } },
      { proposal_type: 'person', confidence: null, payload: { type: 'person', ref: 'child', givenName: 'Jane', surname: 'Smith', citations: verifiedCitation('John Smith'), matches: [] } },
      { proposal_type: 'relationship', confidence: null, payload: { type: 'relationship', personARef: 'parent', personBRef: 'child', relType: 'parent_of', citations: verifiedCitation('John Smith') } },
    ]);
    repo.recordDecision(proposals[0].id, 'edit', {
      type: 'person', ref: 'parent', givenName: 'John', surname: 'Smith', citations: verifiedCitation('John Smith'), matches: [], existingPersonId: 'p_parent',
    });
    repo.recordDecision(proposals[1].id, 'accept', null);
    repo.recordDecision(proposals[2].id, 'accept', null);

    const result = commitIntakeItem(item.id, 'user-1');

    expect(result.conflicts).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM family_members').get()).toEqual({ n: 0 });
  });

  it('commits an event and governs it with the citing claim', () => {
    const { repo, item } = seedIntakeItem();
    const proposals = repo.createProposals(item.id, [
      { proposal_type: 'person', confidence: null, payload: { type: 'person', ref: 'p1', givenName: 'John', surname: 'Smith', citations: verifiedCitation('John Smith'), matches: [] } },
      { proposal_type: 'event', confidence: null, payload: { type: 'event', personRef: 'p1', eventType: 'marriage', date: '1945', place: null, citations: verifiedCitation('John Smith') } },
    ]);
    for (const proposal of proposals) repo.recordDecision(proposal.id, 'accept', null);

    const result = commitIntakeItem(item.id, 'user-1');

    expect(result).toMatchObject({ committed: 2, conflicts: 0 });
    const event = db.prepare("SELECT * FROM events WHERE event_type = 'marriage'").get() as { id: string };
    expect(event).toBeTruthy();
    const claim = db.prepare("SELECT * FROM claims WHERE claim_type = 'event'").get() as { id: string };
    const governs = db.prepare("SELECT * FROM claim_subjects WHERE claim_id = ? AND role = 'governs'").get(claim.id) as { subject_object_id: string };
    expect(governs.subject_object_id).toBe(event.id);
  });

  it('records a conflict rather than overwriting a differing birth date on an existing person match', () => {
    db.prepare(`INSERT INTO archive_objects (id, object_type, title) VALUES ('p_existing', 'person', 'John Smith')`).run();
    db.prepare(`INSERT INTO persons (id) VALUES ('p_existing')`).run();
    db.prepare(`INSERT INTO events (id, person_id, event_type, event_date) VALUES ('ev1', 'p_existing', 'birth', '1919')`).run();

    const { repo, item } = seedIntakeItem();
    const [proposal] = repo.createProposals(item.id, [{
      proposal_type: 'person',
      confidence: null,
      payload: { type: 'person', ref: 'p1', givenName: 'John', surname: 'Smith', birthDate: '1920', citations: verifiedCitation('John Smith'), matches: [] },
    }]);
    repo.recordDecision(proposal.id, 'edit', {
      type: 'person', ref: 'p1', givenName: 'John', surname: 'Smith', birthDate: '1920',
      citations: verifiedCitation('John Smith'), matches: [], existingPersonId: 'p_existing',
    });

    const result = commitIntakeItem(item.id, 'user-1');

    expect(result).toMatchObject({ committed: 1, conflicts: 1 });
    const birthEvent = db.prepare("SELECT event_date FROM events WHERE id = 'ev1'").get() as { event_date: string };
    expect(birthEvent.event_date).toBe('1919'); // unchanged
    const conflicts = repo.findConflictsByItem(item.id);
    expect(conflicts[0]).toMatchObject({ field_name: 'birthDate', existing_value: '1919', incoming_value: '1920' });
  });

  it('re-verifies citations on an edited payload and drops a fact whose edited quote is fabricated', () => {
    const { repo, item } = seedIntakeItem();
    const [proposal] = repo.createProposals(item.id, [{
      proposal_type: 'fact',
      confidence: null,
      payload: { type: 'fact', statement: 'John Smith was a sailor.', subjectRef: 'p1', citations: verifiedCitation('John Smith') },
    }]);
    // An edit that swaps in a quote the source text does not contain.
    repo.recordDecision(proposal.id, 'edit', {
      type: 'fact', statement: 'John Smith invented the telephone.', subjectRef: 'p1',
      citations: [{ quote: 'fabricated quote not in source', locator: null, region: null, citationStatus: 'verified' }],
    });

    const result = commitIntakeItem(item.id, 'user-1');

    expect(result).toMatchObject({ committed: 0, conflicts: 1 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM claims').get()).toEqual({ n: 0 });
  });

  it('attaches the staged upload to the committed artifact via a media_items/artifact_files row (#73 Phase 2)', () => {
    const { repo, item, filePath } = seedIntakeItemWithFile();
    const [personProposal, factProposal] = repo.createProposals(item.id, [
      {
        proposal_type: 'person',
        confidence: null,
        payload: { type: 'person', ref: 'p1', givenName: 'Jane', surname: 'Doe', citations: unconfirmedImageCitation('whatever the model transcribed'), matches: [] },
      },
      {
        proposal_type: 'fact',
        confidence: null,
        payload: { type: 'fact', statement: 'Shown in the photo.', subjectRef: 'p1', citations: unconfirmedImageCitation('whatever the model transcribed') },
      },
    ]);
    repo.recordDecision(personProposal.id, 'accept', null);
    repo.recordDecision(factProposal.id, 'accept', null);

    const result = commitIntakeItem(item.id, 'user-1');

    expect(result).toMatchObject({ committed: 2, conflicts: 0 });
    expect(result.sourceArtifactId).toBeTruthy();

    const media = db.prepare('SELECT * FROM media_items WHERE id = ?').get(result.sourceArtifactId) as { file_path: string; mime_type: string; original_filename: string };
    expect(media.file_path).toBe(filePath);
    expect(media.mime_type).toBe('image/jpeg');
    expect(media.original_filename).toBe('photo.jpg');

    const artifactFile = db.prepare('SELECT * FROM artifact_files WHERE artifact_id = ?').get(result.sourceArtifactId) as { storage_path: string };
    expect(artifactFile.storage_path).toBe(filePath);

    // An unconfirmed_image citation is still recorded as evidence -- #73's
    // "cites or dropped" rule doesn't evaporate at commit just because the
    // quote couldn't be mechanically checked.
    const evidenceRows = db.prepare('SELECT * FROM claim_evidence').all() as { excerpt: string; evidence_object_id: string; notes: string }[];
    expect(evidenceRows).toHaveLength(2);
    for (const row of evidenceRows) {
      expect(row.evidence_object_id).toBe(result.sourceArtifactId);
      expect(row.notes).toMatch(/not mechanically verified/);
    }

    // The file now belongs to the artifact -- the intake item stops tracking
    // it as a staged upload.
    expect(repo.findItemById(item.id)!.source_file_path).toBeNull();
    expect(fs.existsSync(filePath)).toBe(true); // not deleted -- it's the artifact's file now
  });

  it('deletes the staged upload instead of creating an artifact when every proposal on a file-based turn is rejected', () => {
    const { repo, item, filePath } = seedIntakeItemWithFile();
    const [proposal] = repo.createProposals(item.id, [{
      proposal_type: 'fact',
      confidence: null,
      payload: { type: 'fact', statement: 'Shown in the photo.', subjectRef: 'p1', citations: unconfirmedImageCitation('whatever') },
    }]);
    repo.recordDecision(proposal.id, 'reject', null);

    const result = commitIntakeItem(item.id, 'user-1');

    expect(result).toEqual({ committed: 0, conflicts: 0, sourceArtifactId: null });
    expect(db.prepare('SELECT COUNT(*) AS n FROM media_items').get()).toEqual({ n: 0 });
    expect(fs.existsSync(filePath)).toBe(false);
    expect(repo.findItemById(item.id)!.source_file_path).toBeNull();
  });

  it('keeps an unconfirmed_image citation on an all-rejected file turn from being silently re-verified as unverified', () => {
    // Guards the sourceTextForVerification fix: re-verifying against ''
    // instead of null would flip every image-sourced citation to
    // 'unverified' and change which proposals get flagged at commit.
    const { repo, item } = seedIntakeItemWithFile();
    const [proposal] = repo.createProposals(item.id, [{
      proposal_type: 'fact',
      confidence: null,
      payload: { type: 'fact', statement: 'Shown in the photo.', subjectRef: 'p1', citations: unconfirmedImageCitation('whatever the model transcribed') },
    }]);
    repo.recordDecision(proposal.id, 'edit', {
      type: 'fact', statement: 'Edited statement about the photo.', subjectRef: 'p1',
      citations: unconfirmedImageCitation('a different transcription, still not checkable'),
    });

    const result = commitIntakeItem(item.id, 'user-1');

    // subjectRef 'p1' was never an accepted person proposal, so this still
    // conflicts on the unresolved ref -- but NOT on citations, proving the
    // edited unconfirmed_image citation survived re-verification.
    expect(result.conflicts).toBe(1);
    const conflicts = repo.findConflictsByItem(item.id);
    expect(conflicts[0].field_name).toBe('subjectRef');
  });

  it('commits a suggested item against its pre-existing artifact, creating no new artifact (#73 Phase 3)', () => {
    const { repo, item } = seedSuggestedIntakeItem();
    const [proposal] = repo.createProposals(item.id, [{
      proposal_type: 'person',
      confidence: null,
      payload: { type: 'person', ref: 'person_1', givenName: 'John', surname: 'Smith', citations: verifiedCitation('John Smith was born in 1920'), matches: [] },
    }]);
    repo.recordDecision(proposal.id, 'accept', null);

    const result = commitIntakeItem(item.id, 'user-1');

    expect(result).toEqual({ committed: 1, conflicts: 0, sourceArtifactId: 'existing_artifact' });
    expect(db.prepare('SELECT COUNT(*) AS n FROM artifacts').get()).toEqual({ n: 1 }); // just the one seeded, none created
    const evidence = db.prepare('SELECT evidence_object_id FROM claim_evidence').get() as { evidence_object_id: string };
    expect(evidence.evidence_object_id).toBe('existing_artifact');
  });

  it('does not create or delete any artifact when every proposal on a suggested item is rejected', () => {
    const { repo, item } = seedSuggestedIntakeItem();
    const [proposal] = repo.createProposals(item.id, [{
      proposal_type: 'person',
      confidence: null,
      payload: { type: 'person', ref: 'person_1', givenName: 'John', surname: 'Smith', citations: verifiedCitation('John Smith was born in 1920'), matches: [] },
    }]);
    repo.recordDecision(proposal.id, 'reject', null);

    const result = commitIntakeItem(item.id, 'user-1');

    expect(result).toEqual({ committed: 0, conflicts: 0, sourceArtifactId: 'existing_artifact' });
    expect(db.prepare('SELECT COUNT(*) AS n FROM artifacts').get()).toEqual({ n: 1 }); // the pre-existing artifact survives untouched
  });
});
