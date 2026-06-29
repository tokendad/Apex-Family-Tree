# Apex Family Legacy

# Implementation Roadmap 2.0

## Purpose

This document defines the implementation roadmap for Apex Family Legacy 2.0.

The goal is to move from concept to code without losing the architectural vision established in the design documents.

Apex Family Legacy should evolve from a family-tree-centered genealogy application into a connected digital family archive.

The implementation should be incremental, testable, and safe.

This should not be a rushed rewrite.

---

# Guiding Principle

## Build the Archive Foundation First

The most important implementation goal is to prove the new architecture with a small working slice.

The first working slice should be:

> Create a person, create an artifact, connect the artifact to the person, and view that connection through the archive object model.

If that works cleanly, the rest of the system has a strong foundation.

---

# Existing Design Documents

This roadmap assumes the following design documents exist:

```text
Docs/Apex_Family_Legacy_2.0/
├── Product_Vision.md
├── Architecture_of_Ideas.md
├── Artifact_Model.md
├── Relationship_Model.md
├── Data_Model_2.0.md
├── Database_Schema_2.0.md
└── Model_Decisions_Before_Code.md
```

These documents should guide implementation decisions.

`Model_Decisions_Before_Code.md` resolves model-contract ambiguities and supersedes conflicting wording in earlier planning docs.

If a coding decision conflicts with the design documents, pause and update the design first.

---

# Major Implementation Themes

Apex Family Legacy 2.0 should be built around these architectural ideas:

* The archive is a graph of connected knowledge.
* Every major item is an archive object.
* Artifacts are first-class preserved objects.
* Relationships connect everything.
* Claims separate evidence from conclusions.
* Evidence informs confidence.
* Confidence belongs to claims and relationships.
* Provenance protects trust.
* The family tree is generated from selected relationship types.
* The UI should hide database complexity from users.

---

# Development Strategy

## Avoid a Big-Bang Rewrite

Do not attempt to rebuild the entire application at once.

Instead, implement the new architecture in layers.

Each phase should leave the application in a working state.

Each phase should add one meaningful capability.

---

## Prefer Vertical Slices

A vertical slice means implementing database, backend, API, frontend, and tests for one narrow feature.

Example:

```text
Artifact creation
        ↓
Artifact database table
        ↓
Artifact repository
        ↓
Artifact service
        ↓
Artifact API route
        ↓
Artifact UI
        ↓
Artifact tests
```

This is safer than building the whole database first and the UI months later.

---

## Protect the Current Application

The existing app should remain runnable during the transition.

The 2.0 branch may change architecture, but development should still favor:

* Small commits
* Clear migrations
* Tests where practical
* Backups before destructive schema changes
* Compatibility decisions documented before implementation

---

# Phase 0 — Project Preparation

## Goal

Prepare the codebase for the 2.0 implementation.

## Tasks

* Confirm work is happening on the `apex-family-legacy-2.0` branch.
* Review current database schema.
* Review current repository and service patterns.
* Identify existing code that can be reused.
* Identify code that should eventually be replaced.
* Confirm current test setup.
* Create a place for 2.0 migration notes.

## Deliverables

* Updated implementation notes.
* List of current tables.
* List of current backend repositories/services.
* List of current frontend features affected by the redesign.

## Acceptance Criteria

* The team understands what exists today.
* The app still runs.
* No major feature rewrite has begun yet.

---

# Phase 1 — Database Foundation

## Goal

Introduce the core database foundation for Apex Family Legacy 2.0.

## Primary Tables

* `archive_objects`
* `confidence_levels`
* `artifact_types`
* `evidence_classifications`
* `event_types`
* `relationship_types`
* `relationship_type_roles`

## Tasks

* Create the first additive 2.0 migration.
* Add the shared `archive_objects` table.
* Add lookup tables.
* Seed system values.
* Add indexes.
* Do not create replacement `people` or `person_names` tables in Phase 1.
* Do not rename or destroy existing tables in Phase 1.
* Add basic migration tests if practical.
* Confirm migration works on a clean database.
* Confirm migration works on an existing development database.

## Important Decisions

The `archive_objects` table is the identity layer.

Every major object should eventually have a row in `archive_objects`.

Lookup tables should include stable system values but allow future user-defined values where appropriate.

The first migration should be additive and backward-compatible. Existing `persons` and `names` remain the physical person tables during this phase.

## Acceptance Criteria

* A fresh database can be initialized.
* Lookup tables are seeded.
* The app can still start.
* No frontend behavior needs to change yet.

---

# Phase 2 — Archive Object Service Layer

## Goal

Create backend primitives for working with archive objects.

## Tasks

