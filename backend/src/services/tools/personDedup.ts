import { randomUUID } from 'crypto';
import { getDatabase } from '../../db/connection.js';
import { nameSoundex, normalizeName } from '../gedcom/matcher.js';

export type PeopleDuplicateConfidence = 'strong' | 'partial' | 'low';
export type FieldChoice = 'canonical' | `duplicate:${string}`;

export interface PeopleDuplicatePersonSummary {
  id: string;
  displayName: string;
  givenName: string | null;
  surname: string | null;
  birthDate: string | null;
  birthYear: number | null;
  deathDate: string | null;
  deathYear: number | null;
  relationshipCount: number;
  sourceCount: number;
  mediaCount: number;
}

export interface PeopleDuplicateGroup {
  id: string;
  confidence: PeopleDuplicateConfidence;
  reasons: string[];
  people: PeopleDuplicatePersonSummary[];
}

export interface PeopleDuplicateScan {
  groups: PeopleDuplicateGroup[];
}

export interface PeopleMergeInput {
  groupId: string;
  canonicalPersonId: string;
  duplicatePersonIds: string[];
  fieldResolutions?: Record<string, FieldChoice>;
}

export interface PeopleMergeConflict {
  field: string;
  label: string;
  canonicalValue: string | null;
  duplicatePersonId: string;
  duplicateValue: string | null;
}

export interface PeopleMergeTransferCounts {
  names: number;
  events: number;
  families: number;
  sourceCitations: number;
  mediaLinks: number;
  mediaRegions: number;
  userHomePeople: number;
  exportScopes: number;
}

export interface PeopleMergePreview {
  groupId: string;
  canonicalPersonId: string;
  duplicatePersonIds: string[];
  conflicts: PeopleMergeConflict[];
  transferCounts: PeopleMergeTransferCounts;
}

export interface PeopleMergeResult extends PeopleMergePreview {
  mergedPersonIds: string[];
}

interface PersonFactRow {
  id: string;
  sex: string | null;
  is_living: number | null;
  notes: string | null;
  given_name: string | null;
  surname: string | null;
  birth_date: string | null;
  birth_sort: number | null;
  birth_place: string | null;
  death_date: string | null;
  death_sort: number | null;
  death_place: string | null;
}

interface EventRow {
  id: string;
  person_id: string;
  event_type: string;
  event_date: string | null;
  event_date_sort_key: number | null;
  event_place: string | null;
}

const EMPTY_COUNTS: PeopleMergeTransferCounts = {
  names: 0,
  events: 0,
  families: 0,
  sourceCitations: 0,
  mediaLinks: 0,
  mediaRegions: 0,
  userHomePeople: 0,
  exportScopes: 0,
};

function yearFromSortKey(sortKey: number | null): number | null {
  if (!sortKey || sortKey < 10000) return null;
  return Math.floor(sortKey / 10000);
}

function yearFromDate(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/\d{4}/);
  return match ? Number(match[0]) : null;
}

function displayName(row: { given_name: string | null; surname: string | null }): string {
  return [row.given_name, row.surname].filter(Boolean).join(' ') || 'Unknown';
}

function groupIdFor(ids: string[]): string {
  return [...ids].sort().join('__');
}

function tableExists(tableName: string): boolean {
  const db = getDatabase();
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?")
    .get(tableName) as { name: string } | undefined;
  return !!row;
}

function columnExists(tableName: string, columnName: string): boolean {
  if (!tableExists(tableName)) return false;
  const columns = getDatabase().prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return columns.some((column) => column.name === columnName);
}

function countQuery(sql: string, ...params: unknown[]): number {
  const row = getDatabase().prepare(sql).get(...params) as { count: number } | undefined;
  return row?.count ?? 0;
}

function findPersonFacts(ids?: string[]): PersonFactRow[] {
  const db = getDatabase();
  const where = ids && ids.length > 0 ? `WHERE p.id IN (${ids.map(() => '?').join(',')})` : '';
  return db.prepare(`
    SELECT
      p.id,
      p.sex,
      p.is_living,
      p.notes,
      n.given_name,
      n.surname,
      birth.event_date AS birth_date,
      birth.event_date_sort_key AS birth_sort,
      birth.event_place AS birth_place,
      death.event_date AS death_date,
      death.event_date_sort_key AS death_sort,
      death.event_place AS death_place
    FROM persons p
    LEFT JOIN names n
      ON n.id = (
        SELECT id
        FROM names
        WHERE person_id = p.id
        ORDER BY is_primary DESC, sort_order ASC, id ASC
        LIMIT 1
      )
    LEFT JOIN events birth
      ON birth.id = (
        SELECT id
        FROM events
        WHERE person_id = p.id AND event_type = 'birth'
        ORDER BY event_date_sort_key IS NULL, event_date_sort_key ASC, id ASC
        LIMIT 1
      )
    LEFT JOIN events death
      ON death.id = (
        SELECT id
        FROM events
        WHERE person_id = p.id AND event_type = 'death'
        ORDER BY event_date_sort_key IS NULL, event_date_sort_key ASC, id ASC
        LIMIT 1
      )
    ${where}
    ORDER BY p.id ASC
  `).all(...(ids ?? [])) as PersonFactRow[];
}

