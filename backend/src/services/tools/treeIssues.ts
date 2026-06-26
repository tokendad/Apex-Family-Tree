import { getDatabase } from '../../db/connection.js';

export type TreeIssueStatus = 'open' | 'resolved' | 'dismissed';
export type TreeIssueSeverity = 'high' | 'medium' | 'low';

export interface TreeIssue {
  id: string;
  type: string;
  severity: TreeIssueSeverity;
  status: TreeIssueStatus;
  title: string;
  summary: string;
  primary_entity_type: string;
  primary_entity_id: string;
  related_entities_json: string;
  fingerprint: string;
  detected_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  dismissed_at: string | null;
  note: string | null;
}

export interface TreeIssueCandidate {
  type: string;
  severity: TreeIssueSeverity;
  title: string;
  summary: string;
  primaryEntityType: string;
  primaryEntityId: string;
  relatedEntities: Array<{ type: string; id: string; label?: string | null }>;
  fingerprint: string;
}

export interface TreeIssueListOptions {
  status?: TreeIssueStatus;
  type?: string;
  severity?: TreeIssueSeverity;
  limit?: number;
  cursor?: string;
}

export interface TreeIssueSummary {
  open: number;
  bySeverity: Record<TreeIssueSeverity, number>;
  byType: Record<string, number>;
  lastScanAt: string | null;
}

export interface TreeIssueScanResult {
  detected: number;
  created: number;
  updated: number;
  reopened: number;
  dismissed: number;
  open: number;
}

const DEFAULT_LIMIT = 50;

function now(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

function tableExists(name: string): boolean {
  const db = getDatabase();
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
  return Boolean(row);
}

function personLabel(personId: string): string {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT
      p.display_name,
      n.given_name,
      n.middle_name,
      n.surname
    FROM persons p
    LEFT JOIN names n ON n.id = (
      SELECT id FROM names
      WHERE person_id = p.id
      ORDER BY is_primary DESC, sort_order ASC
      LIMIT 1
    )
    WHERE p.id = ?
  `).get(personId) as {
    display_name: string | null;
    given_name: string | null;
    middle_name: string | null;
    surname: string | null;
  } | undefined;

  if (!row) return personId;
  if (row.display_name) return row.display_name;
  const parts = [row.given_name, row.middle_name, row.surname].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Unnamed person';
}

function familyLabel(familyId: string): string {
  const db = getDatabase();
  const row = db.prepare('SELECT spouse1_id, spouse2_id FROM families WHERE id = ?').get(familyId) as {
    spouse1_id: string | null;
    spouse2_id: string | null;
  } | undefined;
  if (!row) return familyId;
  return [row.spouse1_id ? personLabel(row.spouse1_id) : null, row.spouse2_id ? personLabel(row.spouse2_id) : null]
    .filter(Boolean)
    .join(' and ') || 'Family record';
}

function activeMarriageIssues(): TreeIssueCandidate[] {
  const db = getDatabase();
  const rows = db.prepare(`
    WITH active_spouses AS (
      SELECT id AS family_id, spouse1_id AS person_id FROM families WHERE spouse1_id IS NOT NULL AND divorce_date IS NULL
      UNION ALL
      SELECT id AS family_id, spouse2_id AS person_id FROM families WHERE spouse2_id IS NOT NULL AND divorce_date IS NULL
    )
    SELECT person_id, COUNT(*) AS active_count, GROUP_CONCAT(family_id) AS family_ids
    FROM active_spouses
    GROUP BY person_id
    HAVING COUNT(*) > 1
    ORDER BY person_id ASC
  `).all() as { person_id: string; active_count: number; family_ids: string }[];

  return rows.map((row) => {
    const label = personLabel(row.person_id);
    const families = row.family_ids.split(',');
    return {
      type: 'multiple_active_marriages',
      severity: 'high',
      title: `${label} has ${row.active_count} active marriages`,
      summary: 'This person appears in more than one family with no divorce date recorded.',
      primaryEntityType: 'person',
      primaryEntityId: row.person_id,
      relatedEntities: families.map((id) => ({ type: 'family', id, label: familyLabel(id) })),
      fingerprint: `multiple-active-marriages:${row.person_id}`,
    };
  });
}

function deathWithActiveFamilyIssues(): TreeIssueCandidate[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT DISTINCT p.id AS person_id, f.id AS family_id
    FROM persons p
    INNER JOIN events e ON e.person_id = p.id AND e.event_type = 'death'
    INNER JOIN families f ON (f.spouse1_id = p.id OR f.spouse2_id = p.id)
    WHERE f.divorce_date IS NULL
    ORDER BY p.id ASC, f.id ASC
  `).all() as { person_id: string; family_id: string }[];

  return rows.map((row) => {
    const label = personLabel(row.person_id);
    return {
      type: 'death_with_active_family',
      severity: 'medium',
      title: `${label} has a death event and an active family`,
      summary: 'A death event exists, but the spouse family has no divorce or other closure recorded.',
      primaryEntityType: 'person',
      primaryEntityId: row.person_id,
      relatedEntities: [{ type: 'family', id: row.family_id, label: familyLabel(row.family_id) }],
      fingerprint: `death-with-active-family:${row.person_id}:${row.family_id}`,
    };
  });
}

