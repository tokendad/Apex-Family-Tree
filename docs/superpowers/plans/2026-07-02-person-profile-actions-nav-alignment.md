# Person Profile Actions-Nav Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the live UI match `Docs/Apex_Family_Legacy_2.0/UX_Concepts/Person_Profile_Actions_Nav_Prototype.html`: a dark two-row global topbar with archive search and a context-aware Actions menu in the chrome, a sidebar-free centered person profile with breadcrumb/lifespan header, archive-centric stats/tabs/Overview, and an enriched Connected To rail.

**Architecture:** Rework `Navbar` into the mockup's two-row dark topbar. Introduce a `PageActionsContext` so detail pages register their context actions and the topbar renders the single Actions menu. `ArchiveObjectLayout` gains a breadcrumb slot and an `ArtifactCard` card grid; `PersonDetailPage` stops rendering the sidebar, derives lifespan/roles from data it already fetches, and keeps the full connected-objects list (not just artifacts) to power stats, a Stories tab, and Collections/Places rail groups.

**Tech Stack:** React 18 + TypeScript, react-router-dom v6, CSS Modules with design tokens (`frontend/src/styles/tokens.css`), Vitest + Testing Library.

## Global Constraints

- Run frontend tests with `npx vitest run <file>` from `/data/Projects/AFT/frontend` (workspace root `npm test` also works).
- Do not remove existing routes or role-gating: Tools requires `editor`+, Admin requires `admin` (existing `Navbar.test.tsx` enforces this).
- Brand copy from the mockup, verbatim: title **"Apex Family Legacy"**, tagline **"A Digital Family Archive"**, search placeholder **"Search the archive..."**.
- Mockup colors, verbatim: topbar `#143236`, page background `#f6f4ef`, warm border `#e4ded2`. Brand teal already exists as `--color-primary-700: #0f766e`.
- All new styling uses CSS Modules + tokens; no inline style objects except where the codebase already does so.
- Placeholders that stay placeholders (out of scope): ActionDrawer form contents, Claims tab content, artifact preview drawer.
- Commit after every task; work stays on branch `apex-family-legacy-2.0`.

---

### Task 1: Two-row dark topbar with archive search

**Files:**
- Modify: `frontend/src/styles/tokens.css` (add topbar/warm tokens after line 48)
- Modify: `frontend/src/components/Navbar/Navbar.tsx`
- Modify: `frontend/src/components/Navbar/Navbar.module.css` (full rewrite)
- Test: `frontend/src/components/Navbar/Navbar.test.tsx`

**Interfaces:**
- Consumes: existing `useAuth()` from `@/contexts/AuthContext.js`.
- Produces: `Navbar` renders two rows — `.topline` (brand, search, user) and `.navline` (nav links). Row 1 has an empty flex slot `<div className={styles.topActions}>` that Task 2 fills with the Actions menu. Search input has `aria-label="Search the archive"` and on Enter navigates to `/search?q=<encoded>`.

- [ ] **Step 1: Write the failing tests** — append to `Navbar.test.tsx` (keep the three existing role tests untouched; they must still pass). The existing file wraps with `MemoryRouter`; for navigation assertion mock `useNavigate`:

```tsx
// add to imports at top of file
import userEvent from '@testing-library/user-event';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

describe('Navbar archive topbar', () => {
  beforeEach(() => {
    currentRole = 'viewer';
    navigateMock.mockClear();
  });

  it('shows the archive brand and tagline', () => {
    render(<Navbar />, { wrapper: MemoryRouter });
    expect(screen.getByText('Apex Family Legacy')).toBeInTheDocument();
    expect(screen.getByText('A Digital Family Archive')).toBeInTheDocument();
  });

  it('navigates to search results on Enter', async () => {
    render(<Navbar />, { wrapper: MemoryRouter });
    const input = screen.getByRole('searchbox', { name: /search the archive/i });
    await userEvent.type(input, 'draft letter{Enter}');
    expect(navigateMock).toHaveBeenCalledWith('/search?q=draft%20letter');
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `cd /data/Projects/AFT/frontend && npx vitest run src/components/Navbar/Navbar.test.tsx`
Expected: 3 existing PASS, 2 new FAIL ("Unable to find element with text Apex Family Legacy" / no searchbox).

- [ ] **Step 3: Add warm/topbar tokens** to `tokens.css` after the `--color-bg-overlay` line:

```css
  /* Colors — Archive chrome (Apex Family Legacy 2.0 mockup) */
  --color-topbar-bg: #143236;
  --color-topbar-text: #ffffff;
  --color-topbar-muted: #b8d5d1;
  --color-bg-app: #f6f4ef;
  --color-border-warm: #e4ded2;