function toSummary(row: PersonFactRow): PeopleDuplicatePersonSummary {
  const relationshipCount =
    countQuery('SELECT COUNT(*) AS count FROM families WHERE spouse1_id = ? OR spouse2_id = ?', row.id, row.id)
    + countQuery('SELECT COUNT(*) AS count FROM family_members WHERE person_id = ?', row.id);
  const sourceCount =
    countQuery('SELECT COUNT(*) AS count FROM source_citations WHERE person_id = ?', row.id)
    + countQuery(`
      SELECT COUNT(*) AS count
      FROM source_citations sc
      INNER JOIN events e ON e.id = sc.event_id
      WHERE e.person_id = ?
    `, row.id);
  const mediaCount = tableExists('person_media')
    ? countQuery('SELECT COUNT(*) AS count FROM person_media WHERE person_id = ?', row.id)
    : 0;

  return {
    id: row.id,
    displayName: displayName(row),
    givenName: row.given_name,
    surname: row.surname,
    birthDate: row.birth_date,
    birthYear: yearFromSortKey(row.birth_sort) ?? yearFromDate(row.birth_date),
    deathDate: row.death_date,
    deathYear: yearFromSortKey(row.death_sort) ?? yearFromDate(row.death_date),
    relationshipCount,
    sourceCount,
    mediaCount,
  };
}

function classifyGroup(rows: PersonFactRow[]): { confidence: PeopleDuplicateConfidence; reasons: string[] } {
  const normalizedNames = new Set(rows.map((row) => normalizeName(row.given_name, row.surname)).filter(Boolean));
  const soundexNames = new Set(rows.map((row) => nameSoundex(row.given_name, row.surname)));
  const birthYears = new Set(rows.map((row) => yearFromSortKey(row.birth_sort) ?? yearFromDate(row.birth_date)).filter(Boolean));
  const deathYears = new Set(rows.map((row) => yearFromSortKey(row.death_sort) ?? yearFromDate(row.death_date)).filter(Boolean));
  const reasons: string[] = [];

  if (normalizedNames.size === 1) reasons.push('Same normalized primary name');
  if (birthYears.size === 1 && birthYears.size > 0) reasons.push('Same birth year');
  if (deathYears.size === 1 && deathYears.size > 0) reasons.push('Same death year');
  if (soundexNames.size === 1 && normalizedNames.size > 1) reasons.push('Compatible Soundex names');

  if (normalizedNames.size === 1 && birthYears.size === 1 && birthYears.size > 0) {
    return { confidence: 'strong', reasons };
  }
  if ((normalizedNames.size === 1 || soundexNames.size === 1) && (birthYears.size === 1 || deathYears.size === 1)) {
    return { confidence: 'partial', reasons };
  }
  return { confidence: 'low', reasons };
}

export function scanPeopleDuplicates(): PeopleDuplicateScan {
  const rows = findPersonFacts();
  const buckets = new Map<string, PersonFactRow[]>();

  for (const row of rows) {
    const normalized = normalizeName(row.given_name, row.surname);
    if (!normalized) continue;
    const birthYear = yearFromSortKey(row.birth_sort) ?? yearFromDate(row.birth_date) ?? 'unknown';
    const key = `${normalized}|${birthYear}`;
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  }

  const groups = [...buckets.values()]
    .filter((group) => group.length > 1)
    .map((group) => {
      const { confidence, reasons } = classifyGroup(group);
      const people = group.map(toSummary);
      return {
        id: groupIdFor(people.map((person) => person.id)),
        confidence,
        reasons,
        people,
      };
    })
    .sort((a, b) => {
      const rank: Record<PeopleDuplicateConfidence, number> = { strong: 0, partial: 1, low: 2 };
      return rank[a.confidence] - rank[b.confidence] || a.people[0].displayName.localeCompare(b.people[0].displayName);
    });

  return { groups };
}

