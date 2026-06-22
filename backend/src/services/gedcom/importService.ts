import { parseGedcom, type ParseResult } from './parser.js';
import { mapGedcomRecords } from './tagMapper.js';
import { PersonRepository } from '../../repositories/PersonRepository.js';
import { FamilyRepository } from '../../repositories/FamilyRepository.js';
import { EventRepository } from '../../repositories/EventRepository.js';
import { SourceRepository } from '../../repositories/SourceRepository.js';
import { ImportRepository } from '../../repositories/ImportRepository.js';
import { getDatabase } from '../../db/connection.js';
import type { ImportConflict } from '../../types/db.js';
import { buildMergeAnalysis, type MergeAnalysis } from './mergeAnalysis.js';
import { coupleKey, sourceKey, type MatchPersonInput } from './matcher.js';

export interface ImportStats {
  persons: number;
  families: number;
  sources: number;
  repositories: number;
  events: number;
  conflicts: number;
  warnings: string[];
}

export interface ValidationResult {
  valid: boolean;
  stats: ImportStats;
  version: string | null;
  encoding: string | null;
  warnings: string[];
  conflicts: ImportConflict[];
}

// ─── Parse & Validate ───────────────────────────────────────────────────────

export function validateGedcom(jobId: string, content: string): ValidationResult {
  const importRepo = new ImportRepository();
  importRepo.updateJobStatus(jobId, 'validating');

  let parseResult: ParseResult;
  try {
    parseResult = parseGedcom(content);
  } catch (err) {
    importRepo.updateJobStatus(jobId, 'failed', { error_message: 'Parse error: ' + String(err) });
    return {
      valid: false,
      stats: { persons: 0, families: 0, sources: 0, repositories: 0, events: 0, conflicts: 0, warnings: [] },
      version: null,
      encoding: null,
      warnings: ['Parse error: ' + String(err)],
      conflicts: [],
    };
  }

  const mapped = mapGedcomRecords(parseResult.records);

  // Detect conflicts — check if any INDI already exists by gedcom_id
  const conflicts: ImportConflict[] = [];

  for (const person of mapped.persons) {
    if (!person.xref) continue;
    const existing = getDatabase()
      .prepare('SELECT * FROM persons WHERE gedcom_id = ?')
      .get(person.xref) as { id: string; sex: string; gedcom_id: string } | undefined;

    if (existing) {
      const primaryName = person.names.find(n => n.isPrimary) || person.names[0];
      const nameStr = [primaryName?.givenName, primaryName?.surname].filter(Boolean).join(' ');

      const conflict = importRepo.createConflict({
        import_job_id: jobId,
        xref: person.xref,
        record_type: 'INDI',
        field_name: 'person',
        existing_value: existing.id,
        incoming_value: nameStr || person.xref,
      });
      conflicts.push(conflict);
    }
  }

  const totalEvents = mapped.persons.reduce((sum, p) => sum + p.events.length, 0);
  const totalRecords = mapped.persons.length + mapped.families.length + mapped.sources.length + mapped.repositories.length;

  const stats: ImportStats = {
    persons: mapped.persons.length,
    families: mapped.families.length,
    sources: mapped.sources.length,
    repositories: mapped.repositories.length,
    events: totalEvents,
    conflicts: conflicts.length,
    warnings: parseResult.warnings,
  };

  importRepo.updateJobStatus(jobId, conflicts.length > 0 ? 'awaiting_review' : 'processing', {
    total_records: totalRecords,
    gedcom_version: parseResult.version || undefined,
  });

  return {
    valid: true,
    stats,
    version: parseResult.version,
    encoding: parseResult.encoding,
    warnings: parseResult.warnings,
    conflicts,
  };
}

// ─── Analyze Merge ──────────────────────────────────────────────────────────