* Add `ArchiveObjectRepository`.
* Add `ArchiveObjectService`.
* Add helper functions for creating archive objects.
* Add helper functions for updating object titles, summaries, and privacy.
* Add soft-delete behavior.
* Add basic tests.

## Design Requirement

Domain objects should not manually bypass `archive_objects`.

Creating a person, artifact, event, place, story, collection, claim, or relationship should create an archive object first.

## Acceptance Criteria

* Backend can create an archive object.
* Backend can retrieve an archive object by ID.
* Backend can list archive objects by type.
* Backend can update shared metadata.
* Backend can soft-delete an archive object.

---

# Phase 3 — Artifact Vertical Slice

## Goal

Implement artifacts as the first major 2.0 object.

Artifacts are a strong first slice because they prove the archive concept without requiring the full genealogy tree to be rebuilt.

## Primary Tables

* `artifacts`
* `artifact_files`
* `artifact_types`
* `evidence_classifications`

## Backend Tasks

* Add `ArtifactRepository`.
* Add `ArtifactService`.
* Add artifact create/read/update/list endpoints.
* Add artifact type lookup endpoint.
* Add evidence classification lookup endpoint.
* Connect artifact creation to `archive_objects`.

## Frontend Tasks

* Add artifact list view.
* Add artifact detail view.
* Add simple artifact create/edit form.
* Allow selecting artifact type.
* Allow optional evidence classification.
* Display artifact title, description, type, date, and notes.

## Deferred

File upload may reuse the existing media system initially.

A perfect artifact file-management system is not required in the first pass.

## Acceptance Criteria

* User can create an artifact.
* Artifact appears as an archive object.
* User can view artifact details.
* User can edit artifact metadata.
* Artifact type is stored using the new type system.
* Evidence classification is optional.

---

# Phase 4 — Relationship Engine

## Goal

Implement relationships as first-class archive objects.

This phase proves the central idea of Apex Family Legacy:

> Meaning comes from connections.

## Primary Tables

* `relationships`
* `relationship_members`
* `relationship_types`
* `relationship_type_roles`
* `confidence_levels`

## Backend Tasks

* Add `RelationshipRepository`.
* Add `RelationshipService`.
* Add relationship create/read/update/delete endpoints.
* Add ability to connect any archive object to any other archive object.
* Add relationship member validation using `relationship_type_roles` before exposing creation APIs.
* Add helper queries:

  * Get relationships for an object.
  * Get objects connected to an object.
  * Get relationships by type.

## Frontend Tasks

* Add a simple “Connected Items” section to artifact detail.
* Allow connecting an artifact to a person.
* Allow connecting an artifact to an event or place if available.
* Display relationship type and confidence.

## First Relationship Use Case

```text
Person appears in Artifact
```

Example:

```text
Walter appears in Christmas Morning 1989 photo.
```

## Acceptance Criteria

* User can connect a person to an artifact.
* User can view all relationships for an artifact.
* User can view all artifacts connected to a person.
* Relationship has a type.
* Relationship may have confidence.
* Relationship itself exists as an archive object.

---

# Phase 5 — Person Integration

## Goal

Adapt existing `persons` and `names` records to the new archive object model.

## Primary Tables

* existing `persons`
* existing `names`
* `archive_objects`
* `relationships`

## Tasks

* Ensure every person has a corresponding `archive_objects` row.
* Add migration path for existing people.
* Adapt existing `names` support to the archive profile experience.
* Update person repository/service as needed.
* Update person detail/profile view.
* Add “Connected Artifacts” section to person profile.
* Add “Connected Events” section later if available.

## Important Design Rule

A person should not own the entire archive.

A person should be one object connected to many other objects.

## Acceptance Criteria

* Existing people can be represented as archive objects.
* Person profile still works.
* Person names are supported.
* Person can display connected artifacts.
* Existing tree behavior is not unnecessarily broken during this phase.

---

# Phase 6 — Events and Places

## Goal

Add events and places as reusable archive objects.

## Primary Tables

* `events`
* `event_types`
* `places`
* `place_aliases`
* `relationships`

## Tasks

* Add event repository/service/API.
* Add place repository/service/API.
* Add event type lookup.
* Add basic event create/edit/detail UI.
* Add basic place create/edit/detail UI.
* Allow artifacts to connect to events.
* Allow events to connect to places.
* Allow people to connect to events.

## First Event Use Case

```text
Christmas Morning 1989
```

Connected objects:

* Artifact: Christmas photo
* Event: Christmas Morning 1989
* Place: Family home
* People: People appearing in the photo

## Acceptance Criteria

* User can create an event.
* User can create a place.
* User can connect artifact to event.
* User can connect event to place.
* User can connect person to event.
* Event and place are archive objects.

---

# Phase 7 — Collections

## Goal

