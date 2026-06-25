# Future Feature: Data Quality Issues Tracking

**Status:** Deferred — to be designed in a separate session

---

## Problem

The AFT tree can accumulate data-quality inconsistencies that are non-blocking but important to resolve. The most common example: a Marriage event is created linking two people, but one of those people already has an active marriage on record with no Divorce, Death, or Annulment event recorded. The new marriage is allowed (not blocked), but the tree is now in an ambiguous state.

Currently there is no way to:
- Surface these inconsistencies to the user after the fact
- Track which records are affected
- Mark an issue as resolved once corrective action has been taken
- See a summary of all outstanding data-quality problems across the tree

---

## Desired Outcome

A persistent issues panel (accessible from the tree or admin area) that:
- Lists outstanding data-quality warnings tree-wide (e.g. "John Doe has 2 active marriages")
- Links directly to the affected person or family record
- Allows the user to mark an issue resolved (or dismiss it as intentional)
- Generates new issues automatically when problematic data patterns are detected (e.g. on marriage creation, on import)

---

## Known Issue Types to Track (initial list)

- Person has more than one active marriage (no divorce/death/annulment between them)
- Marriage event exists with no corresponding family record (or vice versa)
- Person has a death event but is listed as a spouse in a family with no divorce date
- GEDCOM import conflicts (duplicate persons, unresolved references)

---

## Notes for the Design Session

- Consider whether issues are stored in the database (persistent) or computed on-the-fly (derived)
- Consider a badge count in the navbar or sidebar indicating unresolved issues
- The MarriageEditor warning (2026-06-25 spec) is the first consumer of this concept — the inline warning is a short-term solution; the issues panel is the long-term home
