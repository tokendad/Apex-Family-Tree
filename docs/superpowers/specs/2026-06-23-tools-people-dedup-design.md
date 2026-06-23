# Tools Hub and People De-Duplication Design

## Purpose

Apex Family Tree needs a reusable Tools area for data cleanup workflows. The first tool will focus on People merge and de-duplication. The Tools hub should also preview future cleanup tools for Families, Sources, Media, tree integrity, and import/export utilities so the navigation model is clear before every tool is implemented.

## Goals

- Add a top-level Tools navigation item after Media.
- Show Admin in the main navigation only when the signed-in user has admin privileges.
- Restrict Tools and People de-duplication actions to users with editor-level privileges or higher.
- Provide a Tools hub that can list active and planned tools without crowding the primary data pages.
- Build the first active workflow around People duplicate detection, review, preview, and merge.
- Reuse the existing import merge concepts where appropriate, especially match tiers, field diffs, and review patterns.

## Non-Goals

- Do not implement Families, Sources, or Media merge logic in the first release.
- Do not auto-merge records without user review.
- Do not replace GEDCOM import merge review.
- Do not introduce a new permission model beyond the current role hierarchy.

## Navigation and Access

The main navbar should become:

Tree, People, Families, Sources, Media, Tools, Admin

Admin is displayed only for users with the admin role. Tools is displayed for users who can run bulk data operations, matching the current import/export access level: editor and admin. Direct navigation to Tools routes should also enforce the same minimum role so the UI and backend do not disagree.

## Tools Hub

Route: `/tools`

The hub should use the existing app shell, navbar, and layout language. It should present a concise list or grid of tool entries:

- People Merge and De-Duplication: active. Opens `/tools/people-dedup`.
- Families Cleanup: placeholder. Planned duplicate-family review by shared spouses, children, and marriage facts.
- Sources Cleanup: placeholder. Planned duplicate-source review by title, author, repository, and citation overlap.
- Media Cleanup: placeholder. Planned unlinked media review, duplicate file review, and person-tag cleanup.
- Tree Integrity Checks: placeholder. Planned checks for disconnected people, impossible dates, circular relationships, and missing core facts.
- Import/Export Utilities: placeholder or links to the existing GEDCOM import/export flows.

Placeholder cards should be visibly unavailable but still useful. They should explain what the future tool is for without implying it can be run now.

## People De-Duplication Workflow

Route: `/tools/people-dedup`

The People tool should start with a scan action. A scan identifies candidate duplicate groups and returns enough summary data for review:

- Candidate group id.
- Confidence tier such as strong, partial, or low.
- Person ids in the group.
- Display name.
- Birth and death facts.
- Relationship counts.
- Source and media counts when available.
- Conflict indicators for meaningful differences.

The review UI should sort higher-confidence groups first. Each group should let the user compare candidate records side by side, choose the canonical person to keep, and choose field-level values when records disagree.

The merge should use a preview-before-apply flow:

1. User scans for duplicates.
2. User opens a candidate group.
3. User chooses the canonical person.
4. User resolves field conflicts.
5. App shows a merge preview summarizing updates.
6. User confirms apply.
7. Backend performs the merge transactionally.
8. UI refreshes the scan results and reports the completed merge.

## Matching Rules

The first scan can reuse and extend the current GEDCOM matcher behavior:

- Exact normalized names with matching birth years are strong candidates.
- Soundex-compatible names with matching birth or death years are partial candidates.
- Records with conflicting core facts should remain review-only and never become automatic merges.

The scan should be deterministic and explainable. Candidate details should show the facts that caused the match so users can trust why a group appeared.

## Merge Behavior

The merge operation should preserve the canonical person id and retire or delete merged-away duplicate person records only after dependent data is safely moved.

The backend should update related records in a single transaction. At minimum, this includes:

- Names.
- Events.
- Family spouse and child references.
- Source citations.
- Media links and tagged regions.

The implementation plan should verify the exact table names and relationship tables before coding the merge operation. If any dependency cannot be safely transferred in the first release, the preview must block the merge and explain why.

## Error Handling

The scan endpoint should return structured errors for permission failures and unexpected scan failures. The apply endpoint should reject invalid candidate groups, missing canonical people, unresolved conflicts, and stale merge previews.

Merges should be transactional. If any step fails, no partial merge should remain in the database.

## Testing

Backend tests should cover:

- Candidate grouping and confidence tiers.
- Field conflict detection.
- Permission enforcement.
- Transactional merge behavior across person dependencies.
- Rejection of invalid or stale merge requests.

Frontend tests should cover:

- Tools nav visibility by role.
- Tools hub active and placeholder cards.
- People de-dup scan loading, empty, error, and result states.
- Canonical person selection and conflict resolution.
- Preview and confirmation behavior.

## Open Implementation Notes

- The existing `ProtectedRoute` minimum-role support should be sufficient for route gating.
- The existing `usePermissions` hook already exposes import/export-style bulk permission logic.
- The existing `MergeReview` components and import merge helper types should inform the UI, but the People de-dup workflow should have its own route and API surface.
- Backend API routes should live under `/api/v1/tools` or `/api/v1/maintenance`; `/api/v1/tools` is preferred because it matches the user-facing navigation label.
