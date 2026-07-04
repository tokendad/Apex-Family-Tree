# Apex Family Legacy

# Database Schema 2.0

## Purpose

This document proposes the foundational SQLite database schema for Apex Family Legacy.

Apex Family Legacy is a digital family archive. The database should support people, artifacts, events, places, stories, collections, relationships, claims, evidence, provenance, and future intelligent exploration.

Before implementation, read `Model_Decisions_Before_Code.md`. That document resolves physical implementation decisions that supersede any ambiguity in this conceptual schema.

The schema should not be optimized only for a family tree.

The tree is one view of the archive.

The archive itself is a connected graph of family knowledge.

---

# Core Schema Principle

## Use a Shared Archive Object Layer

The most important schema decision is to introduce a shared object table:

```text
archive_objects
```

Every major thing in the archive receives a row in `archive_objects`.

Examples:

* Person
* Artifact
* Event
* Place
* Story
* Collection
* Claim
* Relationship

Domain-specific tables then extend that shared object.

This provides one consistent way to connect, tag, collect, cite, search, protect, and track provenance for anything in the archive.

---

# Why This Matters

Without a shared object layer, the schema would require many special-purpose join tables:

```text
person_artifacts
person_events
artifact_events
artifact_places
story_people
story_artifacts
collection_artifacts
collection_people
...
```

That approach becomes rigid and bloated.

With a shared object layer, Apex can say:

```text
object connects to object
```

This makes the archive flexible, searchable, and future-proof.

---

# ID Strategy

All primary keys should be text IDs.

Recommended format:

```text
UUID or ULID
```

Examples:

```text
person_01H...
artifact_01H...
event_01H...
```

Benefits:

* Easy syncing later
* Safer imports
* Easier backups
* No dependence on SQLite auto-increment behavior
* Better support for future distributed features

---

# Date Strategy

Family history often contains uncertain dates.

The schema should store both human-readable date text and normalized date ranges.

Recommended pattern:

```text
date_text
date_start
date_end
date_precision
date_qualifier
```

Examples:

```text
date_text: ABT 1954
date_start: 1954-01-01
date_end: 1954-12-31
date_precision: year
date_qualifier: about
```

This preserves original meaning while still allowing search and timeline queries.

---

# Privacy Strategy

Privacy should be available at the shared object level.

Every archive object may have:

```text
privacy_level
```

Examples:

* public
* family
* private
* restricted

This allows a photograph, story, artifact, claim, or relationship to be protected without inventing separate privacy systems for every table.

---

# Core Table: archive_objects

```sql
CREATE TABLE archive_objects (
  id TEXT PRIMARY KEY,
  object_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  privacy_level TEXT NOT NULL DEFAULT 'family',
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  updated_by TEXT,

  CHECK (object_type IN (
    'person',
    'artifact',
    'event',
    'place',
    'story',
    'collection',
    'claim',
    'relationship'
  )),

  CHECK (privacy_level IN (
    'public',
    'family',
    'private',
    'restricted'
  ))
);
```

## Notes

`archive_objects` is the identity layer.

It should contain only fields that are common to all major archive objects.

Domain-specific details belong in extension tables.

---

# People

## Transitional Implementation Decision

Do not create new `people` or `person_names` tables during Phase 1.

During the transition, the existing `persons` and `names` tables are the physical person-domain extension tables.

Phase 1 should backfill archive object rows for existing people using:

```text
archive_objects.id = persons.id
archive_objects.object_type = 'person'
```

The SQL below describes the conceptual target shape for person data. It is not the Phase 1 migration plan unless a deliberate future refactor replaces or renames the existing tables.

Any later schema examples that reference `people` or `person_names` should be read as conceptual target references. During the transition, use the existing `persons` and `names` tables instead.

## people

```sql
CREATE TABLE people (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  sex TEXT,
  gender_identity TEXT,
  living_status TEXT NOT NULL DEFAULT 'unknown',
  profile_artifact_id TEXT,
  notes TEXT,

  FOREIGN KEY (id) REFERENCES archive_objects(id) ON DELETE CASCADE,
  FOREIGN KEY (profile_artifact_id) REFERENCES archive_objects(id),

  CHECK (living_status IN ('living', 'deceased', 'unknown'))
);
```

