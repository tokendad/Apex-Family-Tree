# Surface Entity Editors into UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire PersonEditor, FamilyEditor, and PersonPicker into the four reachable UI entry points so users can create people and families directly from the app.

**Architecture:** Four targeted page edits — no new components, no new routes. Each page calls `useModal` (already in `@/components/modals/useModal`) and handles the resolved `ModalResult<T>` to navigate or refresh.

**Tech Stack:** React 18, TypeScript, Vitest + @testing-library/react, React Router v6, Zustand 5, CSS Modules.

## Global Constraints

- Branch: `feat/entity-editor-picker-modal-system` — all commits go here.
- No new npm packages.
- No CSS-in-JS — all styles via CSS Modules and `var(--token)` design tokens.
- No react-hook-form — use plain controlled inputs.
- All tests run with `npm test` from `frontend/`. Test environment: jsdom (vitest.config.ts).
- Test setup file: `frontend/src/test/setup.ts` (imports `@testing-library/jest-dom`).
- Path alias `@/` maps to `frontend/src/`.
- `useModal` import: `import { useModal } from '@/components/modals/useModal'`
- `PersonSummary` / `FamilySummary` types: `import type { PersonSummary, FamilySummary } from '@/types/genealogy'`
- `PersonPicker` import: `import PersonPicker from '@/components/entity-pickers/PersonPicker'`
- `PersonResult` type (same shape as PersonSummary): `import type { PersonResult } from '@/components/PersonSearch/PersonSearch'`
- `ModalResult<T>` type: `import type { ModalResult } from '@/components/modals/modalTypes'`

---

### Task 1: PeoplePage — "Add Person" opens PersonEditor modal

**Files:**
- Modify: `frontend/src/pages/PeoplePage.tsx`
- Create: `frontend/src/pages/PeoplePage.test.tsx`

**Interfaces:**
- Consumes: `useModal()` → `openModal<PersonSummary>('PersonEditor', { mode: 'create' })`
- Consumes: `useNavigate()` from `react-router-dom`
- Produces: nothing (terminal change for this page)

**Context:**  
`PeoplePage` currently has: `<Button variant="primary" size="sm" onClick={() => navigate('/people/new')}>+ Add Person</Button>` (line ~160). Replace `navigate('/people/new')` with a modal call. The `useModal` hook is called at the top of the component.

---

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/PeoplePage.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import PeoplePage from './PeoplePage';

// Mock heavy dependencies not under test
vi.mock('@/components/AppShell/AppShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/Navbar/Navbar', () => ({ default: () => null }));
vi.mock('@/components/Sidebar/Sidebar', () => ({ default: () => null }));
vi.mock('@/components/Avatar/Avatar', () => ({
  default: ({ name }: { name: string }) => <span>{name}</span>,
}));

// Mock permissions — canCreate = true so the button renders
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canCreate: true }),
}));

// Mock searchStore
vi.mock('@/stores/searchStore', () => ({
  useSearchStore: Object.assign(
    vi.fn(() => ({ globalQuery: '', setTotalCount: vi.fn() })),
    { getState: () => ({ globalQuery: '' }) }
  ),
  hasActiveFilters: () => false,
  filtersToParams: () => new URLSearchParams(),
}));

// Mock fetch to return an empty list
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ people: [], next_cursor: null, total_count: 0 }),
  });
});