```

- [ ] **Step 4: Rewrite Navbar.tsx** — same data (NAV_ITEMS incl. role-gated Tools/Admin, user dropdown) reorganized into two rows plus a search input:

```tsx
import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.js';
import Avatar from '@/components/Avatar/Avatar';
import styles from './Navbar.module.css';

const NAV_ITEMS = [ /* unchanged list */ ];
// ROLE_RANK / hasMinimumRole unchanged

const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [query, setQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const visibleNavItems = [/* unchanged */];
  // click-outside effect unchanged; isActive unchanged

  const submitSearch = () => {
    const q = query.trim();
    if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <header className={styles.topbar}>
      <div className={styles.topline}>
        <Link to="/" className={styles.brand}>
          <strong>Apex Family Legacy</strong>
          <span>A Digital Family Archive</span>
        </Link>
        <span className={styles.version}>v{__APP_VERSION__}</span>
        <div className={styles.search}>
          <input
            type="search"
            aria-label="Search the archive"
            placeholder="Search the archive..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitSearch(); }}
          />
        </div>
        <div className={styles.topActions}>
          {/* Task 2 renders the context Actions menu here */}
          {user && (
            <div className={styles.userArea} ref={dropdownRef}>
              {/* existing userButton + dropdown JSX, styles.userButton gets ghost-pill styling */}
            </div>
          )}
        </div>
      </div>
      <nav className={styles.navline} aria-label="Primary">
        {visibleNavItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`${styles.navLink} ${isActive(item.path) ? styles.navLinkActive : ''}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
};
```

- [ ] **Step 5: Rewrite Navbar.module.css** to the mockup chrome:

```css
.topbar { background: var(--color-topbar-bg); color: var(--color-topbar-text); box-shadow: 0 2px 12px rgba(0,0,0,.18); z-index: var(--z-sticky); flex-shrink: 0; }
.topline { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-3) var(--space-5); }
.brand { display: flex; flex-direction: column; line-height: 1.08; color: inherit; text-decoration: none; min-width: 200px; }
.brand strong { font-size: var(--font-size-lg); letter-spacing: .2px; }
.brand span { font-size: var(--font-size-xs); color: var(--color-topbar-muted); margin-top: 3px; }
.version { font-size: var(--font-size-2xs); color: var(--color-topbar-muted); align-self: flex-end; padding-bottom: 2px; }
.search { flex: 1; max-width: 520px; margin-left: auto; position: relative; }
.search::before { content: "⌕"; position: absolute; left: 14px; top: 6px; font-size: 20px; color: rgba(255,255,255,.8); }
.search input { width: 100%; border: 1px solid rgba(255,255,255,.25); background: rgba(255,255,255,.12); color: var(--color-topbar-text); border-radius: var(--radius-full); padding: var(--space-2) var(--space-3) var(--space-2) 36px; outline: none; font: inherit; }
.search input::placeholder { color: rgba(255,255,255,.72); }
.topActions { display: flex; align-items: center; gap: var(--space-2); margin-left: auto; }
.navline { display: flex; align-items: center; gap: var(--space-1); background: var(--color-bg-primary); border-bottom: 1px solid var(--color-border-warm); padding: 0 var(--space-5); overflow-x: auto; }
.navLink { padding: var(--space-3) var(--space-3); font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); color: var(--color-text-secondary); text-decoration: none; border-bottom: 3px solid transparent; white-space: nowrap; }
.navLink:hover { color: var(--color-text-primary); text-decoration: none; }
.navLinkActive { color: var(--color-primary-700); border-bottom-color: var(--color-primary-600); font-weight: var(--font-weight-bold); }
/* userArea/userButton/dropdown rules kept, userButton restyled: */
.userButton { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-1) var(--space-3); border: 1px solid rgba(255,255,255,.25); background: transparent; color: var(--color-topbar-text); border-radius: var(--radius-full); cursor: pointer; }
.userName { font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); color: inherit; }
/* dropdown block unchanged from current file */
@media (max-width: 740px) { .search { display: none; } .navline { padding: 0 var(--space-3); } .userName { display: none; } .version { display: none; } }
```

- [ ] **Step 6: Run tests to verify all pass**

Run: `cd /data/Projects/AFT/frontend && npx vitest run src/components/Navbar/Navbar.test.tsx`
Expected: 5 PASS.

- [ ] **Step 7: Full frontend test suite** (catch anything asserting old navbar markup)

Run: `cd /data/Projects/AFT/frontend && npx vitest run`
Expected: PASS (fix any test that greps for "Apex Family Tree" text).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/styles/tokens.css frontend/src/components/Navbar/
git commit -m "ui: two-row archive topbar with global search"
```

---

### Task 2: PageActions context — Actions menu moves into the topbar

**Files:**
- Create: `frontend/src/contexts/PageActionsContext.tsx`
- Create: `frontend/src/contexts/PageActionsContext.test.tsx`
- Modify: `frontend/src/components/archive-object/ContextActionsMenu.tsx` (title + grouping + primary pill button)
- Modify: `frontend/src/components/archive-object/ContextActionsMenu.module.css`
- Modify: `frontend/src/components/Navbar/Navbar.tsx` (render menu in `.topActions`)
- Modify: `frontend/src/App.tsx` (mount provider inside `AuthProvider`)
- Modify: `frontend/src/pages/PersonDetailPage.tsx`, `frontend/src/pages/ArtifactDetailPage.tsx` (register actions via hook, drop `headerAction` menus)

**Interfaces:**
- Consumes: `ContextActionItem` from `ContextActionsMenu.tsx`.
- Produces:
  - `ContextActionItem` gains optional `group?: 'create' | 'manage'` (default `'create'`).
  - `ContextActionsMenu` props gain optional `title?: string` (menu heading, e.g. "Actions for John LeFort"); items with `group: 'manage'` render under a "Manage" section header.
  - `PageActionsProvider({ children })`, hook `usePageActions(title: string, actions: ContextActionItem[])` (registers on mount / re-register on change, clears on unmount), hook `usePageActionsValue(): { title: string; actions: ContextActionItem[] }` for the Navbar.

- [ ] **Step 1: Write failing test** `PageActionsContext.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PageActionsProvider, usePageActions, usePageActionsValue } from './PageActionsContext';
import ContextActionsMenu from '@/components/archive-object/ContextActionsMenu';

function FakeChrome() {
  const { title, actions } = usePageActionsValue();
  if (actions.length === 0) return null;
  return <ContextActionsMenu title={title} actions={actions} />;
}

function FakePage({ onEdit }: { onEdit: () => void }) {
  usePageActions('Actions for John LeFort', [
    { id: 'connect', label: 'Connect Artifact', onSelect: () => undefined },
    { id: 'edit', label: 'Edit Person', group: 'manage', onSelect: onEdit },
  ]);
  return <div>page body</div>;
}

describe('PageActionsContext', () => {
  it('renders registered actions in the chrome menu with grouping', async () => {
    const onEdit = vi.fn();
    render(
      <PageActionsProvider>
        <FakeChrome />
        <FakePage onEdit={onEdit} />
      </PageActionsProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: /actions/i }));
    expect(screen.getByText('Actions for John LeFort')).toBeInTheDocument();
    expect(screen.getByText('Manage')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: /edit person/i }));
    expect(onEdit).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/contexts/PageActionsContext.test.tsx` → FAIL (module not found).

- [ ] **Step 3: Implement `PageActionsContext.tsx`:**

```tsx
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ContextActionItem } from '@/components/archive-object/ContextActionsMenu';

interface PageActionsValue { title: string; actions: ContextActionItem[] }
interface PageActionsApi extends PageActionsValue {
  setPageActions: (value: PageActionsValue) => void;
  clearPageActions: () => void;
}

const PageActionsContext = createContext<PageActionsApi | null>(null);

export const PageActionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [value, setValue] = useState<PageActionsValue>({ title: '', actions: [] });
  const api = useMemo<PageActionsApi>(() => ({
    ...value,
    setPageActions: setValue,
    clearPageActions: () => setValue({ title: '', actions: [] }),
  }), [value]);
  return <PageActionsContext.Provider value={api}>{children}</PageActionsContext.Provider>;
};