## person_names

```sql
CREATE TABLE person_names (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  name_type TEXT NOT NULL DEFAULT 'primary',
  prefix TEXT,
  given_name TEXT,
  middle_name TEXT,
  surname TEXT,
  suffix TEXT,
  nickname TEXT,
  display_name TEXT,
  sort_name TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  date_text TEXT,
  date_start TEXT,
  date_end TEXT,
  notes TEXT,

  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
);
```

## Design Notes

A person should store identity-level information only.

Birth, death, marriage, residence, military service, and education should be modeled as events, claims, or relationships rather than being trapped as fixed person columns.

For the initial implementation, apply this principle to the existing `persons` and `names` tables rather than creating new person tables.

---

# Artifact Types

## artifact_types

```sql
CREATE TABLE artifact_types (
  id TEXT PRIMARY KEY,
  parent_type_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,

  FOREIGN KEY (parent_type_id) REFERENCES artifact_types(id),
  UNIQUE (name)
);
```

## Design Notes

Artifact types answer:

```text
What is this?
```

Examples:

* Photo
* Letter
* Document
* Recipe
* Audio Recording
* Video
* Physical Object
* Map
* Book

Users should be able to add custom types:

* School Report Card
* Draft Letter
* Church Bulletin
* Family Reunion Program
* Quilt Pattern
* Farm Ledger

Artifact type should not answer whether something is authoritative.

That is handled by evidence classification.

---

# Evidence Classification

## evidence_classifications

```sql
CREATE TABLE evidence_classifications (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  default_weight INTEGER,
  is_system INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,

  UNIQUE (name),

  CHECK (default_weight IS NULL OR default_weight BETWEEN 0 AND 100)
);
```

## Suggested Seed Values

```text
Official Record
Primary Source
Secondary Source
Supporting Evidence
Personal Artifact
Family Memory
Reproduction / Copy
Unknown
```

## Design Notes

Evidence classification answers:

```text
How authoritative is this artifact when used as evidence?
```

It is separate from artifact type.

Example:

```text
Type: Letter
Custom Type: Draft Letter
Evidence Classification: Official Record / Primary Source
```

---

# Artifacts

## artifacts

```sql
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  artifact_type_id TEXT NOT NULL,
  evidence_classification_id TEXT,
  original_date_text TEXT,
  original_date_start TEXT,
  original_date_end TEXT,
  date_precision TEXT,
  date_qualifier TEXT,
  creator_text TEXT,
  physical_location TEXT,
  original_format TEXT,
  condition_notes TEXT,
  language TEXT,
  transcription TEXT,
  notes TEXT,

  FOREIGN KEY (id) REFERENCES archive_objects(id) ON DELETE CASCADE,
  FOREIGN KEY (artifact_type_id) REFERENCES artifact_types(id),
  FOREIGN KEY (evidence_classification_id) REFERENCES evidence_classifications(id)
);
```

## artifact_files

```sql
CREATE TABLE artifact_files (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL,
  file_role TEXT NOT NULL DEFAULT 'primary',
  storage_provider TEXT NOT NULL DEFAULT 'local',
  storage_path TEXT NOT NULL,
  original_filename TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  checksum_sha256 TEXT,
  width INTEGER,
  height INTEGER,
  duration_seconds REAL,
  created_at TEXT NOT NULL,

  FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE,

  CHECK (file_role IN (
    'primary',
    'original',
    'derivative',
    'thumbnail',
    'transcription',
    'other'
  ))
);
```

## Design Notes

An artifact is the preserved object.

A file is one digital representation of that object.

This distinction matters.

A single artifact may have:

* Original scan
* Cropped image
* Thumbnail
* Transcription file
* Restoration version

All of those are files connected to one artifact.

---

# Event Types

## event_types

```sql
CREATE TABLE event_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,

  UNIQUE (name)
);
```

## Suggested Seed Values

```text
Birth
Death
Marriage
Divorce
Residence
Military Service
Graduation
School Year
Immigration
Census
Holiday Gathering
Family Reunion
Move
Burial
Baptism
Employment
Retirement
Custom Event
```

---

# Events

## events

