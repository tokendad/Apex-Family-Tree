import { randomUUID } from 'crypto';
import { getDatabase } from '../../db/connection.js';
import { EventRepository } from '../../repositories/EventRepository.js';
import { dateMatch, nameSoundex, normalizeName } from '../gedcom/matcher.js';
import { soundex } from '../../utils/soundex.js';

export type PeopleDuplicateConfidence = 'strong' | 'partial' | 'low';
export type FieldChoice = 'canonical' | `duplicate:${string}` | 'blank';
export type ComparisonStatus = 'match' | 'possible' | 'different' | 'missing';

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
  matchScore: number | null;
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

export interface PeopleMergeComparison {
  field: string;
  label: string;
  status: ComparisonStatus;
  hasSelection: boolean;
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
  comparisons: PeopleMergeComparison[];
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
  spouse_name: string | null;
  father_name: string | null;
  mother_name: string | null;
  occupation: string | null;
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

function personDisplayNameSql(personIdExpr: string): string {
  return `(
    SELECT TRIM(COALESCE(dn.given_name, '') || ' ' || COALESCE(dn.surname, ''))
    FROM names dn
    WHERE dn.person_id = ${personIdExpr}
    ORDER BY dn.is_primary DESC, dn.sort_order ASC, dn.id ASC
    LIMIT 1
  )`;
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
      death.event_place AS death_place,
      NULLIF(${personDisplayNameSql(`(
        SELECT CASE WHEN f.spouse1_id = p.id THEN f.spouse2_id ELSE f.spouse1_id END
        FROM families f
        WHERE (f.spouse1_id = p.id OR f.spouse2_id = p.id)
          AND CASE WHEN f.spouse1_id = p.id THEN f.spouse2_id ELSE f.spouse1_id END IS NOT NULL
        ORDER BY f.id ASC
        LIMIT 1
      )`)}, '') AS spouse_name,
      NULLIF(${personDisplayNameSql(`(
        SELECT CASE
          WHEN COALESCE((SELECT sex FROM persons WHERE id = pf.spouse1_id), 'M') = 'M' THEN pf.spouse1_id
          ELSE pf.spouse2_id
        END
        FROM family_members fm
        INNER JOIN families pf ON pf.id = fm.family_id
        WHERE fm.person_id = p.id AND fm.role = 'child'
          AND (pf.spouse1_id IS NOT NULL OR pf.spouse2_id IS NOT NULL)
        ORDER BY fm.id ASC
        LIMIT 1
      )`)}, '') AS father_name,
      NULLIF(${personDisplayNameSql(`(
        SELECT CASE
          WHEN COALESCE((SELECT sex FROM persons WHERE id = pf.spouse2_id), 'F') = 'F' THEN pf.spouse2_id
          ELSE pf.spouse1_id
        END
        FROM family_members fm
        INNER JOIN families pf ON pf.id = fm.family_id
        WHERE fm.person_id = p.id AND fm.role = 'child'
          AND (pf.spouse1_id IS NOT NULL OR pf.spouse2_id IS NOT NULL)
        ORDER BY fm.id ASC
        LIMIT 1
      )`)}, '') AS mother_name,
      occupation.description AS occupation
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
    LEFT JOIN events occupation
      ON occupation.id = (
        SELECT id
        FROM events
        WHERE person_id = p.id AND event_type = 'occupation'
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

function matchScore(rows: PersonFactRow[]): number | null {
  if (rows.length < 2) return null;
  const normalizedNames = new Set(rows.map((row) => normalizeName(row.given_name, row.surname)).filter(Boolean));
  const soundexNames = new Set(rows.map((row) => nameSoundex(row.given_name, row.surname)));
  const birthYears = new Set(rows.map((row) => yearFromSortKey(row.birth_sort) ?? yearFromDate(row.birth_date)).filter(Boolean));
  const deathYears = new Set(rows.map((row) => yearFromSortKey(row.death_sort) ?? yearFromDate(row.death_date)).filter(Boolean));

  let score = 0;
  if (normalizedNames.size === 1) score += 50;
  else if (soundexNames.size === 1) score += 25;
  if (birthYears.size === 1 && birthYears.size > 0) score += 25;
  if (deathYears.size === 1 && deathYears.size > 0) score += 25;

  return Math.min(100, Math.round(score / 5) * 5);
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
        matchScore: matchScore(group),
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

type ComparisonKind = 'name' | 'date' | 'place' | 'text';

interface ComparisonFieldSpec {
  field: string;
  label: string;
  kind: ComparisonKind;
  hasSelection: boolean;
}

/* Spouse/father/mother/occupation are relationship facts the merge already
   unions onto the canonical person (moveFamilies/moveEvents carry both
   sides over unconditionally) -- so there is no "use this" action that
   would change what gets written. They're shown for context only. */
const COMPARISON_FIELDS: ComparisonFieldSpec[] = [
  { field: 'fullName', label: 'Full name', kind: 'name', hasSelection: true },
  { field: 'birthDate', label: 'Birth date', kind: 'date', hasSelection: true },
  { field: 'birthPlace', label: 'Birth place', kind: 'place', hasSelection: true },
  { field: 'deathDate', label: 'Death date', kind: 'date', hasSelection: true },
  { field: 'deathPlace', label: 'Death place', kind: 'place', hasSelection: true },
  { field: 'spouse', label: 'Spouse', kind: 'name', hasSelection: false },
  { field: 'father', label: 'Father', kind: 'name', hasSelection: false },
  { field: 'mother', label: 'Mother', kind: 'name', hasSelection: false },
  { field: 'occupation', label: 'Occupation', kind: 'text', hasSelection: false },
  { field: 'sex', label: 'Sex', kind: 'text', hasSelection: true },
  { field: 'isLiving', label: 'Living status', kind: 'text', hasSelection: true },
  { field: 'notes', label: 'Notes', kind: 'text', hasSelection: true },
];

function fieldValue(row: PersonFactRow, field: string): string | null {
  switch (field) {
    case 'fullName':
      return [row.given_name, row.surname].filter(Boolean).join(' ').trim() || null;
    case 'birthDate':
      return row.birth_date;
    case 'birthPlace':
      return row.birth_place;
    case 'deathDate':
      return row.death_date;
    case 'deathPlace':
      return row.death_place;
    case 'spouse':
      return row.spouse_name;
    case 'father':
      return row.father_name;
    case 'mother':
      return row.mother_name;
    case 'occupation':
      return row.occupation;
    case 'sex':
      return row.sex;
    case 'isLiving':
      return row.is_living === null ? null : String(row.is_living);
    case 'notes':
      return row.notes;
    default:
      return null;
  }
}

function normalizeFullName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function isInitialOf(short: string, long: string): boolean {
  return (short.length === 1 && long.length > 1 && long.startsWith(short))
    || (long.length === 1 && short.length > 1 && short.startsWith(long));
}

function classifyName(a: string, b: string): ComparisonStatus {
  const na = normalizeFullName(a);
  const nb = normalizeFullName(b);
  if (na === nb) return 'match';
  const tokensA = na.split(' ').filter(Boolean);
  const tokensB = nb.split(' ').filter(Boolean);
  if (tokensA.length === tokensB.length
    && tokensA.every((token, i) => token === tokensB[i]
      || isInitialOf(token, tokensB[i])
      || soundex(token) === soundex(tokensB[i]))) {
    return 'possible';
  }
  return 'different';
}

function classifyDate(a: string, b: string): ComparisonStatus {
  if (a === b) return 'match';
  return dateMatch(a, b) === 'match' ? 'possible' : 'different';
}

/* Deliberately small -- just enough to cover the issue's own example
   (Massachusetts vs MA). Extend this map only as real false positives show
   up; it isn't meant to be an exhaustive gazetteer. */
const STATE_ABBREVIATIONS: Record<string, string> = {
  massachusetts: 'ma',
  'new hampshire': 'nh',
  maine: 'me',
  vermont: 'vt',
  connecticut: 'ct',
  'rhode island': 'ri',
};

function normalizePlace(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s,]/g, '').replace(/\s+/g, ' ').trim();
}

function expandPlaceAbbreviations(value: string): string {
  let expanded = value;
  for (const [full, abbr] of Object.entries(STATE_ABBREVIATIONS)) {
    expanded = expanded.replace(new RegExp(`\\b${abbr}\\b`, 'g'), full);
  }
  return expanded;
}

function classifyPlace(a: string, b: string): ComparisonStatus {
  const na = normalizePlace(a);
  const nb = normalizePlace(b);
  if (na === nb) return 'match';
  if (expandPlaceAbbreviations(na) === expandPlaceAbbreviations(nb)) return 'possible';
  if (na.includes(nb) || nb.includes(na)) return 'possible';
  return 'different';
}

function classifyText(a: string, b: string): ComparisonStatus {
  return a.trim().toLowerCase() === b.trim().toLowerCase() ? 'match' : 'different';
}

function classifyField(a: string | null, b: string | null, kind: ComparisonKind): ComparisonStatus {
  const hasA = !!a && a.trim().length > 0;
  const hasB = !!b && b.trim().length > 0;
  if (!hasA || !hasB) return 'missing';
  switch (kind) {
    case 'name':
      return classifyName(a as string, b as string);
    case 'date':
      return classifyDate(a as string, b as string);
    case 'place':
      return classifyPlace(a as string, b as string);
    default:
      return classifyText(a as string, b as string);
  }
}

function buildComparisons(canonical: PersonFactRow, duplicates: PersonFactRow[]): PeopleMergeComparison[] {
  const comparisons: PeopleMergeComparison[] = [];
  for (const duplicate of duplicates) {
    for (const spec of COMPARISON_FIELDS) {
      const canonicalValue = fieldValue(canonical, spec.field);
      const duplicateValue = fieldValue(duplicate, spec.field);
      const status = classifyField(canonicalValue, duplicateValue, spec.kind);
      comparisons.push({
        field: spec.field,
        label: spec.label,
        status,
        hasSelection: spec.hasSelection && status !== 'match',
        canonicalValue,
        duplicatePersonId: duplicate.id,
        duplicateValue,
      });
    }
  }
  return comparisons;
}

function requireResolutions(input: PeopleMergeInput, comparisons: PeopleMergeComparison[]): void {
  const missing: string[] = [];
  for (const comparison of comparisons) {
    if (!comparison.hasSelection) continue;
    if (comparison.status !== 'different' && comparison.status !== 'possible') continue;
    if (!input.fieldResolutions?.[comparison.field]) missing.push(comparison.label);
  }
  if (missing.length > 0) {
    throw new Error(`A selection is required for: ${[...new Set(missing)].join(', ')}`);
  }
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
    comparisons: buildComparisons(canonical, duplicates),
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
    const choice = choiceFor(input, field);
    /* is_living is NOT NULL in the schema, so "blank" isn't a representable
       state for it -- leave it alone rather than violate the constraint. */
    if (choice === 'blank' && field !== 'isLiving') {
      personSets.push(`${field === 'sex' ? 'sex' : 'notes'} = ?`);
      personParams.push(null);
      continue;
    }
    const duplicateId = duplicateIdFromChoice(choice);
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

  // These writes bypass EventRepository, so the subject edge in the
  // relationship graph has to be kept in step by hand. Without this a merge
  // leaves the event drawn to the duplicate person who no longer exists.
  const eventRepo = new EventRepository();

  for (const event of events) {
    const canonicalEvent = canonicalEventFor(canonicalPersonId, event);
    if (canonicalEvent) {
      db.prepare('UPDATE source_citations SET event_id = ? WHERE event_id = ?').run(canonicalEvent.id, event.id);
      eventRepo.syncEventSubject(event.id, null, null);
      db.prepare('DELETE FROM events WHERE id = ?').run(event.id);
    } else {
      db.prepare('UPDATE events SET person_id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(canonicalPersonId, event.id);
      eventRepo.syncEventSubject(event.id, canonicalPersonId, null);
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

/**
 * Carry a duplicate's archive-model memberships over to the surviving person.
 *
 * Relationships record their members as archive_objects, and nothing links
 * relationship_members back to persons -- so deleting a duplicate used to
 * leave its memberships behind pointing at an archive object for a person who
 * no longer existed. One such ghost was found in this tree: "Alta Lefort",
 * still listed as a child of Gustave and Mabel's union long after the merge
 * that removed her. 063 cleaned that up and added a trigger that now sweeps
 * such rows away on delete, but sweeping them away loses them; moving them
 * first is what makes a merge inherit the duplicate's relationships, which is
 * what a merge is supposed to do.
 *
 * Re-pointed one row at a time rather than with a bulk UPDATE, because
 * relationship_members is UNIQUE on (relationship_id, object_id, role): where
 * the canonical person is already a member in that role -- both halves of a
 * duplicate pair sitting in the same family union, say -- the update would
 * collide, so the duplicate's row is simply dropped instead.
 */
function moveArchiveMemberships(canonicalPersonId: string, duplicateIds: string[]) {
  const db = getDatabase();
  if (!tableExists('relationship_members')) return;

  const placeholders = duplicateIds.map(() => '?').join(',');
  const memberships = db.prepare(`
    SELECT id, relationship_id, role
    FROM relationship_members
    WHERE object_id IN (${placeholders})
  `).all(...duplicateIds) as Array<{ id: string; relationship_id: string; role: string }>;

  for (const membership of memberships) {
    const taken = db.prepare(`
      SELECT 1 FROM relationship_members
      WHERE relationship_id = ? AND object_id = ? AND role = ?
    `).get(membership.relationship_id, canonicalPersonId, membership.role);

    if (taken) {
      db.prepare('DELETE FROM relationship_members WHERE id = ?').run(membership.id);
    } else {
      db.prepare('UPDATE relationship_members SET object_id = ? WHERE id = ?')
        .run(canonicalPersonId, membership.id);
    }
  }

  // The archive object itself goes with the person. The trigger added in 063
  // would catch this too, but doing it here keeps the merge self-contained.
  if (tableExists('archive_objects')) {
    db.prepare(`
      DELETE FROM archive_objects
      WHERE object_type = 'person' AND id IN (${placeholders})
    `).run(...duplicateIds);
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

/* Promotes the chosen side's primary name onto the canonical person. Runs
   before copyMissingNames so that function's own exists-check picks up the
   row this just wrote (or inserted) and doesn't duplicate it. */
function applyFullNameResolution(input: PeopleMergeInput, duplicateById: Map<string, PersonFactRow>) {
  const duplicateId = duplicateIdFromChoice(choiceFor(input, 'fullName'));
  if (!duplicateId) return;
  const duplicate = duplicateById.get(duplicateId);
  if (!duplicate) return;

  const db = getDatabase();
  const duplicateName = db.prepare(`
    SELECT name_type, given_name, surname
    FROM names
    WHERE person_id = ?
    ORDER BY is_primary DESC, sort_order ASC, id ASC
    LIMIT 1
  `).get(duplicateId) as { name_type: string; given_name: string | null; surname: string | null } | undefined;
  if (!duplicateName) return;

  db.prepare('UPDATE names SET is_primary = 0 WHERE person_id = ? AND is_primary = 1').run(input.canonicalPersonId);
  const existing = db.prepare(`
    SELECT id FROM names
    WHERE person_id = ?
      AND COALESCE(given_name, '') = COALESCE(?, '')
      AND COALESCE(surname, '') = COALESCE(?, '')
    LIMIT 1
  `).get(input.canonicalPersonId, duplicateName.given_name, duplicateName.surname) as { id: string } | undefined;

  if (existing) {
    db.prepare('UPDATE names SET is_primary = 1, updated_at = datetime(\'now\') WHERE id = ?').run(existing.id);
  } else {
    db.prepare(`
      INSERT INTO names (id, person_id, name_type, given_name, surname, is_primary, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, 0, datetime('now'), datetime('now'))
    `).run(randomUUID(), input.canonicalPersonId, duplicateName.name_type, duplicateName.given_name, duplicateName.surname);
  }
}

/* moveEvents already decided which single birth/death event survives on the
   canonical person (merging citations either way, and -- when the canonical
   side had no event of that type -- transferring the duplicate's row onto
   the canonical person by default). This resolves every birth/death field
   explicitly against the chosen side's own original value, including
   'canonical', rather than treating 'canonical' as a no-op: if the
   canonical person had no value, moveEvents has already filled that slot
   with a duplicate's event, and an explicit "use canonical" (or a default
   that resolves to the canonical's empty side) must still clear it back out.
   Dates go through EventRepository so event_date_qualifier is recalculated
   from the adopted date rather than left over from whichever row survived. */
function applyBirthDeathResolutions(
  input: PeopleMergeInput,
  canonical: PersonFactRow,
  duplicateById: Map<string, PersonFactRow>,
) {
  const db = getDatabase();
  const eventRepo = new EventRepository();
  const updates: Array<{ field: string; eventType: string; column: 'date' | 'place' }> = [
    { field: 'birthDate', eventType: 'birth', column: 'date' },
    { field: 'birthPlace', eventType: 'birth', column: 'place' },
    { field: 'deathDate', eventType: 'death', column: 'date' },
    { field: 'deathPlace', eventType: 'death', column: 'place' },
  ];

  for (const { field, eventType, column } of updates) {
    const choice = choiceFor(input, field);
    const duplicateId = duplicateIdFromChoice(choice);
    const source = duplicateId ? duplicateById.get(duplicateId) : choice === 'blank' ? null : canonical;
    if (duplicateId && !source) continue;

    const existingEvent = db.prepare('SELECT id FROM events WHERE person_id = ? AND event_type = ?')
      .get(input.canonicalPersonId, eventType) as { id: string } | undefined;
    if (!existingEvent) continue;

    if (column === 'date') {
      const date = eventType === 'birth' ? source?.birth_date ?? null : source?.death_date ?? null;
      eventRepo.update(existingEvent.id, { event_date: date });
    } else {
      const place = eventType === 'birth' ? source?.birth_place ?? null : source?.death_place ?? null;
      db.prepare(`UPDATE events SET event_place = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(place, existingEvent.id);
    }
  }
}

/* Issue #70 requires missing-information fields to default to whichever
   side has the value. The frontend pre-selects that default for display,
   but a caller hitting this service directly (no UI in the loop) must get
   the same guarantee, so it's applied here too before anything is written. */
function withMissingFieldDefaults(input: PeopleMergeInput, comparisons: PeopleMergeComparison[]): PeopleMergeInput {
  const fieldResolutions = { ...input.fieldResolutions };
  const missingByField = new Map<string, PeopleMergeComparison[]>();
  for (const comparison of comparisons) {
    if (!comparison.hasSelection || comparison.status !== 'missing') continue;
    const bucket = missingByField.get(comparison.field) ?? [];
    bucket.push(comparison);
    missingByField.set(comparison.field, bucket);
  }
  // A field with 3+ people in the merge group produces one "missing"
  // comparison per duplicate. Looking at only the first one risks defaulting
  // to 'blank' because that duplicate happens to be empty too, even though a
  // later duplicate in the same group actually has the value -- so this
  // scans every duplicate for the field before giving up on a populated side.
  for (const [field, fieldComparisons] of missingByField) {
    if (fieldResolutions[field]) continue;
    const withCanonical = fieldComparisons.find((comparison) => comparison.canonicalValue);
    if (withCanonical) {
      fieldResolutions[field] = 'canonical';
      continue;
    }
    const withDuplicate = fieldComparisons.find((comparison) => comparison.duplicateValue);
    fieldResolutions[field] = withDuplicate ? `duplicate:${withDuplicate.duplicatePersonId}` : 'blank';
  }
  return { ...input, fieldResolutions };
}

export function applyPeopleMerge(input: PeopleMergeInput): PeopleMergeResult {
  const duplicateIds = validateInput(input);
  const preview = previewPeopleMerge(input);
  requireResolutions(input, preview.comparisons);
  const resolvedInput = withMissingFieldDefaults(input, preview.comparisons);
  const db = getDatabase();

  const runMerge = db.transaction(() => {
    const rows = findPersonFacts([resolvedInput.canonicalPersonId, ...duplicateIds]);
    const canonical = rows.find((row) => row.id === resolvedInput.canonicalPersonId)!;
    const duplicateById = new Map(rows.filter((row) => duplicateIds.includes(row.id)).map((row) => [row.id, row]));
    updateCanonicalPersonFields(resolvedInput, rows);
    applyFullNameResolution(resolvedInput, duplicateById);
    copyMissingNames(resolvedInput.canonicalPersonId, duplicateIds);
    moveEvents(resolvedInput.canonicalPersonId, duplicateIds);
    applyBirthDeathResolutions(resolvedInput, canonical, duplicateById);
    moveFamilies(resolvedInput.canonicalPersonId, duplicateIds);
    moveDirectReferences(resolvedInput.canonicalPersonId, duplicateIds);
    moveMedia(resolvedInput.canonicalPersonId, duplicateIds);
    moveArchiveMemberships(resolvedInput.canonicalPersonId, duplicateIds);
    db.prepare(`DELETE FROM persons WHERE id IN (${duplicateIds.map(() => '?').join(',')})`).run(...duplicateIds);
  });

  runMerge();

  return {
    ...preview,
    mergedPersonIds: duplicateIds,
  };
}