// Capture the openModal mock so tests can resolve it
const mockOpenModal = vi.fn();
vi.mock('@/components/modals/useModal', () => ({
  useModal: () => ({ openModal: mockOpenModal }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('PeoplePage — Add Person', () => {
  it('opens PersonEditor modal instead of navigating to /people/new', async () => {
    mockOpenModal.mockResolvedValue({ action: 'cancelled' });
    render(<PeoplePage />, { wrapper: MemoryRouter });

    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /add person/i }));
    expect(mockOpenModal).toHaveBeenCalledWith('PersonEditor', { mode: 'create' });
    expect(mockNavigate).not.toHaveBeenCalledWith('/people/new');
  });

  it('navigates to person detail on created result', async () => {
    mockOpenModal.mockResolvedValue({
      action: 'created',
      entityType: 'person',
      entity: {
        id: 'p-123',
        given_name: 'Ada',
        surname: 'Lovelace',
        birth_date: null,
        death_date: null,
        photo_url: null,
      },
    });
    render(<PeoplePage />, { wrapper: MemoryRouter });

    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /add person/i }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/people/p-123'));
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /data/Projects/AFT/frontend && npm test -- --run src/pages/PeoplePage.test.tsx
```

Expected: FAIL — "navigates to /people/new" or openModal not called.

- [ ] **Step 3: Implement the change in PeoplePage.tsx**

At the top of `PeoplePage`, add the import and hook call:

```tsx
// Add after existing imports
import { useModal } from '@/components/modals/useModal';
import type { PersonSummary } from '@/types/genealogy';
```

Inside `PeoplePage` component, add the hook call alongside `useNavigate`:

```tsx
const { openModal } = useModal();
```

Replace the Add Person button's `onClick`:

```tsx
// Before:
onClick={() => navigate('/people/new')}

// After:
onClick={async () => {
  const result = await openModal<PersonSummary>('PersonEditor', { mode: 'create' });
  if (result.action === 'created') {
    navigate(`/people/${result.entity.id}`);
  }
}}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /data/Projects/AFT/frontend && npm test -- --run src/pages/PeoplePage.test.tsx
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /data/Projects/AFT && git add frontend/src/pages/PeoplePage.tsx frontend/src/pages/PeoplePage.test.tsx
git commit -m "feat: open PersonEditor modal from PeoplePage Add Person button"
```

---

### Task 2: FamiliesPage — "Add Family" opens FamilyEditor modal

**Files:**
- Modify: `frontend/src/pages/FamiliesPage.tsx`
- Create: `frontend/src/pages/FamiliesPage.test.tsx`

**Interfaces:**
- Consumes: `useModal()` → `openModal<FamilySummary>('FamilyEditor', { mode: 'create' })`
- Consumes: `useNavigate()` from `react-router-dom`
- Produces: nothing (terminal change for this page)

**Context:**  
`FamiliesPage` currently has: `<Button variant="primary" size="sm" onClick={() => navigate('/families/new')}>+ Add Family</Button>` (line ~160). Replace the navigate call.

---

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/FamiliesPage.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import FamiliesPage from './FamiliesPage';

vi.mock('@/components/AppShell/AppShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/Navbar/Navbar', () => ({ default: () => null }));
vi.mock('@/components/Sidebar/Sidebar', () => ({ default: () => null }));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canCreate: true }),
}));

vi.mock('@/stores/searchStore', () => ({
  useSearchStore: Object.assign(
    vi.fn(() => ({ globalQuery: '' })),
    { getState: () => ({ globalQuery: '' }) }
  ),
}));

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ families: [], next_cursor: null }),
  });
});

const mockOpenModal = vi.fn();
vi.mock('@/components/modals/useModal', () => ({
  useModal: () => ({ openModal: mockOpenModal }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('FamiliesPage — Add Family', () => {
  it('opens FamilyEditor modal instead of navigating to /families/new', async () => {
    mockOpenModal.mockResolvedValue({ action: 'cancelled' });
    render(<FamiliesPage />, { wrapper: MemoryRouter });

    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /add family/i }));
    expect(mockOpenModal).toHaveBeenCalledWith('FamilyEditor', { mode: 'create' });
    expect(mockNavigate).not.toHaveBeenCalledWith('/families/new');
  });

  it('navigates to family detail on created result', async () => {
    mockOpenModal.mockResolvedValue({
      action: 'created',
      entityType: 'family',
      entity: {
        id: 'f-456',
        spouse1_id: null,
        spouse2_id: null,
        spouse1: null,
        spouse2: null,
        marriage_date: null,
        marriage_place: null,
      },
    });
    render(<FamiliesPage />, { wrapper: MemoryRouter });

    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /add family/i }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/families/f-456'));
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /data/Projects/AFT/frontend && npm test -- --run src/pages/FamiliesPage.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement the change in FamiliesPage.tsx**

Add imports at top of file:

```tsx
import { useModal } from '@/components/modals/useModal';
import type { FamilySummary } from '@/types/genealogy';
```

Inside `FamiliesPage` component, alongside `useNavigate`:

```tsx
const { openModal } = useModal();
```

Replace the Add Family button's `onClick`:

```tsx
// Before:
onClick={() => navigate('/families/new')}

// After:
onClick={async () => {
  const result = await openModal<FamilySummary>('FamilyEditor', { mode: 'create' });
  if (result.action === 'created') {
    navigate(`/families/${result.entity.id}`);
  }
}}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /data/Projects/AFT/frontend && npm test -- --run src/pages/FamiliesPage.test.tsx
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /data/Projects/AFT && git add frontend/src/pages/FamiliesPage.tsx frontend/src/pages/FamiliesPage.test.tsx
git commit -m "feat: open FamilyEditor modal from FamiliesPage Add Family button"
```

---

### Task 3: FamilyDetailPage — assign spouse via PersonPicker

**Files:**
- Modify: `frontend/src/pages/FamilyDetailPage.tsx`
- Create: `frontend/src/pages/FamilyDetailPage.test.tsx`

**Interfaces:**
- Consumes: `PersonPicker` from `@/components/entity-pickers/PersonPicker`
- Consumes: `PersonResult` from `@/components/PersonSearch/PersonSearch`
- Consumes: `canEdit` from `usePermissions()`
- Consumes: `PUT /api/v1/families/:id` — accepts `{ spouse1_id?: string | null, spouse2_id?: string | null, ... }` in body
- Produces: nothing (terminal change)

**Context:**  
`SpouseCard` is a sub-component inside `FamilyDetailPage.tsx`. It currently renders a link when person is present, or "Not recorded" text when null. We add two new props: `canEdit: boolean` and `onAssign: (personId: string) => Promise<void>`. When `person` is null and `canEdit` is true, render a `PersonPicker` instead of "Not recorded".

The `FamilyDetailPage` component already has `fetchFamily` and `id` in scope. Add a `handleAssignSpouse` async function that calls `PUT /api/v1/families/:id` with the updated spouse field, then calls `fetchFamily()`.

`PersonPicker` prop `onSelect` receives `PersonResult` (shape: `{ id, given_name, surname, birth_date, death_date, photo_url }`).

---

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/FamilyDetailPage.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import FamilyDetailPage from './FamilyDetailPage';

vi.mock('@/components/AppShell/AppShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/Navbar/Navbar', () => ({ default: () => null }));
vi.mock('@/components/Sidebar/Sidebar', () => ({ default: () => null }));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canEdit: true, canDelete: false }),
}));

// PersonPicker: just a stub that immediately calls onSelect with a fake person
vi.mock('@/components/entity-pickers/PersonPicker', () => ({
  default: ({
    label,
    onSelect,
  }: {
    label?: string;
    onSelect: (p: { id: string; given_name: string | null; surname: string | null; birth_date: string | null; death_date: string | null; photo_url: string | null }) => void;
  }) => (
    <button
      type="button"
      data-testid={`pick-${label?.toLowerCase().replace(/\s/g, '-')}`}
      onClick={() =>
        onSelect({
          id: 'p-999',
          given_name: 'Mary',
          surname: 'Smith',
          birth_date: null,
          death_date: null,
          photo_url: null,
        })
      }
    >
      {label ?? 'Pick person'}
    </button>
  ),
}));

const familyWithNoSpouse1 = {
  id: 'f-1',
  spouse1_id: null,
  spouse2_id: 's2',
  spouse1: null,
  spouse2: { id: 's2', given_name: 'John', surname: 'Doe' },
  marriage_date: null,
  marriage_place: null,
  divorce_date: null,
  divorce_place: null,
  children: [],
};

describe('FamilyDetailPage — spouse assignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows PersonPicker for empty spouse1 slot when canEdit', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => familyWithNoSpouse1,
    });

    render(
      <MemoryRouter initialEntries={['/families/f-1']}>
        <Routes>
          <Route path="/families/:id" element={<FamilyDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
    expect(screen.getByTestId('pick-spouse-1')).toBeInTheDocument();
  });

  it('calls PUT /api/v1/families/:id with spouse1_id on selection', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      callCount += 1;
      if (callCount === 1) {
        // Initial GET
        return Promise.resolve({
          ok: true,
          json: async () => familyWithNoSpouse1,
        });
      }
      if ((options?.method ?? 'GET') === 'PUT') {
        // PUT to assign spouse
        const body = JSON.parse(options?.body as string);
        expect(body.spouse1_id).toBe('p-999');
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ...familyWithNoSpouse1,
            spouse1_id: 'p-999',
            spouse1: { id: 'p-999', given_name: 'Mary', surname: 'Smith' },
          }),
        });
      }
      // Re-fetch after assign
      return Promise.resolve({
        ok: true,
        json: async () => ({
          ...familyWithNoSpouse1,
          spouse1_id: 'p-999',
          spouse1: { id: 'p-999', given_name: 'Mary', surname: 'Smith' },
        }),
      });
    });

    render(
      <MemoryRouter initialEntries={['/families/f-1']}>
        <Routes>
          <Route path="/families/:id" element={<FamilyDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByTestId('pick-spouse-1')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('pick-spouse-1'));

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const putCall = calls.find(
        (c: [string, RequestInit?]) => (c[1]?.method ?? 'GET') === 'PUT'
      );
      expect(putCall).toBeTruthy();
      expect(JSON.parse(putCall![1]!.body as string).spouse1_id).toBe('p-999');
    });
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /data/Projects/AFT/frontend && npm test -- --run src/pages/FamilyDetailPage.test.tsx
```

Expected: FAIL — PersonPicker not rendered in empty spouse slot.

- [ ] **Step 3: Implement the change in FamilyDetailPage.tsx**

**3a.** Add import at top of file:

```tsx
import PersonPicker from '@/components/entity-pickers/PersonPicker';
import type { PersonResult } from '@/components/PersonSearch/PersonSearch';
```

**3b.** Update `SpouseCardProps` interface to add the two new props:

```tsx
interface SpouseCardProps {
  person: PersonSummary | null;
  label: string;
  canEdit?: boolean;
  onAssign?: (personId: string) => Promise<void>;
}
```

**3c.** Update the `SpouseCard` component body. Replace the current "empty" branch:

```tsx
const SpouseCard: React.FC<SpouseCardProps> = ({ person, label, canEdit, onAssign }) => {
  if (!person) {
    if (canEdit && onAssign) {
      return (
        <div className={`${styles.spouseCard} ${styles.spouseCardEmpty}`}>
          <span className={styles.spouseLabel}>{label}</span>
          <PersonPicker
            onSelect={(p: PersonResult) => void onAssign(p.id)}
          />
        </div>
      );
    }
    return (
      <div className={`${styles.spouseCard} ${styles.spouseCardEmpty}`}>
        <span className={styles.spouseLabel}>{label}</span>
        <span className={styles.noSpouse}>Not recorded</span>
      </div>
    );
  }
  return (
    <Link to={`/people/${person.id}`} className={`${styles.spouseCard} ${styles.spouseCardLink}`}>
      <span className={styles.spouseLabel}>{label}</span>
      <span className={styles.spouseName}>{personName(person)}</span>
      <span className={styles.spouseArrow} aria-hidden="true">→</span>
    </Link>
  );
};
```

**3d.** Add `handleAssignSpouse` function inside `FamilyDetailPage` component body, after `fetchFamily` is defined:

```tsx
const handleAssignSpouse = async (slot: 'spouse1' | 'spouse2', personId: string) => {
  if (!id) return;
  try {
    const res = await fetch(`/api/v1/families/${id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [slot === 'spouse1' ? 'spouse1_id' : 'spouse2_id']: personId }),
    });
    if (!res.ok) {
      const errData: { message?: string } = await res.json().catch(() => ({}));
      setError(errData.message ?? `Failed to assign spouse (${res.status})`);
      return;
    }
    await fetchFamily();
  } catch {
    setError('Failed to assign spouse');
  }
};
```

**3e.** Find the SpouseCard render calls inside FamilyDetailPage (around line 378) and pass the new props:

```tsx
// Before:
<SpouseCard person={family.spouse1} label="Spouse 1" />
...
<SpouseCard person={family.spouse2} label="Spouse 2" />

