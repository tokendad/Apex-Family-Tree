# Apex Family Legacy
# UX Concept — Person Archive Profile

## Purpose

This document describes a future UX concept for the Apex Family Legacy person profile page.

The goal is not to define final visual design.

The goal is to describe how a person page should feel once Apex evolves from a tree-centered genealogy app into a connected digital family archive.

The person profile should answer:

> Who was this person, and what in the archive is connected to them?

---

# Core UX Shift

The current product experience is centered on the family tree.

Apex Family Legacy should expand that experience.

The tree remains important, but a person is no longer only a node in a diagram.

A person becomes an archive profile connected to:

- Relationships
- Artifacts
- Events
- Places
- Stories
- Collections
- Claims
- Evidence
- Provenance

The page should help users understand the person's life through connected family knowledge.

---

# Guiding Principle

## The person page is not a form.

It is an archive profile.

Users should not feel like they are looking at a database record.

They should feel like they are exploring a life.

---

# Page Goals

The person profile should help users:

- Understand the person's basic identity.
- See immediate family relationships.
- Discover connected artifacts.
- Read stories connected to the person.
- View major life events.
- Understand places connected to the person.
- Review historical claims and supporting evidence.
- Continue exploring through connected archive objects.

---

# Conceptual Layout

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Apex Family Legacy                                  Search the Archive [  ] │
│ A Digital Family Archive                               + Add    User Menu    │
├──────────────────────────────────────────────────────────────────────────────┤
│ Tree │ People │ Artifacts │ Collections │ Stories │ Places │ Timeline │ More│
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────┐   ┌──────────────────────────────────────────────┐ │
│  │                      │   │ John LeFort                                 │ │
│  │   Profile Photo      │   │ Born: 1931                                  │ │
│  │                      │   │ Died: 2008                                  │ │
│  └──────────────────────┘   │ Married twice • 5 children • WWII Veteran   │ │
│                             │ 14 artifacts • 3 stories • 12 events        │ │
│                             └──────────────────────────────────────────────┘ │
│                                                                              │
│  ┌───────────────────────────────┐  ┌─────────────────────────────────────┐ │
│  │ Quick Actions                 │  │ Connected To                        │ │
│  │ + Add Artifact                │  │ Spouses                             │ │
│  │ + Add Story                   │  │ - Mary Smith                        │ │
│  │ + Add Event                   │  │ - Susan Brown                       │ │
│  │ + Add Relationship            │  │                                     │ │
│  │ + Add Claim                   │  │ Children                            │ │
│  │ Set as Home Person            │  │ - Robert LeFort                     │ │
│  │ Edit Person                   │  │ - Linda LeFort                      │ │
│  └───────────────────────────────┘  │ - Michael LeFort                    │ │
│                                      │                                     │ │
│                                      │ Collections                         │ │
│                                      │ - Grandpa's Military Service        │ │
│                                      │ - Christmas Through the Years       │ │
│                                      └─────────────────────────────────────┘ │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │ Tabs: Overview | Timeline | Artifacts | Stories | Events | Claims       ││
│  ├──────────────────────────────────────────────────────────────────────────┤│
│  │ Overview                                                                 ││
│  │                                                                          ││
│  │ Recent Artifacts                                                         ││
│  │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                       ││
│  │ │ WWII Draft   │ │ Family Photo │ │ School Award │   [View All]         ││
│  │ │ Letter       │ │ 1989         │ │ Certificate  │                       ││
│  │ └──────────────┘ └──────────────┘ └──────────────┘                       ││
│  │                                                                          ││
│  │ Recent Stories                                                           ││
│  │ - The Story of Grandpa's Service                                         ││
│  │ - Christmas at the Old House                                             ││
│  │                                                                          ││
│  │ Key Events                                                               ││
│  │ - 1931: Birth                                                            ││
│  │ - 1942: Drafted into WWII                                                ││
│  │ - 1954: Married Mary Smith                                               ││
│  │ - 1989: First Christmas in the new house                                 ││
│  │                                                                          ││
│  │ Claims / Evidence                                                        ││
│  │ - Served in World War II                 Confidence: High                ││
│  │   Supported by: Draft Letter, Discharge Record, Uniform Photo           ││
│  └──────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

# Primary Areas

## 1. Global Archive Navigation

The top navigation should represent the archive, not only the tree.

Possible navigation items:

```text
Tree
People
Artifacts
Collections
Stories
Places
Timeline
Search
```

The tree can remain the default home view early in development.

Over time, the navigation should make it clear that Apex contains more than lineage.

---

## 2. Person Identity Header

The header should provide a quick human summary.

Possible fields:

- Preferred display name
- Lifespan
- Primary photo
- Short summary
- Key relationship counts
- Artifact/story/event counts
- Privacy indicator

Example:

```text
John LeFort
1931–2008
Married twice • 5 children • WWII Veteran
14 artifacts • 3 stories • 12 events
```

The header should be readable and warm.

It should not look like a database table.

---