export function usePageActionsValue(): PageActionsValue {
  const ctx = useContext(PageActionsContext);
  return ctx ?? { title: '', actions: [] };
}

/** Register this page's context actions in the global topbar Actions menu. */
export function usePageActions(title: string, actions: ContextActionItem[]): void {
  const ctx = useContext(PageActionsContext);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  // Re-register only when the visible shape changes; handlers stay fresh via the ref.
  const shape = actions.map((a) => `${a.id}:${a.label}:${a.group ?? 'create'}:${a.disabled ? 1 : 0}`).join('|');
  useEffect(() => {
    if (!ctx) return;
    ctx.setPageActions({ title, actions: actionsRef.current });
    return () => ctx.clearPageActions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, shape]);
}
```

- [ ] **Step 4: Extend `ContextActionsMenu`** — add to the interface `group?: 'create' | 'manage'`; add prop `title?: string`; render:

```tsx
{open && (
  <div className={styles.menu} role="menu" aria-label="Context actions">
    <div className={styles.menuTitle}>{title ?? 'Actions'}</div>
    {createActions.map(renderAction)}
    {manageActions.length > 0 && <div className={styles.menuTitle}>Manage</div>}
    {manageActions.map(renderAction)}
  </div>
)}
```

where `const createActions = actions.filter(a => (a.group ?? 'create') === 'create')` and `manageActions` the rest, `renderAction` is the existing button JSX extracted to a function. Trigger button becomes `<Button variant="primary">{label} ▾</Button>`.

- [ ] **Step 5: Run test** — `npx vitest run src/contexts/PageActionsContext.test.tsx` → PASS.

- [ ] **Step 6: Wire chrome + provider.** In `App.tsx` wrap inside `AuthProvider`:

```tsx
import { PageActionsProvider } from './contexts/PageActionsContext';
...
<AuthProvider>
  <PageActionsProvider>
    <ModalHost />
    ...
  </PageActionsProvider>
