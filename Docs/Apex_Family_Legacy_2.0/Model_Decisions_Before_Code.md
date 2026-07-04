# Apex Family Legacy

# Model Decisions Before Code

## Purpose

This document records model decisions that must be treated as settled before Phase 1 implementation begins.

It resolves ambiguities across the Apex Family Legacy planning documents so early migrations, repositories, services, and APIs do not introduce competing representations of the same concept.

If another planning document conflicts with this one, this document takes precedence until the conflict is deliberately revisited and documented.

---

# A. Existing Persons and Names Tables Stay

## Decision

Do not create new `people` or `person_names` tables during the first implementation phase.

Use the existing `persons` and `names` tables as the person-domain extension tables.

Add `archive_objects` beside the existing schema.

Backfill one archive object for each existing person:

```text
archive_objects.id = persons.id
archive_objects.object_type = 'person'
```

Treat `persons` as the current physical table for the conceptual Person object.

## Clarification

Conceptual documents may refer to `Person` as a domain object.

Physical implementation should use existing `persons` and `names` until a deliberate future refactor.

Phase 5 means:

```text
Adapt existing persons/names to the archive object model.
```

It does not mean:

```text
Create brand-new people/person_names tables.
```

---

# B. Archive Objects Are Additive

## Decision

`archive_objects` is introduced as a shared identity layer.

Existing tables remain in place during the transition.

Existing data should not be destroyed, renamed, or force-migrated in early migrations.

Early migrations should be additive and backward-compatible.

## Implementation Rule

The first archive foundation migration may create new foundation tables and seed lookup values.

It should not remove or rename existing production tables.

---

# C. Relationship Validation Requires a Type-Role Contract

## Decision

`relationship_members.role` must not be treated as uncontrolled free text in practice.

Relationship member validation requires an explicit type-role contract.

The schema should include a contract table named:

```text
relationship_type_roles
```

Conceptual fields:

```text
id
relationship_type_id
role
allowed_object_type
min_count
max_count
sort_order
is_required
```

## Purpose

`relationship_type_roles` defines which roles are allowed for each relationship type.

It also defines which archive object type may fill each role.

The service layer must validate relationship members against this contract before creating or updating relationships.

## Examples

### family_union

```text
role: partner
allowed_object_type: person
min_count: 1
max_count: 2
is_required: 1

role: child
allowed_object_type: person
min_count: 0
max_count: null
is_required: 0
```

### appears_in

```text
role: subject
allowed_object_type: person

role: artifact
allowed_object_type: artifact
```

### occurred_at

```text
role: event
allowed_object_type: event

role: place
allowed_object_type: place
```

This prevents invalid relationships such as:

* Place as spouse
* Claim as child
* Artifact as biological parent

---

# D. Evidence Path Is Canonical Through Claim Evidence or Citations

## Decision

Claims and evidence should not be modeled both through generic relationships and `claim_evidence`.

The canonical evidence path is:

```text
Artifact -> claim_evidence/citation -> Claim
```

If the project later renames this concept, the canonical path may become:

```text
Artifact -> Citation -> Claim
```

## Clarification

`claim_evidence`, or a future `citations` table, is the canonical path for artifact-to-claim evidence.

Do not use generic `supports_claim` relationships as a second canonical path.

If `supports_claim` appears in older examples, treat it as derived/display-only language or replace it with `claim_evidence`.

Evidence links need specialized fields such as:

* Support level
* Evidence role
* Contradiction flag
* Excerpt
* Page or locator
* Confidence contribution
* Citation notes

These fields do not belong in the generic relationship-member model.

---

# E. Tree Relationships Use Canonical family_union

## Decision

The canonical stored tree-generation relationship is:

```text
relationship_type: family_union
```

Do not store tree family structure in multiple competing canonical ways such as both `spouse_of` and `family_union`.

## Canonical Shape

```text
relationship_type: family_union

members:
  partner -> person
  partner -> person
  child -> person
  child -> person
```

## Migration Mapping

Existing schema migration/backfill should eventually map:

```text
families.id -> family_union relationship
families.spouse1_id -> partner member
families.spouse2_id -> partner member
family_members.person_id -> child member
family_members.role -> child relationship detail or member metadata
```

## Clarification

`spouse_of`, `partner_of`, parent-child edges, and similar pairwise edges may be derived views for UI and tree rendering.

The canonical stored tree shape should be `family_union` plus members.

This avoids ambiguity during migration and tree generation.

---

# F. Naming Policy

## Decision

`Apex Family Tree` is the current repository and application name.

`Apex Family Legacy` is the 2.0 product direction and future user-facing experience.

Code/package names and existing docs may continue to use Apex Family Tree or AFT until a deliberate rename phase.

New 2.0 planning docs should use Apex Family Legacy unless referring to the current app or repository.

---

# G. Filename and Path Consistency

## Decision

2.0 planning docs live under exactly:

```text
Docs/Apex_Family_Legacy_2.0/
```

Use that exact casing in references.

The implementation roadmap filename is:

```text
Docs/Apex_Family_Legacy_2.0/Implementation_Roadmap_2.0.md
```

Linux path references are case-sensitive. Documentation and scripts should use exact filenames and casing.

---

# Summary

Before Phase 1 coding begins, implementation should assume:

* Existing `persons` and `names` stay as physical tables during transition.
* `archive_objects` is additive.
* Relationship creation requires `relationship_type_roles` validation.
* Claim evidence is canonical through `claim_evidence` or future citations.
* Tree family structure is canonically stored as `family_union` plus members.
* Apex Family Legacy is the 2.0 direction; Apex Family Tree remains the current repo/app name.
* Docs use exact `Docs/Apex_Family_Legacy_2.0/` paths and `.md` filenames.