```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  event_type_id TEXT NOT NULL,
  date_text TEXT,
  date_start TEXT,
  date_end TEXT,
  date_precision TEXT,
  date_qualifier TEXT,
  primary_place_id TEXT,
  description TEXT,
  notes TEXT,

  FOREIGN KEY (id) REFERENCES archive_objects(id) ON DELETE CASCADE,
  FOREIGN KEY (event_type_id) REFERENCES event_types(id),
  FOREIGN KEY (primary_place_id) REFERENCES archive_objects(id)
);
```

## Design Notes

Events support both formal genealogy events and informal family-history moments.

Examples:

* Birth
* Death
* Marriage
* Military Service
* Christmas 1989
* First day of school
* Family reunion
* Move to a new house

People, artifacts, places, stories, and claims connect to events through relationships.

---

# Places

## places

```sql
CREATE TABLE places (
  id TEXT PRIMARY KEY,
  place_type TEXT,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  county TEXT,
  region TEXT,
  country TEXT,
  postal_code TEXT,
  latitude REAL,
  longitude REAL,
  parent_place_id TEXT,
  notes TEXT,

  FOREIGN KEY (id) REFERENCES archive_objects(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_place_id) REFERENCES places(id)
);
```

## place_aliases

```sql
CREATE TABLE place_aliases (
  id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  date_text TEXT,
  date_start TEXT,
  date_end TEXT,
  notes TEXT,

  FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE
);
```

## Design Notes

Places should be reusable.

A school, cemetery, house, town, farm, or military base may connect to many events, artifacts, people, and stories.

---

# Stories

## stories

```sql
CREATE TABLE stories (
  id TEXT PRIMARY KEY,
  story_type TEXT NOT NULL DEFAULT 'story',
  body_markdown TEXT NOT NULL,
  narrator_person_id TEXT,
  recorded_by_user_id TEXT,
  date_text TEXT,
  date_start TEXT,
  date_end TEXT,
  notes TEXT,

  FOREIGN KEY (id) REFERENCES archive_objects(id) ON DELETE CASCADE,
  FOREIGN KEY (narrator_person_id) REFERENCES people(id)
);
```

## Design Notes

Stories preserve meaning that structured fields cannot.

Stories may be attached to people, artifacts, events, places, claims, relationships, and collections through relationships.

---

# Collections

## collections

```sql
CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  collection_type TEXT NOT NULL DEFAULT 'manual',
  description TEXT,
  cover_artifact_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,

  FOREIGN KEY (id) REFERENCES archive_objects(id) ON DELETE CASCADE,
  FOREIGN KEY (cover_artifact_id) REFERENCES artifacts(id)
);
```

## collection_items

```sql
CREATE TABLE collection_items (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  item_object_id TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL,
  added_by TEXT,

  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
  FOREIGN KEY (item_object_id) REFERENCES archive_objects(id) ON DELETE CASCADE,

  UNIQUE (collection_id, item_object_id)
);
```

## Design Notes

Collections are curated storytelling containers.

They are not just folders.

Examples:

* Christmas Through the Years
* Mom's School Records
* Grandpa's Military Service
* Family Recipes
* LeFort Farm

Collections may contain any archive object.

---

# Relationship Types

## relationship_types

```sql
CREATE TABLE relationship_types (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  inverse_name TEXT,
  category TEXT,
  description TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  is_directional INTEGER NOT NULL DEFAULT 1,
  is_tree_relevant INTEGER NOT NULL DEFAULT 0,
  default_confidence_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
```

## relationship_type_roles

```sql
CREATE TABLE relationship_type_roles (
  id TEXT PRIMARY KEY,
  relationship_type_id TEXT NOT NULL,
  role TEXT NOT NULL,
  allowed_object_type TEXT NOT NULL,
  min_count INTEGER NOT NULL DEFAULT 0,
  max_count INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_required INTEGER NOT NULL DEFAULT 0,

  FOREIGN KEY (relationship_type_id) REFERENCES relationship_types(id) ON DELETE CASCADE,

  CHECK (allowed_object_type IN (
    'person',
    'artifact',
    'event',
    'place',
    'story',
    'collection',
    'claim',
    'relationship'
  )),

  CHECK (min_count >= 0),
  CHECK (max_count IS NULL OR max_count >= min_count),
  CHECK (is_required IN (0, 1)),

  UNIQUE (relationship_type_id, role, allowed_object_type)
);
```

