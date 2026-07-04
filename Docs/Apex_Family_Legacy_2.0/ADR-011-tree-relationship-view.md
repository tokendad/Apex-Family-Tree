# ADR-011: Tree as Relationship View Compatibility

## Status

Accepted for Phase 11 implementation.

## Context

The existing tree canvas expects a compact legacy shape: people plus family records containing two spouse slots and child IDs. Apex Family Legacy 2.0 introduces first-class archive relationships, including `family_union` with `partner` and `child` members. The tree should become a view over relationship data without breaking current tree interactions.

## Decision

Use `family_union` relationships as the tree-compatible source of truth, then adapt those relationships into the existing frontend tree shape at the API boundary.

Legacy `families` and `family_members` remain compatibility data during this phase. Existing family records are backfilled into `family_union` relationships, and family create/update/member operations synchronize the matching `family_union` record where the 2.0 relationship tables are present.

## Consequences

- The frontend tree canvas does not need a risky rewrite in Phase 11.
- Current spouse and parent-child rendering remains stable.
- Adoptive, foster, and step child roles remain representable through `relationship_members.notes` metadata while the current canvas accepts only `children_ids`.
- Unknown parents remain practical through single-partner or child-only `family_union` records, though the current visual layout still works best with at least one partner.
- Removal of legacy family tables is deliberately deferred to a later phase.
