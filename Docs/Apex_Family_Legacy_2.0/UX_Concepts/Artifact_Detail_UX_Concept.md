# Apex Family Legacy
# UX Concept — Artifact Detail Page

## Purpose

This document describes a future UX concept for the Apex Family Legacy artifact detail page.

The artifact detail page is one of the most important new experiences in Apex Family Legacy.

Apex is not only preserving people.

It is preserving the things families leave behind:

- Photographs
- Letters
- Recipes
- Certificates
- Report cards
- Military records
- Audio recordings
- Videos
- Newspaper clippings
- Scrapbook pages
- Physical objects

The artifact page should answer:

> What is this, why does it matter, and what is it connected to?

---

# Core UX Shift

In the current app, media is primarily file-centered.

In Apex Family Legacy, an artifact should be archive-centered.

A file is only one digital representation of an artifact.

The artifact itself is the preserved family object.

Example:

```text
Artifact: Grandpa's WWII Draft Letter
Files:
- Original scan
- Cropped image
- Transcription
- Thumbnail
```

The UX should make this distinction clear without exposing database complexity.

---

# Guiding Principle

## An artifact is not an attachment.

It is a preserved object with its own identity, relationships, evidence value, provenance, and story.

---

# Page Goals

The artifact detail page should help users:

- Understand what the artifact is.
- View the artifact or its file representation.
- See who and what it is connected to.
- Understand whether it supports any claims.
- Record where it came from.
- Connect it to stories, events, places, and collections.
- Preserve evidence and confidence context.
- Continue exploring the archive through connected objects.

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
│  ┌─────────────────────────────────────┐ ┌────────────────────────────────┐ │
│  │                                     │ │ WWII Draft Letter              │ │
│  │                                     │ │ Type: Letter                   │ │
│  │        Artifact Preview             │ │ Custom Type: Draft Letter      │ │
│  │        Image / PDF / Audio          │ │ Date: 1942                     │ │
│  │                                     │ │ Evidence: Official Record      │ │
│  │                                     │ │ Privacy: Family                │ │
│  └─────────────────────────────────────┘ └────────────────────────────────┘ │
│                                                                              │
│  ┌───────────────────────────────┐  ┌─────────────────────────────────────┐ │
│  │ Quick Actions                 │  │ Connected To                        │ │
│  │ + Connect Person              │  │ People                              │ │
│  │ + Connect Event               │  │ - John LeFort                       │ │
│  │ + Connect Place               │  │                                     │ │
│  │ + Add to Collection           │  │ Claims                              │ │
│  │ + Add Story                   │  │ - John served in World War II       │ │
│  │ + Add Claim                   │  │                                     │ │
│  │ Edit Artifact                 │  │ Events                              │ │
│  │ Download File                 │  │ - Military service                  │ │
│  └───────────────────────────────┘  │                                     │ │
│                                      │ Collections                         │ │
│                                      │ - Grandpa's Military Service        │ │
│                                      └─────────────────────────────────────┘ │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │ Tabs: Overview | Transcript | Claims | Provenance | Related Artifacts   ││
│  ├──────────────────────────────────────────────────────────────────────────┤│
│  │ Overview                                                                 ││
│  │                                                                          ││
│  │ Description                                                              ││
│  │ This letter notified John LeFort of his draft status during WWII.        ││
│  │                                                                          ││
│  │ What this artifact may tell us                                           ││
│  │ - John was registered for the draft                                      ││
│  │ - John lived at the listed address in 1942                               ││
│  │ - The family preserved this document after the war                       ││
│  │                                                                          ││
│  │ Claims Supported                                                         ││
│  │ - John served in World War II              Confidence: Probable          ││
│  │ - John lived at 12 Maple Street in 1942    Confidence: High              ││
│  │                                                                          ││
│  │ Provenance Summary                                                       ││
│  │ Original held by Aunt Susan. Scanned by Walter in 2026.                 ││
│  └──────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

# Primary Areas

## 1. Artifact Preview

The artifact preview should be prominent.

