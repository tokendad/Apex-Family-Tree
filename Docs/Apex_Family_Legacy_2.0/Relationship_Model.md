# Apex Family Legacy

# Relationship Model

## Purpose

Relationships are the foundation of Apex Family Legacy.

Apex is not only a collection of people, artifacts, places, events, and stories. It is a connected archive where meaning emerges from the relationships between those objects.

The relationship model defines how the archive connects.

---

# Core Principle

**Connections create meaning. Identity remains constant.**

A person remains a person.

An artifact remains an artifact.

A place remains a place.

What changes over time is how richly each object is connected to the rest of the archive.

A single photograph is just an image.

That same photograph connected to people, places, events, collections, and stories becomes family history.

---

# Relationships Are First-Class Objects

Relationships should not be treated as hidden database joins.

They should be meaningful objects that can carry their own context.

A relationship may have:

* Type
* Date or date range
* Place
* Notes
* Confidence level
* Provenance
* Related artifacts
* Related stories

This allows the archive to preserve not only that two things are connected, but also why and how they are connected.

---

# Relationship Type Contracts

Relationship roles must be validated by an explicit type-role contract.

The implementation should use `relationship_type_roles` to define which member roles are allowed for each relationship type and which archive object type may fill each role.

Examples:

```text
family_union:
  partner -> person
  child -> person

appears_in:
  subject -> person
  artifact -> artifact

occurred_at:
  event -> event
  place -> place
```

This prevents invalid relationships such as a place as spouse, a claim as child, or an artifact as biological parent.

`relationship_members.role` may be stored as text, but it must not be treated as uncontrolled free text by APIs or services.

---

# Relationship Scope

Relationships can connect many kinds of objects.

Examples:

* Person ↔ Person
* Person ↔ Artifact
* Person ↔ Event
* Person ↔ Place
* Person ↔ Story
* Artifact ↔ Event
* Artifact ↔ Place
* Artifact ↔ Story
* Artifact ↔ Collection
* Event ↔ Place
* Story ↔ Collection
* Collection ↔ Person

The system should avoid assuming that only people can have meaningful relationships.

---

# Person-to-Person Relationships

Person-to-person relationships include traditional genealogy relationships and broader family/social relationships.

Examples:

* Parent
* Child
* Spouse
* Partner
* Sibling
* Adoptive parent
* Foster parent
* Guardian
* Step-parent
* Grandparent
* Household member
* Friend
* Neighbor
* Witness
* Informant

Some of these relationships affect the family tree.

Others enrich the family archive.

Both matter.

---

# Relationship Context

A relationship should answer:

* What is connected?
* How are they connected?
* When did the connection exist?
* Where did it happen?
* How do we know?
* Why does it matter?

For example:

**Grandpa ↔ WWII Draft Letter**

Relationship type:

* Subject of artifact

Context:

* The letter documents Grandpa's draft status.
* It supports the claim that he was called for military service.
* It is part of the WWII collection.

---

# Genealogical Relationships

Traditional genealogy relationships should still be supported.

Examples:

* Biological parent-child
* Adoptive parent-child
* Foster parent-child
* Step-parent relationship
* Family union
* Common-law partnership
* Unknown parent
* Half sibling

However, these should be understood as specialized relationship types within the larger archive model.

The family tree becomes one view generated from selected relationship types.

---

# Archive Relationships

Archive relationships preserve broader family knowledge.

Examples:

* Person appears in artifact
* Person created artifact
* Person owned artifact
* Person donated artifact
* Person identified people in artifact
* Artifact depicts event
* Artifact documents claim
* Artifact belongs to collection
* Story describes relationship
* Event occurred at place
* Place associated with family branch

These relationships may not affect the tree, but they are essential to preserving legacy.

---

# Relationship Types

Relationship types should be extensible.

The application should provide built-in system relationship types for common use cases, but families should be able to add their own.

Examples of system types:

* parent_of
* child_of
* family_union
* appeared_in
* created_by
* owned_by
* donated_by
* occurred_at
* documents
* belongs_to_collection
* describes
* associated_with

User-defined types may include:

* godparent_of
* neighbor_of
* classmate_of
* served_with
* lived_with
* taught_by
* inherited_from

This keeps the archive flexible without requiring new code for every family-specific relationship.

---

# Directionality

Some relationships are directional.

Example:

* Parent → Child
* Donor → Artifact
* Artifact → Claim
* Event → Place

Other relationships are symmetrical.

Example:

* Spouse ↔ Spouse
* Sibling ↔ Sibling
* Related artifact ↔ Related artifact

The relationship model should support both directional and non-directional relationships.

---

# Confidence and Uncertainty

Family archives often contain uncertainty.

The relationship model should support confidence.

Examples:

* Confirmed
* Probable
* Possible
* Disputed
* Unknown

This is especially important for:

* Unknown people in photographs
* Unverified family stories
* Conflicting records
* Estimated dates
* Informal relationships

The archive should preserve uncertainty honestly rather than forcing false certainty.

---

# Provenance

Relationships need provenance.

It is not enough to say:

> This person appears in this photograph.

The archive should also preserve:

* Who identified the person
* When they identified them
* How confident they were
* Whether others agreed
* Whether the identification is disputed

This makes the archive more trustworthy over time.

---

# Claims

Claims and evidence use a specialized evidence path rather than generic relationships.

Example claim:

> John Smith served in World War II.

Supporting evidence links:

* John Smith ↔ WWII Draft Letter
* John Smith ↔ Military Discharge Record
* John Smith ↔ Photograph in Uniform
* John Smith ↔ Oral History Interview

Each supporting artifact may carry a different evidence level.

The claim becomes stronger as more evidence is connected.

The canonical implementation path is:

```text
Artifact -> claim_evidence/citation -> Claim
```

Do not duplicate artifact-to-claim evidence as generic `supports_claim` relationships.

---

# Collections as Relationship Containers

Collections are curated groups of connected objects.

A collection is less about storage and more about meaning.

Examples:

* Christmas Through the Years
* Grandpa's Military Service
* Mom's School Records
* Family Recipes
* Vermont Ancestors

A collection may contain people, artifacts, events, stories, places, and other collections.

---

# The Tree as a Relationship View

The family tree should not be treated as the entire archive.

It is one view generated from specific relationship types.

The canonical stored relationship shape for tree generation is:

```text
relationship_type: family_union

members:
  partner -> person
  partner -> person
  child -> person
  child -> person
```

Parent-child, spouse, partner, sibling, and tree edge records may be derived from `family_union` for display or compatibility views.

They should not be stored as competing canonical tree structures.

Other relationships remain discoverable elsewhere in the archive.

This allows Apex to remain a genealogy tool while expanding into a broader family archive.

---

# Design Implication

The UI should avoid asking users only:

> Who is this person related to?

It should also ask:

> What is this connected to?

This broader question supports the digital archive vision.

Everything in Apex should be connectable.

---

# Summary

The relationship model is the grammar of Apex Family Legacy.

Objects are the nouns.

Relationships are the verbs.

Stories emerge from how they connect.

By treating relationships as first-class, contextual, and extensible, Apex can preserve not only family lineage, but the richer web of people, places, events, artifacts, and memories that define family legacy.
