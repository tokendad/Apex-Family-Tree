# Apex Family Legacy
# Phase 0 Current State Assessment

## Purpose

This document records the Phase 0 assessment of the current Apex Family Tree codebase before beginning Apex Family Legacy 2.0 implementation.

The goal is to identify what already exists, what can be reused, what should be adapted, and what should be deferred until the new archive object model has been proven.

This assessment is intended to support the transition from the design documents into command-line implementation work.

---

# Branch and Scope

Assessment target:

```text
Repository: tokendad/Apex-Family-Tree
Branch: apex-family-legacy-2.0
Area: Docs/Apex_Family_Legacy_2.0 planning and current implementation review
```

Primary implementation target:

```text
Apex Family Legacy 2.0
```

This assessment focuses on:

- Current architecture
- Current database schema shape
- Current migration system
- Current backend repository/route structure
- Current frontend routing/state shape
- Existing concepts that map cleanly to the 2.0 archive model
- Risks and recommendations for the first coding phase

---

# Existing Design Documents

The current 2.0 design stack now includes:

```text
Docs/Apex_Family_Legacy_2.0/
├── Product_Vision.md
├── Architecture_of_Ideas.md
├── Artifact_Model.md
├── Relationship_Model.md
├── Data_Model_2.0.md
├── Database_Schema_2.0.md
├── Implementation_Roadmap_2.0.md
└── Model_Decisions_Before_Code.md
```

These documents should guide implementation.

If code decisions conflict with these documents, update the design documents before proceeding.

## Model Contract Cleanup Note

A documentation review before Phase 1 identified model-contract ambiguities around physical person tables, relationship role validation, claim evidence, tree relationships, naming, and filenames.

`Model_Decisions_Before_Code.md` resolves those ambiguities and supersedes conflicting wording in earlier planning docs.

Implementation should follow that decision document before creating migrations or runtime code.

---

# Executive Summary

The current codebase is a strong foundation for Apex Family Legacy 2.0.

The project is not a throwaway prototype.

It already has:

- A working React/TypeScript frontend
- A working Express/TypeScript backend
- SQLite with migrations
- Repository-based data access
- JWT authentication
- Role-based permissions
- GEDCOM import/export
- Media upload and scanning support
- Sources and citations
- Tree rendering and layout
- Tests in both frontend and backend

The recommended approach is **additive evolution**, not a blank-slate rewrite.

The most important Phase 1 implementation move is to add the 2.0 archive foundation alongside existing tables:

```text
archive_objects
artifact_types
evidence_classifications
confidence_levels
relationship_types
```

Then build the first vertical slice:

```text
Person → Artifact → Relationship → Connected object view
```

---

# Current Application Identity

The existing app is still branded as **Apex Family Tree**.

The README describes it as a self-hosted genealogy web application running as a single Docker container with embedded SQLite.

Current documented capabilities include:

- Interactive SVG family tree canvas
- 4-step person creation wizard
- GEDCOM 5.5.1 and 7.0 import/export
- Role-based access control
- Invitations
- Media management
- Source and citation tracking
- Full-text person search
- Admin dashboard
- Backups
- Optional Google Cloud integration
- Responsive design
- Docker-first deployment

## Assessment

This confirms that Apex already has many of the operational pieces needed for a digital family archive.

The main gap is not infrastructure.

The main gap is conceptual modeling.

Today the app is organized around genealogy tables and tree behavior.

Apex Family Legacy 2.0 should gradually re-center the app around archive objects and relationships.

---

# Current Technical Stack

The current project uses:

```text
Frontend: React 18, TypeScript, Vite, Zustand, React Router
Backend: Node.js 20, Express, TypeScript
Database: SQLite via better-sqlite3
Auth: JWT with Argon2id password hashing
Container: Docker
Styling: CSS Modules and design tokens
Testing: Vitest and Testing Library
```

## Assessment

No stack replacement is recommended for 2.0.

SQLite remains appropriate for the product vision because Apex is self-hosted, single-container, and local-first by design.

The graph-style archive model does not require a graph database.

The graph can be represented practically using:

```text
archive_objects
relationships
relationship_members
```

inside SQLite.

---

# Current Repository Architecture

The backend currently follows a layered structure:

```text
Routes → Services → Repositories → SQLite
```

Current repository exports include:

```text
UserRepository
PersonRepository
FamilyRepository
EventRepository
MediaRepository
SourceRepository
ImportRepository
SettingsRepository
```