Depending on artifact file type, the preview may show:

- Image
- PDF viewer
- Audio player
- Video player
- Document icon
- Object placeholder
- Thumbnail gallery

The preview area should make the artifact feel tangible.

The user should immediately understand that they are looking at a preserved family item, not merely a file row.

---

## 2. Artifact Identity Header

The header should answer:

```text
What is this?
```

Possible fields:

- Title
- Artifact type
- Custom type
- Date or date range
- Evidence classification
- Privacy level
- Short summary

Example:

```text
WWII Draft Letter
Type: Letter
Custom Type: Draft Letter
Date: 1942
Evidence: Official Record
```

Important UX rule:

```text
Type describes what the artifact is.
Evidence classification describes how authoritative it may be.
```

---

## 3. Quick Actions

The artifact page should make connection-building easy.

Possible actions:

- Connect Person
- Connect Event
- Connect Place
- Add to Collection
- Add Story
- Add Claim
- Edit Artifact
- Download File

The most important early actions are:

```text
Connect Person
Add to Collection
Add Claim
```

These prove the archive model.

---

## 4. Connected To Panel

Every artifact should have a `Connected To` panel.

Possible connected objects:

- People appearing in the artifact
- People who created the artifact
- People who owned the artifact
- People who donated the artifact
- Events depicted or documented
- Places shown or mentioned
- Stories explaining the artifact
- Collections containing the artifact
- Claims supported or contradicted by the artifact

The connected panel should make the artifact explorable.

A user should be able to open a letter, click a person, then follow the person to a story, event, or collection.

---

# Tabs

Recommended artifact detail tabs:

```text
Overview
Transcript
Claims
Provenance
Related Artifacts
```

Possible later tabs:

```text
Files
People
Events
Places
Stories
AI Suggestions
Revision History
```

---

# Overview Tab

The Overview tab should summarize the artifact in plain language.

Possible sections:

- Description
- Key connections
- What this artifact may tell us
- Claims supported
- Collections
- Provenance summary

The overview should be understandable to casual family members.

It should not assume genealogy expertise.

---

# Transcript Tab

The Transcript tab is useful for letters, documents, newspaper clippings, certificates, audio, and video.

Transcript content may include:

- Manual transcription
- OCR text
- Audio/video transcript
- Translation
- Notes about illegible sections

Possible transcript states:

```text
No transcript yet.
Add a transcription to make this artifact searchable.
```

Future AI may help create draft transcriptions, but user confirmation should be required before treating them as archival text.

---

# Claims Tab

The Claims tab shows how the artifact functions as evidence.

Important principle:

```text
An artifact is not a source by type.
An artifact becomes evidence when it supports a claim.
```

Example:

```text
Artifact: WWII Draft Letter

Claim: John LeFort lived at 12 Maple Street in 1942.
Evidence role: Supports
Evidence strength: Strong
Claim confidence: High

Claim: John LeFort served in World War II.
Evidence role: Supports
Evidence strength: Moderate
Claim confidence: Probable
```

This distinction matters.

The same artifact may strongly support one claim and only partially support another.

---

# Provenance Tab

The Provenance tab records where the artifact came from and how it entered the archive.

Possible provenance records:

- Original owner
- Current holder
- Donor
- Scanner
- Date scanned
- Physical storage location
- Who identified people in the artifact
- Who transcribed it
- Whether identification is disputed
- Whether AI suggested anything
- Whether a user confirmed the suggestion

Example:

```text
Original held by Aunt Susan.
Scanned by Walter on June 29, 2026.
Stored physically in Box 3, Folder 2.
John LeFort identified by Aunt Susan with high confidence.
```

Provenance should make the archive more trustworthy.

It is part of the artifact's story.

---

# Related Artifacts Tab

Related artifacts help users discover context.

Examples:

- Other letters from the same person
- Photos from the same event
- Documents from the same collection
- Artifacts from the same year
- Items stored in the same physical box
- Artifacts supporting the same claim

This tab is where the archive starts to feel alive.

The user can wander through family history by following meaningful connections.

---