function validateInput(input: PeopleMergeInput): string[] {
  const duplicateIds = [...new Set(input.duplicatePersonIds ?? [])].filter(Boolean);
  if (!input.groupId) throw new Error('groupId is required');
  if (!input.canonicalPersonId) throw new Error('canonicalPersonId is required');
  if (duplicateIds.length === 0) throw new Error('At least one duplicate person is required');
  if (duplicateIds.includes(input.canonicalPersonId)) throw new Error('canonicalPersonId cannot also be a duplicate');
  const expected = groupIdFor([input.canonicalPersonId, ...duplicateIds]);
  if (input.groupId !== expected) throw new Error('groupId does not match selected people');

  const rows = findPersonFacts([input.canonicalPersonId, ...duplicateIds]);
  const found = new Set(rows.map((row) => row.id));
  for (const id of [input.canonicalPersonId, ...duplicateIds]) {
    if (!found.has(id)) throw new Error(`Person not found: ${id}`);
  }
  return duplicateIds;
}

function conflictValue(row: PersonFactRow, field: string): string | null {
  switch (field) {
    case 'sex':
      return row.sex;
    case 'isLiving':
      return row.is_living === null ? null : String(row.is_living);
    case 'birthDate':
      return row.birth_date;
    case 'birthPlace':
      return row.birth_place;
    case 'deathDate':
      return row.death_date;
    case 'deathPlace':
      return row.death_place;
    case 'notes':
      return row.notes;
    default:
      return null;
  }
}

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    sex: 'Sex',
    isLiving: 'Living status',
    birthDate: 'Birth date',
    birthPlace: 'Birth place',
    deathDate: 'Death date',
    deathPlace: 'Death place',
    notes: 'Notes',
  };
  return labels[field] ?? field;
}

function buildConflicts(canonical: PersonFactRow, duplicates: PersonFactRow[]): PeopleMergeConflict[] {
  const fields = ['sex', 'isLiving', 'birthDate', 'birthPlace', 'deathDate', 'deathPlace', 'notes'];
  const conflicts: PeopleMergeConflict[] = [];
  for (const duplicate of duplicates) {
    for (const field of fields) {
      const canonicalValue = conflictValue(canonical, field);
      const duplicateValue = conflictValue(duplicate, field);
      if (!duplicateValue || canonicalValue === duplicateValue) continue;
      if (!canonicalValue || canonicalValue !== duplicateValue) {
        conflicts.push({
          field,
          label: fieldLabel(field),
          canonicalValue,
          duplicatePersonId: duplicate.id,
          duplicateValue,
        });
      }
    }
  }
  return conflicts;
}

function countTransfers(duplicateIds: string[]): PeopleMergeTransferCounts {
  const counts = { ...EMPTY_COUNTS };
  for (const id of duplicateIds) {
    counts.names += countQuery(`
      SELECT COUNT(*) AS count
      FROM names dn
      WHERE dn.person_id = ?
        AND NOT EXISTS (
          SELECT 1
          FROM names cn
          WHERE cn.person_id NOT IN (${duplicateIds.map(() => '?').join(',')})
            AND COALESCE(cn.given_name, '') = COALESCE(dn.given_name, '')
            AND COALESCE(cn.surname, '') = COALESCE(dn.surname, '')
            AND cn.is_primary = dn.is_primary
        )
    `, id, ...duplicateIds);
    counts.events += countQuery('SELECT COUNT(*) AS count FROM events WHERE person_id = ?', id);
    counts.families += countQuery('SELECT COUNT(*) AS count FROM families WHERE spouse1_id = ? OR spouse2_id = ?', id, id);
    counts.families += countQuery('SELECT COUNT(*) AS count FROM family_members WHERE person_id = ?', id);
    counts.sourceCitations += countQuery('SELECT COUNT(*) AS count FROM source_citations WHERE person_id = ?', id);
    counts.sourceCitations += countQuery(`
      SELECT COUNT(*) AS count
      FROM source_citations sc
      INNER JOIN events e ON e.id = sc.event_id
      WHERE e.person_id = ?
    `, id);
    if (tableExists('person_media')) {
      counts.mediaLinks += countQuery('SELECT COUNT(*) AS count FROM person_media WHERE person_id = ?', id);
    }
    if (tableExists('media_person_regions')) {
      counts.mediaRegions += countQuery('SELECT COUNT(*) AS count FROM media_person_regions WHERE person_id = ?', id);
    }
    if (tableExists('users') && columnExists('users', 'home_person_id')) {
      counts.userHomePeople += countQuery('SELECT COUNT(*) AS count FROM users WHERE home_person_id = ?', id);
    }
    if (tableExists('export_jobs') && columnExists('export_jobs', 'scope_person_id')) {
      counts.exportScopes += countQuery('SELECT COUNT(*) AS count FROM export_jobs WHERE scope_person_id = ?', id);
    }
  }
  return counts;
}