The base repository already provides shared helpers:

```text
db getter
generateId()
now()
```

## Assessment

This structure should be kept.

For 2.0, add new repositories rather than replacing the pattern.

Recommended new repositories:

```text
ArchiveObjectRepository
ArtifactRepository
RelationshipRepository
ClaimRepository
CollectionRepository
PlaceRepository
StoryRepository
ProvenanceRepository
```

Recommended service additions:

```text
ArchiveObjectService
ArtifactService
RelationshipService
ClaimService
```

The existing repository pattern is a useful boundary for incremental migration.

---

# Current Migration System

Migrations are plain SQL files in:

```text
backend/src/migrations/
```

The migration runner:

- Creates `schema_migrations` if needed
- Reads all `.sql` files
- Skips rollback files ending in `-down.sql`
- Sorts files by name
- Calculates checksums
- Refuses to run if an already-applied migration checksum changes
- Runs new migrations inside transactions
- Temporarily disables foreign keys for the migration run

## Assessment

Do **not** edit old migrations.

The checksum protection means already-applied migrations should be treated as immutable.

Phase 1 should create new additive migrations with the next migration numbers.

Because the current branch already appears to include migrations through at least `041-family-events.sql`, verify the exact latest number locally before adding the first 2.0 migration.

Recommended CLI command:

```bash
ls backend/src/migrations
```

Then create the next file, likely something like:

```text
042-archive-foundation.sql
```

if `041` is the latest migration.

---

# Current Database Foundation

## Persons

Current person records are stored in `persons`.

Important columns include:

```text
id
sex
is_living
is_private
gedcom_id
notes
created_by
created_at
updated_at
```

## Names

Person names are stored separately in `names`.

The current names table supports:

```text
person_id
name_type
prefix
given_name
surname
suffix
is_primary
sort_order
created_at
updated_at
```

Later TypeScript types also reference additional fields such as:

```text
middle_name
nickname
```

## Assessment

The existing `persons` and `names` tables map well to the 2.0 `people` and `person_names` concepts.

Do not delete or replace these immediately.

Instead:

1. Add `archive_objects`.
2. Backfill one `archive_objects` row for each existing `persons` row.
3. Treat the current `persons` table as the first domain extension table.
4. Rename/refactor later only if necessary.

Recommended transitional model:

```text
archive_objects.id = persons.id
archive_objects.object_type = 'person'
```

This allows existing person IDs to remain stable.

---

# Current Family / Relationship Model

Current family data is stored in:

```text
families
family_members
```

The `families` table links spouse slots:

```text
spouse1_id
spouse2_id
marriage_date
marriage_place
divorce_date
divorce_place
gedcom_id
```

The `family_members` table links children to family units:

```text
family_id
person_id
role
sort_order
```

Current child roles are:

```text
child
adopted
foster
step
```

## Assessment

The existing model is workable for traditional tree generation, but it is not broad enough for Apex Family Legacy 2.0.

It assumes relationships are mainly genealogy structures.

2.0 needs relationships to connect any archive object to any archive object.

Recommended migration strategy:

1. Keep `families` and `family_members` in place during early phases.
2. Add new `relationships` and `relationship_members` tables.
3. Backfill relationship records from existing families only after the new relationship engine is tested.
4. Keep compatibility views for tree generation.

Do not remove `families` until the tree can be generated from 2.0 relationship data.

---

# Current Events Model

The original events table was person-centered.

Later migration work expanded it so events can belong to either a person or a family.

The newer event shape includes:

```text
person_id
family_id
event_type
event_date
event_date_qualifier
event_date_sort_key
event_place
description
```

A later family-events migration rebuilt the table and backfilled marriage/divorce events from families.

## Assessment

This is a useful bridge, but still not the final 2.0 event model.

In 2.0, events should be archive objects.

Recommended transitional model:

```text
archive_objects.id = events.id
archive_objects.object_type = 'event'
```

However, delay full event migration until after the artifact and relationship vertical slice.

Events are important, but they are not the safest first implementation target.

---

# Current Sources and Citations

Current source data is stored in:

```text
sources
source_repositories
source_citations
```

The `sources` table stores bibliographic/source-like data:

```text
title
author
publisher
publication_date
url
notes
gedcom_id
```

The current `source_citations` table links sources to either people or events and stores:

```text
source_id
person_id
event_id
page
quality
notes
```

Current citation quality values include:

```text
primary
secondary
questionable
unreliable
```

## Assessment

