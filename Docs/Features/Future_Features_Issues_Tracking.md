# Feature: Tree Issues Tracking

**Status:** Implemented v1 — manual scan and persistent issue tracking

---

## Problem

The AFT tree can accumulate data-quality inconsistencies that are non-blocking but important to resolve. The most common example: a Marriage event is created linking two people, but one of those people already has an active marriage on record with no Divorce, Death, or Annulment event recorded. The new marriage is allowed (not blocked), but the tree is now in an ambiguous state.

Currently there is no way to:
- Surface these inconsistencies to the user after the fact
- Track which records are affected
- Mark an issue as resolved once corrective action has been taken
- See a summary of all outstanding data-quality problems across the tree

---

## Implemented v1

Tree Issues now uses a hybrid model:

- Scanner logic detects current data-quality warning patterns.
- Persistent issue rows store status decisions such as `open`, `resolved`, and `dismissed`.
- Stable fingerprints prevent duplicate issue rows across repeated scans.
- Resolved issues reopen if the same problem is detected again.
- Dismissed issues stay dismissed and require a note.

The main UI lives at `/tools/tree-issues`, with a compact unresolved-count entry point on the Tree page toolbar.

Access model:

- All signed-in users can view issue summaries and issue lists.
- Editor/admin users can run scans and change issue status.

---

## Initial Issue Types

- Person has more than one active marriage.
- Person has a death event but is listed as a spouse in an active family.
- Marriage event exists with no corresponding family record.
- Family marriage record exists with no corresponding spouse timeline event.
- Person is missing core data: usable name, birth event, or death event for deceased records.
- Person is unconnected to any family.
- Connected branch is disconnected from the main tree.
- GEDCOM import conflict remains unresolved.

---

## UX Placement

The Tree page remains focused on browsing and editing the visual tree. It only shows a compact "Tree Issues: N" control when unresolved issues exist.

The full review workflow lives in Tools:

1. Open Tools.
2. Select Tree Integrity Checks.
3. Run Scan tree if the user has editor/admin access.
4. Review issues, follow affected record links, fix data in existing pages, then resolve or dismiss.
