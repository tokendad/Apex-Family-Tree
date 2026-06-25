# Tree Filter: Unconnected People & Unconnected Trees Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two filter modes to the Tree page — "Unconnected People" (no family connections) and "Unconnected Trees" (branches disconnected from the home person) — that replace the canvas with the filtered view.

**Architecture:** Two new `GET /api/v1/tree/unconnected-*` endpoints drive the feature. The frontend adds a filter `<select>` to `CanvasToolbar`, manages filter state in `TreePage`, and uses the existing `layoutTree()` utility and `canvasStore` setters to render each filtered view on the canvas. The banner is an absolutely positioned overlay rendered directly in `TreePage`.

**Tech Stack:** TypeScript, Express, better-sqlite3, React, Zustand, CSS Modules, Vitest

## Global Constraints

- All CSS uses design tokens: `var(--color-*)`, `var(--radius-*)`, `var(--space-*)`, `var(--shadow-*)`
- No Tailwind — use CSS Modules
- No new npm dependencies
- `tsc --noEmit` must pass after every task
- Run tests with `npm test` from the relevant workspace (`/data/Projects/AFT/backend` or `/data/Projects/AFT/frontend`)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/src/routes/tree.ts` | Modify | Add two new GET handlers + BFS helpers |
| `backend/src/routes/tree.test.ts` | Create | Tests for both new endpoints |
| `frontend/src/components/CanvasToolbar/CanvasToolbar.tsx` | Modify | Add `treeFilter` prop and filter `<select>` |
| `frontend/src/components/CanvasToolbar/CanvasToolbar.module.css` | Modify | Styles for filter select + separator |
| `frontend/src/pages/TreePage.tsx` | Modify | Filter state, fetch logic, banner, filtered canvas rendering |
| `frontend/src/pages/TreePage.module.css` | Create | Banner styles |

---

## Task 1: Backend — `GET /api/v1/tree/unconnected-people`

**Files:**
- Modify: `backend/src/routes/tree.ts`
- Create: `backend/src/routes/tree.test.ts`

**Interfaces:**
- Produces: `GET /api/v1/tree/unconnected-people` → `{ people: TreePersonShape[] }`

- [ ] **Step 1: Create the test file**

Create `/data/Projects/AFT/backend/src/routes/tree.test.ts`:

```typescript
import Database from 'better-sqlite3';
import { describe, it, expect, beforeAll, vi } from 'vitest';

let db: Database.Database;

vi.mock('../db/connection.js', () => ({ getDatabase: () => db }));

// Must import after mock
const { treeRouter } = await import('./tree.js');
import express from 'express';
import request from 'supertest';

function buildApp() {
  const app = express();
  app.use(express.json());
  // Inject a fake user on every request
  app.use((req, _res, next) => {
    (req as any).user = { userId: 'user-1', role: 'admin' };
    next();
  });
  app.use('/api/v1/tree', treeRouter);
  return app;
}

