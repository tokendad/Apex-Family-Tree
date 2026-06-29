# Apex Family Legacy 2.0

# Phased Implementation Plan with ADR and Code Review Gates

## Purpose

This plan translates the Apex Family Legacy 2.0 design documents into a phased implementation sequence for review before coding.

It is based on:

- `Product_Vision.md`
- `Architecture_of_Ideas.md`
- `Artifact_Model.md`
- `Relationship_Model.md`
- `Data_Model_2.0.md`
- `Database_Schema_2.0.md`
- `Implementation_Roadmap_2.0.md`
- `Model_Decisions_Before_Code.md`
- `Phase_0_Current_State_Assessment.md`
- `ChatGPT_Review.md`

The plan uses an ADR-style decision framework and a code-review risk lens. It does not replace the roadmap. It defines implementation checkpoints, review gates, and phase boundaries so the 2.0 work can proceed incrementally without turning into a rewrite.

---

## Implementation North Star

The first complete slice must prove this workflow:

```text
Existing person -> new artifact -> first-class relationship -> connected object view
```

This proves the central architecture:

```text
Objects gain meaning through relationships.
```

The tree remains important, but it must not drive the first 2.0 implementation. The initial work should build the archive foundation beside the current Apex Family Tree application.

---

## Settled ADR Decisions

These decisions are treated as accepted unless deliberately superseded by a future ADR.

| Decision | Status | Implementation Rule |
|---|---|---|
| Keep SQLite and single-container deployment | Accepted | No graph database or service split for 2.0 foundation. |
| Add `archive_objects` as shared identity layer | Accepted | Every major 2.0 domain object receives an archive object row. |
| Keep existing `persons` and `names` tables during transition | Accepted | Do not create replacement `people` or `person_names` tables in early phases. |
| Use additive migrations first | Accepted | Do not rename, delete, or force-migrate existing production tables early. |
| Validate relationships through `relationship_type_roles` | Accepted | APIs/services must not treat `relationship_members.role` as uncontrolled text. |
| Use `claim_evidence` or future citations as canonical claim evidence path | Accepted | Do not create generic `supports_claim` relationships as a second canonical evidence path. |
| Store canonical tree family structure as `family_union` plus members | Accepted | Spouse, parent-child, sibling, and tree edges may be derived views only. |
| Reuse current repository/service/API patterns | Accepted | Add focused 2.0 repositories and routes instead of replacing the app shell. |
| Defer tree rebuild, GEDCOM rewrite, source migration, and full media overhaul | Accepted | These remain later phases after the archive model is proven. |

---

## Review Policy for Each Phase

Every phase should include a short implementation note or ADR update before code if a new architectural choice is made.

Each phase should pass this code-review checklist before merge:

- Migration is additive unless the phase explicitly allows destructive migration.
- Old migrations are not edited.
- Existing app behavior remains runnable.
- New API inputs are validated at the service boundary.
- New repositories keep SQL parameterized.
- New archive domain objects create or use the matching `archive_objects` row.
- Relationship writes validate object type, role, required role count, and max role count.
- Soft-deleted archive objects do not appear in normal list/detail queries.
- Tests cover the phase's database and service invariants where practical.
- UI hides graph mechanics and presents people, artifacts, stories, places, events, and collections as user concepts.

---

## Phase 0: Baseline and Branch Gate

### Goal

Confirm the current branch and test baseline before changing schema or runtime behavior.

### Scope

- Verify the intended branch is `apex-family-legacy-2.0`.
- Run baseline `npm run build`, `npm run test`, and `npm run lint` if feasible.
- Record any pre-existing failures before implementation.
- Confirm the latest migration number. The current repository contains migrations through `041-family-events.sql`, so the first new 2.0 migration is expected to be `042-archive-foundation.sql` unless newer files are added first.

### Deliverables

- Baseline build/test/lint notes.
- Confirmed next migration number.
- A short implementation log under `Docs/Apex_Family_Legacy_2.0/` or appended to the phase notes.

### Code Review Focus

- No code behavior changes in this phase.
- No migration files edited.
- Any baseline failures are documented rather than hidden.

### Exit Criteria

- Team agrees implementation can begin from a known baseline.

---