</AuthProvider>
```

In `Navbar.tsx` `.topActions`, before the user area:

```tsx
const { title: actionsTitle, actions: pageActions } = usePageActionsValue();
...
{pageActions.length > 0 && <ContextActionsMenu title={actionsTitle || undefined} actions={pageActions} />}
```

(Navbar tests render without the provider — `usePageActionsValue` falls back to empty, so they still pass.)

- [ ] **Step 7: Migrate the two detail pages.** `PersonDetailPage.tsx`: the `contextActions` array moves above the guard renders is NOT possible (it depends on `person`), so call the hook with a memo-safe pattern: compute `contextActions` as today (after person loads it re-registers) but call `usePageActions` unconditionally before the guards with `person ? contextActions : []`. Concretely, move the `contextActions` definition up next to the other hooks, guarding data access (`const displayTitle = person ? ... : ''`), then:

```tsx
usePageActions(person ? `Actions for ${displayTitle}` : '', person ? contextActions : []);
```

Mark `edit-person`, `set-home`/`delete-person` style items with `group: 'manage'`; remove `view-tree` from the menu (Task 3 gives it a header button). Remove `headerAction={<ContextActionsMenu .../>}` from the `ArchiveObjectLayout` call (leave `headerAction` out for now; Task 3 re-adds it). Apply the same migration to `ArtifactDetailPage.tsx` (its actions array → `usePageActions`, drop its `headerAction` menu).

- [ ] **Step 8: Full suite** — `npx vitest run` → PASS (update `PersonDetailPage.test.tsx` / `ArtifactDetailPage.test.tsx` if they assert the in-card Actions button; they must now render inside `PageActionsProvider` or rely on the fallback no-op).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/contexts/ frontend/src/components/archive-object/ frontend/src/components/Navbar/Navbar.tsx frontend/src/App.tsx frontend/src/pages/PersonDetailPage.tsx frontend/src/pages/ArtifactDetailPage.tsx
git commit -m "ui: context-aware Actions menu lives in the topbar chrome"
```

---

### Task 3: Sidebar-free centered person profile + View in Tree header button

**Files:**
- Modify: `frontend/src/components/AppShell/AppShell.tsx` (`sidebar` becomes optional)
- Modify: `frontend/src/components/Button/Button.tsx` + `Button.module.css` (add `secondary` variant)
- Modify: `frontend/src/pages/PersonDetailPage.tsx` (drop `Sidebar`, centered warm page, header button)
- Modify: `frontend/src/pages/PersonDetailPage.module.css`
- Test: `frontend/src/pages/PersonDetailPage.test.tsx`

**Interfaces:**
- Consumes: `usePageActions` from Task 2.
- Produces: `AppShellProps.sidebar?: React.ReactNode` (rendered only when provided). `Button` accepts `variant="secondary"` (teal-tinted pill: bg `#eef7f5`, text `--color-primary-800`, border `#cde7e2`).

