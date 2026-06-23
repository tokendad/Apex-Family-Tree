# Tools People De-Duplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a role-gated Tools area with an active People merge/de-duplication workflow and disabled placeholder cards for future cleanup tools.

**Architecture:** Add a backend tools service and router under `/api/v1/tools` for duplicate scanning, preview, and transactional merge. Add frontend Tools routes, navbar items, hub page, and People de-dup page using existing AppShell, ProtectedRoute, permissions, and CSS Modules patterns.

**Tech Stack:** React 18, TypeScript, React Router v6, CSS Modules, Express 4, better-sqlite3, Vitest.

## Global Constraints

- Project name is "Apex Family Tree" or "AFT" and never "TreeRoots".
- REST API remains under `/api/v1/`.
- Tools and merge actions require editor-level privileges or higher.
- Admin navigation is displayed only when the signed-in user has the admin role.
- People de-duplication is People-first; Families, Sources, Media, Tree Integrity, and Import/Export entries are placeholders only.
- Merges must be previewed before apply and executed transactionally.

---

### Task 1: Backend People Duplicate Service

**Files:**
- Create: `backend/src/services/tools/personDedup.ts`
- Test: `backend/src/services/tools/personDedup.test.ts`

**Interfaces:**
- Produces: `scanPeopleDuplicates(): PeopleDuplicateScan`
- Produces: `previewPeopleMerge(input: PeopleMergeInput): PeopleMergePreview`
- Produces: `applyPeopleMerge(input: PeopleMergeInput): PeopleMergeResult`
- Produces types `PeopleDuplicateGroup`, `PeopleMergeInput`, `PeopleMergePreview`, `PeopleMergeResult`

- [ ] **Step 1: Write failing tests for duplicate scan and preview**

Add tests that seed persons, names, birth/death events, family membership, source citations, and media links, then assert:

```ts
expect(scan.groups[0].confidence).toBe('strong');
expect(scan.groups[0].people).toHaveLength(2);
expect(preview.conflicts.some((c) => c.field === 'birthDate')).toBe(true);
expect(preview.transferCounts.events).toBe(1);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -w backend -- src/services/tools/personDedup.test.ts`

Expected: FAIL because `personDedup.ts` does not exist.

- [ ] **Step 3: Implement minimal scan and preview**

Create deterministic group detection from normalized primary name plus birth/death year signals. Return group people summaries with relationship, citation, and media counts. Implement preview validation and transfer counts.

- [ ] **Step 4: Add failing tests for transactional apply**

Assert the canonical person is preserved, duplicate person is removed, and dependent rows point to the canonical person after merge.

- [ ] **Step 5: Implement transactional apply**

Update duplicate references to the canonical id, copy non-duplicate names/events as needed, update family, source, media, region, user home person, and export scope references, then delete duplicate person rows in one transaction.

- [ ] **Step 6: Run backend service tests**

Run: `npm run test -w backend -- src/services/tools/personDedup.test.ts`

Expected: PASS.

### Task 2: Backend Tools Routes

**Files:**
- Create: `backend/src/routes/tools.ts`
- Modify: `backend/src/routes/api.ts`
- Test: `backend/src/routes/tools.test.ts`

**Interfaces:**
- Consumes: `scanPeopleDuplicates`, `previewPeopleMerge`, `applyPeopleMerge`
- Produces routes:
  - `GET /api/v1/tools/people-dedup/scan`
  - `POST /api/v1/tools/people-dedup/preview`
  - `POST /api/v1/tools/people-dedup/apply`

- [ ] **Step 1: Write failing route permission and response tests**

Assert editor/admin requests can scan and viewer requests are rejected. Assert invalid merge input returns `400` with `{ error: string }`.

- [ ] **Step 2: Run route tests to verify failure**

Run: `npm run test -w backend -- src/routes/tools.test.ts`

Expected: FAIL because the route file is not registered.

- [ ] **Step 3: Implement route handlers**

Register `toolsRouter` under `/api/v1/tools`, require editor/admin roles for each endpoint, call the service functions, and return structured JSON.

- [ ] **Step 4: Run route tests**

Run: `npm run test -w backend -- src/routes/tools.test.ts`

Expected: PASS.

### Task 3: Navbar, Routing, and Permissions

