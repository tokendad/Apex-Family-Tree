# Apex Family Legacy 2.0

# Phase 1 Implementation Log

## Scope

Phase 1 begins the approved archive foundation implementation.

Implemented in this phase:

- Additive archive foundation migration.
- Shared `archive_objects` identity table.
- System lookup tables for artifact types, evidence classifications, confidence levels, relationship types, and relationship type role contracts.
- Seed values with stable text IDs.
- Backfill of existing `persons` rows into `archive_objects` using existing person IDs.
- Migration coverage for clean database creation and existing-person backfill.

## Baseline Check

Branch:

```text
apex-family-legacy-2.0
```

Baseline commands before implementation:

```bash
npm run build
npm run test
```

Result:

- `npm run build` passed.
- `npm run test` had one pre-existing frontend failure in `frontend/src/components/MediaPersonTagger/MediaPersonTagger.test.tsx`.

The failing frontend test expected resized tag coordinates but received the original dimensions. This is unrelated to the Phase 1 archive foundation migration and was not modified.

## Migration Added

```text
backend/src/migrations/042-archive-foundation.sql
```

The migration is additive. It does not rename, delete, or replace existing tables.

Legacy tables intentionally left in place:

- `persons`
- `names`
- `families`
- `family_members`
- `events`
- `media_items`
- `sources`
- `source_citations`

## Backfill Rule

Existing people are represented as archive objects with stable IDs:

```text
archive_objects.id = persons.id
archive_objects.object_type = 'person'
```

Person archive object titles use this priority:

1. `persons.display_name`
2. Primary or first available row in `names`
3. `Unknown Person`

Privacy mapping:

```text
persons.is_private = 1 -> archive_objects.privacy_level = 'private'
otherwise              -> archive_objects.privacy_level = 'family'
```

## Tests Added

```text
backend/src/db/migrator.archive-foundation.test.ts
```

Coverage:

- Full migration run on a clean in-memory database.
- Archive foundation tables are created.
- System lookup values are seeded.
- `family_union` is the only tree-relevant seeded relationship type.
- `appears_in` has relationship role contracts.
- Existing `persons` rows are backfilled as archive objects after migrations through `041`.
- Existing `persons` rows remain intact after applying `042`.

## Verification

Commands run after implementation:

```bash
npm run test -w backend -- src/db/migrator.archive-foundation.test.ts
npm run test -w backend
npm run build -w backend
npm run lint
```

Result:

- Targeted archive foundation migration test passed.
- Backend test suite passed.
- Backend build passed.
- `npm run lint` failed on existing unrelated lint errors across backend and frontend files. No lint errors were reported for the new migration test file.

## Notes

This phase intentionally does not add API routes, repositories, or UI changes. Those belong to Phase 2 and later.

The current family tree, GEDCOM, media, source, auth, and admin behavior should remain unchanged by this migration.