Add curated storytelling groups.

## Primary Tables

* `collections`
* `collection_items`

## Tasks

* Add collection repository/service/API.
* Add collection create/edit/detail UI.
* Allow adding any archive object to a collection.
* Allow custom ordering.
* Allow captions.
* Add cover artifact support.

## First Collection Use Case

```text
Grandpa's Military Service
```

Possible contents:

* Person: Grandpa
* Artifact: Draft letter
* Artifact: Discharge record
* Artifact: Photo in uniform
* Event: Military service
* Claim: Grandpa served in WWII
* Story: Family memory about his service

## Acceptance Criteria

* User can create a collection.
* User can add artifacts to a collection.
* User can add people, events, stories, or claims to a collection.
* Collection contents can be ordered.
* Collection acts like a storytelling container, not just a folder.

---

# Phase 8 — Claims, Evidence, and Confidence

## Goal

Implement historical claims and evidence support.

This phase is essential for serious genealogy, source evaluation, and future AI-assisted reasoning.

## Primary Tables

* `claims`
* `claim_subjects`
* `claim_evidence`
* `confidence_levels`
* `evidence_classifications`

## Tasks

* Add claim repository/service/API.
* Add claim create/edit/detail UI.
* Allow claims to reference subjects.
* Allow artifacts to support or contradict claims.
* Add confidence level to claims.
* Add evidence weight or evidence role.
* Display supporting evidence on claim detail.
* Display claims supported by an artifact.

## Design Rule

Evidence informs confidence.

Confidence belongs to claims and relationships.

An artifact may be authoritative, but it does not automatically prove every claim.

## First Claim Use Case

```text
Grandpa served in World War II.
```

Supporting evidence:

* Draft letter
* Discharge record
* Photo in uniform
* Oral history

## Acceptance Criteria

* User can create a claim.
* User can connect artifact evidence to a claim.
* Evidence may support, contradict, mention, or be uncertain.
* Claim has a confidence level.
* Artifact detail can show claims it supports.
* Claim detail can show supporting evidence.

---

# Phase 9 — Stories

## Goal

Add narrative memory and explanation.

## Primary Tables

* `stories`
* `relationships`

## Tasks

* Add story repository/service/API.
* Add story create/edit/detail UI.
* Allow stories to connect to any archive object.
* Allow stories to be added to collections.
* Support Markdown body content.
* Add narrator/author fields where practical.

## First Story Use Case

```text
The Story Behind Grandpa's Draft Letter
```

Connected objects:

* Grandpa
* Draft letter artifact
* WWII service claim
* Military service collection

## Acceptance Criteria

* User can create a story.
* Story can connect to people, artifacts, events, places, claims, or collections.
* Story body supports Markdown.
* Story appears in connected object views.

---

# Phase 10 — Search and Discovery

## Goal

Create archive-wide search.

## Primary Tables

* `archive_search`
* `tags`
* `object_tags`

## Tasks

* Add SQLite FTS table.
* Index archive object titles and summaries.
* Index person names.
* Index artifact descriptions and transcriptions.
* Index story bodies.
* Index place names.
* Index tags.
* Add search endpoint.
* Add simple global search UI.

## Acceptance Criteria

* User can search across people, artifacts, events, places, stories, claims, and collections.
* Search results show object type.
* Search results link to detail views.
* Artifact transcriptions are searchable.
* Tags improve discovery.

---

# Phase 11 — Tree Rebuild as Relationship View

## Goal

Rebuild or adapt the family tree so it is generated from relationship data.

The tree should become a view over the archive, not the archive itself.

## Tree-Relevant Relationship Types

* Biological parent
* Adoptive parent
* Foster parent
* Step-parent
* Guardian
* Spouse
* Partner
* Family union
* Child in union

## Tasks

* Create tree relationship query/view.
* Map relationship records to tree nodes and edges.
* Preserve existing tree interactions where possible.
* Support uncertain relationships.
* Support adoptive/foster/step relationships.
* Support unknown parents where practical.
* Update canvas data-loading logic.

## Acceptance Criteria

* Tree loads from relationship data.
* Existing person nodes display correctly.
* Parent-child relationships render correctly.
* Spouse/partner relationships render correctly.
* Adoptive/foster/step relationships are representable.
* Tree remains one view of the archive, not the whole model.

---

# Phase 12 — Provenance

## Goal

Track where information came from and how it entered the archive.

## Primary Tables

* `provenance_records`

## Tasks

* Add provenance repository/service/API.
* Record artifact upload/scanning provenance.
* Record identification provenance.
* Record claim verification provenance.
* Record relationship confirmation provenance.
* Add provenance display to artifact, claim, and relationship detail views.

## First Provenance Use Case