function marriageEventWithoutFamilyIssues(): TreeIssueCandidate[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT e.id AS event_id, e.person_id, e.event_date
    FROM events e
    WHERE e.event_type = 'marriage'
      AND NOT EXISTS (
        SELECT 1 FROM families f
        WHERE (f.spouse1_id = e.person_id OR f.spouse2_id = e.person_id)
          AND COALESCE(f.marriage_date, '') = COALESCE(e.event_date, '')
      )
    ORDER BY e.id ASC
  `).all() as { event_id: string; person_id: string; event_date: string | null }[];

  return rows.map((row) => {
    const label = personLabel(row.person_id);
    return {
      type: 'marriage_event_without_family',
      severity: 'medium',
      title: `${label} has a marriage event with no matching family`,
      summary: 'A marriage event exists on the person timeline, but no spouse family with the same date was found.',
      primaryEntityType: 'person',
      primaryEntityId: row.person_id,
      relatedEntities: [{ type: 'event', id: row.event_id, label: row.event_date }],
      fingerprint: `marriage-event-without-family:${row.event_id}`,
    };
  });
}

function familyWithoutMarriageEventIssues(): TreeIssueCandidate[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, spouse1_id, spouse2_id, marriage_date
    FROM families f
    WHERE f.marriage_date IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM events e
        WHERE e.event_type = 'marriage'
          AND COALESCE(e.event_date, '') = COALESCE(f.marriage_date, '')
          AND (e.person_id = f.spouse1_id OR e.person_id = f.spouse2_id)
      )
    ORDER BY id ASC
  `).all() as { id: string; spouse1_id: string | null; spouse2_id: string | null; marriage_date: string | null }[];

  return rows.map((row) => ({
    type: 'family_without_marriage_event',
    severity: 'low',
    title: `${familyLabel(row.id)} has a family marriage with no timeline event`,
    summary: 'The family record has a marriage date, but neither spouse has a matching marriage event.',
    primaryEntityType: 'family',
    primaryEntityId: row.id,
    relatedEntities: [row.spouse1_id, row.spouse2_id]
      .filter((id): id is string => Boolean(id))
      .map((id) => ({ type: 'person', id, label: personLabel(id) })),
    fingerprint: `family-without-marriage-event:${row.id}`,
  }));
}