// After:
<SpouseCard
  person={family.spouse1}
  label="Spouse 1"
  canEdit={canEdit}
  onAssign={(pid) => handleAssignSpouse('spouse1', pid)}
/>
...
<SpouseCard
  person={family.spouse2}
  label="Spouse 2"
  canEdit={canEdit}
  onAssign={(pid) => handleAssignSpouse('spouse2', pid)}
/>
```

Note: `canEdit` is already destructured from `usePermissions()` at the top of `FamilyDetailPage`.

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /data/Projects/AFT/frontend && npm test -- --run src/pages/FamilyDetailPage.test.tsx
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /data/Projects/AFT && git add frontend/src/pages/FamilyDetailPage.tsx frontend/src/pages/FamilyDetailPage.test.tsx
git commit -m "feat: assign spouse via PersonPicker on FamilyDetailPage"
```

---

### Task 4: PersonDetailPage — "Add Family" button in relationships section

**Files:**
- Modify: `frontend/src/pages/PersonDetailPage.tsx`
- Create: `frontend/src/pages/PersonDetailPage.test.tsx`

**Interfaces:**
- Consumes: `useModal()` → `openModal<FamilySummary>('FamilyEditor', { mode: 'create', defaults: { spouse1_id: id } })`
- Consumes: `canCreate` from `usePermissions()`
- Consumes: `useNavigate()` from `react-router-dom`
- Produces: nothing (terminal change)