```text
Aunt Susan identified the people in this photograph on June 1, 2026.
```

## Acceptance Criteria

* Provenance can attach to any archive object.
* Provenance records who, when, and what happened.
* Provenance can include confidence.
* Users can understand where information came from.

---

# Phase 13 — AI-Ready Architecture

## Goal

Prepare the archive for future AI-assisted exploration without making AI a dependency.

## Important Principle

The AI should reason from structured archive knowledge.

It should not guess from flat files.

## Future AI Use Cases

* Suggest unidentified people in photos.
* Suggest likely relationships between artifacts.
* Find artifacts that may belong to the same event.
* Compare handwriting across letters.
* Summarize a person's life from connected events and artifacts.
* Identify conflicting claims.
* Suggest missing provenance.
* Estimate confidence based on evidence strength.
* Surface “unknown but likely connected” archive items.

## Implementation Tasks

This phase should remain mostly design-oriented until the archive model is stable.

Possible future tasks:

* Add AI suggestion records.
* Add user confirmation workflow.
* Add `ai_suggested` provenance action type.
* Add confidence scores to suggestions.
* Add review queue.
* Ensure AI suggestions never become facts without user confirmation.

## Acceptance Criteria

* AI can suggest.
* Users confirm.
* Confirmed suggestions become normal archive relationships, claims, or provenance records.
* AI-generated content is clearly marked.
* The archive remains trustworthy.

---

# Recommended First Vertical Slice

The first meaningful implementation slice should be:

```text
Person
  ↓
Artifact
  ↓
Relationship
  ↓
Connected object view
```

## User Story

As a user, I want to add a family artifact and connect it to a person so that the artifact becomes part of that person's family history.

## Technical Scope

* `archive_objects`
* existing `persons`
* existing `names`
* `artifacts`
* `artifact_types`
* `evidence_classifications`
* `relationships`
* `relationship_members`
* `relationship_types`
* `confidence_levels`

## UI Scope

* Create artifact
* View artifact
* Connect artifact to person
* View connected artifacts on person profile
* View connected people on artifact profile

## Why This Slice Matters

This proves the most important architectural idea:

> Objects gain meaning through relationships.

If this slice works, the rest of the archive can grow naturally.

---

# Migration Strategy

## Existing Data

The current app likely already has:

* People
* Families
* Family members
* Events
* Media
* Sources
* Users
* Roles
* Settings

These should not be destroyed.

## Recommended Approach

1. Add new tables alongside existing tables.
2. Create archive object rows for existing people.
3. Map existing media to artifacts where possible.
4. Map existing family structures to relationships gradually.
5. Keep compatibility views or adapters during the transition.
6. Remove obsolete tables only after the new model is proven.

Existing `persons` and `names` are not obsolete in early phases. They are the transitional physical implementation of conceptual Person and person names.

## Important Rule

Do not delete old data structures until the new model can fully represent their meaning.

---

# Testing Strategy

Each phase should include tests where practical.

## Backend Tests

* Repository tests
* Service tests
* Migration tests
* Relationship query tests
* Claim/evidence tests

## Frontend Tests

* Form rendering
* Detail views
* Connection workflows
* Search behavior
* Tree rendering after relationship migration

## Data Integrity Tests

Important integrity tests should verify:

* Every domain object has an archive object.
* Relationship members point to valid archive objects.
* Claims can reference supporting evidence.
* Collections can contain mixed object types.
* Soft-deleted objects do not appear in normal views.
* Tree-relevant relationships can produce tree edges.

---

# Development Order Summary

Recommended order:

```text
0. Project preparation
1. Database foundation
2. Archive object service layer
3. Artifact vertical slice
4. Relationship engine
5. Person integration
6. Events and places
7. Collections
8. Claims, evidence, and confidence
9. Stories
10. Search and discovery
11. Tree rebuild as relationship view
12. Provenance
13. AI-ready architecture
```

---

# What Not To Do First

Avoid starting with:

* Full tree rewrite
* Full GEDCOM rewrite
* Full AI integration
* Full media overhaul
* Full source/citation perfection
* Full UI redesign
* Massive one-shot migration

Those are important, but they are not the foundation.

The foundation is the archive object model and the relationship engine.

---

# Definition of Success

Apex Family Legacy 2.0 succeeds when users can naturally move through the archive by following connections.

A person leads to artifacts.

An artifact leads to events.

An event leads to places.

A place leads to stories.

A story leads to claims.

A claim leads to evidence.

Evidence leads back to people.

That connected experience is the product.

---

# Final Principle

Do not let the database dictate the family story.

Let the family story define the database.

Apex Family Legacy should preserve not only who people were related to, but what they left behind, where they lived, what they experienced, what evidence remains, and why their lives mattered.