function missingCorePersonDataIssues(): TreeIssueCandidate[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT p.id,
      CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM names n
          WHERE n.person_id = p.id
            AND COALESCE(TRIM(n.given_name), '') != ''
        ) THEN 'missing usable name'
        WHEN NOT EXISTS (
          SELECT 1 FROM events e
          WHERE e.person_id = p.id AND e.event_type = 'birth'
        ) THEN 'missing birth event'
        WHEN p.is_living = 0 AND NOT EXISTS (
          SELECT 1 FROM events e
          WHERE e.person_id = p.id AND e.event_type = 'death'
        ) THEN 'deceased person missing death event'
      END AS reason
    FROM persons p
    WHERE reason IS NOT NULL
    ORDER BY p.id ASC
  `).all() as { id: string; reason: string }[];

  return rows.map((row) => {
    const label = personLabel(row.id);
    return {
      type: 'missing_core_person_data',
      severity: 'low',
      title: `${label} is missing core data`,
      summary: `This person is flagged for ${row.reason}.`,
      primaryEntityType: 'person',
      primaryEntityId: row.id,
      relatedEntities: [],
      fingerprint: `missing-core-person-data:${row.id}:${row.reason}`,
    };
  });
}

function unconnectedPersonIssues(): TreeIssueCandidate[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT p.id FROM persons p
    WHERE NOT EXISTS (SELECT 1 FROM families WHERE spouse1_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM families WHERE spouse2_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM family_members WHERE person_id = p.id)
    ORDER BY p.id ASC
  `).all() as { id: string }[];

  return rows.map((row) => {
    const label = personLabel(row.id);
    return {
      type: 'unconnected_person',
      severity: 'low',
      title: `${label} is not connected to a family`,
      summary: 'This person is not listed as a spouse, parent, or child in any family.',
      primaryEntityType: 'person',
      primaryEntityId: row.id,
      relatedEntities: [],
      fingerprint: `unconnected-person:${row.id}`,
    };
  });
}

function disconnectedBranchIssues(): TreeIssueCandidate[] {
  const db = getDatabase();
  const people = db.prepare('SELECT id FROM persons ORDER BY created_at ASC, id ASC').all() as { id: string }[];
  if (people.length === 0) return [];

  const familyRows = db.prepare('SELECT id, spouse1_id, spouse2_id FROM families').all() as {
    id: string;
    spouse1_id: string | null;
    spouse2_id: string | null;
  }[];
  const childRows = db.prepare('SELECT family_id, person_id FROM family_members').all() as {
    family_id: string;
    person_id: string;
  }[];

  const adjacency = new Map<string, Set<string>>();
  const personToFamilies = new Map<string, Set<string>>();
  for (const person of people) adjacency.set(person.id, new Set());

  const connect = (a: string | null, b: string | null, familyId: string) => {
    if (!a || !b) return;
    adjacency.get(a)?.add(b);
    adjacency.get(b)?.add(a);
    if (!personToFamilies.has(a)) personToFamilies.set(a, new Set());
    if (!personToFamilies.has(b)) personToFamilies.set(b, new Set());
    personToFamilies.get(a)?.add(familyId);
    personToFamilies.get(b)?.add(familyId);
  };

  const familyChildren = new Map<string, string[]>();
  for (const child of childRows) {
    if (!familyChildren.has(child.family_id)) familyChildren.set(child.family_id, []);
    familyChildren.get(child.family_id)?.push(child.person_id);
  }

  for (const family of familyRows) {
    connect(family.spouse1_id, family.spouse2_id, family.id);
    for (const childId of familyChildren.get(family.id) ?? []) {
      connect(family.spouse1_id, childId, family.id);
      connect(family.spouse2_id, childId, family.id);
    }
  }

  const bfs = (start: string, allowed?: Set<string>): Set<string> => {
    const seen = new Set<string>();
    const queue = [start];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      if (allowed && !allowed.has(id)) continue;
      seen.add(id);
      for (const next of adjacency.get(id) ?? []) {
        if (!seen.has(next)) queue.push(next);
      }
    }
    return seen;
  };

  const master = bfs(people[0].id);
  const disconnected = new Set(people.map((person) => person.id).filter((id) => !master.has(id)));
  const visited = new Set<string>();
  const issues: TreeIssueCandidate[] = [];

  for (const id of disconnected) {
    if (visited.has(id)) continue;
    const component = bfs(id, disconnected);
    for (const componentId of component) visited.add(componentId);

    const hasFamilyConnection = Array.from(component).some((componentId) => (personToFamilies.get(componentId)?.size ?? 0) > 0);
    if (!hasFamilyConnection) continue;

    const componentIds = Array.from(component).sort();
    const familyIds = Array.from(new Set(componentIds.flatMap((componentId) => Array.from(personToFamilies.get(componentId) ?? [])))).sort();
    const primaryId = componentIds[0];

    issues.push({
      type: 'disconnected_branch',
      severity: 'medium',
      title: `Disconnected branch with ${componentIds.length} people`,
      summary: 'This connected family branch is not reachable from the main tree root.',
      primaryEntityType: 'person',
      primaryEntityId: primaryId,
      relatedEntities: [
        ...componentIds.map((personId) => ({ type: 'person', id: personId, label: personLabel(personId) })),
        ...familyIds.map((familyId) => ({ type: 'family', id: familyId, label: familyLabel(familyId) })),
      ],
      fingerprint: `disconnected-branch:${componentIds.join(',')}`,
    });
  }

  return issues;
}