function seedMinimal(database: Database.Database) {
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE IF NOT EXISTS persons (
      id TEXT PRIMARY KEY, sex TEXT NOT NULL DEFAULT 'U',
      is_living INTEGER NOT NULL DEFAULT 1, is_private INTEGER NOT NULL DEFAULT 0,
      notes TEXT, created_by TEXT, gedcom_id TEXT, display_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS names (
      id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      name_type TEXT DEFAULT 'birth', prefix TEXT, given_name TEXT, middle_name TEXT,
      surname TEXT, suffix TEXT, nickname TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL, event_date TEXT, event_date_qualifier TEXT,
      event_date_sort_key INTEGER, event_place TEXT, description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS families (
      id TEXT PRIMARY KEY, spouse1_id TEXT REFERENCES persons(id),
      spouse2_id TEXT REFERENCES persons(id), marriage_date TEXT,
      marriage_date_qualifier TEXT, marriage_date_sort_key INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS family_members (
      id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      role TEXT DEFAULT 'child', created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, display_name TEXT,
      password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'viewer',
      home_person_id TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS media_items (
      id TEXT PRIMARY KEY, file_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS person_media (
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      media_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
      is_primary INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (person_id, media_id)
    );
  `);
}

describe('GET /api/v1/tree/unconnected-people', () => {
  beforeAll(() => {
    db = new Database(':memory:');
    seedMinimal(db);

    // User with no home_person_id
    db.prepare(`INSERT INTO users (id, email, display_name, password_hash, role)
      VALUES ('user-1', 'a@b.com', 'Test', 'x', 'admin')`).run();

    // Person A and B in a family (connected)
    db.prepare(`INSERT INTO persons (id, sex) VALUES ('p-a', 'M'), ('p-b', 'F')`).run();
    db.prepare(`INSERT INTO families (id, spouse1_id, spouse2_id) VALUES ('f-1', 'p-a', 'p-b')`).run();

    // Person C — no family (unconnected)
    db.prepare(`INSERT INTO persons (id, sex) VALUES ('p-c', 'U')`).run();
  });

  it('returns only people with no family connections', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/tree/unconnected-people');
    expect(res.status).toBe(200);
    const ids = res.body.people.map((p: { id: string }) => p.id);
    expect(ids).toContain('p-c');
    expect(ids).not.toContain('p-a');
    expect(ids).not.toContain('p-b');
  });
});
```

- [ ] **Step 2: Install supertest if not present, then run the test to verify it fails**

```bash
cd /data/Projects/AFT/backend && npm ls supertest 2>/dev/null || npm install --save-dev supertest @types/supertest
npm test -- --reporter=verbose tree.test 2>&1 | tail -20
```

Expected: test file runs but fails because the route doesn't exist yet.

- [ ] **Step 3: Add the `GET /tree/unconnected-people` route in `tree.ts`**

Open `/data/Projects/AFT/backend/src/routes/tree.ts`. After the existing `treeRouter.get('/')` handler (around line 278), add:

```typescript
// GET /tree/unconnected-people — People with no family connections
treeRouter.get('/unconnected-people', (req, res) => {
  try {
    const db = getDatabase();
    const personRepo = new PersonRepository();

    const rows = db.prepare(`
      SELECT p.id FROM persons p
      WHERE NOT EXISTS (SELECT 1 FROM families WHERE spouse1_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM families WHERE spouse2_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM family_members WHERE person_id = p.id)
      ORDER BY p.created_at ASC
    `).all() as { id: string }[];

    const people = rows
      .map(r => personRepo.findById(r.id))
      .filter(Boolean)
      .map(person => {
        const birthEvent = db.prepare(
          "SELECT event_date FROM events WHERE person_id = ? AND event_type = 'birth' LIMIT 1"
        ).get(person!.id) as { event_date: string | null } | undefined;

        const deathEvent = db.prepare(
          "SELECT event_date FROM events WHERE person_id = ? AND event_type = 'death' LIMIT 1"
        ).get(person!.id) as { event_date: string | null } | undefined;

        const primaryPhoto = db.prepare(
          'SELECT mi.id FROM media_items mi INNER JOIN person_media pm ON mi.id = pm.media_id WHERE pm.person_id = ? AND pm.is_primary = 1 LIMIT 1'
        ).get(person!.id) as { id: string } | undefined;

        return {
          id: person!.id,
          displayName: person!.displayName ?? null,
          display_name: person!.display_name ?? null,
          given_name: person!.primary_name?.given_name ?? null,
          middle_name: person!.primary_name?.middle_name ?? null,
          surname: person!.primary_name?.surname ?? null,
          sex: person!.sex,
          birth_date: birthEvent?.event_date ?? null,
          death_date: deathEvent?.event_date ?? null,
          is_living: person!.is_living === 1,
          is_private: person!.is_private === 1,
          photo_url: primaryPhoto ? `/api/v1/media/${primaryPhoto.id}` : null,
        };
      });

    res.json({ people });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get unconnected people' });
  }
});
```

> **Important:** This route must be added **before** the `treeRouter.get('/:personId', ...)` handler, otherwise `/unconnected-people` is captured by the `/:personId` param route.

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /data/Projects/AFT/backend && npm test -- --reporter=verbose tree.test 2>&1 | tail -20
```

Expected: `GET /api/v1/tree/unconnected-people > returns only people with no family connections` PASS

- [ ] **Step 5: TypeScript check**

```bash
cd /data/Projects/AFT/backend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /data/Projects/AFT && git add backend/src/routes/tree.ts backend/src/routes/tree.test.ts
git commit -m "feat: add GET /tree/unconnected-people endpoint"
```

---

## Task 2: Backend — `GET /api/v1/tree/unconnected-segments`

**Files:**
- Modify: `backend/src/routes/tree.ts`
- Modify: `backend/src/routes/tree.test.ts`

**Interfaces:**
- Consumes: `buildFlatTree(rootId, generations, personRepo)` already defined in `tree.ts`
- Produces: `GET /api/v1/tree/unconnected-segments` → `{ segments: Array<{ persons: object[], families: object[] }> }`

- [ ] **Step 1: Add tests for the segments endpoint**

Append to `tree.test.ts` (after the existing `describe` block):

```typescript
describe('GET /api/v1/tree/unconnected-segments', () => {
  beforeAll(() => {
    db = new Database(':memory:');
    seedMinimal(db);

    // User with home_person_id = 'home'
    db.prepare(`INSERT INTO users (id, email, display_name, password_hash, role, home_person_id)
      VALUES ('user-1', 'a@b.com', 'Test', 'x', 'admin', 'home')`).run();

    // Master tree: home → spouse (family f-home)
    db.prepare(`INSERT INTO persons (id, sex) VALUES ('home', 'M'), ('spouse', 'F')`).run();
    db.prepare(`INSERT INTO families (id, spouse1_id, spouse2_id) VALUES ('f-home', 'home', 'spouse')`).run();

    // Disconnected segment: p1 + p2 in family f-disc
    db.prepare(`INSERT INTO persons (id, sex) VALUES ('p1', 'M'), ('p2', 'F')`).run();
    db.prepare(`INSERT INTO families (id, spouse1_id, spouse2_id) VALUES ('f-disc', 'p1', 'p2')`).run();
  });

  it('returns segments not connected to the home person', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/tree/unconnected-segments');
    expect(res.status).toBe(200);
    expect(res.body.segments).toHaveLength(1);
    const segPersonIds = res.body.segments[0].persons.map((p: { id: string }) => p.id);
    expect(segPersonIds).toContain('p1');
    expect(segPersonIds).toContain('p2');
    expect(segPersonIds).not.toContain('home');
    expect(segPersonIds).not.toContain('spouse');
  });

  it('returns empty segments when all people are connected to home', async () => {
    // Fresh db with only home person
    const localDb = new Database(':memory:');
    seedMinimal(localDb);
    localDb.prepare(`INSERT INTO users (id, email, display_name, password_hash, role, home_person_id)
      VALUES ('user-1', 'a@b.com', 'Test', 'x', 'admin', 'solo')`).run();
    localDb.prepare(`INSERT INTO persons (id, sex) VALUES ('solo', 'M')`).run();
    db = localDb;

    const app = buildApp();
    const res = await request(app).get('/api/v1/tree/unconnected-segments');
    expect(res.status).toBe(200);
    expect(res.body.segments).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /data/Projects/AFT/backend && npm test -- --reporter=verbose tree.test 2>&1 | tail -20
```

Expected: the two new segment tests FAIL (route doesn't exist yet).

- [ ] **Step 3: Add the BFS helpers and `GET /tree/unconnected-segments` route in `tree.ts`**

Add this helper function near the top of `tree.ts` (after `clampGenerations`):

```typescript
function resolveHomePersonId(userId: string): string | null {
  const db = getDatabase();
  const userRepo = new UserRepository();
  const user = userRepo.findById(userId);
  let homeId = user?.home_person_id ?? null;
  if (!homeId) {
    const first = db.prepare('SELECT id FROM persons ORDER BY created_at ASC LIMIT 1').get() as { id: string } | undefined;
    homeId = first?.id ?? null;
  }
  return homeId;
}

function bfsAllReachable(startId: string): Set<string> {
  const db = getDatabase();
  const visited = new Set<string>();
  const queue = [startId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    // Spouse families → follow spouses and children
    const spouseFamilies = db.prepare(
      'SELECT id, spouse1_id, spouse2_id FROM families WHERE spouse1_id = ? OR spouse2_id = ?'
    ).all(id, id) as { id: string; spouse1_id: string | null; spouse2_id: string | null }[];

    for (const fam of spouseFamilies) {
      const spouseId = fam.spouse1_id === id ? fam.spouse2_id : fam.spouse1_id;
      if (spouseId && !visited.has(spouseId)) queue.push(spouseId);

      const children = db.prepare(
        'SELECT person_id FROM family_members WHERE family_id = ?'
      ).all(fam.id) as { person_id: string }[];
      for (const c of children) {
        if (!visited.has(c.person_id)) queue.push(c.person_id);
      }
    }

    // Parent families → follow parents and siblings
    const parentFamilies = db.prepare(
      'SELECT family_id FROM family_members WHERE person_id = ?'
    ).all(id) as { family_id: string }[];

    for (const pf of parentFamilies) {
      const fam = db.prepare(
        'SELECT id, spouse1_id, spouse2_id FROM families WHERE id = ?'
      ).get(pf.family_id) as { id: string; spouse1_id: string | null; spouse2_id: string | null } | undefined;
      if (!fam) continue;
      if (fam.spouse1_id && !visited.has(fam.spouse1_id)) queue.push(fam.spouse1_id);
      if (fam.spouse2_id && !visited.has(fam.spouse2_id)) queue.push(fam.spouse2_id);

      const siblings = db.prepare(
        'SELECT person_id FROM family_members WHERE family_id = ?'
      ).all(fam.id) as { person_id: string }[];
      for (const s of siblings) {
        if (!visited.has(s.person_id)) queue.push(s.person_id);
      }
    }
  }

  return visited;
}

function findConnectedComponents(ids: string[]): string[][] {
  const db = getDatabase();
  const pool = new Set(ids);
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const startId of ids) {
    if (visited.has(startId)) continue;

    const component: string[] = [];
    const queue = [startId];

    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      component.push(id);

      const spouseFamilies = db.prepare(
        'SELECT id, spouse1_id, spouse2_id FROM families WHERE spouse1_id = ? OR spouse2_id = ?'
      ).all(id, id) as { id: string; spouse1_id: string | null; spouse2_id: string | null }[];

      for (const fam of spouseFamilies) {
        const spouseId = fam.spouse1_id === id ? fam.spouse2_id : fam.spouse1_id;
        if (spouseId && pool.has(spouseId) && !visited.has(spouseId)) queue.push(spouseId);

        const children = db.prepare(
          'SELECT person_id FROM family_members WHERE family_id = ?'
        ).all(fam.id) as { person_id: string }[];
        for (const c of children) {
          if (pool.has(c.person_id) && !visited.has(c.person_id)) queue.push(c.person_id);
        }
      }

      const parentFamilies = db.prepare(
        'SELECT family_id FROM family_members WHERE person_id = ?'
      ).all(id) as { family_id: string }[];

      for (const pf of parentFamilies) {
        const fam = db.prepare(
          'SELECT id, spouse1_id, spouse2_id FROM families WHERE id = ?'
        ).get(pf.family_id) as { id: string; spouse1_id: string | null; spouse2_id: string | null } | undefined;
        if (!fam) continue;
        if (fam.spouse1_id && pool.has(fam.spouse1_id) && !visited.has(fam.spouse1_id)) queue.push(fam.spouse1_id);
        if (fam.spouse2_id && pool.has(fam.spouse2_id) && !visited.has(fam.spouse2_id)) queue.push(fam.spouse2_id);

        const siblings = db.prepare(
          'SELECT person_id FROM family_members WHERE family_id = ?'
        ).all(fam.id) as { person_id: string }[];
        for (const s of siblings) {
          if (pool.has(s.person_id) && !visited.has(s.person_id)) queue.push(s.person_id);
        }
      }
    }

    components.push(component);
  }

  return components;
}
```

Then add the route **before** `treeRouter.get('/:personId', ...)`:

```typescript
// GET /tree/unconnected-segments — Branches disconnected from the home person's tree
treeRouter.get('/unconnected-segments', (req, res) => {
  try {
    const db = getDatabase();
    const personRepo = new PersonRepository();

    const homePersonId = resolveHomePersonId(req.user!.userId);
    if (!homePersonId) {
      res.json({ segments: [] });
      return;
    }

    // Find every person reachable from the home person (no generation limit)
    const masterSet = bfsAllReachable(homePersonId);

    // All person IDs not in the master set
    const allIds = (db.prepare('SELECT id FROM persons').all() as { id: string }[]).map(r => r.id);
    const disconnectedIds = allIds.filter(id => !masterSet.has(id));

    if (disconnectedIds.length === 0) {
      res.json({ segments: [] });
      return;
    }

    // Group disconnected people into connected components
    const components = findConnectedComponents(disconnectedIds);

    // Sort by component size descending (largest branch first)
    components.sort((a, b) => b.length - a.length);

    // Build a mini-tree for each component
    const segments = components.map(componentIds => {
      // Root = first member with no parents in this component
      const componentSet = new Set(componentIds);
      let rootId = componentIds[0];

      for (const id of componentIds) {
        const parentFamilies = db.prepare(
          'SELECT family_id FROM family_members WHERE person_id = ?'
        ).all(id) as { family_id: string }[];

        const hasParent = parentFamilies.some(pf => {
          const fam = db.prepare(
            'SELECT spouse1_id, spouse2_id FROM families WHERE id = ?'
          ).get(pf.family_id) as { spouse1_id: string | null; spouse2_id: string | null } | undefined;
          return fam && (
            (fam.spouse1_id && componentSet.has(fam.spouse1_id)) ||
            (fam.spouse2_id && componentSet.has(fam.spouse2_id))
          );
        });

        if (!hasParent) {
          rootId = id;
          break;
        }
      }

      const { persons, families } = buildFlatTree(rootId, 20, personRepo);
      return { persons, families };
    });

    res.json({ segments });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get unconnected segments' });
  }
});
```

- [ ] **Step 4: Run all tree tests to verify they pass**

```bash
cd /data/Projects/AFT/backend && npm test -- --reporter=verbose tree.test 2>&1 | tail -30
```

Expected: all tests PASS.

- [ ] **Step 5: TypeScript check**

```bash
cd /data/Projects/AFT/backend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /data/Projects/AFT && git add backend/src/routes/tree.ts backend/src/routes/tree.test.ts
git commit -m "feat: add GET /tree/unconnected-segments endpoint with BFS component detection"
```

---

## Task 3: Frontend — Filter Dropdown, State, and Banner

**Files:**
- Modify: `frontend/src/components/CanvasToolbar/CanvasToolbar.tsx`
- Modify: `frontend/src/components/CanvasToolbar/CanvasToolbar.module.css`
- Modify: `frontend/src/pages/TreePage.tsx`
- Create: `frontend/src/pages/TreePage.module.css`

**Interfaces:**
- Produces: `treeFilter: TreeFilter` state in `TreePage`; `CanvasToolbar` accepts `treeFilter` and `onTreeFilterChange` props

```typescript
type TreeFilter = 'all' | 'unconnected-people' | 'unconnected-trees';
```

- [ ] **Step 1: Write a test for the filter dropdown in CanvasToolbar**

Create `/data/Projects/AFT/frontend/src/components/CanvasToolbar/CanvasToolbar.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/stores/canvasStore', () => ({
  useCanvasStore: vi.fn(() => ({
    zoom: 1, zoomIn: vi.fn(), zoomOut: vi.fn(), resetView: vi.fn(), fitToScreen: vi.fn(),
  })),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/components/Button/Button', () => ({ default: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button> }));

const { default: CanvasToolbar } = await import('./CanvasToolbar');

describe('CanvasToolbar filter dropdown', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the filter select with correct options', () => {
    render(<CanvasToolbar treeFilter="all" onTreeFilterChange={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: /filter tree/i });
    expect(select).toBeDefined();
    expect(screen.getByRole('option', { name: 'All' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'Unconnected People' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'Unconnected Trees' })).toBeDefined();
  });

  it('calls onTreeFilterChange when a new option is selected', () => {
    const onChange = vi.fn();
    render(<CanvasToolbar treeFilter="all" onTreeFilterChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox', { name: /filter tree/i }), {
      target: { value: 'unconnected-people' },
    });
    expect(onChange).toHaveBeenCalledWith('unconnected-people');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /data/Projects/AFT/frontend && npm test -- --reporter=verbose CanvasToolbar.test 2>&1 | tail -15
```

Expected: FAIL — props don't exist yet.

- [ ] **Step 3: Update `CanvasToolbar.tsx` to accept filter props**

Open `/data/Projects/AFT/frontend/src/components/CanvasToolbar/CanvasToolbar.tsx`.

Add the type at the top of the file (after existing imports):

```typescript
type TreeFilter = 'all' | 'unconnected-people' | 'unconnected-trees';
```

Update the props interface:

```typescript
interface CanvasToolbarProps {
  onAddPerson?: () => void;
  treeFilter?: TreeFilter;
  onTreeFilterChange?: (filter: TreeFilter) => void;
}
```

Update the component signature:

```typescript
const CanvasToolbar: React.FC<CanvasToolbarProps> = ({ onAddPerson, treeFilter = 'all', onTreeFilterChange }) => {
```

Add the filter select just before the closing `</div>` of the toolbar (after the last `resetBtn`):

```tsx
      <div className={styles.separator} />

      <select
        className={styles.filterSelect}
        value={treeFilter}
        aria-label="Filter tree"
        onChange={(e) => onTreeFilterChange?.(e.target.value as TreeFilter)}
      >
        <option value="all">All</option>
        <option value="unconnected-people">Unconnected People</option>
        <option value="unconnected-trees">Unconnected Trees</option>
      </select>
```

- [ ] **Step 4: Add CSS for the filter select in `CanvasToolbar.module.css`**

Append to `/data/Projects/AFT/frontend/src/components/CanvasToolbar/CanvasToolbar.module.css`:

```css
.filterSelect {
  height: 28px;
  padding: 0 var(--space-2);
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-md);
  background: var(--color-bg-primary);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: border-color var(--transition-fast), color var(--transition-fast);
}

.filterSelect:hover {
  border-color: var(--color-gray-400);
  color: var(--color-text-primary);
}

.filterSelect:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}
```

- [ ] **Step 5: Add `treeFilter` state and banner to `TreePage.tsx`**

Open `/data/Projects/AFT/frontend/src/pages/TreePage.tsx`.

Add the import at the top:

```typescript
import styles from './TreePage.module.css';
```

Add this type near the top of the component (after the imports, before the component):

```typescript
type TreeFilter = 'all' | 'unconnected-people' | 'unconnected-trees';
```

Inside the component, after `const { refetch } = useTreeData();`, add:

```typescript
const [treeFilter, setTreeFilter] = useState<TreeFilter>('all');
```

Update the `CanvasToolbar` usage in the JSX:

```tsx
<CanvasToolbar
  onAddPerson={openCreateWizard}
  treeFilter={treeFilter}
  onTreeFilterChange={setTreeFilter}
/>
```

Add the banner JSX directly after `<CanvasToolbar .../>`:

```tsx
{treeFilter !== 'all' && (
  <div className={styles.filterBanner}>
    <span className={styles.filterBannerLabel}>
      Showing: {treeFilter === 'unconnected-people' ? 'Unconnected People' : 'Unconnected Trees'}
    </span>
    <button
      className={styles.filterBannerClear}
      onClick={() => setTreeFilter('all')}
    >
      Clear filter
    </button>
  </div>
)}
```

- [ ] **Step 6: Create `TreePage.module.css`**

Create `/data/Projects/AFT/frontend/src/pages/TreePage.module.css`:

```css
.filterBanner {
  position: absolute;
  top: calc(var(--space-3) + 52px); /* below the toolbar */
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  background: var(--color-warning-bg, #fef9c3);
  border: 1px solid var(--color-warning-border, #fde047);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
  z-index: var(--z-sticky);
  white-space: nowrap;
}

.filterBannerLabel {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.filterBannerClear {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-primary);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}

.filterBannerClear:hover {
  opacity: 0.8;
}
```

- [ ] **Step 7: Run the CanvasToolbar test to verify it passes**

```bash
cd /data/Projects/AFT/frontend && npm test -- --reporter=verbose CanvasToolbar.test 2>&1 | tail -15
```

Expected: PASS.

- [ ] **Step 8: TypeScript check**

```bash
cd /data/Projects/AFT/frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
cd /data/Projects/AFT && git add \
  frontend/src/components/CanvasToolbar/CanvasToolbar.tsx \
  frontend/src/components/CanvasToolbar/CanvasToolbar.module.css \
  frontend/src/components/CanvasToolbar/CanvasToolbar.test.tsx \
  frontend/src/pages/TreePage.tsx \
  frontend/src/pages/TreePage.module.css
git commit -m "feat: add tree filter dropdown and active filter banner to TreePage"
```

---

## Task 4: Frontend — Unconnected People Canvas Rendering

**Files:**
- Modify: `frontend/src/pages/TreePage.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/tree/unconnected-people` → `{ people: TreePerson[] }`
- Consumes: `useCanvasStore` actions: `setNodes`, `setFamilies`, `setConnectors`, `setLoading`, `fitToScreen`
- Consumes: `TreeNode` shape from `@/stores/canvasStore`

- [ ] **Step 1: Add the fetch-and-layout logic for unconnected people in `TreePage.tsx`**

Add this import at the top of `TreePage.tsx` (add to existing imports):

```typescript
import type { TreeNode, TreePerson } from '@/stores/canvasStore';
```

Add these store bindings inside the component (after the existing `canvasStore` destructuring):

```typescript
const { setNodes, setFamilies, setConnectors, setLoading, fitToScreen } = useCanvasStore();
```

Add the following `useEffect` inside `TreePage` (after the existing search highlight `useEffect`):

```typescript
useEffect(() => {
  if (treeFilter === 'all') {
    // Normal tree is handled by useTreeData — nothing to do here
    return;
  }

  if (treeFilter === 'unconnected-people') {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/v1/tree/unconnected-people', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json() as { people: TreePerson[] };

        const CARD_W = 260;
        const CARD_H = 180;
        const COLS = 4;
        const GAP_X = 20;
        const GAP_Y = 40;

        const nodes: TreeNode[] = data.people.map((person, i) => ({
          person,
          x: (i % COLS) * (CARD_W + GAP_X),
          y: Math.floor(i / COLS) * (CARD_H + GAP_Y),
          generation: 0,
        }));

        setNodes(nodes);
        setFamilies([]);
        setConnectors([]);
        fitToScreen(window.innerWidth, window.innerHeight);
      } catch {
        setNodes([]);
        setFamilies([]);
        setConnectors([]);
      } finally {
        setLoading(false);
      }
    })();
  }
}, [treeFilter, setNodes, setFamilies, setConnectors, setLoading, fitToScreen]);
```

- [ ] **Step 2: Restore the normal tree when filter is reset to 'all'**

In `TreePage.tsx`, update the `useEffect` for `treeFilter` to call `refetch()` when filter returns to 'all':

```typescript
useEffect(() => {
  if (treeFilter === 'all') {
    void refetch();
    return;
  }
  // ... rest of existing filter logic
```

> **Note:** The `refetch` function comes from `const { refetch } = useTreeData();` already in the component.

- [ ] **Step 3: TypeScript check**

```bash
cd /data/Projects/AFT/frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /data/Projects/AFT && git add frontend/src/pages/TreePage.tsx
git commit -m "feat: render unconnected people as floating grid on tree canvas"
```

---

## Task 5: Frontend — Unconnected Trees Canvas Rendering

**Files:**
- Modify: `frontend/src/pages/TreePage.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/tree/unconnected-segments` → `{ segments: Array<{ persons: TreePerson[], families: TreeFamily[] }> }`
- Consumes: `layoutTree({ persons, families, rootPersonId })` → `{ nodes, connectors }`
- Consumes: `TreeNode`, `TreeFamily`, `ConnectorLine` from `@/stores/canvasStore`

- [ ] **Step 1: Add import for `layoutTree` and `ConnectorLine` if not already present**

In `TreePage.tsx`, ensure these imports exist at the top:

```typescript
import { layoutTree } from '@/utils/treeLayout';
import type { TreeNode, TreePerson, TreeFamily, ConnectorLine } from '@/stores/canvasStore';
```

- [ ] **Step 2: Add the unconnected-trees branch to the filter `useEffect`**

In the `useEffect` from Task 4, add the `unconnected-trees` branch alongside the `unconnected-people` branch:

```typescript
  if (treeFilter === 'unconnected-trees') {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/v1/tree/unconnected-segments', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json() as { segments: Array<{ persons: TreePerson[]; families: TreeFamily[] }> };

        if (data.segments.length === 0) {
          setNodes([]);
          setFamilies([]);
          setConnectors([]);
          setLoading(false);
          return;
        }

        const CARD_W = 260;
        const SEG_GAP = 120;

        let xOffset = 0;
        const allNodes: TreeNode[] = [];
        const allFamilies: TreeFamily[] = [];
        const allConnectors: ConnectorLine[] = [];

        for (const segment of data.segments) {
          const rootId = segment.persons[0]?.id ?? null;
          const { nodes, connectors } = layoutTree({
            persons: segment.persons,
            families: segment.families,
            rootPersonId: rootId,
          });

          // Segment bounding width
          const maxX = nodes.reduce((m, n) => Math.max(m, n.x), 0);
          const segW = maxX + CARD_W;

          // Offset all nodes and connectors horizontally
          const shiftedNodes = nodes.map(n => ({ ...n, x: n.x + xOffset }));
          const shiftedConnectors = connectors.map(c => ({
            ...c,
            from: { ...c.from, x: c.from.x + xOffset },
            to: { ...c.to, x: c.to.x + xOffset },
            midPoint: c.midPoint ? { ...c.midPoint, x: c.midPoint.x + xOffset } : undefined,
          }));

          allNodes.push(...shiftedNodes);
          allFamilies.push(...segment.families);
          allConnectors.push(...shiftedConnectors);

          xOffset += segW + SEG_GAP;
        }

        setNodes(allNodes);
        setFamilies(allFamilies);
        setConnectors(allConnectors);
        fitToScreen(window.innerWidth, window.innerHeight);
      } catch {
        setNodes([]);
        setFamilies([]);
        setConnectors([]);
      } finally {
        setLoading(false);
      }
    })();
  }
```

- [ ] **Step 3: Add an empty-state message for zero results**

In the TreePage JSX, after the banner, add an empty-state overlay that appears when the filter is active but the canvas has no nodes:

```tsx
{treeFilter !== 'all' && nodes.length === 0 && !isLoading && (
  <div className={styles.emptyState}>
    {treeFilter === 'unconnected-people'
      ? 'No unconnected people found.'
      : 'No unconnected branches found — everyone is connected to the home person.'}
  </div>
)}
```

Add `nodes` and `isLoading` to the canvasStore destructure at the top of the component:

```typescript
const { nodes, isLoading, setNodes, setFamilies, setConnectors, setLoading, fitToScreen } = useCanvasStore();
```

Add the empty state CSS to `TreePage.module.css`:

```css
.emptyState {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: var(--font-size-md);
  color: var(--color-text-secondary);
  text-align: center;
  pointer-events: none;
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd /data/Projects/AFT/frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Run all frontend tests to verify no regressions**

```bash
cd /data/Projects/AFT/frontend && npm test 2>&1 | tail -15
```

Expected: all existing tests pass (1 new CanvasToolbar test also passes).

- [ ] **Step 6: Commit**

```bash
cd /data/Projects/AFT && git add frontend/src/pages/TreePage.tsx frontend/src/pages/TreePage.module.css
git commit -m "feat: render unconnected tree segments as separate mini-trees on canvas"
```

---

## Task 6: Build and Deploy

- [ ] **Step 1: Rebuild Docker image**

```bash
cd /data/Projects/AFT && docker build -t neuman1812/apex_family_tree:latest . 2>&1 | tail -8
```

Expected: build completes without errors.

- [ ] **Step 2: Force-recreate the container**

```bash
cd /data/DockerConfigs && docker compose up --force-recreate -d aft 2>&1
```

Expected: container recreated and started.

- [ ] **Step 3: Smoke test**

Navigate to the Tree page in the browser. Verify:

- The filter dropdown appears in the toolbar
- Selecting "Unconnected People" replaces the canvas with floating cards (or shows "No unconnected people found")
- Selecting "Unconnected Trees" shows disconnected branches as separate mini-trees (or shows "No unconnected branches found")
- The banner appears with the active filter name and "Clear filter" button
- Clicking "Clear filter" restores the normal home-person tree
- Selecting "All" also restores the normal tree

---

## Self-Review

**Spec coverage check:**
- ✅ Filter dropdown in tree controls — Task 3
- ✅ "Unconnected People" replaces canvas with floating cards — Task 4
- ✅ "Unconnected Trees" shows disconnected branches as separate mini-trees — Task 5
- ✅ Multiple disconnected segments shown separately — Task 5 (xOffset loop)
- ✅ Clear filter button in banner — Task 3
- ✅ Selecting "All" resets to normal tree — Tasks 3 & 4
- ✅ Backend BFS from home person — Task 2 `bfsAllReachable`
- ✅ Component detection within disconnected set — Task 2 `findConnectedComponents`
- ✅ Largest segment first — Task 2 `components.sort((a, b) => b.length - a.length)`
- ✅ Empty state when no results — Task 5 Step 3
- ✅ `fitToScreen` called after filtered layout — Tasks 4 & 5

**Route ordering note:** Both new routes (`/unconnected-people`, `/unconnected-segments`) must be registered **before** `treeRouter.get('/:personId', ...)` to avoid being captured as a personId param. Task 1 Step 3 explicitly notes this.
