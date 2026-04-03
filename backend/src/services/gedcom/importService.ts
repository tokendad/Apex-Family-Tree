import { parseGedcom, type ParseResult } from './parser.js';
import { mapGedcomRecords } from './tagMapper.js';
import { PersonRepository } from '../../repositories/PersonRepository.js';
import { FamilyRepository } from '../../repositories/FamilyRepository.js';
import { EventRepository } from '../../repositories/EventRepository.js';
import { SourceRepository } from '../../repositories/SourceRepository.js';
import { ImportRepository } from '../../repositories/ImportRepository.js';
import { getDatabase } from '../../db/connection.js';
import type { ImportConflict } from '../../types/db.js';

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

// ─── Process Import ─────────────────────────────────────────────────────────

export function processImport(jobId: string, content: string, userId: string): ImportStats {
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
      for (const source of mapped.sources) {
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

        // Create new person (default or 'merge' falls through to create)
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
      for (const family of mapped.families) {
        const spouse1Id = family.spouse1Xref ? xrefMap.get(family.spouse1Xref) : undefined;
        const spouse2Id = family.spouse2Xref ? xrefMap.get(family.spouse2Xref) : undefined;

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