## Phase 1: Archive Foundation Migration

### Goal

Introduce the minimum shared foundation needed for the archive model while preserving current app behavior.

### Scope

Create a focused additive migration, likely:

```text
backend/src/migrations/042-archive-foundation.sql
```

Create tables:

- `archive_objects`
- `artifact_types`
- `evidence_classifications`
- `confidence_levels`
- `relationship_types`
- `relationship_type_roles`

Seed system values for:

- Artifact types
- Evidence classifications
- Confidence levels
- Relationship types
- Relationship type role contracts for at least `appears_in`, `family_union`, and `occurred_at`

Backfill existing people:

```text
archive_objects.id = persons.id
archive_objects.object_type = 'person'
```

Use primary/display names for archive titles where possible. Use `Unknown Person` as the fallback.

### ADR Gate

If the implementation needs to change any schema field from `Database_Schema_2.0.md`, document the reason before coding the migration.

### Code Review Focus

- Migration is idempotent enough for existing data assumptions but still compatible with the migration runner checksum model.
- Foreign keys and checks align with `Model_Decisions_Before_Code.md`.
- Seed IDs are stable text IDs, not auto-increment integers.
- Backfill does not overwrite existing archive object rows.
- Existing `persons`, `names`, `families`, `media_items`, and source tables remain untouched.

### Tests

- Migration applies on a clean database.
- Migration applies on an existing development database.
- Seed rows exist.
- Every existing person has one `archive_objects` row.

### Exit Criteria

- App starts with the new foundation tables.
- Existing person and tree behavior remains usable.
- No UI changes are required yet.

---

## Phase 2: Archive Object Backend Primitives

### Goal

Create the backend primitives that all later archive objects will use.

### Scope

Add backend types under a new archive-focused type location, such as:

```text
backend/src/types/archive.ts
```

Add:

- `ArchiveObjectRepository`
- `ArchiveObjectService` if service-layer behavior is needed beyond repository calls
- Repository export from `backend/src/repositories/index.ts`
- Optional authenticated read endpoints under `/api/v1/archive-objects`

Minimum operations:

- Create archive object
- Find by ID
- List by type
- Update title, summary, and privacy
- Soft-delete

### ADR Gate

Decide whether archive object writes are exposed directly through public API routes or kept internal until artifact/relationship flows need them. Prefer internal-first if there is no immediate UI need.

### Code Review Focus

- Domain repositories do not bypass archive object creation once they represent 2.0 objects.
- Soft-delete behavior is consistently filtered from normal reads.
- Privacy values and object types are constrained to allowed values.
- API route, if added, follows current `/api/v1` auth pattern.

### Tests

- Repository create/read/list/update/soft-delete tests.
- Service tests for validation and soft-delete filtering if a service is added.

### Exit Criteria

- Backend can reliably manage shared archive metadata.
- Existing features still run against existing tables.

---

## Phase 3: Artifact Metadata Vertical Slice

### Goal

Make artifacts the first new 2.0 user-facing domain object.

### Scope

Add migration for:

- `artifacts`
- `artifact_files` if file metadata is needed now

Add backend:

- `ArtifactRepository`
- `ArtifactService`
- `/api/v1/artifacts`
- Lookup endpoints or embedded lookup responses for artifact types and evidence classifications

Add frontend:

- `/artifacts`
- `/artifacts/:id`
- Basic create/edit form
- List and detail views

First pass should support metadata only:

- Title
- Summary/description
- Artifact type
- Optional evidence classification
- Original date text and normalized date fields if practical
- Creator text
- Physical location
- Notes
- Privacy level

File upload and legacy media migration may be deferred until the metadata path works.

### ADR Gate

Decide whether an artifact's ID equals its `archive_objects.id` at creation. The recommended decision is yes.

### Code Review Focus

- Artifact creation is transactional with archive object creation.
- Artifact type is required and references `artifact_types`.
- Evidence classification is optional and separate from artifact type.
- UI does not ask users whether the item is a source first. It asks what the item is.
- Existing `/media` behavior is not broken.

### Tests

- Repository/service tests for artifact create/read/update/list.
- API tests for validation and auth.
- Frontend tests for artifact form rendering and successful create/edit where practical.