The existing source/citation model is useful, but it does not match the new artifact-first model.

Apex Family Legacy 2.0 should treat scanned records, documents, photographs, letters, and keepsakes as artifacts first.

Sources should eventually become either:

1. Legacy imported source records, or
2. Artifact-backed evidence/citation records.

Recommended strategy:

- Do not delete `sources` in early phases.
- Do not immediately rewrite GEDCOM source import/export.
- Add `artifacts`, `claims`, and `claim_evidence` alongside current sources.
- Later decide whether GEDCOM sources map to artifacts, claims, or a compatibility layer.

Important design distinction:

```text
Artifact = what the item is.
Evidence classification = how authoritative it may be.
Claim evidence = how it supports a specific claim.
```

---

# Current Media Model

Media is currently stored in:

```text
media_items
person_media
family_media
event_media
media_person_regions
```

The `media_items` table stores:

```text
filename
original_filename
mime_type
file_size
file_path
thumbnail_path
title
description
date_taken
uploaded_by
is_external
created_at
updated_at
```

Current join tables link media to people, families, and events.

`media_person_regions` stores rectangular person tags inside media items using normalized coordinates.

The media repository also supports scanning pre-existing local media files.

## Assessment

This is one of the most reusable parts of the current codebase.

Media items are very close to the 2.0 artifact concept, but not identical.

Current media is file-centered.

2.0 artifacts should be preserved-object-centered.

Recommended migration strategy:

1. Add `artifacts` and `artifact_files`.
2. Backfill artifacts from `media_items`.
3. Let `artifact_files` point to the existing file paths.
4. Preserve `media_person_regions` by either:
   - keeping it temporarily, or
   - migrating it later into artifact/person relationship metadata.

Recommended mapping:

```text
media_items.id → artifacts.id or artifact_files.legacy_media_id
media_items.title → archive_objects.title
media_items.description → archive_objects.summary or artifacts.notes
media_items.date_taken → artifacts.original_date_text
media_items.file_path → artifact_files.storage_path
media_items.mime_type → artifact_files.mime_type
media_items.is_external → artifact_files/storage provenance signal
```

Do not destroy media paths or thumbnails during early migration.

---

# Current Search Model

The app currently has person full-text search via `persons_fts`.

The person repository uses FTS5 for global person search and falls back to LIKE for short terms.

## Assessment

This should be preserved but eventually generalized.

Apex Family Legacy 2.0 should introduce archive-wide search later, likely after core archive objects exist.

Do not begin 2.0 by replacing search.

Recommended future direction:

```text
archive_search
```

covering:

- archive object titles
- summaries
- person names
- artifact descriptions
- artifact transcriptions
- story bodies
- places
- tags
- claims

---

# Current Tree Model

The current tree API is deeply tied to:

```text
persons
families
family_members
events
media_items
person_media
```

The tree route builds flat tree data by:

- resolving a home person
- traversing spouse families
- traversing parent families
- loading birth/death events
- loading primary photos
- returning `persons` and `families` arrays

Frontend tree state expects:

```text
TreePerson
TreeFamily
TreeNode
ConnectorLine
```

The canvas store manages:

```text
nodes
families
connectors
zoom
cameraX/cameraY
homePersonId
selectedPersonId
hoveredPersonId
contextMenuPosition
generations
highlightedPersonIds
```

## Assessment

The current tree should not be the first thing rewritten.

It is central, visible, and highly coupled to the existing family model.

Instead:

1. Leave current tree behavior in place initially.
2. Build the new archive object and relationship engine alongside it.
3. Create compatibility views/helpers later.
4. Rebuild the tree as a relationship view only after relationships are proven.

Recommended future tree compatibility layer:

```text
tree_edges_view
```

This view should translate 2.0 relationship records into the shape currently expected by the frontend tree.

---

# Current Frontend Routes

The app currently has protected routes for:

```text
/
/people
/people/:id
/families
/families/:id
/sources
/media
/import
/export
/tools
/admin
```

## Assessment

The existing route structure is usable.

For 2.0, add new routes incrementally:

```text
/artifacts
/artifacts/:id
/archive/:id
/collections
/claims
/places
/stories
```

Recommended first UI route:

```text
/artifacts
/artifacts/:id
```

Avoid renaming all pages immediately.

The current app can keep `/media` while `/artifacts` is developed.

Eventually, `/media` may become an implementation detail or redirect into artifacts.

---

# Current API Routes

The backend currently mounts authenticated API routes under `/api/v1`:

```text
/api/v1/people
/api/v1/events
/api/v1/families
/api/v1/tree
/api/v1/media
/api/v1/sources
/api/v1/home-person
/api/v1/admin
/api/v1/gedcom
/api/v1/tools
```

## Assessment

This is a good pattern to continue.

Recommended new API modules:

```text
/api/v1/archive-objects
/api/v1/artifacts
/api/v1/relationships
/api/v1/claims
/api/v1/collections
/api/v1/places
/api/v1/stories
```

However, do not add all of them at once.

Add only what the current vertical slice requires.

First new API routes should be:

```text
/api/v1/archive-objects
/api/v1/artifacts
/api/v1/relationships
```

---

# Current TypeScript Model

Current database-facing types live in:

```text
backend/src/types/db.ts
```

This file contains types for:

- Users and auth tokens
- Persons
- Names
- Families
- Events
- Family members
- Sources
- Citations
- Media
- GEDCOM import/export
- Data quality tools

## Assessment

For 2.0, do not overload the existing type file indefinitely.

Recommended approach:

```text
backend/src/types/archive.ts
backend/src/types/artifact.ts
backend/src/types/relationship.ts
```

or a grouped folder:

```text
backend/src/types/archive/
```

Keep the legacy types while the migration is in progress.

---

# Strong Reuse Candidates

The following areas should likely be reused or adapted:

## Backend

```text
Database connection
Migration runner
BaseRepository
Repository pattern
Auth middleware
Role middleware
Validation middleware
Settings system
Audit log concepts
Media file storage paths
Provider pattern
GEDCOM import/export code, initially unchanged
```

## Frontend

```text
React/Vite app shell
Protected routes
Admin routes
CSS Modules/design tokens
ModalHost/modal infrastructure
People pages, initially
Media page, as artifact inspiration
Tree canvas, initially unchanged
```

## Database

```text
users
app_settings
feature_flags
audit_log
backup_log
persons
names
families, temporarily
events, temporarily
media_items, temporarily
source tables, temporarily
GEDCOM tracking tables
```

---

# Likely Replacement or Refactor Areas

The following areas should eventually be replaced or significantly refactored:

## Conceptual Model

```text
sources as first-class archive records
media as separate from artifacts
family-only relationship model
person-owned event model
tree-first mental model
```

## Schema

```text
person_media
family_media
event_media
source_citations directly to persons/events only
families as the only union/parent-child model
string-only places on events/families
```

## UI

```text
Media as the primary preserved-item interface
Sources as a separate top-level genealogy object
Tree as the only primary exploration workspace
Modal-first relationship editing
```

These should not all be changed immediately.

They should be migrated after the 2.0 foundation exists.

---

# Important Migration Constraints

## 1. Old migrations are immutable

Because the migration runner validates checksums, old migration files should not be edited after they have been applied.

## 2. Additive first

Early 2.0 migrations should add tables, seed values, and backfill references.

Avoid destructive changes in Phase 1.

## 3. Keep IDs stable

Where possible, use existing IDs for archive object IDs.

Example:

```text
archive_objects.id = persons.id
```

This avoids unnecessary mapping tables and preserves existing links.

## 4. Tree stays functional

Do not break the current tree before a 2.0 relationship-based tree view exists.

## 5. Media paths must be protected

Do not move or delete existing media files during early artifact migration.

## 6. GEDCOM should be deferred

GEDCOM compatibility is important, but should not drive the first 2.0 schema implementation.

---

# Recommended Phase 1 CLI Plan

## Step 1 — Sync and verify branch

```bash
git checkout apex-family-legacy-2.0
git pull
npm install
npm run build
npm run test
```

If build or tests fail before code changes, record the baseline failures before beginning.

---

## Step 2 — Confirm latest migration number

```bash
ls backend/src/migrations | sort | tail -20
```

If `041-family-events.sql` is the latest migration, create:

```text
backend/src/migrations/042-archive-foundation.sql
```

If there are newer migrations, use the next available number.

---

## Step 3 — Add archive foundation migration

First 2.0 migration should create:

```text
archive_objects
artifact_types
evidence_classifications
confidence_levels
relationship_types
```

It may also seed system lookup values.

Recommended: keep this migration focused.

Do not create every 2.0 table in one file unless you are intentionally doing a schema-only milestone.

---

## Step 4 — Backfill existing people as archive objects

Add backfill SQL:

```text
INSERT INTO archive_objects (...)
SELECT id, 'person', ... FROM persons
WHERE NOT EXISTS (...)
```

Use primary/display names where available for titles.

Fallback title:

```text
Unknown Person
```

---

## Step 5 — Add backend archive repository

Create:

```text
backend/src/repositories/ArchiveObjectRepository.ts
```

Export it from:

```text
backend/src/repositories/index.ts
```

Minimum methods:

```text
findById(id)
findByType(type)
create(data)
update(id, data)
softDelete(id)
```

---

## Step 6 — Add tests

Recommended backend tests:

```text
ArchiveObjectRepository.test.ts
archive foundation migration test
```

Test requirements:

- Can create archive object
- Can fetch archive object
- Can list by type
- Can update title/summary/privacy
- Can soft delete
- Existing person rows can be represented as archive objects

---

# Recommended Phase 2 CLI Plan

After Phase 1 foundation passes build/tests, implement the artifact vertical slice.

## Migration

Create:

```text
artifacts
artifact_files
```

Possibly defer file migration until after artifact metadata works.

## Backend

Create:

```text
ArtifactRepository
ArtifactService
artifacts router
```

## Frontend

Create:

```text
ArtifactsPage
ArtifactDetailPage
ArtifactEditor
```

## First UI capability

```text
Create artifact metadata without upload complexity.
```

Then add file handling.

---

# Recommended Phase 3 CLI Plan

Implement relationships.

## Migration

Create:

```text
relationships
relationship_members
```

## Backend

Create:

```text
RelationshipRepository
RelationshipService
relationships router
```

## First relationship use case

```text
Person appears in artifact
```

This should allow:

- Connecting a person to an artifact
- Viewing connected people on artifact detail
- Viewing connected artifacts on person detail

---

# Suggested Compatibility Views

Once the foundation exists, consider adding views to simplify transition.

## archive_people_view

Joins `archive_objects` and `persons`.

## archive_artifacts_view

Joins `archive_objects` and `artifacts`.

## person_artifacts_view

Shows artifacts connected to people through relationships.

## legacy_media_artifacts_view

Temporary bridge from `media_items` to artifact-like behavior.

## tree_edges_view

Future bridge from 2.0 relationships to tree rendering.

---

# Risk Assessment

## High Risk: Rewriting the tree too early

The tree is visible, complex, and tightly coupled to existing `families` and `family_members` behavior.

Mitigation:

```text
Leave it alone until relationship data can fully generate tree edges.
```

## High Risk: Migrating sources too early

Current sources support GEDCOM workflows.

The new artifact-first evidence model is better, but source migration has many edge cases.

Mitigation:

```text
Keep sources as legacy-compatible tables until claims/evidence is implemented.
```

## Medium Risk: Over-generalizing relationships

A generic relationship engine can become hard to query and validate.

Mitigation:

```text
Use relationship_types with system codes, expected roles, and helper views.
```

## Medium Risk: Artifact/media confusion

Media files are close to artifacts but are not the same thing.

Mitigation:

```text
Artifact = preserved object.
Artifact file = digital representation.
Media item = legacy file record during transition.
```

## Medium Risk: Migration ordering

Adding too many tables at once can make debugging difficult.

Mitigation:

```text
Prefer small migrations and vertical slices.
```

---

# Recommended First Coding Commit Series

A safe first implementation sequence:

```text
1. chore: verify 2.0 branch baseline
2. db: add archive foundation tables
3. db: seed archive lookup values
4. db: backfill person archive objects
5. backend: add ArchiveObjectRepository
6. backend: add archive object tests
7. api: add archive object read endpoints
8. docs: update Phase 1 implementation notes
```

Then begin artifact implementation.

---

# Definition of Phase 0 Complete

Phase 0 is complete when:

- The current codebase has been reviewed.
- Migration constraints are understood.
- Reuse candidates are identified.
- Risk areas are identified.
- The next CLI implementation steps are clear.

This assessment completes the planning handoff from design work to code work.

---

# Final Recommendation

Do not start by changing the tree.

Do not start by changing GEDCOM.

Do not start by replacing media.

Start by adding the archive foundation beside the existing app.

The first code milestone should prove this:

```text
Existing person rows can become archive objects without breaking the current application.
```

The second milestone should prove this:

```text
An artifact can exist as an archive object.
```

The third milestone should prove this:

```text
A person and an artifact can be connected by a first-class relationship.
```

Once those three things work, Apex Family Legacy 2.0 has a real foundation.