## Relationship Type Role Contract

`relationship_members.role` is not uncontrolled free text in practice.

The service layer must validate relationship members against `relationship_type_roles` before creating or updating a relationship.

This contract defines allowed roles, allowed archive object types, minimum and maximum member counts, and required roles for each relationship type.

Examples:

```text
family_union:
  partner -> person, min 1, max 2, required
  child   -> person, min 0, max null

appears_in:
  subject  -> person
  artifact -> artifact

occurred_at:
  event -> event
  place -> place
```

This prevents invalid relationships such as a place as spouse, a claim as child, or an artifact as biological parent.

## Suggested Seed Values

```text
biological_parent_of
adoptive_parent_of
foster_parent_of
step_parent_of
guardian_of
sibling_of
family_union
child_in_union
appears_in
created_by
owned_by
donated_by
scanned_by
identified_by
occurred_at
depicts_event
documents
belongs_to_collection
describes
associated_with
lived_at
attended_school
served_in
```

## Design Notes

Relationship types should be extensible.

The system needs built-in types for common behavior, especially tree generation.

Users should eventually be able to define custom relationship types for archive-specific needs.

`family_union` is the canonical stored relationship type for tree family structure. Pairwise spouse, partner, and parent-child edges may be derived views for UI and tree rendering, but should not become competing canonical stored tree relationships.

Claim evidence should not use generic `supports_claim` or `contradicts_claim` relationships as a second canonical path. Use `claim_evidence`, or a future `citations` table, for artifact-to-claim evidence.

---

# Confidence Levels

## confidence_levels

```sql
CREATE TABLE confidence_levels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  numeric_value INTEGER,
  is_system INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,

  CHECK (numeric_value IS NULL OR numeric_value BETWEEN 0 AND 100)
);
```

## Suggested Seed Values

```text
Unknown
Possible
Probable
Confirmed
Disputed
Rejected
```

## Design Notes

Confidence belongs to claims and relationships.

Evidence informs confidence.

An artifact may be highly authoritative, but the claim it supports may still require interpretation.

---

# Relationships

There are two viable patterns for relationships:

1. Simple edge model
2. Relationship object with members

Apex should use the second pattern.

This allows relationships to be more than hidden joins.

A relationship can carry its own dates, notes, confidence, and provenance.

Claim evidence is handled separately through `claim_evidence` or future citations.

## relationships

```sql
CREATE TABLE relationships (
  id TEXT PRIMARY KEY,
  relationship_type_id TEXT NOT NULL,
  label TEXT,
  description TEXT,
  date_text TEXT,
  date_start TEXT,
  date_end TEXT,
  date_precision TEXT,
  date_qualifier TEXT,
  confidence_level_id TEXT,
  confidence_score INTEGER,
  notes TEXT,

  FOREIGN KEY (id) REFERENCES archive_objects(id) ON DELETE CASCADE,
  FOREIGN KEY (relationship_type_id) REFERENCES relationship_types(id),
  FOREIGN KEY (confidence_level_id) REFERENCES confidence_levels(id),

  CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 100)
);
```

## relationship_members

```sql
CREATE TABLE relationship_members (
  id TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL,
  object_id TEXT NOT NULL,
  role TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,

  FOREIGN KEY (relationship_id) REFERENCES relationships(id) ON DELETE CASCADE,
  FOREIGN KEY (object_id) REFERENCES archive_objects(id) ON DELETE CASCADE,

  UNIQUE (relationship_id, object_id, role)
);
```

## Why Relationship Members?

This supports simple and complex relationships.

### Example: Person appears in photo

```text
Relationship type: appears_in

Members:
- person: John Smith, role: subject
- artifact: Christmas 1989 Photo, role: artifact
```

### Example: Family union

```text
Relationship type: family_union

Members:
- person: John Smith, role: partner
- person: Mary Jones, role: partner
```

### Example: Family union with children

```text
Relationship type: family_union

Members:
- person: John Smith, role: partner
- person: Mary Jones, role: partner
- person: Susan Smith, role: child
- person: Robert Smith, role: child
```