### Exit Criteria

- User can create, view, edit, and list artifact metadata.
- Each artifact appears as an archive object.
- Existing media workflows remain available.

---

## Phase 4: Relationship Engine and Person-to-Artifact Connection

### Goal

Prove that archive objects gain meaning through first-class relationships.

### Scope

Add migration for:

- `relationships`
- `relationship_members`

Add backend:

- `RelationshipRepository`
- `RelationshipService`
- `/api/v1/relationships`

Add helper queries:

- Relationships for object
- Connected objects for object
- Relationships by type

Implement first use case:

```text
Person appears in artifact
```

Add frontend:

- Connected People section on artifact detail
- Connected Artifacts section on person detail
- Minimal connect-person-to-artifact workflow

### ADR Gate

Relationship validation through `relationship_type_roles` is not optional. If validation proves awkward, update the contract design rather than bypassing it.

### Code Review Focus

- Relationship creation creates a `relationship` archive object.
- Relationship members reference valid `archive_objects` rows.
- Service validates allowed roles and object types.
- Service validates required role counts and max role counts.
- `claim_evidence` is not simulated with generic relationship types.
- UI labels relationships in human language, not graph jargon.

### Tests

- Valid `appears_in` relationship can be created.
- Invalid object type for role is rejected.
- Missing required role is rejected.
- Duplicate `(relationship_id, object_id, role)` is rejected.
- Connected object queries return expected people/artifacts.

### Exit Criteria

- User can connect an existing person to an artifact.
- Artifact detail shows connected people.
- Person detail shows connected artifacts.
- Relationship itself exists as an archive object.

---

## Phase 5: Legacy Media to Artifact Bridge

### Goal

Start adapting current media without destroying media paths or changing upload behavior prematurely.

### Scope

Choose the least risky bridge:

- Add an `artifact_files` bridge to existing media paths, or
- Backfill artifacts from `media_items`, or
- Create a compatibility view such as `legacy_media_artifacts_view`

Recommended first move:

```text
media_items -> artifacts + artifact_files, preserving media_items and file paths
```

### ADR Gate

Document whether `media_items.id` becomes `artifacts.id` or whether `artifact_files` stores a legacy media reference. Prefer stable IDs only if it avoids ambiguity and duplicate mapping.

### Code Review Focus

- No file moves or deletes.
- Thumbnails remain valid.
- Existing `/media` UI still works.
- Backfill can be safely rerun only if explicitly designed for it.
- Mapping from media descriptions/dates to artifact fields is documented.

### Tests

- Existing media repository tests still pass.
- Backfilled media artifacts have archive object rows.
- Artifact file rows point to existing storage paths.

### Exit Criteria

- Existing media can be viewed or reasoned about as artifacts without breaking legacy media flows.

---

## Phase 6: Events and Places as Archive Objects

### Goal

Add reusable events and places to support artifact context.

### Scope

Add migrations for:

- `events` 2.0 shape only if separate from existing events is required, or a bridge strategy for current `events`
- `places`
- `place_aliases`

Add backend:

- Event service/repository adaptation or new archive event repository
- `PlaceRepository`
- Event/place APIs

Add frontend:

- Basic event create/edit/detail
- Basic place create/edit/detail
- Connect artifact to event
- Connect event to place
- Connect person to event

### ADR Gate

Decide whether to adapt the existing `events` table directly or create a new 2.0 event extension table. Because early migrations should be additive, prefer bridge/adaptation unless a new table is clearly safer.

### Code Review Focus

- Tree and person timelines remain stable.
- Date uncertainty fields preserve original text and normalized ranges.
- Places are reusable objects, not only string fields.

### Tests

- Event and place archive object creation.
- Relationship connection among artifact, event, place, and person.
- Existing event API behavior remains compatible or intentionally adapted with tests.

### Exit Criteria

- User can create an event and place, then connect artifacts and people to them.

---

## Phase 7: Collections and Tags

### Goal

Add curated storytelling containers and lightweight organization.

### Scope

Add migrations for:

- `collections`
- `collection_items`
- `tags`
- `object_tags`

Add backend:

- `CollectionRepository`
- Tag repository or tag methods in an archive repository
- Collection APIs