**Files:**
- Modify: `frontend/src/components/Navbar/Navbar.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/stores/searchStore.ts`
- Modify: `frontend/src/components/Sidebar/Sidebar.tsx`
- Test: `frontend/src/components/Navbar/Navbar.test.tsx`

**Interfaces:**
- Produces routes `/tools` and `/tools/people-dedup`
- Tools route uses `<ProtectedRoute minimumRole="editor">`
- Admin nav link renders only when `user.role === 'admin'`

- [ ] **Step 1: Write failing navbar tests**

Assert admin sees Tools and Admin, editor sees Tools but not Admin, viewer sees neither.

- [ ] **Step 2: Run navbar tests to verify failure**

Run: `npm run test -w frontend -- src/components/Navbar/Navbar.test.tsx`

Expected: FAIL because Tools and Admin nav handling is missing.

- [ ] **Step 3: Implement navbar and route wiring**

Add Tools and conditional Admin nav items. Add lazy routes for `ToolsPage` and `PeopleDedupPage`. Extend sidebar context to include `tools` where needed.

- [ ] **Step 4: Run navbar tests**

Run: `npm run test -w frontend -- src/components/Navbar/Navbar.test.tsx`

Expected: PASS.

### Task 4: Tools Hub UI

**Files:**
- Create: `frontend/src/pages/ToolsPage.tsx`
- Create: `frontend/src/pages/ToolsPage.module.css`
- Test: `frontend/src/pages/ToolsPage.test.tsx`

**Interfaces:**
- Produces active card link to `/tools/people-dedup`
- Produces disabled placeholder cards for Families, Sources, Media, Tree Integrity, Import/Export Utilities

- [ ] **Step 1: Write failing hub tests**

Assert People Merge and De-Duplication is an active link, future tool cards render disabled copy, and no placeholder card navigates.

- [ ] **Step 2: Run hub tests to verify failure**

Run: `npm run test -w frontend -- src/pages/ToolsPage.test.tsx`

Expected: FAIL because `ToolsPage` does not exist.

- [ ] **Step 3: Implement Tools hub**

Use AppShell with Navbar and a lightweight tools sidebar. Render a dense, scannable grid of cards with active and disabled states.

- [ ] **Step 4: Run hub tests**

Run: `npm run test -w frontend -- src/pages/ToolsPage.test.tsx`

Expected: PASS.

### Task 5: People De-Duplication UI

**Files:**
- Create: `frontend/src/pages/PeopleDedupPage.tsx`
- Create: `frontend/src/pages/PeopleDedupPage.module.css`
- Test: `frontend/src/pages/PeopleDedupPage.test.tsx`

**Interfaces:**
- Consumes backend scan, preview, and apply endpoints
- Produces scan, empty, error, review, preview, confirm, and completed states

- [ ] **Step 1: Write failing page tests**

Mock fetch and assert clicking Scan renders candidate groups. Assert selecting a canonical person enables preview, preview renders transfer counts, and apply calls the apply endpoint.

- [ ] **Step 2: Run page tests to verify failure**

Run: `npm run test -w frontend -- src/pages/PeopleDedupPage.test.tsx`

Expected: FAIL because `PeopleDedupPage` does not exist.

- [ ] **Step 3: Implement People de-dup page**

Build the scan button, group list, side-by-side review panel, canonical selection controls, conflict choices, preview call, confirmation, apply call, and success/error messages.

- [ ] **Step 4: Run page tests**

Run: `npm run test -w frontend -- src/pages/PeopleDedupPage.test.tsx`

Expected: PASS.

### Task 6: Full Verification and Commit

**Files:**
- Modify only files touched by Tasks 1-5.

- [ ] **Step 1: Run focused backend tests**

Run: `npm run test -w backend -- src/services/tools/personDedup.test.ts src/routes/tools.test.ts`

Expected: PASS.

- [ ] **Step 2: Run focused frontend tests**

Run: `npm run test -w frontend -- src/components/Navbar/Navbar.test.tsx src/pages/ToolsPage.test.tsx src/pages/PeopleDedupPage.test.tsx`

Expected: PASS.

- [ ] **Step 3: Run full build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Review git diff**

Run: `git status --short` and `git diff --stat`

Expected: only intended Tools and People de-dup files changed.

- [ ] **Step 5: Commit**

Run:

```bash
git add backend/src frontend/src docs/superpowers/plans/2026-06-23-tools-people-dedup.md
git commit -m "feat: add people dedup tools workflow"
```