export function analyzeMerge(_jobId: string, content: string): MergeAnalysis {
  const parsed = parseGedcom(content);
  const mapped = mapGedcomRecords(parsed.records);
  const personRepo = new PersonRepository();
  const eventRepo = new EventRepository();
  const existing = personRepo.findAllForMatch();

  const existingFields = (id: string): Record<string, string | null> => {
    const p = personRepo.findById(id);
    const pn = p?.primary_name;
    // birthPlace/deathPlace must come from EventRepository.findByPerson —
    // findById does NOT include events.
    const events = eventRepo.findByPerson(id);
    const birthEvent = events.find((e) => e.event_type === 'birth') ?? null;
    const deathEvent = events.find((e) => e.event_type === 'death') ?? null;
    return {
      givenName: pn?.given_name ?? '',
      surname: pn?.surname ?? '',
      sex: p?.sex ?? '',
      birthPlace: birthEvent?.event_place ?? '',
      deathPlace: deathEvent?.event_place ?? '',
    };
  };

  return buildMergeAnalysis(mapped, existing as MatchPersonInput[], existingFields);
}

// ─── Process Import ─────────────────────────────────────────────────────────

export function processImport(jobId: string, content: string, userId: string, mode: 'new' | 'merge' = 'new'): ImportStats {
  const importRepo = new ImportRepository();
  const personRepo = new PersonRepository();
  const familyRepo = new FamilyRepository();
  const eventRepo = new EventRepository();
  const sourceRepo = new SourceRepository();
  const db = getDatabase();

  importRepo.updateJobStatus(jobId, 'processing');

  const parseResult = parseGedcom(content);
  const mapped = mapGedcomRecords(parseResult.records);

  // Gather conflict resolutions
  const unresolvedConflicts = importRepo.findUnresolvedConflicts(jobId);
  if (unresolvedConflicts.length > 0) {
    importRepo.updateJobStatus(jobId, 'failed', {
      error_message: `${unresolvedConflicts.length} unresolved conflicts remain`,
    });
    throw new Error('Unresolved conflicts remain');
  }

  const allConflicts = db
    .prepare('SELECT * FROM import_conflicts WHERE import_job_id = ?')
    .all(jobId) as ImportConflict[];

  const conflictMap = new Map<string, ImportConflict['resolution']>();
  for (const c of allConflicts) {
    conflictMap.set(c.xref, c.resolution);
  }

  // Merge mode: load saved decisions keyed by xref
  const mergeDecisions = mode === 'merge'
    ? new Map(importRepo.findMergeDecisions(jobId).map((d) => [d.xref, d]))
    : new Map<string, { xref: string; decision: 'same' | 'new'; candidate_person_id: string | null; field_resolutions: string }>();

  // Xref → internal ID mapping
  const xrefMap = new Map<string, string>();
  let processedCount = 0;
  let eventCount = 0;

  try {
    const transaction = db.transaction(() => {
      // 1. Process repositories
      for (const repo of mapped.repositories) {
        const created = sourceRepo.createRepo({
          name: repo.name,
          address: repo.address || undefined,
          url: repo.url || undefined,
          notes: repo.notes || undefined,
          gedcom_id: repo.xref,
        });
        xrefMap.set(repo.xref, created.id);
        importRepo.createXrefMapping({
          import_job_id: jobId,
          xref: repo.xref,
          record_type: 'REPO',
          internal_id: created.id,
          internal_table: 'source_repositories',
        });
        importRepo.logAction({
          import_job_id: jobId,
          action: 'created',
          record_type: 'REPO',
          xref: repo.xref,
          internal_id: created.id,
        });
        processedCount++;
      }

      // 2. Process sources
      // Merge mode: build set of existing source keys to avoid duplicates
      const existingSourceKeys = new Map<string, string>(); // key -> source id
      if (mode === 'merge') {
        const existingSources = db.prepare('SELECT id, title, author FROM sources').all() as { id: string; title: string; author: string | null }[];
        for (const s of existingSources) {
          existingSourceKeys.set(sourceKey(s.title, s.author), s.id);
        }
      }

      for (const source of mapped.sources) {
        // Merge mode: skip create if source already exists by key
        if (mode === 'merge') {
          const sk = sourceKey(source.title, source.author ?? null);
          const existingSourceId = existingSourceKeys.get(sk);
          if (existingSourceId) {
            xrefMap.set(source.xref, existingSourceId);
            importRepo.logAction({
              import_job_id: jobId,
              action: 'skipped',
              record_type: 'SOUR',
              xref: source.xref,
              internal_id: existingSourceId,
              details: 'Skipped: source already exists (merge dedupe)',
            });
            processedCount++;
            continue;
          }
        }

        const repoId = source.repositoryXref ? xrefMap.get(source.repositoryXref) : undefined;
        const created = sourceRepo.create({
          title: source.title,
          author: source.author || undefined,
          publisher: source.publisher || undefined,
          url: source.url || undefined,
          notes: source.notes || undefined,
          repository_id: repoId,
          gedcom_id: source.xref,
        });
        xrefMap.set(source.xref, created.id);
        if (mode === 'merge') {
          existingSourceKeys.set(sourceKey(source.title, source.author ?? null), created.id);
        }
        importRepo.createXrefMapping({
          import_job_id: jobId,
          xref: source.xref,
          record_type: 'SOUR',
          internal_id: created.id,
          internal_table: 'sources',
        });
        importRepo.logAction({
          import_job_id: jobId,
          action: 'created',
          record_type: 'SOUR',
          xref: source.xref,
          internal_id: created.id,
        });
        processedCount++;
      }

      // 3. Process persons
      for (const person of mapped.persons) {
        const resolution = conflictMap.get(person.xref);
        if (resolution === 'skip') {
          importRepo.logAction({
            import_job_id: jobId,
            action: 'skipped',
            record_type: 'INDI',
            xref: person.xref,
            details: 'Skipped due to conflict resolution',
          });
          // Map to existing
          const existing = db
            .prepare('SELECT id FROM persons WHERE gedcom_id = ?')
            .get(person.xref) as { id: string } | undefined;
          if (existing) xrefMap.set(person.xref, existing.id);
          processedCount++;
          continue;
        }

        if (resolution === 'overwrite') {
          const existing = db
            .prepare('SELECT id FROM persons WHERE gedcom_id = ?')
            .get(person.xref) as { id: string } | undefined;
          if (existing) {
            personRepo.update(existing.id, { sex: person.sex });
            // Delete old names and events, re-create
            db.prepare('DELETE FROM names WHERE person_id = ?').run(existing.id);
            db.prepare('DELETE FROM events WHERE person_id = ?').run(existing.id);
            for (const name of person.names) {
              personRepo.addName(existing.id, {
                name_type: name.nameType,
                prefix: name.prefix || undefined,
                given_name: name.givenName || undefined,
                surname: name.surname || undefined,
                suffix: name.suffix || undefined,
                is_primary: name.isPrimary ? 1 : 0,
              });
            }
            for (const event of person.events) {
              eventRepo.create({
                person_id: existing.id,
                event_type: event.eventType,
                event_date: event.date || undefined,
                event_place: event.place || undefined,
                description: event.description || undefined,
              });
              eventCount++;
            }
            xrefMap.set(person.xref, existing.id);
            importRepo.logAction({
              import_job_id: jobId,
              action: 'updated',
              record_type: 'INDI',
              xref: person.xref,
              internal_id: existing.id,
            });
            processedCount++;
            continue;
          }
        }

        // Merge mode: check if this xref has a 'same' decision linking to an existing person
        if (mode === 'merge') {
          const decision = mergeDecisions.get(person.xref);
          if (decision && decision.decision === 'same' && decision.candidate_person_id) {
            const candidateId = decision.candidate_person_id;
            xrefMap.set(person.xref, candidateId);

            // Apply field resolutions: for each field set to 'new', write incoming value
            const fieldResolutions: Record<string, 'old' | 'new'> = decision.field_resolutions
              ? JSON.parse(decision.field_resolutions)
              : {};

            // Name-related field resolution
            const primaryNameData = person.names.find((n) => n.isPrimary) ?? person.names[0];
            if (primaryNameData) {
              const existingPerson = personRepo.findById(candidateId);
              const primaryName = existingPerson?.primary_name;

              if (primaryName) {
                // Build update object for fields set to 'new'
                const nameUpdate: Record<string, string | undefined> = {};
                if (fieldResolutions.givenName === 'new') nameUpdate.given_name = primaryNameData.givenName ?? undefined;
                if (fieldResolutions.surname === 'new') nameUpdate.surname = primaryNameData.surname ?? undefined;
                if (fieldResolutions.prefix === 'new') nameUpdate.prefix = primaryNameData.prefix ?? undefined;
                if (fieldResolutions.suffix === 'new') nameUpdate.suffix = primaryNameData.suffix ?? undefined;
                if (Object.keys(nameUpdate).length > 0) {
                  personRepo.updateName(primaryName.id, nameUpdate);
                }
              }
            }

            // Sex field resolution
            if (fieldResolutions.sex === 'new' && person.sex) {
              personRepo.update(candidateId, { sex: person.sex as 'M' | 'F' | 'X' | 'U' });
            }

            // Place field resolutions via event upsert
            const existingEvents = eventRepo.findByPerson(candidateId);

            if (fieldResolutions.birthPlace === 'new') {
              const incomingBirth = person.events.find((e) => e.eventType === 'birth');
              if (incomingBirth?.place) {
                const existingBirth = existingEvents.find((e) => e.event_type === 'birth');
                if (existingBirth) {
                  eventRepo.update(existingBirth.id, { event_place: incomingBirth.place });
                } else {
                  eventRepo.create({
                    person_id: candidateId,
                    event_type: 'birth',
                    event_date: incomingBirth.date ?? undefined,
                    event_place: incomingBirth.place,
                  });
                  eventCount++;
                }
              }
            }

            if (fieldResolutions.deathPlace === 'new') {
              const incomingDeath = person.events.find((e) => e.eventType === 'death');
              if (incomingDeath?.place) {
                const existingDeath = existingEvents.find((e) => e.event_type === 'death');
                if (existingDeath) {
                  eventRepo.update(existingDeath.id, { event_place: incomingDeath.place });
                } else {
                  eventRepo.create({
                    person_id: candidateId,
                    event_type: 'death',
                    event_date: incomingDeath.date ?? undefined,
                    event_place: incomingDeath.place,
                  });
                  eventCount++;
                }
              }
            }

            // Add incoming events not already present (match by event_type + event_date)
            for (const incomingEvent of person.events) {
              const alreadyPresent = existingEvents.some(
                (e) => e.event_type === incomingEvent.eventType && e.event_date === (incomingEvent.date ?? null),
              );
              if (!alreadyPresent) {
                eventRepo.create({
                  person_id: candidateId,
                  event_type: incomingEvent.eventType,
                  event_date: incomingEvent.date ?? undefined,
                  event_place: incomingEvent.place ?? undefined,
                  description: incomingEvent.description ?? undefined,
                });
                eventCount++;
              }
            }

            importRepo.createXrefMapping({
              import_job_id: jobId,
              xref: person.xref,
              record_type: 'INDI',
              internal_id: candidateId,
              internal_table: 'persons',
            });
            importRepo.logAction({
              import_job_id: jobId,
              action: 'updated',
              record_type: 'INDI',
              xref: person.xref,
              internal_id: candidateId,
              details: 'Linked to existing person via merge decision',
            });
            processedCount++;
            continue;
          }
        }

        // Create new person (default 'new' mode, or 'merge' with no/new decision falls through to create)
        const created = personRepo.create({
          sex: person.sex,
          is_living: person.events.some(e => e.eventType === 'death') ? 0 : 1,
          gedcom_id: person.xref,
          created_by: userId,
        });

        for (const name of person.names) {
          personRepo.addName(created.id, {
            name_type: name.nameType,
            prefix: name.prefix || undefined,
            given_name: name.givenName || undefined,
            surname: name.surname || undefined,
            suffix: name.suffix || undefined,
            is_primary: name.isPrimary ? 1 : 0,
          });
        }

        for (const event of person.events) {
          eventRepo.create({
            person_id: created.id,
            event_type: event.eventType,
            event_date: event.date || undefined,
            event_place: event.place || undefined,
            description: event.description || undefined,
          });
          eventCount++;
        }

        xrefMap.set(person.xref, created.id);
        importRepo.createXrefMapping({
          import_job_id: jobId,
          xref: person.xref,
          record_type: 'INDI',
          internal_id: created.id,
          internal_table: 'persons',
        });
        importRepo.logAction({
          import_job_id: jobId,
          action: 'created',
          record_type: 'INDI',
          xref: person.xref,
          internal_id: created.id,
        });
        processedCount++;
      }

      // 4. Process families
      // Merge mode: build set of existing couple keys to avoid duplicates
      const existingCoupleKeys = new Map<string, string>(); // coupleKey -> family id
      if (mode === 'merge') {
        const existingFamilies = db.prepare('SELECT id, spouse1_id, spouse2_id FROM families').all() as { id: string; spouse1_id: string | null; spouse2_id: string | null }[];
        for (const f of existingFamilies) {
          existingCoupleKeys.set(coupleKey(f.spouse1_id, f.spouse2_id), f.id);
        }
      }

      for (const family of mapped.families) {
        const spouse1Id = family.spouse1Xref ? xrefMap.get(family.spouse1Xref) : undefined;
        const spouse2Id = family.spouse2Xref ? xrefMap.get(family.spouse2Xref) : undefined;

        // Merge mode: skip create if couple already exists
        if (mode === 'merge') {
          const ck = coupleKey(spouse1Id ?? null, spouse2Id ?? null);
          const existingFamilyId = existingCoupleKeys.get(ck);
          if (existingFamilyId) {
            xrefMap.set(family.xref, existingFamilyId);
            importRepo.logAction({
              import_job_id: jobId,
              action: 'skipped',
              record_type: 'FAM',
              xref: family.xref,
              internal_id: existingFamilyId,
              details: 'Skipped: family already exists (merge dedupe)',
            });
            processedCount++;
            continue;
          }
        }

        const created = familyRepo.create({
          spouse1_id: spouse1Id,
          spouse2_id: spouse2Id,
          marriage_date: family.marriageDate || undefined,
          marriage_place: family.marriagePlace || undefined,
          gedcom_id: family.xref,
        });

        if (family.divorceDate || family.divorcePlace) {
          familyRepo.update(created.id, {
            divorce_date: family.divorceDate || undefined,
            divorce_place: family.divorcePlace || undefined,
          });
        }

        // Add children
        for (const childXref of family.childXrefs) {
          const childId = xrefMap.get(childXref);
          if (childId) {
            familyRepo.addMember(created.id, childId, 'child');
          }
        }

        xrefMap.set(family.xref, created.id);
        if (mode === 'merge') {
          existingCoupleKeys.set(coupleKey(spouse1Id ?? null, spouse2Id ?? null), created.id);
        }
        importRepo.createXrefMapping({
          import_job_id: jobId,
          xref: family.xref,
          record_type: 'FAM',
          internal_id: created.id,
          internal_table: 'families',
        });
        importRepo.logAction({
          import_job_id: jobId,
          action: 'created',
          record_type: 'FAM',
          xref: family.xref,
          internal_id: created.id,
        });
        processedCount++;
      }
    });

    transaction();

    // Post-import maintenance
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.exec('ANALYZE');

    importRepo.updateJobStatus(jobId, 'completed', {
      processed_records: processedCount,
    });

    return {
      persons: mapped.persons.length,
      families: mapped.families.length,
      sources: mapped.sources.length,
      repositories: mapped.repositories.length,
      events: eventCount,
      conflicts: allConflicts.length,
      warnings: parseResult.warnings,
    };
  } catch (err) {
    importRepo.updateJobStatus(jobId, 'failed', {
      error_message: String(err),
    });
    throw err;
  }
}