**Context:**  
`PersonDetailPage` currently destructures `{ canEdit, canDelete }` from `usePermissions()`. Add `canCreate`. The relationships `<section>` starts around line 604 with `aria-labelledby="relationships-heading"`. Place the `+ Add Family` button in the section header row, visible when `canCreate` is true.

The current person's id is available as `id` from `const { id } = useParams<{ id: string }>()`.

---

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/PersonDetailPage.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PersonDetailPage from './PersonDetailPage';

vi.mock('@/components/AppShell/AppShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/Navbar/Navbar', () => ({ default: () => null }));
vi.mock('@/components/Sidebar/Sidebar', () => ({ default: () => null }));
vi.mock('@/components/Avatar/Avatar', () => ({
  default: ({ name }: { name: string }) => <span>{name}</span>,
}));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canCreate: true, canEdit: false, canDelete: false }),
}));

// Minimal person fixture
const stubPerson = {
  id: 'per-1',
  sex: 'F',
  is_living: 0,
  is_private: 0,
  birth_date: null,
  birth_place: null,
  death_date: null,
  death_place: null,
  photo_url: null,
  names: [{ given_name: 'Jane', surname: 'Doe', name_type: 'birth', is_primary: 1 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/relationships')) {
      return Promise.resolve({ ok: true, json: async () => [] });
    }
    if (url.includes('/media')) {
      return Promise.resolve({ ok: true, json: async () => ({ media: [] }) });
    }
    if (url.includes('/sources')) {
      return Promise.resolve({ ok: true, json: async () => ({ sources: [] }) });
    }
    return Promise.resolve({ ok: true, json: async () => stubPerson });
  });
});