### Evidence links are specialized

```text
Artifact-to-claim evidence is represented through claim_evidence or future citations,
not through a generic relationship record.
```

This pattern keeps the model flexible without creating endless special-case tables.

---

# Claims

## claims

```sql
CREATE TABLE claims (
  id TEXT PRIMARY KEY,
  statement TEXT NOT NULL,
  claim_type TEXT,
  subject_object_id TEXT,
  date_text TEXT,
  date_start TEXT,
  date_end TEXT,
  confidence_level_id TEXT,
  confidence_score INTEGER,
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT,

  FOREIGN KEY (id) REFERENCES archive_objects(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_object_id) REFERENCES archive_objects(id),
  FOREIGN KEY (confidence_level_id) REFERENCES confidence_levels(id),

  CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 100),
  CHECK (status IN ('open', 'supported', 'conflicted', 'rejected', 'unknown'))
);
```

## claim_evidence

```sql
CREATE TABLE claim_evidence (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL,
  evidence_object_id TEXT NOT NULL,
  evidence_role TEXT NOT NULL DEFAULT 'supports',
  evidence_classification_id TEXT,
  excerpt TEXT,
  locator TEXT,
  weight_score INTEGER,
  confidence_contribution INTEGER,
  notes TEXT,

  FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE,
  FOREIGN KEY (evidence_object_id) REFERENCES archive_objects(id) ON DELETE CASCADE,
  FOREIGN KEY (evidence_classification_id) REFERENCES evidence_classifications(id),

  CHECK (evidence_role IN ('supports', 'contradicts', 'mentions', 'uncertain')),
  CHECK (weight_score IS NULL OR weight_score BETWEEN 0 AND 100),
  CHECK (confidence_contribution IS NULL OR confidence_contribution BETWEEN 0 AND 100),

  UNIQUE (claim_id, evidence_object_id, evidence_role)
);
```

## claim_subjects

```sql
CREATE TABLE claim_subjects (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL,
  subject_object_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'subject',

  FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_object_id) REFERENCES archive_objects(id) ON DELETE CASCADE,

  UNIQUE (claim_id, subject_object_id, role)
);
```

## Design Notes

Claims separate evidence from conclusions.

`claim_evidence`, or a future `citations` table, is the canonical path between artifacts and claims.

Do not duplicate artifact-to-claim support with generic `supports_claim` relationships.

Example claim:

```text
John Smith served in World War II.
```

Supporting evidence:

* Draft letter
* Discharge record
* Photograph in uniform
* Family oral history

Each evidence item may have its own weight.

The claim has its own confidence.

This supports future AI-assisted reasoning.

---

# Provenance

## provenance_records

```sql
CREATE TABLE provenance_records (
  id TEXT PRIMARY KEY,
  object_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  actor_user_id TEXT,
  actor_person_id TEXT,
  action_date TEXT NOT NULL,
  original_date_text TEXT,
  source_note TEXT,
  confidence_level_id TEXT,
  notes TEXT,

  FOREIGN KEY (object_id) REFERENCES archive_objects(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_person_id) REFERENCES people(id),
  FOREIGN KEY (confidence_level_id) REFERENCES confidence_levels(id)
);
```

## Suggested Action Types

```text
created
uploaded
scanned
transcribed
donated
identified
corrected
imported
verified
disputed
ai_suggested
user_confirmed
```

## Design Notes

Provenance applies to any archive object.

Examples:

* Who scanned a photo
* Who donated a box of records
* Who identified a person in a photograph
* Who transcribed a letter
* Who verified a claim
* Where the original object is stored

Provenance is part of the archive.

---

# Tags

## tags

```sql
CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT,
  created_at TEXT NOT NULL
);
```

## object_tags

```sql
CREATE TABLE object_tags (
  id TEXT PRIMARY KEY,
  object_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,

  FOREIGN KEY (object_id) REFERENCES archive_objects(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,

  UNIQUE (object_id, tag_id)
);
```

## Design Notes

Tags are lightweight discovery aids.

They are not the same as collections.

Tags organize.

Collections tell stories.

---

# Search

SQLite FTS should be used for archive-wide search.

## archive_search