- [ ] **Step 1: Failing test** — add to `PersonDetailPage.test.tsx` (follow that file's existing fetch-mock setup):

```tsx
it('renders View in Tree in the identity header and no sidebar', async () => {
  renderPersonDetailPage(); // existing helper in the test file
  expect(await screen.findByRole('button', { name: /view in tree/i })).toBeInTheDocument();
  expect(screen.queryByText(/generations/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run** — `npx vitest run src/pages/PersonDetailPage.test.tsx` → new test FAIL.

- [ ] **Step 3: AppShell optional sidebar** — change prop to `sidebar?: React.ReactNode;` and render `{sidebar}` only when truthy (JSX already tolerates undefined; just update the interface).

- [ ] **Step 4: Button secondary variant** — `type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';` and in `Button.module.css`:

```css
.secondary { background: #eef7f5; color: var(--color-primary-800); border: 1px solid #cde7e2; }
.secondary:hover:not(:disabled) { background: #e0f2ef; }
```

- [ ] **Step 5: PersonDetailPage shell.** Remove the `Sidebar` import and all four `sidebar={<Sidebar context="people" />}` props (loading/notFound/error/main renders). Add to the main render:

```tsx
headerAction={(
  <Button variant="secondary" onClick={() => navigate('/')}>View in Tree</Button>
)}
```

Update `.page` in `PersonDetailPage.module.css`:

```css
.page {
  height: 100%;
  overflow-y: auto;
  background: var(--color-bg-app);
  padding: var(--space-6) var(--space-4) var(--space-8);
}
.pageInner {
  width: min(1180px, 100%);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
```

Wrap page children in `<div className={styles.pageInner}>...</div>` in all four render branches.

- [ ] **Step 6: Run** — `npx vitest run src/pages/PersonDetailPage.test.tsx` → PASS, then `npx vitest run` → PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/AppShell/ frontend/src/components/Button/ frontend/src/pages/PersonDetailPage.tsx frontend/src/pages/PersonDetailPage.module.css frontend/src/pages/PersonDetailPage.test.tsx
git commit -m "ui: sidebar-free centered person profile with View in Tree header action"
```

---

### Task 4: Breadcrumb + lifespan identity header

**Files:**
- Create: `frontend/src/utils/personEvents.ts`
- Create: `frontend/src/utils/personEvents.test.ts`
- Modify: `frontend/src/components/archive-object/ArchiveObjectLayout.tsx` (optional `breadcrumb` node above the title)
- Modify: `frontend/src/components/archive-object/ArchiveObjectLayout.module.css`
- Modify: `frontend/src/pages/PersonDetailPage.tsx` (breadcrumb, lifespan subtitle, remove `backBtn`)

**Interfaces:**
- Consumes: `PersonEvent` shape `{ event_type: string; event_date: string | null }`.
- Produces:
  - `lifespanLabel(events: Array<{ event_type: string; event_date: string | null }>): string | null` — returns `"1931–2008"`, `"1931–"` (birth only, deceased handled by caller), `"–2008"`, or `null`. Year = first 4-digit match in `event_date`.
  - `ArchiveObjectLayoutProps.breadcrumb?: React.ReactNode` — rendered as `<div className={styles.crumb}>` above `<h1>`; when present it replaces the eyebrow.

- [ ] **Step 1: Failing tests** `personEvents.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { lifespanLabel } from './personEvents';

describe('lifespanLabel', () => {
  it('formats birth and death years', () => {
    expect(lifespanLabel([
      { event_type: 'birth', event_date: '1931-04-02' },
      { event_type: 'death', event_date: '2008' },
    ])).toBe('1931–2008');
  });
  it('handles birth only', () => {
    expect(lifespanLabel([{ event_type: 'birth', event_date: 'abt 1931' }])).toBe('1931–');
  });
  it('handles death only', () => {
    expect(lifespanLabel([{ event_type: 'death', event_date: '2008-01-01' }])).toBe('–2008');
  });
  it('returns null without years', () => {
    expect(lifespanLabel([{ event_type: 'residence', event_date: '1950' }])).toBeNull();
    expect(lifespanLabel([{ event_type: 'birth', event_date: null }])).toBeNull();
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run src/utils/personEvents.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `personEvents.ts`:**

```ts
interface DatedEvent { event_type: string; event_date: string | null }

function yearOf(events: DatedEvent[], type: string): string | null {
  const match = events.find((e) => e.event_type === type)?.event_date?.match(/\b(\d{4})\b/);
  return match ? match[1] : null;
}

/** "1931–2008" style lifespan from birth/death events; null when neither year is known. */
export function lifespanLabel(events: DatedEvent[]): string | null {
  const birth = yearOf(events, 'birth');
  const death = yearOf(events, 'death');
  if (!birth && !death) return null;
  return `${birth ?? ''}–${death ?? ''}`;
}
```

- [ ] **Step 4: Run** — PASS.

- [ ] **Step 5: Layout breadcrumb.** In `ArchiveObjectLayout.tsx` add `breadcrumb?: React.ReactNode` and in the identity text block:

```tsx
{breadcrumb ? <div className={styles.crumb}>{breadcrumb}</div> : <p className={styles.eyebrow}>{eyebrow}</p>}
```

(make `eyebrow` optional: `eyebrow?: string`). CSS:

```css
.crumb { color: var(--color-text-secondary); font-size: 0.85rem; margin-bottom: var(--space-2); }
.crumb a { color: inherit; }
```

- [ ] **Step 6: Use it in PersonDetailPage.** Remove the `← People` `backBtn` button (and its CSS class usage). Pass:

```tsx
breadcrumb={<><Link to="/people">People</Link> / Archive Profile</>}
subtitle={[
  lifespanLabel(person.events),
  person.is_living === 1 ? 'Living' : 'Deceased',
  SEX_LABELS[person.sex],
  person.is_private === 1 ? 'Private' : null,
].filter(Boolean).join(' • ')}
```

- [ ] **Step 7: Full suite** — `npx vitest run` → PASS (update any PersonDetailPage test asserting the back button; the breadcrumb link `People` covers navigation).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/utils/personEvents.ts frontend/src/utils/personEvents.test.ts frontend/src/components/archive-object/ frontend/src/pages/PersonDetailPage.tsx frontend/src/pages/PersonDetailPage.module.css
git commit -m "ui: breadcrumb and lifespan identity header on person profile"
```

---

### Task 5: Archive-centric stats, Stories tab, enriched Connected To rail

**Files:**
- Modify: `frontend/src/pages/PersonDetailPage.tsx`
- Test: `frontend/src/pages/PersonDetailPage.test.tsx`

**Interfaces:**
- Consumes: `/api/v1/relationships/objects/:id/connected` already returns *all* connected object types (`object_type: 'artifact' | 'story' | 'collection' | 'place' | ...`) — stop filtering to artifacts at fetch time.
- Produces (internal to the page):
  - state rename `connectedArtifacts` → `connectedObjects: ConnectedArtifact[]` (interface rename to `ConnectedObject`); derived `const connectedArtifacts/connectedStories/connectedCollections/connectedPlaces = connectedObjects.filter((o) => o.object_type === '...')`.
  - Stats: `Artifacts`, `Stories`, `Events`, `Collections`, `Families`.
  - Tabs: `overview`, `timeline`, `artifacts`, `stories` (new, count `connectedStories.length`), `family`, `claims`.
  - Connected rail groups: `Family` (role subtitles), `Collections`, `Places`, `Artifacts`.

- [ ] **Step 1: Failing test** — add to `PersonDetailPage.test.tsx`, extending its fetch mock so the connected endpoint returns a story and a collection:

```tsx
// in the connected-objects mock payload:
{ relationship_id: 'r2', relationship_type_code: 'subject_of', relationship_type_name: 'Subject of',
  role: 'subject', object_id: 'story-1', object_type: 'story', title: 'The Recipe Box',
  summary: null, artifact_type_name: null },
{ relationship_id: 'r3', relationship_type_code: 'member_of', relationship_type_name: 'Member of',
  role: 'member', object_id: 'col-1', object_type: 'collection', title: 'Military Service',
  summary: null, artifact_type_name: null },

it('shows archive stats and a Stories tab fed by connected objects', async () => {
  renderPersonDetailPage();
  expect(await screen.findByText('Stories')).toBeInTheDocument(); // stat label
  await userEvent.click(screen.getByRole('tab', { name: /stories/i }));
  expect(await screen.findByRole('link', { name: /the recipe box/i })).toBeInTheDocument();
});

it('groups collections in the Connected To rail', async () => {
  renderPersonDetailPage();
  expect(await screen.findByText('Collections')).toBeInTheDocument();
  expect(screen.getByText('Military Service')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run** — new tests FAIL.

- [ ] **Step 3: Implement.** In `fetchConnectedArtifacts` (rename `fetchConnectedObjects`) drop `.filter(object => object.object_type === 'artifact')` — store the full list. Derive:

```tsx
const connectedArtifacts = connectedObjects.filter((o) => o.object_type === 'artifact');
const connectedStories = connectedObjects.filter((o) => o.object_type === 'story');
const connectedCollections = connectedObjects.filter((o) => o.object_type === 'collection');
const connectedPlaces = connectedObjects.filter((o) => o.object_type === 'place');
```

Family role subtitles — build alongside `uniqueFamilyConnections`:

```tsx
const familyRoles = new Map<string, string>();
childFamilies.forEach((rel) => {
  [rel.spouse1, rel.spouse2].forEach((p) => { if (p) familyRoles.set(p.id, 'Parent'); });
});
parentFamilies.forEach((rel) => {
  const other = rel.role === 'spouse1' ? rel.spouse2 : rel.spouse1;
  if (other) familyRoles.set(other.id, 'Spouse');
  rel.children.forEach((c) => familyRoles.set(c.person_id, 'Child'));
});
```

Connected groups (`subtitle: familyRoles.get(p.id) ?? 'Family relationship'`), plus:

```tsx
{ id: 'collections', label: 'Collections', items: connectedCollections.slice(0, 6).map((o) => ({
    id: o.object_id, title: o.title, subtitle: o.relationship_type_name,
    href: `/collections/${o.object_id}`, initials: '★' })) },
{ id: 'places', label: 'Places', items: connectedPlaces.slice(0, 6).map((o) => ({
    id: o.object_id, title: o.title, subtitle: o.relationship_type_name,
    href: `/places/${o.object_id}`, initials: '⌂' })) },
```

Stats/tabs per the Interfaces block. New Stories panel:

```tsx
{activeTab === 'stories' && (
  <section className={styles.section} aria-labelledby="stories-heading">
    <h2 className={styles.sectionTitle} id="stories-heading">Stories
      {connectedStories.length > 0 && <span className={styles.countBadge}>{connectedStories.length}</span>}
    </h2>
    {connectedStories.length === 0 ? (
      <p className={styles.noInfo}>No stories connected to this person yet. Use Actions → Add Story.</p>
    ) : (
      <div className={styles.relPersonList}>
        {connectedStories.map((story) => (
          <Link key={story.relationship_id} to={`/stories/${story.object_id}`} className={styles.relPersonLink}>
            {story.title}
          </Link>
        ))}
      </div>
    )}
  </section>
)}
```

Also include children in the family Connected group source list (add `parentFamilies.flatMap((rel) => rel.children.map(c => ({ id: c.person_id, ... })))` mapped through the same dedupe) so "Child" rows appear as in the mockup.

- [ ] **Step 4: Run** — `npx vitest run src/pages/PersonDetailPage.test.tsx` → PASS, then full suite → PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/PersonDetailPage.tsx frontend/src/pages/PersonDetailPage.test.tsx
git commit -m "ui: archive stats, stories tab, and enriched connected rail on person profile"
```

---

### Task 6: ArtifactCard grid + archive-content Overview

**Files:**
- Create: `frontend/src/components/archive-object/ArtifactCard.tsx`
- Create: `frontend/src/components/archive-object/ArtifactCard.module.css`
- Create: `frontend/src/components/archive-object/ArtifactCard.test.tsx`
- Modify: `frontend/src/pages/PersonDetailPage.tsx` (Overview: Recent Artifacts + Key Life Context first; Artifacts tab uses card grid)
- Modify: `frontend/src/pages/PersonDetailPage.module.css` (card grid + panel styles)

**Interfaces:**
- Consumes: `ConnectedObject` fields `object_id`, `title`, `artifact_type_name`, `relationship_type_name`.
- Produces: `ArtifactCard` component:

```tsx
interface ArtifactCardProps {
  href: string;
  title: string;
  subtitle?: string | null;
  /** drives the placeholder glyph */
  typeName?: string | null;
}
```

- [ ] **Step 1: Failing test** `ArtifactCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ArtifactCard from './ArtifactCard';

describe('ArtifactCard', () => {
  it('renders a linked card with title and subtitle', () => {
    render(
      <MemoryRouter>
        <ArtifactCard href="/artifacts/a1" title="WWII Draft Letter" subtitle="Letter • Official Record" typeName="Letter" />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /wwii draft letter/i });
    expect(link).toHaveAttribute('href', '/artifacts/a1');
    expect(screen.getByText('Letter • Official Record')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run** — FAIL (module not found).

- [ ] **Step 3: Implement `ArtifactCard.tsx`:**

```tsx
import React from 'react';
import { Link } from 'react-router-dom';
import styles from './ArtifactCard.module.css';

interface ArtifactCardProps {
  href: string;
  title: string;
  subtitle?: string | null;
  typeName?: string | null;
}

const GLYPHS: Array<[RegExp, string]> = [
  [/letter|document|record|certificate/i, '✉'],
  [/photo|image|picture/i, '▧'],
  [/recipe|handwrit/i, '⌁'],
];

function glyphFor(typeName?: string | null): string {
  if (typeName) {
    const hit = GLYPHS.find(([re]) => re.test(typeName));
    if (hit) return hit[1];
  }
  return '▤';
}

const ArtifactCard: React.FC<ArtifactCardProps> = ({ href, title, subtitle, typeName }) => (
  <Link to={href} className={styles.card}>
    <div className={styles.thumb} aria-hidden="true">{glyphFor(typeName)}</div>
    <div className={styles.meta}>
      <strong>{title}</strong>
      {subtitle && <span>{subtitle}</span>}
    </div>
  </Link>
);

export default ArtifactCard;
```

`ArtifactCard.module.css` (mockup `.artifact`/`.thumb`):

```css
.card { display: block; border: 1px solid var(--color-border-warm); background: var(--color-bg-primary); border-radius: var(--radius-lg); overflow: hidden; text-decoration: none; color: inherit; transition: transform .14s ease, box-shadow .14s ease; }
.card:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(30,42,46,.12); text-decoration: none; }
.thumb { height: 96px; display: grid; place-items: center; background: linear-gradient(145deg, #f2ead9, #dcebe8); color: var(--color-primary-800); font-size: 38px; border-bottom: 1px solid var(--color-border-warm); }
.meta { padding: var(--space-3); }
.meta strong { display: block; }
.meta span { display: block; color: var(--color-text-secondary); font-size: var(--font-size-sm); margin-top: var(--space-1); line-height: 1.35; }
```

- [ ] **Step 4: Run** — PASS.

- [ ] **Step 5: Overview + Artifacts tab.** In `PersonDetailPage.module.css` add:

```css
.cardGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); }
@media (max-width: 740px) { .cardGrid { grid-template-columns: 1fr; } }
```

In the Overview tab, before the Basic Information section:

```tsx
<section className={styles.section} aria-labelledby="recent-artifacts-heading">
  <div className={styles.sectionHeader}>
    <h2 className={styles.sectionTitle} id="recent-artifacts-heading">Recent Artifacts</h2>
    <Button variant="ghost" size="sm" onClick={() => setActiveTab('artifacts')}>View all</Button>
  </div>
  {connectedArtifacts.length === 0 ? (
    <p className={styles.noInfo}>No artifacts connected yet. Use Actions → Connect Artifact.</p>
  ) : (
    <div className={styles.cardGrid}>
      {connectedArtifacts.slice(0, 3).map((a) => (
        <ArtifactCard key={a.relationship_id} href={`/artifacts/${a.object_id}`} title={a.title}
          subtitle={a.artifact_type_name ?? a.relationship_type_name} typeName={a.artifact_type_name} />
      ))}
    </div>
  )}
</section>

<section className={styles.section} aria-labelledby="life-context-heading">
  <div className={styles.sectionHeader}>
    <h2 className={styles.sectionTitle} id="life-context-heading">Key Life Context</h2>
    <Button variant="ghost" size="sm" onClick={() => setActiveTab('timeline')}>Timeline</Button>
  </div>
  {sortedEventsList.length === 0 ? (
    <p className={styles.noInfo}>No events recorded.</p>
  ) : (
    <ol className={styles.eventsList} aria-label="Key life events">
      {sortedEventsList.slice(0, 3).map((event) => (
        /* same <li> markup as the timeline tab */
      ))}
    </ol>
  )}
</section>
```

In the Artifacts tab, replace the plain-links Connected Artifacts list with:

```tsx
<div className={styles.cardGrid}>
  {connectedArtifacts.map((artifact) => (
    <ArtifactCard key={`${artifact.relationship_id}-${artifact.object_id}`}
      href={`/artifacts/${artifact.object_id}`} title={artifact.title}
      subtitle={artifact.artifact_type_name ?? artifact.relationship_type_name}
      typeName={artifact.artifact_type_name} />
  ))}
</div>
```

- [ ] **Step 6: Full suite** — `npx vitest run` → PASS (update any Overview-order assertions in `PersonDetailPage.test.tsx`).

- [ ] **Step 7: Verify end-to-end** — `cd /data/Projects/AFT/frontend && npx vite build` (type-check + build), then run the dev stack and eyeball `/people/:id` against the mockup (topbar, no sidebar, breadcrumb, stats row, tabs, card grid, rail groups).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/archive-object/ArtifactCard.* frontend/src/pages/PersonDetailPage.tsx frontend/src/pages/PersonDetailPage.module.css
git commit -m "ui: artifact card grid and archive-first overview on person profile"
```