Add frontend:

- Collection list/detail/create/edit
- Add any archive object to collection
- Captions and custom ordering
- Basic tag assignment where useful

### ADR Gate

Confirm collections are not implemented as folders and tags are not implemented as collections.

### Code Review Focus

- `collection_items.item_object_id` accepts any archive object.
- Ordering and captions are collection-specific.
- Tags remain lightweight search/discovery aids.

### Tests

- Collections can include mixed object types.
- Duplicate collection items are rejected.
- Ordering persists.

### Exit Criteria

- User can curate a mixed collection of people, artifacts, events, places, stories, or claims.

---

## Phase 8: Claims, Evidence, and Confidence

### Goal

Separate historical conclusions from supporting evidence.

### Scope

Add migrations for:

- `claims`
- `claim_subjects`
- `claim_evidence`

Add backend:

- `ClaimRepository`
- `ClaimService`
- Claim APIs

Add frontend:

- Claim create/edit/detail
- Add artifact evidence to claim
- Show claims supported by an artifact

### ADR Gate

If citation terminology replaces `claim_evidence`, document the rename and update all docs before implementation. Do not run two canonical models.

### Code Review Focus

- Artifact-to-claim support uses `claim_evidence`, not generic relationships.
- Evidence role supports `supports`, `contradicts`, `mentions`, and `uncertain`.
- Confidence belongs to claims and relationships, not directly to artifact identity.
- Evidence classification remains separate from claim confidence.

### Tests

- Claim with subject can be created.
- Evidence can support or contradict a claim.
- Duplicate evidence links are rejected.
- Artifact detail shows related claims through the canonical evidence path.

### Exit Criteria

- User can create a claim and attach artifact evidence with a role and confidence context.

---

## Phase 9: Stories and Narrative Context

### Goal

Preserve narrative memory that structured fields cannot capture.

### Scope

Add migration for:

- `stories`

Add backend:

- `StoryRepository`
- Story APIs

Add frontend:

- Story create/edit/detail
- Markdown body support
- Connect stories to archive objects
- Add stories to collections

### ADR Gate

Decide Markdown sanitization/rendering approach before exposing story rendering.

### Code Review Focus

- Story body rendering is safe against XSS.
- Story connections use the relationship engine.
- Stories are presented as narrative content, not generic object records.

### Tests

- Story CRUD.
- Markdown rendering safety where practical.
- Story appears in connected object views.

### Exit Criteria

- User can write a story and connect it to people, artifacts, events, places, claims, or collections.

---

## Phase 10: Archive-Wide Search and Discovery

### Goal

Generalize search across the archive once enough object types exist.

### Scope

Add:

- `archive_search` FTS5 table
- Search indexing service or repository methods
- `/api/v1/search` or archive search endpoint
- Global search UI

Index:

- Archive object titles and summaries
- Person names
- Artifact descriptions and transcriptions
- Story bodies
- Place names
- Tags
- Claims

### ADR Gate

Decide whether indexing is trigger-based, service-maintained, or rebuilt by a maintenance job. Prefer service-maintained first if it is simpler to test.

### Code Review Focus

- Existing `persons_fts` behavior remains compatible until replacement is proven.
- Search results enforce privacy and soft-delete filtering.
- FTS updates happen when indexed objects change.

### Tests

- Search returns expected object types.
- Soft-deleted objects are excluded.
- Privacy filters are enforced if privacy is user-visible at this phase.

### Exit Criteria

- User can search across the archive and open results by object type.

---

## Phase 11: Tree as Relationship View

### Goal

Rebuild or adapt tree loading so the tree is generated from selected relationship types, especially `family_union`.

### Scope

Add:

- Family-to-relationship backfill for `family_union`
- `tree_edges_view` or equivalent query helper
- Compatibility adapter for current frontend tree state
- Updated tree data-loading logic

### ADR Gate

Before coding, create a focused ADR for tree compatibility. This is a high-risk phase because the tree is visible and tightly coupled to current `families` and `family_members` behavior.

### Code Review Focus

- No competing canonical spouse/parent-child storage is introduced.
- Existing family roles map correctly to partner/child members or metadata.
- Current tree interactions remain stable or changes are explicitly accepted.
- Unknown, adoptive, foster, step, and guardian relationships are representable.