```sql
CREATE VIRTUAL TABLE archive_search USING fts5(
  object_id UNINDEXED,
  object_type UNINDEXED,
  title,
  summary,
  body,
  tags,
  names,
  tokenize = 'porter'
);
```

## Design Notes

The search table should be updated when relevant objects change.

Search should support:

* People
* Artifact titles
* Artifact descriptions
* Transcriptions
* Story text
* Place names
* Tags
* Claims

This is essential for the archive experience.

---

# System Tables

The existing app already has users, roles, settings, and audit logging concepts.

These can either be retained or adapted.

## users

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'viewer',
  status TEXT NOT NULL DEFAULT 'active',
  home_person_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (home_person_id) REFERENCES people(id),

  CHECK (role IN ('admin', 'editor', 'limited_editor', 'viewer')),
  CHECK (status IN ('active', 'invited', 'disabled'))
);
```

## app_settings

```sql
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  is_encrypted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
```

## audit_log

```sql
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  object_id TEXT,
  object_type TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL,

  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (object_id) REFERENCES archive_objects(id)
);
```

---

# Indexes

Recommended initial indexes:

```sql
CREATE INDEX idx_archive_objects_type ON archive_objects(object_type);
CREATE INDEX idx_archive_objects_updated ON archive_objects(updated_at);
CREATE INDEX idx_archive_objects_privacy ON archive_objects(privacy_level);

CREATE INDEX idx_person_names_person ON person_names(person_id);
CREATE INDEX idx_person_names_sort ON person_names(sort_name);

CREATE INDEX idx_artifacts_type ON artifacts(artifact_type_id);
CREATE INDEX idx_artifacts_evidence ON artifacts(evidence_classification_id);
CREATE INDEX idx_artifact_files_artifact ON artifact_files(artifact_id);

CREATE INDEX idx_events_type ON events(event_type_id);
CREATE INDEX idx_events_date_start ON events(date_start);
CREATE INDEX idx_events_place ON events(primary_place_id);

CREATE INDEX idx_places_name ON places(name);
CREATE INDEX idx_places_parent ON places(parent_place_id);

CREATE INDEX idx_relationships_type ON relationships(relationship_type_id);
CREATE INDEX idx_relationships_confidence ON relationships(confidence_level_id);
CREATE INDEX idx_relationship_type_roles_type ON relationship_type_roles(relationship_type_id);
CREATE INDEX idx_relationship_members_relationship ON relationship_members(relationship_id);
CREATE INDEX idx_relationship_members_object ON relationship_members(object_id);
CREATE INDEX idx_relationship_members_role ON relationship_members(role);

CREATE INDEX idx_claims_subject ON claims(subject_object_id);
CREATE INDEX idx_claims_confidence ON claims(confidence_level_id);
CREATE INDEX idx_claim_evidence_claim ON claim_evidence(claim_id);
CREATE INDEX idx_claim_evidence_object ON claim_evidence(evidence_object_id);

CREATE INDEX idx_collection_items_collection ON collection_items(collection_id);
CREATE INDEX idx_collection_items_object ON collection_items(item_object_id);

CREATE INDEX idx_provenance_object ON provenance_records(object_id);
CREATE INDEX idx_object_tags_object ON object_tags(object_id);
CREATE INDEX idx_object_tags_tag ON object_tags(tag_id);
```

---

# Seed Data

The first migration should seed system values.

## Artifact Types

```text
Photo
Letter
Document
Recipe
Audio Recording
Video
Physical Object
Map
Book
Newspaper
Scrapbook Page
Certificate
```

## Evidence Classifications

```text
Official Record
Primary Source
Secondary Source
Supporting Evidence
Personal Artifact
Family Memory
Reproduction / Copy
Unknown
```

## Confidence Levels

```text
Unknown
Possible
Probable
Confirmed
Disputed
Rejected
```

## Event Types

```text
Birth
Death
Marriage
Divorce
Residence
Military Service
Graduation
School Year
Immigration
Census
Holiday Gathering
Family Reunion
Move
Burial
Baptism
Employment
Retirement
Custom Event
```

## Relationship Types

```text
biological_parent_of
adoptive_parent_of
foster_parent_of
step_parent_of
guardian_of
sibling_of
family_union
child_in_union
appears_in
created_by
owned_by
donated_by
scanned_by
identified_by
occurred_at
depicts_event
documents
belongs_to_collection
describes
associated_with
lived_at
attended_school
served_in
```

---

# Tree Generation

The family tree should be generated from selected relationship types.

Tree-relevant relationship types include:

```text
family_union
```

`family_union` is the canonical stored tree shape. Partner and child membership within the union generates derived parent-child, spouse, partner, sibling, and tree edge views.

This allows Apex to preserve genealogy while avoiding the mistake of making the tree the entire data model or storing competing tree structures.

---

# Example: WWII Draft Letter

## Artifact

```text
archive_objects:
  object_type: artifact
  title: Grandpa's WWII Draft Letter