function unresolvedImportConflictIssues(): TreeIssueCandidate[] {
  if (!tableExists('import_conflicts')) return [];
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, import_job_id, xref, record_type, field_name
    FROM import_conflicts
    WHERE resolution IS NULL
    ORDER BY created_at ASC, id ASC
  `).all() as { id: string; import_job_id: string; xref: string; record_type: string; field_name: string }[];

  return rows.map((row) => ({
    type: 'unresolved_import_conflict',
    severity: 'medium',
    title: `Unresolved GEDCOM ${row.record_type} conflict`,
    summary: `Import ${row.import_job_id} has an unresolved ${row.field_name} conflict for ${row.xref}.`,
    primaryEntityType: 'import_conflict',
    primaryEntityId: row.id,
    relatedEntities: [{ type: 'import_job', id: row.import_job_id, label: row.xref }],
    fingerprint: `unresolved-import-conflict:${row.id}`,
  }));
}

function detectTreeIssues(): TreeIssueCandidate[] {
  return [
    ...activeMarriageIssues(),
    ...deathWithActiveFamilyIssues(),
    ...marriageEventWithoutFamilyIssues(),
    ...familyWithoutMarriageEventIssues(),
    ...missingCorePersonDataIssues(),
    ...unconnectedPersonIssues(),
    ...disconnectedBranchIssues(),
    ...unresolvedImportConflictIssues(),
  ];
}

export function scanTreeIssues(): TreeIssueScanResult {
  const db = getDatabase();
  const detectedAt = now();
  const candidates = detectTreeIssues();
  let created = 0;
  let updated = 0;
  let reopened = 0;
  let dismissed = 0;

  const insert = db.prepare(`
    INSERT INTO data_quality_issues (
      id, type, severity, status, title, summary, primary_entity_type, primary_entity_id,
      related_entities_json, fingerprint, detected_at, last_seen_at, resolved_at, dismissed_at, note
    ) VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
  `);

  const update = db.prepare(`
    UPDATE data_quality_issues
    SET type = ?, severity = ?, title = ?, summary = ?, primary_entity_type = ?,
        primary_entity_id = ?, related_entities_json = ?, last_seen_at = ?,
        status = CASE WHEN status = 'resolved' THEN 'open' ELSE status END,
        resolved_at = CASE WHEN status = 'resolved' THEN NULL ELSE resolved_at END
    WHERE id = ?
  `);

  const find = db.prepare('SELECT * FROM data_quality_issues WHERE fingerprint = ?');

  const transaction = db.transaction(() => {
    for (const candidate of candidates) {
      const existing = find.get(candidate.fingerprint) as TreeIssue | undefined;
      const related = JSON.stringify(candidate.relatedEntities);

      if (!existing) {
        insert.run(
          generateId(),
          candidate.type,
          candidate.severity,
          candidate.title,
          candidate.summary,
          candidate.primaryEntityType,
          candidate.primaryEntityId,
          related,
          candidate.fingerprint,
          detectedAt,
          detectedAt,
        );
        created += 1;
        continue;
      }

      if (existing.status === 'dismissed') dismissed += 1;
      if (existing.status === 'resolved') reopened += 1;
      updated += 1;

      update.run(
        candidate.type,
        candidate.severity,
        candidate.title,
        candidate.summary,
        candidate.primaryEntityType,
        candidate.primaryEntityId,
        related,
        detectedAt,
        existing.id,
      );
    }
  });

  transaction();

  const open = (db.prepare("SELECT COUNT(*) AS count FROM data_quality_issues WHERE status = 'open'").get() as { count: number }).count;

  return {
    detected: candidates.length,
    created,
    updated,
    reopened,
    dismissed,
    open,
  };
}

export function listTreeIssues(options: TreeIssueListOptions = {}): { data: TreeIssue[]; next_cursor: string | null } {
  const db = getDatabase();
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), 200);
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.status) {
    conditions.push('status = ?');
    params.push(options.status);
  }
  if (options.type) {
    conditions.push('type = ?');
    params.push(options.type);
  }
  if (options.severity) {
    conditions.push('severity = ?');
    params.push(options.severity);
  }
  if (options.cursor) {
    conditions.push('id > ?');
    params.push(options.cursor);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT * FROM data_quality_issues
    ${where}
    ORDER BY
      CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
      last_seen_at DESC,
      id ASC
    LIMIT ?
  `).all(...params, limit + 1) as TreeIssue[];

  const hasMore = rows.length > limit;
  if (hasMore) rows.pop();

  return {
    data: rows,
    next_cursor: hasMore ? rows[rows.length - 1]?.id ?? null : null,
  };
}