const mockOpenModal = vi.fn();
vi.mock('@/components/modals/useModal', () => ({
  useModal: () => ({ openModal: mockOpenModal }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/people/per-1']}>
      <Routes>
        <Route path="/people/:id" element={<PersonDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PersonDetailPage — Add Family', () => {
  it('renders Add Family button in relationships section', async () => {
    mockOpenModal.mockResolvedValue({ action: 'cancelled' });
    renderPage();

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /add family/i })).toBeInTheDocument();
  });

  it('opens FamilyEditor pre-populated with current person as spouse1', async () => {
    mockOpenModal.mockResolvedValue({ action: 'cancelled' });
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: /add family/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /add family/i }));
    expect(mockOpenModal).toHaveBeenCalledWith('FamilyEditor', {
      mode: 'create',
      defaults: { spouse1_id: 'per-1' },
    });
  });

  it('navigates to new family on created result', async () => {
    mockOpenModal.mockResolvedValue({
      action: 'created',
      entityType: 'family',
      entity: {
        id: 'f-789',
        spouse1_id: 'per-1',
        spouse2_id: null,
        spouse1: null,
        spouse2: null,
        marriage_date: null,
        marriage_place: null,
      },
    });
    renderPage();

    await waitFor(() => expect(screen.getByRole('button', { name: /add family/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /add family/i }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/families/f-789'));
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /data/Projects/AFT/frontend && npm test -- --run src/pages/PersonDetailPage.test.tsx
```

Expected: FAIL — "Add Family" button not found.

- [ ] **Step 3: Implement the change in PersonDetailPage.tsx**

**3a.** Add imports at top of file:

```tsx
import { useModal } from '@/components/modals/useModal';
import type { FamilySummary } from '@/types/genealogy';
```

**3b.** Add `canCreate` to the existing `usePermissions()` destructure (around line 218):

```tsx
// Before:
const { canEdit, canDelete } = usePermissions();

// After:
const { canCreate, canEdit, canDelete } = usePermissions();
```

**3c.** Add `openModal` call alongside `useNavigate` at the top of the component:

```tsx
const { openModal } = useModal();
```

**3d.** In the JSX, find the relationships `<section>` header (around line 604):

```tsx
// Before:
<h2 className={styles.sectionTitle} id="relationships-heading">
  Relationships
</h2>

// After:
<div className={styles.sectionHeader}>
  <h2 className={styles.sectionTitle} id="relationships-heading">
    Relationships
  </h2>
  {canCreate && (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        const result = await openModal<FamilySummary>('FamilyEditor', {
          mode: 'create',
          defaults: { spouse1_id: id },
        });
        if (result.action === 'created') {
          navigate(`/families/${result.entity.id}`);
        }
      }}
    >
      + Add Family
    </Button>
  )}
</div>
```

**3e.** Add the `sectionHeader` CSS class to `PersonDetailPage.module.css`. Check the file first with `grep -n "sectionTitle" frontend/src/pages/PersonDetailPage.module.css` — if `.sectionTitle` already exists, add `.sectionHeader` alongside it:

```css
.sectionHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /data/Projects/AFT/frontend && npm test -- --run src/pages/PersonDetailPage.test.tsx
```

Expected: 3 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
cd /data/Projects/AFT/frontend && npm test -- --run
```

Expected: all tests PASS (35 pre-existing + 9 new = 44 total).

- [ ] **Step 6: Commit**

```bash
cd /data/Projects/AFT && git add frontend/src/pages/PersonDetailPage.tsx frontend/src/pages/PersonDetailPage.module.css frontend/src/pages/PersonDetailPage.test.tsx
git commit -m "feat: add Add Family button to PersonDetailPage relationships section"
```