artifacts:
  type: Letter
  evidence_classification: Official Record
```

## Claim

```text
archive_objects:
  object_type: claim
  title: John Smith served in World War II

claims:
  statement: John Smith served in World War II.
  confidence: Probable or Confirmed
```

## Claim Evidence

```text
claim_evidence:
  artifact: Grandpa's WWII Draft Letter
  claim: John Smith served in World War II
  evidence_role: supports
  locator: Draft notice text
  notes: Supports military draft status; service conclusion depends on additional evidence.
```

## Provenance

```text
provenance:
  action: scanned
  actor: Walter
  note: Original held by Aunt Susan
```

---

# Example: Christmas Photo 1989

## Artifact

```text
archive_objects:
  object_type: artifact
  title: Christmas Morning 1989

artifacts:
  type: Photo
  evidence_classification: Personal Artifact
```

## Event

```text
archive_objects:
  object_type: event
  title: Christmas Morning 1989

events:
  type: Holiday Gathering
  date_text: 25 DEC 1989
```

## Relationships

```text
relationship type: depicts_event
members:
  artifact: Christmas Morning 1989, role: artifact
  event: Christmas Morning 1989, role: event

relationship type: appears_in
members:
  person: Walter, role: subject
  artifact: Christmas Morning 1989, role: artifact

relationship type: occurred_at
members:
  event: Christmas Morning 1989, role: event
  place: Family Home, role: place
```

---

# Design Risks

## Risk: Over-generalization

A flexible graph model can become too abstract.

Mitigation:

Use strong system types and good UI defaults.

Users should not feel like they are editing graph nodes.

They should feel like they are adding people, photos, stories, and artifacts.

---

## Risk: Weak Foreign Key Enforcement

Generic object references can weaken type-specific constraints.

Mitigation:

Use `archive_objects` as the shared FK target.

Use application-level validation to ensure relationship roles match expected object types.

---

## Risk: Complex Queries

Relationship-member queries can be more complex than direct join tables.

Mitigation:

Create helper views for common queries such as:

* person artifacts
* person events
* tree relationships
* artifact claims
* collection contents

---

# Recommended Views

To make development easier, create database views for common access patterns.

## person_artifacts_view

Shows artifacts connected to people.

## person_events_view

Shows events connected to people.

## tree_edges_view

Shows parent-child and spouse relationships used by the tree.

## artifact_claims_view

Shows claims supported or contradicted by an artifact through `claim_evidence` or future citations.

## collection_contents_view

Shows all objects in a collection.

Views allow the database to remain flexible while giving the application simple query surfaces.

---

# Implementation Order

Recommended migration sequence:

1. System tables
2. `archive_objects`
3. Lookup tables
4. Core domain tables
5. Relationship tables and `relationship_type_roles`
6. Claims and evidence tables
7. Provenance tables
8. Tags and collections
9. Search table
10. Views
11. Seed data

---

# Summary

The Apex Family Legacy database should be built around a shared archive object layer and a first-class relationship model.

The key architectural ideas are:

* Every major item is an archive object.
* Artifacts are first-class preserved objects.
* Relationships connect everything.
* Claims separate evidence from conclusions.
* Evidence informs confidence.
* Confidence belongs to claims and relationships.
* Provenance preserves trust.
* The tree is generated from selected relationship types.
* The archive is a graph of family knowledge.

This schema provides a foundation for genealogy, artifact preservation, storytelling, search, collections, evidence review, and future AI-assisted exploration.