# Artifact Intake Flow

The artifact detail page should be supported by a simple intake flow.

Recommended first version:

```text
1. Add artifact title
2. Choose artifact type
3. Add optional date
4. Add optional description
5. Add optional evidence classification
6. Save
```

Recommended later version:

```text
1. Upload or catalog item
2. What is it?
3. When is it from?
4. Who is connected?
5. Where is it from?
6. Does it support any claims?
7. Add to collection
8. Preserve provenance
```

Important UX rule:

```text
Ask users what they know.
Do not force them to complete what they do not know.
```

---

# Evidence Classification UX

Evidence classification should be optional and human-readable.

Possible classifications:

- Official Record
- Primary Source
- Secondary Source
- Supporting Evidence
- Personal Artifact
- Family Memory
- Reproduction / Copy
- Unknown

Default should probably be:

```text
Unknown
```

or

```text
Personal Artifact
```

depending on artifact type.

Do not force casual users to answer evidence questions during simple photo upload.

---

# Confidence UX

Confidence should appear on claims and relationships, not only on artifacts.

Example:

```text
Claim:
John LeFort served in World War II.

Evidence:
WWII Draft Letter — Official Record
Discharge Record — Official Record
Uniform Photo — Supporting Evidence
Family Story — Family Memory

Claim confidence:
High
```

This structure prepares the archive for future AI-assisted reasoning.

The AI can evaluate evidence and suggest confidence, but the archive should clearly show what is confirmed by users.

---

# Empty States

The artifact page should guide users when information is missing.

Examples:

```text
No people connected yet.
Connect the people who appear in, created, owned, or donated this artifact.
```

```text
No claims connected yet.
Add a claim if this artifact supports or contradicts something in the family history.
```

```text
No provenance recorded yet.
Preserve where this item came from and who added it to the archive.
```

Empty states should invite discovery without making the user feel they made a mistake.

---

# First MVP Version

The first artifact detail page does not need every tab.

Recommended first version:

```text
Artifact header
Artifact preview or placeholder
Basic metadata
Connected people
Connected collections
Quick action: connect person
Quick action: edit artifact
```

Claims, provenance, and transcript can be added later.

---

# First UX Loop

The first meaningful artifact loop should be:

```text
Create artifact
Open artifact detail
Connect person
Open connected person
See artifact listed on person profile
Return to artifact
```

This proves that artifacts are first-class archive objects.

---

# Relationship Examples

An artifact may connect to people in many ways.

Examples:

```text
Person appears in artifact
Person created artifact
Person owned artifact
Person donated artifact
Person identified artifact
Person is mentioned in artifact
Person is subject of artifact
```

An artifact may connect to non-person objects:

```text
Artifact depicts event
Artifact occurred at place
Artifact belongs to collection
Artifact supports claim
Artifact contradicts claim
Artifact is related to artifact
Story describes artifact
```

The UX should not expose all relationship complexity at once.

Start with simple labels.

Examples:

```text
Appears in
Created by
Owned by
Supports claim
Part of collection
```

---

# Implementation Notes

Do not replace the current media page immediately.

Instead:

1. Add artifact tables.
2. Add artifact repository/API.
3. Add artifact list/detail pages.
4. Allow existing media files to become artifact files later.
5. Add person-artifact relationships.
6. Gradually make media an implementation detail beneath artifacts.

The current media system is valuable and should be reused carefully.

---

# Design Tone

The artifact page should feel:

- Tangible
- Archival
- Trustworthy
- Connected
- Easy to contribute to
- Respectful of uncertainty

It should not feel:

- Like a raw file manager
- Like a rigid source database
- Like a genealogy-only citation form
- Like an AI-generated guess board

The artifact should feel like something the family preserved.

---

# Summary

The artifact detail page is one of the core experiences of Apex Family Legacy.

It turns files into family history.

A photograph becomes meaningful when connected to people, places, events, stories, collections, and claims.

A letter becomes powerful when it preserves both memory and evidence.

An artifact is not an attachment.

It is a doorway into the archive.
