# Apex Family Legacy

# Data Model 2.0

## Purpose

This document defines the conceptual data model for Apex Family Legacy.

Apex Family Legacy is not simply a genealogy database. It is a digital family archive built around people, relationships, artifacts, events, places, stories, collections, evidence, and provenance.

The goal of this model is to preserve not only lineage, but legacy.

---

# Core Design Idea

Apex should model a connected archive.

Objects gain meaning through relationships.

The database should support discovery, storytelling, evidence, and future intelligent exploration.

The model should not be optimized only for today's tree view. It should support many possible views of the archive, including:

* Family tree
* Timeline
* Artifact gallery
* Place map
* Story view
* Collections
* Evidence review
* Search and discovery
* Future AI-assisted exploration

---

# Primary Objects

The core archive objects are:

1. Person
2. Artifact
3. Event
4. Place
5. Story
6. Collection
7. Relationship
8. Claim
9. Provenance Record

These objects should exist independently and connect through relationships.

---

# Person

A person represents an individual.

A person should store identity-level information only.

Examples:

* Preferred display name
* Names
* Sex / gender
* Birth/death status
* Privacy status
* Profile image
* Notes

A person's life should be assembled from linked relationships, events, artifacts, stories, places, and claims.

A person should not directly own the archive.

---

# Artifact

An artifact is any item preserved by the family archive.

Examples:

* Photograph
* Letter
* Recipe
* Report card
* Military document
* Certificate
* Newspaper clipping
* Audio recording
* Video
* Scrapbook page
* Physical object

Every scanned item, uploaded file, or catalogued keepsake should enter the archive as an artifact.

Some artifacts may support historical claims.

Not all artifacts are sources.

---

# Artifact Type

Each artifact should have one primary type.

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

The system should provide stable built-in artifact types.

Users should also be able to create custom types as their family archive grows.

Examples:

* School Report Card
* Church Bulletin
* Draft Letter
* Family Reunion Program
* Quilt Pattern
* Farm Ledger

Type describes what the artifact is.

It does not describe whether the artifact is authoritative.

---

# Evidence Classification

Evidence classification describes the historical authority of an artifact.

It is separate from artifact type.

Examples:

* Official Record
* Primary Source
* Secondary Source
* Supporting Evidence
* Personal Artifact
* Family Memory
* Reproduction / Copy
* Unknown

A draft letter may have:

* Type: Letter
* Custom Type: Draft Letter
* Evidence Classification: Official Record / Primary Source

A Christmas photo may have:

* Type: Photo
* Evidence Classification: Personal Artifact

Evidence classification helps users and future intelligent systems reason about trust.

---

# Claim

A claim is a statement about family history.

Examples:

* John Smith served in World War II.
* Mary attended Lincoln Elementary School in 1954.
* This photograph was taken at 12 Maple Street.
* Sarah is the biological daughter of James and Anna.
* This recipe was written by Grandma Ruth.

Claims may be supported by artifacts, stories, relationships, or other records.

Claims should support:

* Statement
* Subject
* Date or date range
* Confidence level
* Supporting evidence
* Contradicting evidence
* Notes

Evidence informs confidence.

Confidence belongs to claims.

---

# Relationship

A relationship connects one object to another.

Relationships are first-class objects.

They may connect:

* Person to person
* Person to artifact
* Person to event
* Artifact to event
* Artifact to place
* Artifact to story
* Event to place
* Story to collection
* Claim to artifact

Relationships should support:

* Relationship type
* Directionality
* Date or date range
* Confidence level
* Notes
* Provenance
* Supporting artifacts or claims

The relationship model is the grammar of the archive.

Objects are the nouns.

Relationships are the verbs.

---

# Event

An event represents something that happened.

Examples:

* Birth
* Death
* Marriage
* Divorce
* Graduation
* Military service
* Immigration
* Census appearance
* Christmas gathering
* Family reunion
* School year
* Move to a new home

Events may connect to:

* People
* Places
* Artifacts
* Stories
* Claims
* Collections

Events should support formal genealogy events and informal family-history moments.

---

# Place

A place represents a meaningful location.

Examples:

* Home
* School
* Church
* Cemetery
* City
* Farm
* Military base
* Hospital
* Vacation destination

Places should be reusable and connectable.