### Tests

- Existing tree route tests updated or preserved.
- Backfilled family unions generate expected partner and child edges.
- Tree renders expected parent-child and partner relationships.

### Exit Criteria

- Tree can load from 2.0 relationship data.
- Legacy family tables can remain as compatibility data until removal is deliberately planned.

---

## Phase 12: Provenance and Audit Expansion

### Goal

Track how archive knowledge entered the system and who verified or changed it.

### Scope

Add migration for:

- `provenance_records`

Add backend:

- `ProvenanceRepository`
- Provenance APIs or embedded provenance operations

Add frontend:

- Provenance display on artifact, relationship, and claim detail pages
- Initial provenance creation for scanned/uploaded/identified/verified actions

### ADR Gate

Decide how provenance differs from existing `audit_log`. Recommended distinction: audit log records application actions; provenance records historical/archive trust context.

### Code Review Focus

- Provenance can attach to any archive object.
- Provenance does not replace security audit logging.
- AI/user confirmation actions are represented distinctly if introduced later.

### Tests

- Provenance records attach to artifacts, claims, and relationships.
- Provenance display excludes soft-deleted objects where needed.

### Exit Criteria

- Users can understand where key archive information came from.

---

## Phase 13: AI-Ready Architecture Without AI Dependency

### Goal

Prepare for AI-assisted exploration without making AI a core dependency or source of truth.

### Scope

Keep this mostly design-oriented until the archive model is stable.

Potential later additions:

- Suggestion records
- Review queue
- AI suggestion provenance actions
- User confirmation workflow
- Confidence scoring for suggestions

### ADR Gate

Create an ADR before any AI-generated suggestions can write to archive facts. The expected decision is: AI suggests, users confirm, confirmed suggestions become normal archive relationships, claims, or provenance records.

### Code Review Focus

- AI output is clearly marked.
- AI suggestions never become facts without user confirmation.
- Structured archive data remains the reasoning source.

### Exit Criteria

- The data model can support future suggestions without weakening trust.

---

## Recommended Commit Series

Use small, reviewable commits. A safe first series is:

```text
1. chore: record 2.0 baseline verification
2. db: add archive foundation tables
3. db: seed archive lookup values
4. db: backfill person archive objects
5. backend: add archive object repository
6. backend: add archive object tests
7. api: add archive object read endpoints if needed
8. db: add artifact tables
9. backend: add artifact service and API
10. frontend: add artifact metadata views
11. db: add relationship tables
12. backend: add relationship validation service
13. frontend: connect people and artifacts
```

Do not combine schema foundation, artifact UI, and relationship engine into one large change.

---

## Cross-Phase Risks

| Risk | Severity | Mitigation |
|---|---:|---|
| Rewriting the tree too early | High | Keep current tree until relationship data can generate tree edges. |
| Creating competing person tables | High | Use existing `persons` and `names` during transition. |
| Generic relationships become unvalidated graph soup | High | Enforce `relationship_type_roles` in service layer. |
| Claim evidence duplicated through relationships | High | Use `claim_evidence` or future citations as the only canonical evidence path. |
| Media paths or thumbnails break during artifact migration | High | Preserve `media_items` and file paths until artifact files are proven. |
| Migration checksum failures | Medium | Never edit old migrations; add new numbered migrations only. |
| UI exposes database abstraction | Medium | Use object-specific language and connected item sections, not graph terminology. |
| Search leaks deleted/private objects | Medium | Enforce soft-delete and privacy filters in search queries. |
| AI weakens trust | Medium | Require user confirmation and provenance before facts change. |

---

## Definition of 2.0 Foundation Complete

The foundation is complete when:

- Existing people have archive object rows.
- Users can create artifact metadata as archive objects.
- Users can connect people and artifacts through validated first-class relationships.
- Person and artifact detail pages show connected objects.
- Existing tree, GEDCOM, media, source, auth, and admin functionality remain intact.
- Phase-level tests pass or any residual failures are documented with owners.

At that point, Apex Family Legacy 2.0 has proven the architecture and can safely expand into events, places, collections, claims, stories, search, tree migration, provenance, and AI-ready workflows.