export function previewPeopleMerge(input: PeopleMergeInput): PeopleMergePreview {
  const duplicateIds = validateInput(input);
  const rows = findPersonFacts([input.canonicalPersonId, ...duplicateIds]);
  const canonical = rows.find((row) => row.id === input.canonicalPersonId)!;
  const duplicates = duplicateIds.map((id) => rows.find((row) => row.id === id)!);

  return {
    groupId: input.groupId,
    canonicalPersonId: input.canonicalPersonId,
    duplicatePersonIds: duplicateIds,
    conflicts: buildConflicts(canonical, duplicates),
    transferCounts: countTransfers(duplicateIds),
  };
}

function choiceFor(input: PeopleMergeInput, field: string): FieldChoice {
  return input.fieldResolutions?.[field] ?? 'canonical';
}

function duplicateIdFromChoice(choice: FieldChoice): string | null {
  return choice.startsWith('duplicate:') ? choice.slice('duplicate:'.length) : null;
}

function updateCanonicalPersonFields(input: PeopleMergeInput, rows: PersonFactRow[]) {
  const db = getDatabase();
  const duplicateById = new Map(rows.map((row) => [row.id, row]));
  const personSets: string[] = [];
  const personParams: unknown[] = [];

  for (const field of ['sex', 'isLiving', 'notes']) {
    const duplicateId = duplicateIdFromChoice(choiceFor(input, field));
    if (!duplicateId) continue;
    const duplicate = duplicateById.get(duplicateId);
    if (!duplicate) continue;
    if (field === 'sex') {
      personSets.push('sex = ?');
      personParams.push(duplicate.sex);
    } else if (field === 'isLiving') {
      personSets.push('is_living = ?');
      personParams.push(duplicate.is_living);
    } else if (field === 'notes') {
      personSets.push('notes = ?');
      personParams.push(duplicate.notes);
    }
  }

  if (personSets.length > 0) {
    personSets.push('updated_at = datetime(\'now\')');
    db.prepare(`UPDATE persons SET ${personSets.join(', ')} WHERE id = ?`).run(...personParams, input.canonicalPersonId);
  }
}

function copyMissingNames(canonicalPersonId: string, duplicateIds: string[]) {
  const db = getDatabase();
  const duplicateNames = db.prepare(`
    SELECT *
    FROM names
    WHERE person_id IN (${duplicateIds.map(() => '?').join(',')})
    ORDER BY is_primary ASC, sort_order ASC, id ASC
  `).all(...duplicateIds) as Array<Record<string, unknown>>;

  for (const name of duplicateNames) {
    const exists = db.prepare(`
      SELECT id
      FROM names
      WHERE person_id = ?
        AND COALESCE(given_name, '') = COALESCE(?, '')
        AND COALESCE(surname, '') = COALESCE(?, '')
        AND is_primary = ?
      LIMIT 1
    `).get(canonicalPersonId, name.given_name, name.surname, name.is_primary) as { id: string } | undefined;
    if (exists) continue;
    db.prepare(`
      INSERT INTO names (
        id, person_id, name_type, prefix, given_name, surname, suffix, is_primary, sort_order, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, datetime('now'), datetime('now'))
    `).run(
      randomUUID(),
      canonicalPersonId,
      name.name_type,
      name.prefix,
      name.given_name,
      name.surname,
      name.suffix,
      name.sort_order,
    );
  }
}

function canonicalEventFor(personId: string, duplicateEvent: EventRow): EventRow | undefined {
  return getDatabase().prepare(`
    SELECT id, person_id, event_type, event_date, event_date_sort_key, event_place
    FROM events
    WHERE person_id = ? AND event_type = ?
    ORDER BY event_date_sort_key IS NULL, event_date_sort_key ASC, id ASC
    LIMIT 1
  `).get(personId, duplicateEvent.event_type) as EventRow | undefined;
}