A place may appear in many events, artifacts, stories, claims, and collections.

---

# Story

A story is a narrative memory or explanation.

Stories may be attached to:

* People
* Relationships
* Events
* Places
* Artifacts
* Collections
* Claims

Stories preserve meaning that structured fields cannot capture.

---

# Collection

A collection is a curated group of archive objects.

Examples:

* Christmas Through the Years
* Mom's School Records
* Grandpa's Military Service
* Family Recipes
* Vermont Ancestors
* LeFort Farm

Collections are not just folders.

They are storytelling containers.

Collections may include:

* People
* Artifacts
* Events
* Places
* Stories
* Claims
* Other collections

---

# Provenance Record

Provenance explains where information came from and how it entered the archive.

Examples:

* Original owner
* Current holder
* Donor
* Scanner
* Date scanned
* Date added
* Person who identified people in a photo
* Confidence notes
* Location of original item
* Chain of custody

Provenance may apply to artifacts, relationships, stories, claims, and identifications.

Provenance protects trust.

---

# Suggested Logical Tables

This section describes conceptual tables, not final implementation details.

## Identity

* people
* person_names

## Artifacts

* artifacts
* artifact_types
* artifact_files
* evidence_classifications

## Events

* events
* event_types

## Places

* places
* place_aliases

## Stories

* stories

## Collections

* collections
* collection_items

## Relationships

* relationships
* relationship_types

## Claims and Evidence

* claims
* claim_evidence
* claim_conflicts

## Provenance

* provenance_records

## Tags and Classification

* tags
* object_tags

## System

* users
* permissions
* audit_log
* app_settings

---

# Generic Object Identity

Because many object types need to connect to many other object types, the system should support a generic object identity pattern.

Each major object should have:

* Object type
* Object id

Examples:

* person:123
* artifact:456
* event:789
* place:321
* story:654
* collection:987
* claim:555

This allows relationships, tags, collections, provenance, and comments to reference any archive object consistently.

---

# Relationship Pattern

The conceptual relationship pattern should be:

* source_object_type
* source_object_id
* relationship_type
* target_object_type
* target_object_id
* directionality
* confidence
* date_range
* notes
* provenance_id

Example:

Grandpa appears in a photograph.

* source: person:john-smith
* relationship: appears_in
* target: artifact:christmas-1989-photo

Example:

Draft letter supports military service claim.

* source: artifact:draft-letter-1942
* relationship: supports_claim
* target: claim:john-served-in-wwii

---

# Claim Pattern

Claims should separate evidence from conclusions.

Example:

Claim:

> John Smith served in World War II.

Supporting evidence:

* WWII draft letter
* Military discharge record
* Photograph in uniform
* Oral history interview

Each evidence link may have its own weight, notes, and confidence.

The claim itself should have an overall confidence level.

This design supports future AI-assisted reasoning because the system can distinguish evidence quality from conclusion confidence.

---

# Artifact Pattern

Artifacts should be catalogued as preserved objects.

An artifact should include:

* Title
* Description
* Primary type
* Optional custom type
* Evidence classification
* Original date or date range
* Created by
* Physical location
* Digital file links
* Privacy level
* Notes

Artifacts gain meaning through relationships.

They should not be forced into rigid source/document/photo categories.

---

# MVP Recommendation

The first implementation pass should support:

1. People
2. Artifacts
3. Artifact types
4. Relationships
5. Events
6. Places
7. Stories
8. Collections
9. Claims
10. Provenance

The UI can start simple, but the model should preserve the archive-first architecture.

---

# Design Warnings

Avoid these mistakes:

* Do not make artifacts mere attachments.
* Do not make sources separate from artifacts too early.
* Do not hard-code every artifact type.
* Do not model everything as owned by a person.
* Do not make the tree the only organizing structure.
* Do not force certainty where family history is uncertain.
* Do not optimize only for GEDCOM.

---

# Summary

The 2.0 data model should treat Apex Family Legacy as a connected digital family archive.

People, artifacts, events, places, stories, collections, claims, and relationships should exist independently and connect richly.

The tree remains important, but it becomes one view into the archive.

The archive itself is a network of family knowledge.

Apex should preserve not only who people were related to, but what they left behind, where they lived, what they experienced, what evidence remains, and why their lives mattered.