## 3. Quick Actions

The page should make it easy to continue building the archive.

Possible actions:

- Add Artifact
- Add Story
- Add Event
- Add Relationship
- Add Claim
- Edit Person
- Set as Home Person

These actions can use modals or drawers.

However, the page itself should remain the place where the user understands the person.

---

## 4. Connected To Panel

This is the most important UX pattern.

Every major archive object should have a `Connected To` area.

For a person, this panel may include:

- Parents
- Spouses / partners
- Children
- Siblings
- Places
- Collections
- Artifacts
- Stories
- Claims

The goal is to make exploration natural.

A user should always have another meaningful connection to follow.

---

## 5. Tabs

Tabs prevent the profile from becoming one long, overwhelming page.

Recommended initial tabs:

```text
Overview
Timeline
Artifacts
Stories
Events
Claims
```

Possible later tabs:

```text
Places
Relationships
Provenance
Research Notes
```

---

# Overview Tab

The Overview tab should summarize the person's archive presence.

Sections may include:

- Recent or featured artifacts
- Important stories
- Key events
- Significant places
- Claims and evidence summary
- Collections containing this person

This tab should feel curated, not exhaustive.

---

# Timeline Tab

The Timeline tab should assemble the person's life chronologically.

Items may include:

- Birth
- Residence
- Education
- Military service
- Marriage
- Children
- Employment
- Holidays
- Family reunions
- Death
- Burial

Timeline items should be able to link to:

- Artifacts
- Places
- Stories
- Claims
- Relationships

Example:

```text
1942 — Drafted for military service
Linked artifact: WWII Draft Letter
Evidence: Official Record
Confidence: High
```

---

# Artifacts Tab

The Artifacts tab should show all artifacts connected to the person.

Possible grouping options:

- Photos
- Documents
- Letters
- Audio / Video
- Recipes
- Physical objects
- Military records
- School records

Each card should show:

- Artifact title
- Type
- Date or approximate date
- Thumbnail if available
- Relationship to person

Examples:

```text
Appears in
Created by
Owned by
Mentioned in
Subject of
Evidence for claim
```

---

# Stories Tab

The Stories tab should preserve family memory.

Stories connected to a person may be:

- Firsthand memories
- Oral histories
- Explanations of artifacts
- Biographical sketches
- Family legends
- Research notes

A story should be able to connect to more than one person.

The UX should make that visible.

---

# Events Tab

The Events tab should show structured life events.

Events may be formal genealogy events or informal family-history moments.

Examples:

- Birth
- Death
- Marriage
- Graduation
- Military service
- Census appearance
- Christmas gathering
- Family reunion
- Move to a new home

Events should be reusable archive objects, not just fields owned by a person.

---

# Claims Tab

The Claims tab should show historical statements connected to the person.

Examples:

```text
John LeFort served in World War II.
John LeFort lived at 12 Maple Street in 1954.
John LeFort appeared in the 1940 census.
```

Each claim should show:

- Statement
- Confidence level
- Evidence summary
- Supporting artifacts
- Contradicting evidence if any
- Last reviewed date if available

Important UX rule:

```text
Evidence informs confidence.
Confidence belongs to the claim.
```

---

# Empty States

A person profile should guide users when information is missing.

Examples:

```text
No artifacts connected yet.
Add a photo, letter, document, or keepsake connected to John.
```

```text
No stories yet.
Preserve a memory, family story, or explanation about John.
```

```text
No claims recorded yet.
Add a claim when you want to track evidence and confidence.
```

Empty states should invite contribution without making the user feel like the archive is broken.

---

# First MVP Version

The first implementation does not need every tab.

Recommended first version:

```text
Person header
Connected Artifacts section
Connected Relationships section
Quick action: Add Artifact
Quick action: Connect Artifact
```

This proves the archive UX without redesigning the whole app.

---

# First UX Loop

The first meaningful user loop should be:

```text
Open person profile
Add artifact
Connect artifact to person
Open artifact profile
See connected person
Return to person profile
```

This loop proves the central Apex Family Legacy idea:

> Objects gain meaning through relationships.

---

# Implementation Notes

Do not rewrite the current tree page first.

Do not redesign the entire app shell first.

Do not force all person data into the new layout immediately.

Instead:

1. Keep the existing person detail page working.
2. Add a connected artifacts section.
3. Add an archive-aware artifact detail page.
4. Add relationship creation between person and artifact.
5. Expand the person profile once the relationship engine is stable.

---

# Design Tone

The page should feel:

- Warm
- Archival
- Clear
- Exploratory
- Trustworthy
- Family-centered

It should not feel:

- Clinical
- Spreadsheet-like
- Overly technical
- Tree-only
- AI-first

The product should feel like a family archive that happens to have excellent structure underneath.

---

# Summary

The future person profile should become an archive profile.

It should preserve identity, relationships, artifacts, stories, events, places, claims, and evidence in one understandable experience.

The person is not merely a tree node.

The person is a doorway into the family's legacy.