function moveEvents(canonicalPersonId: string, duplicateIds: string[]) {
  const db = getDatabase();
  const events = db.prepare(`
    SELECT id, person_id, event_type, event_date, event_date_sort_key, event_place
    FROM events
    WHERE person_id IN (${duplicateIds.map(() => '?').join(',')})
    ORDER BY event_type ASC, id ASC
  `).all(...duplicateIds) as EventRow[];

  for (const event of events) {
    const canonicalEvent = canonicalEventFor(canonicalPersonId, event);
    if (canonicalEvent) {
      db.prepare('UPDATE source_citations SET event_id = ? WHERE event_id = ?').run(canonicalEvent.id, event.id);
      db.prepare('DELETE FROM events WHERE id = ?').run(event.id);
    } else {
      db.prepare('UPDATE events SET person_id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(canonicalPersonId, event.id);
    }
  }
}

function moveFamilies(canonicalPersonId: string, duplicateIds: string[]) {
  const db = getDatabase();
  for (const id of duplicateIds) {
    db.prepare('UPDATE families SET spouse1_id = ?, updated_at = datetime(\'now\') WHERE spouse1_id = ?').run(canonicalPersonId, id);
    db.prepare('UPDATE families SET spouse2_id = ?, updated_at = datetime(\'now\') WHERE spouse2_id = ?').run(canonicalPersonId, id);

    const memberships = db.prepare('SELECT id, family_id FROM family_members WHERE person_id = ?').all(id) as Array<{ id: string; family_id: string }>;
    for (const membership of memberships) {
      const exists = db.prepare('SELECT id FROM family_members WHERE family_id = ? AND person_id = ?').get(membership.family_id, canonicalPersonId);
      if (exists) {
        db.prepare('DELETE FROM family_members WHERE id = ?').run(membership.id);
      } else {
        db.prepare('UPDATE family_members SET person_id = ? WHERE id = ?').run(canonicalPersonId, membership.id);
      }
    }
  }
}

function moveMedia(canonicalPersonId: string, duplicateIds: string[]) {
  const db = getDatabase();
  if (tableExists('person_media')) {
    const links = db.prepare(`
      SELECT person_id, media_id, is_primary, sort_order
      FROM person_media
      WHERE person_id IN (${duplicateIds.map(() => '?').join(',')})
    `).all(...duplicateIds) as Array<{ media_id: string; is_primary: number; sort_order: number }>;
    for (const link of links) {
      db.prepare(`
        INSERT OR IGNORE INTO person_media (person_id, media_id, is_primary, sort_order, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run(canonicalPersonId, link.media_id, link.is_primary, link.sort_order);
    }
    db.prepare(`DELETE FROM person_media WHERE person_id IN (${duplicateIds.map(() => '?').join(',')})`).run(...duplicateIds);
  }

  if (tableExists('media_person_regions')) {
    db.prepare(`
      UPDATE media_person_regions
      SET person_id = ?, updated_at = datetime('now')
      WHERE person_id IN (${duplicateIds.map(() => '?').join(',')})
    `).run(canonicalPersonId, ...duplicateIds);
  }
}

function moveDirectReferences(canonicalPersonId: string, duplicateIds: string[]) {
  const db = getDatabase();
  db.prepare(`
    UPDATE source_citations
    SET person_id = ?
    WHERE person_id IN (${duplicateIds.map(() => '?').join(',')})
  `).run(canonicalPersonId, ...duplicateIds);

  if (tableExists('users') && columnExists('users', 'home_person_id')) {
    db.prepare(`
      UPDATE users
      SET home_person_id = ?
      WHERE home_person_id IN (${duplicateIds.map(() => '?').join(',')})
    `).run(canonicalPersonId, ...duplicateIds);
  }

  if (tableExists('export_jobs') && columnExists('export_jobs', 'scope_person_id')) {
    db.prepare(`
      UPDATE export_jobs
      SET scope_person_id = ?
      WHERE scope_person_id IN (${duplicateIds.map(() => '?').join(',')})
    `).run(canonicalPersonId, ...duplicateIds);
  }
}

export function applyPeopleMerge(input: PeopleMergeInput): PeopleMergeResult {
  const duplicateIds = validateInput(input);
  const preview = previewPeopleMerge(input);
  const db = getDatabase();

  const runMerge = db.transaction(() => {
    const rows = findPersonFacts([input.canonicalPersonId, ...duplicateIds]);
    updateCanonicalPersonFields(input, rows);
    copyMissingNames(input.canonicalPersonId, duplicateIds);
    moveEvents(input.canonicalPersonId, duplicateIds);
    moveFamilies(input.canonicalPersonId, duplicateIds);
    moveDirectReferences(input.canonicalPersonId, duplicateIds);
    moveMedia(input.canonicalPersonId, duplicateIds);
    db.prepare(`DELETE FROM persons WHERE id IN (${duplicateIds.map(() => '?').join(',')})`).run(...duplicateIds);
  });

  runMerge();

  return {
    ...preview,
    mergedPersonIds: duplicateIds,
  };
}