export function updateTreeIssue(id: string, data: { status?: TreeIssueStatus; note?: string | null }): TreeIssue {
  const db = getDatabase();
  const existing = db.prepare('SELECT * FROM data_quality_issues WHERE id = ?').get(id) as TreeIssue | undefined;
  if (!existing) throw new Error('Tree issue not found');

  const nextStatus = data.status ?? existing.status;
  if (!['open', 'resolved', 'dismissed'].includes(nextStatus)) {
    throw new Error('Invalid tree issue status');
  }

  if (nextStatus === 'dismissed' && !((data.note ?? existing.note) || '').trim()) {
    throw new Error('A note is required when dismissing a tree issue');
  }

  const changedAt = now();
  db.prepare(`
    UPDATE data_quality_issues
    SET status = ?,
        note = ?,
        resolved_at = CASE WHEN ? = 'resolved' THEN ? WHEN ? = 'open' THEN NULL ELSE resolved_at END,
        dismissed_at = CASE WHEN ? = 'dismissed' THEN ? WHEN ? = 'open' THEN NULL ELSE dismissed_at END
    WHERE id = ?
  `).run(
    nextStatus,
    data.note !== undefined ? data.note : existing.note,
    nextStatus,
    changedAt,
    nextStatus,
    nextStatus,
    changedAt,
    nextStatus,
    id,
  );

  return db.prepare('SELECT * FROM data_quality_issues WHERE id = ?').get(id) as TreeIssue;
}

export function getTreeIssueSummary(): TreeIssueSummary {
  const db = getDatabase();
  const bySeverity: Record<TreeIssueSeverity, number> = { high: 0, medium: 0, low: 0 };
  const byType: Record<string, number> = {};

  const severityRows = db.prepare(`
    SELECT severity, COUNT(*) AS count
    FROM data_quality_issues
    WHERE status = 'open'
    GROUP BY severity
  `).all() as { severity: TreeIssueSeverity; count: number }[];
  for (const row of severityRows) bySeverity[row.severity] = row.count;

  const typeRows = db.prepare(`
    SELECT type, COUNT(*) AS count
    FROM data_quality_issues
    WHERE status = 'open'
    GROUP BY type
  `).all() as { type: string; count: number }[];
  for (const row of typeRows) byType[row.type] = row.count;

  const last = db.prepare('SELECT MAX(last_seen_at) AS lastScanAt FROM data_quality_issues').get() as { lastScanAt: string | null };

  return {
    open: bySeverity.high + bySeverity.medium + bySeverity.low,
    bySeverity,
    byType,
    lastScanAt: last.lastScanAt,
  };
}
