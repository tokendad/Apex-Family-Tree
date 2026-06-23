# Entity Editor & Picker Modal System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable ModalManager + PersonPicker + PersonEditor + FamilyEditor system so any form in the app can search for, select, or inline-create genealogy records without breaking the user's current workflow.

**Architecture:** A Zustand modal stack drives a single `ModalManager` portal that renders registered editor components. Editors communicate results back to callers via a typed `ModalResult<T>` Promise — no direct component imports between editors. `PersonPicker` wraps the existing `PersonSearch` component and delegates "Create New" flows to `PersonEditor` through the manager.

**Tech Stack:** React 18, TypeScript, Zustand 5, CSS Modules, Vitest + @testing-library/react, existing backend REST API at `/api/v1/`.

## Architecture Decision Records

### ADR-001: Modal State Management — Zustand

**Decision:** Use Zustand (`modalStore.ts`) to manage the modal stack.

**Justification:** Zustand is already the project's state manager (see `canvasStore.ts`). Adding a second Zustand store avoids introducing React Context complexity and keeps the stack readable from any component without prop drilling.

**Rejected alternatives:**
- React Context: requires wrapping `App` in another provider; teardown on unmount is error-prone with async Promises.
- Redux: no Redux in the project; overkill.

### ADR-002: Draft Persistence — In-Memory Only (MVP)

**Decision:** Editor form state lives only in local React state. No localStorage or server-side drafts in this phase.

**Justification:** Genealogy inline-create flows are short (< 2 minutes). Persisting drafts adds error surface without measurable user benefit at MVP stage. Phase 9 (UX Polish) can add localStorage draft saving.

**Consequence:** Navigating away from an in-progress PersonEditor will discard the draft. An "Unsaved changes?" guard is out of scope here.

### ADR-003: Partner Model — spouse1_id / spouse2_id

**Decision:** Family records keep `spouse1_id` and `spouse2_id` as defined in the existing database schema and `backend/src/types/db.ts`.

**Consequence:** Serial marriages (one person in multiple families) work correctly — each marriage is a separate Family record. The two-slot model does not constrain gender. Adding a third-partner slot is a future schema migration.

### ADR-004: PersonPicker API — No relationshipContext Prop

**Decision:** `PersonPicker` accepts only `label`, `value`, `defaultSearch`, `onSelect`, and `onClear`. It does not receive a `relationshipContext` prop.

**Justification:** The plan document's UX section says "keep pickers generic." A `relationshipContext` prop would leak caller knowledge into the picker and create special-casing. The caller decides what to do with the returned person; the picker only finds people.

---

## Global Constraints

- Path alias `@/` resolves to `frontend/src/` in all imports.
- CSS Modules only — no inline styles beyond `style={{ zIndex: ... }}` for dynamic stack layering.
- All design token values come from `frontend/src/styles/tokens.css` CSS custom properties (e.g., `var(--color-primary-600)`).
- Every new component must be accessible: `role="dialog"`, `aria-modal`, `aria-labelledby`, focus trap via existing `FocusTrap` component.
- Tests: Vitest + `@testing-library/react` + `@testing-library/jest-dom`. Colocate tests next to source as `*.test.tsx`.
- API calls use `fetch` with `credentials: 'include'` (existing pattern).
- Project name in UI copy: "Apex Family Tree" (never "TreeRoots").

---

## File Map

```
frontend/src/
  types/
    genealogy.ts                          [CREATE] Frontend entity summary types
  utils/
    entityDisplay.ts                      [CREATE] getPersonDisplayName, getPersonDates, getFamilyDisplayName
    entityDisplay.test.ts                 [CREATE] Unit tests for display helpers
  components/
    modals/
      modalTypes.ts                       [CREATE] ModalResult<T>, ModalConfig, ModalEditorProps
      modalStore.ts                       [CREATE] Zustand stack store
      useModal.ts                         [CREATE] openModal<T>() hook
      ModalManager.tsx                    [CREATE] Portal renderer + component registry
      ModalManager.module.css             [CREATE] Backdrop + layer styles
      ModalManager.test.tsx               [CREATE] Stack render + Escape key + backdrop click
      ModalHost.tsx                       [CREATE] Thin wrapper that renders ModalManager
    entity-pickers/
      PersonPicker.tsx                    [CREATE] Search + select + "Create New" button
      PersonPicker.module.css             [CREATE]
      PersonPicker.test.tsx               [CREATE]
    entity-editors/
      PersonEditor.tsx                    [CREATE] Inline create/edit modal (minimal fields)
      PersonEditor.module.css             [CREATE]
      PersonEditor.test.tsx               [CREATE]
      FamilyEditor.tsx                    [CREATE] Spouse1 + Spouse2 PersonPickers + marriage date
      FamilyEditor.module.css             [CREATE]
      FamilyEditor.test.tsx               [CREATE]
  App.tsx                                 [MODIFY] Add <ModalHost /> inside AuthProvider
```

---

## Task 1: Frontend Genealogy Types + Modal Types

**Files:**
- Create: `frontend/src/types/genealogy.ts`
- Create: `frontend/src/components/modals/modalTypes.ts`
- Test: `frontend/src/types/genealogy.test.ts`

**Interfaces:**
- Produces: `PersonSummary`, `FamilySummary` (used by Tasks 4–8)
- Produces: `ModalResult<T>`, `ModalConfig`, `ModalEditorProps` (used by Tasks 3–8)

- [ ] **Step 1: Write the type tests (they compile-check the shapes)**

Create `frontend/src/types/genealogy.test.ts`:

```ts
import { describe, it, expectTypeOf } from 'vitest';
import type { PersonSummary, FamilySummary } from './genealogy';

describe('PersonSummary', () => {
  it('has required id and nullable name fields', () => {
    expectTypeOf<PersonSummary>().toHaveProperty('id');
    expectTypeOf<PersonSummary['given_name']>().toEqualTypeOf<string | null>();
    expectTypeOf<PersonSummary['surname']>().toEqualTypeOf<string | null>();
  });
});

describe('FamilySummary', () => {
  it('has nullable spouse ids and optional spouse objects', () => {
    expectTypeOf<FamilySummary['spouse1_id']>().toEqualTypeOf<string | null>();
    expectTypeOf<FamilySummary['spouse1']>().toEqualTypeOf<PersonSummary | null>();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails (type file missing)**

```bash
cd frontend && npx vitest run src/types/genealogy.test.ts
```

Expected: error — `Cannot find module './genealogy'`

- [ ] **Step 3: Create `frontend/src/types/genealogy.ts`**

```ts
export interface PersonSummary {
  id: string;
  given_name: string | null;
  surname: string | null;
  birth_date: string | null;
  death_date: string | null;
  photo_url: string | null;
}

export interface FamilySummary {
  id: string;
  spouse1_id: string | null;
  spouse2_id: string | null;
  spouse1: PersonSummary | null;
  spouse2: PersonSummary | null;
  marriage_date: string | null;
  marriage_place: string | null;
}
```

- [ ] **Step 4: Create `frontend/src/components/modals/modalTypes.ts`**

```ts
export type ModalResult<T> =
  | { action: 'created' | 'updated' | 'selected'; entityType: string; entity: T }
  | { action: 'cancelled' };

export interface ModalConfig {
  id: string;
  component: string;
  props: Record<string, unknown>;
  resolve: (result: ModalResult<unknown>) => void;
}

export interface ModalEditorProps {
  modalId: string;
  onClose: (result: ModalResult<unknown>) => void;
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/types/genealogy.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/genealogy.ts frontend/src/types/genealogy.test.ts frontend/src/components/modals/modalTypes.ts
git commit -m "feat: add frontend genealogy types and modal result contract"
```

---

## Task 2: Display Name Utilities

**Files:**
- Create: `frontend/src/utils/entityDisplay.ts`
- Create: `frontend/src/utils/entityDisplay.test.ts`

**Interfaces:**
- Consumes: `PersonSummary`, `FamilySummary` from `@/types/genealogy`
- Produces:
  - `getPersonDisplayName(p: Pick<PersonSummary, 'given_name' | 'surname'>): string`
  - `getPersonDates(p: Pick<PersonSummary, 'birth_date' | 'death_date'>): string`
  - `getFamilyDisplayName(f: { spouse1: Pick<PersonSummary, 'given_name' | 'surname'> | null; spouse2: Pick<PersonSummary, 'given_name' | 'surname'> | null }): string`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/utils/entityDisplay.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  getPersonDisplayName,
  getPersonDates,
  getFamilyDisplayName,
} from './entityDisplay';

describe('getPersonDisplayName', () => {
  it('joins given name and surname', () => {
    expect(getPersonDisplayName({ given_name: 'Mary', surname: 'Johnson' })).toBe('Mary Johnson');
  });
  it('returns only given name when surname is null', () => {
    expect(getPersonDisplayName({ given_name: 'Mary', surname: null })).toBe('Mary');
  });
  it('returns "Unknown" when both are null', () => {
    expect(getPersonDisplayName({ given_name: null, surname: null })).toBe('Unknown');
  });
});

describe('getPersonDates', () => {
  it('formats birth and death dates', () => {
    expect(getPersonDates({ birth_date: '1884', death_date: '1950' })).toBe('b. 1884 — d. 1950');
  });
  it('formats birth date only', () => {
    expect(getPersonDates({ birth_date: '1884', death_date: null })).toBe('b. 1884');
  });
  it('returns empty string when both are null', () => {
    expect(getPersonDates({ birth_date: null, death_date: null })).toBe('');
  });
});

describe('getFamilyDisplayName', () => {
  it('joins spouse display names with &', () => {
    const result = getFamilyDisplayName({
      spouse1: { given_name: 'John', surname: 'Smith' },
      spouse2: { given_name: 'Mary', surname: 'Johnson' },
    });
    expect(result).toBe('John Smith & Mary Johnson');
  });
  it('handles single spouse', () => {
    expect(
      getFamilyDisplayName({ spouse1: { given_name: 'John', surname: 'Smith' }, spouse2: null })
    ).toBe('John Smith');
  });
  it('returns "Unknown Family" when both spouses are null', () => {
    expect(getFamilyDisplayName({ spouse1: null, spouse2: null })).toBe('Unknown Family');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend && npx vitest run src/utils/entityDisplay.test.ts
```

Expected: FAIL — `Cannot find module './entityDisplay'`

- [ ] **Step 3: Create `frontend/src/utils/entityDisplay.ts`**

```ts
export function getPersonDisplayName(p: {
  given_name: string | null;
  surname: string | null;
}): string {
  const parts = [p.given_name, p.surname].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Unknown';
}

export function getPersonDates(p: {
  birth_date: string | null;
  death_date: string | null;
}): string {
  const parts: string[] = [];
  if (p.birth_date) parts.push(`b. ${p.birth_date}`);
  if (p.death_date) parts.push(`d. ${p.death_date}`);
  return parts.join(' — ');
}

export function getFamilyDisplayName(f: {
  spouse1: { given_name: string | null; surname: string | null } | null;
  spouse2: { given_name: string | null; surname: string | null } | null;
}): string {
  const parts = [f.spouse1, f.spouse2]
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .map(getPersonDisplayName);
  return parts.length > 0 ? parts.join(' & ') : 'Unknown Family';
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/utils/entityDisplay.test.ts
```

Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/entityDisplay.ts frontend/src/utils/entityDisplay.test.ts
git commit -m "feat: add entity display name utility helpers"
```

---

## Task 3: Modal Zustand Store + useModal Hook

**Files:**
- Create: `frontend/src/components/modals/modalStore.ts`
- Create: `frontend/src/components/modals/useModal.ts`
- Create: `frontend/src/components/modals/modalStore.test.ts`

**Interfaces:**
- Consumes: `ModalConfig`, `ModalResult` from `./modalTypes`
- Produces:
  - `useModalStore` — Zustand store with `stack`, `push(config)`, `pop(id, result)`
  - `useModal()` — returns `{ openModal<T>(component, props): Promise<ModalResult<T>>, closeModal(id, result) }`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/modals/modalStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useModalStore } from './modalStore';

beforeEach(() => {
  useModalStore.setState({ stack: [] });
});

describe('useModalStore', () => {
  it('starts with an empty stack', () => {
    expect(useModalStore.getState().stack).toHaveLength(0);
  });

  it('push adds an entry with a unique id', () => {
    const resolve = () => {};
    const id = useModalStore.getState().push({
      component: 'PersonEditor',
      props: { mode: 'create' },
      resolve,
    });
    const stack = useModalStore.getState().stack;
    expect(stack).toHaveLength(1);
    expect(stack[0].id).toBe(id);
    expect(stack[0].component).toBe('PersonEditor');
  });

  it('pop removes the entry and calls resolve with the result', () => {
    let resolved: unknown;
    const id = useModalStore.getState().push({
      component: 'PersonEditor',
      props: {},
      resolve: (r) => { resolved = r; },
    });
    useModalStore.getState().pop(id, { action: 'cancelled' });
    expect(useModalStore.getState().stack).toHaveLength(0);
    expect(resolved).toEqual({ action: 'cancelled' });
  });

  it('pop only removes the targeted entry from the stack', () => {
    const id1 = useModalStore.getState().push({ component: 'A', props: {}, resolve: () => {} });
    useModalStore.getState().push({ component: 'B', props: {}, resolve: () => {} });
    useModalStore.getState().pop(id1, { action: 'cancelled' });
    expect(useModalStore.getState().stack).toHaveLength(1);
    expect(useModalStore.getState().stack[0].component).toBe('B');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend && npx vitest run src/components/modals/modalStore.test.ts
```

Expected: FAIL — `Cannot find module './modalStore'`

- [ ] **Step 3: Create `frontend/src/components/modals/modalStore.ts`**

```ts
import { create } from 'zustand';
import type { ModalConfig, ModalResult } from './modalTypes';

interface ModalState {
  stack: ModalConfig[];
  push: (config: Omit<ModalConfig, 'id'>) => string;
  pop: (id: string, result: ModalResult<unknown>) => void;
}

export const useModalStore = create<ModalState>((set, get) => ({
  stack: [],

  push: (config) => {
    const id = crypto.randomUUID();
    set((s) => ({ stack: [...s.stack, { ...config, id }] }));
    return id;
  },

  pop: (id, result) => {
    const entry = get().stack.find((m) => m.id === id);
    entry?.resolve(result);
    set((s) => ({ stack: s.stack.filter((m) => m.id !== id) }));
  },
}));
```

- [ ] **Step 4: Create `frontend/src/components/modals/useModal.ts`**

```ts
import { useModalStore } from './modalStore';
import type { ModalResult } from './modalTypes';

export function useModal() {
  const { push, pop } = useModalStore();

  function openModal<T>(
    component: string,
    props: Record<string, unknown> = {}
  ): Promise<ModalResult<T>> {
    return new Promise((resolve) => {
      push({
        component,
        props,
        resolve: resolve as (r: ModalResult<unknown>) => void,
      });
    });
  }

  function closeModal(id: string, result: ModalResult<unknown>): void {
    pop(id, result);
  }

  return { openModal, closeModal };
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/components/modals/modalStore.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/modals/modalStore.ts frontend/src/components/modals/modalStore.test.ts frontend/src/components/modals/useModal.ts
git commit -m "feat: add modal Zustand store and useModal hook"
```

---

## Task 4: ModalManager + ModalHost

**Files:**
- Create: `frontend/src/components/modals/ModalManager.tsx`
- Create: `frontend/src/components/modals/ModalManager.module.css`
- Create: `frontend/src/components/modals/ModalHost.tsx`
- Create: `frontend/src/components/modals/ModalManager.test.tsx`

**Interfaces:**
- Consumes: `useModalStore` from `./modalStore`, `ModalEditorProps` from `./modalTypes`
- Produces: `<ModalHost />` — drop into `App.tsx` once to enable all modals app-wide

Note: The component registry inside `ModalManager.tsx` will initially be empty. Tasks 7 and 8 add `PersonEditor` and `FamilyEditor` to it. Tests inject a registry prop so they do not rely on module mocking of a closed-over const.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/modals/ModalManager.test.tsx`:

```tsx
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useModalStore } from './modalStore';
import ModalManager from './ModalManager';

const FakeEditor = ({
  onClose,
}: {
  modalId: string;
  onClose: (r: { action: string }) => void;
}) => (
  <div role="dialog" aria-label="Fake Editor">
    <button onClick={() => onClose({ action: 'cancelled' })}>Cancel</button>
  </div>
);

beforeEach(() => {
  useModalStore.setState({ stack: [] });
});

describe('ModalManager', () => {
  it('renders nothing when stack is empty', () => {
    const { container } = render(<ModalManager />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a dialog when a modal is pushed', () => {
    act(() => {
      useModalStore.getState().push({
        component: 'FakeEditor',
        props: {},
        resolve: () => {},
      });
    });
    render(<ModalManager registry={{ FakeEditor }} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes the top modal when Escape is pressed', () => {
    let resolved: unknown;
    act(() => {
      useModalStore.getState().push({
        component: 'FakeEditor',
        props: {},
        resolve: (r) => { resolved = r; },
      });
    });
    render(<ModalManager registry={{ FakeEditor }} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(useModalStore.getState().stack).toHaveLength(0);
    expect(resolved).toEqual({ action: 'cancelled' });
  });

  it('closes the top modal when backdrop is clicked', () => {
    let resolved: unknown;
    act(() => {
      useModalStore.getState().push({
        component: 'FakeEditor',
        props: {},
        resolve: (r) => { resolved = r; },
      });
    });
    render(<ModalManager registry={{ FakeEditor }} />);
    fireEvent.click(screen.getByTestId('modal-backdrop'));
    expect(useModalStore.getState().stack).toHaveLength(0);
    expect(resolved).toEqual({ action: 'cancelled' });
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend && npx vitest run src/components/modals/ModalManager.test.tsx
```

Expected: FAIL — `Cannot find module './ModalManager'`

- [ ] **Step 3: Create `frontend/src/components/modals/ModalManager.module.css`**

```css
.backdrop {
  position: fixed;
  inset: 0;
  background-color: var(--color-bg-overlay);
  z-index: var(--z-modal-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
}

.layer {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.layer > * {
  pointer-events: all;
}
```

- [ ] **Step 4: Create `frontend/src/components/modals/ModalManager.tsx`**

```tsx
import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import FocusTrap from '@/components/FocusTrap/FocusTrap';
import { useModalStore } from './modalStore';
import type { ModalEditorProps, ModalResult } from './modalTypes';
import styles from './ModalManager.module.css';

export type ModalRegistry = Record<
  string,
  React.ComponentType<ModalEditorProps & Record<string, unknown>>
>;

// Registry is populated after editor components are created (Tasks 7 & 8).
// Import editors here once they exist.
export const REGISTRY: ModalRegistry = {
  // PersonEditor: added in Task 7
  // FamilyEditor: added in Task 8
};

interface ModalManagerProps {
  registry?: ModalRegistry;
}

const ModalManager: React.FC<ModalManagerProps> = ({ registry = REGISTRY }) => {
  const stack = useModalStore((s) => s.stack);
  const pop = useModalStore((s) => s.pop);

  const closeTop = (result: ModalResult<unknown> = { action: 'cancelled' }) => {
    if (stack.length === 0) return;
    pop(stack[stack.length - 1].id, result);
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTop();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  });

  if (stack.length === 0) return null;

  return ReactDOM.createPortal(
    <>
      <div
        className={styles.backdrop}
        data-testid="modal-backdrop"
        aria-hidden="true"
        onClick={() => closeTop()}
      />
      {stack.map((entry, i) => {
        const Component = registry[entry.component];
        if (!Component) return null;
        const isTop = i === stack.length - 1;
        return (
          <div
            key={entry.id}
            className={styles.layer}
            style={{ zIndex: `calc(var(--z-modal) + ${i})` }}
          >
            <FocusTrap active={isTop}>
              <Component
                {...entry.props}
                modalId={entry.id}
                onClose={(result: ModalResult<unknown>) => pop(entry.id, result)}
              />
            </FocusTrap>
          </div>
        );
      })}
    </>,
    document.body
  );
};

export default ModalManager;
```

- [ ] **Step 5: Create `frontend/src/components/modals/ModalHost.tsx`**

```tsx
import React from 'react';
import ModalManager from './ModalManager';

const ModalHost: React.FC = () => <ModalManager />;

export default ModalHost;
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/components/modals/ModalManager.test.tsx
```

Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/modals/ModalManager.tsx frontend/src/components/modals/ModalManager.module.css frontend/src/components/modals/ModalHost.tsx frontend/src/components/modals/ModalManager.test.tsx
git commit -m "feat: add ModalManager portal and ModalHost"
```

---

## Task 5: Wire ModalHost into App.tsx

**Files:**
- Modify: `frontend/src/App.tsx` — add `<ModalHost />` inside `<AuthProvider>`

**Interfaces:**
- Consumes: `ModalHost` from `@/components/modals/ModalHost`

- [ ] **Step 1: Write a smoke test confirming ModalHost renders without crashing**

Create `frontend/src/components/modals/ModalHost.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useModalStore } from './modalStore';
import ModalHost from './ModalHost';

beforeEach(() => {
  useModalStore.setState({ stack: [] });
});

describe('ModalHost', () => {
  it('renders without crashing when stack is empty', () => {
    const { container } = render(<ModalHost />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to confirm it passes**

```bash
cd frontend && npx vitest run src/components/modals/ModalHost.test.tsx
```

Expected: PASS

- [ ] **Step 3: Add ModalHost to App.tsx**

In `frontend/src/App.tsx`, add the import after the last existing import:

```tsx
import ModalHost from './components/modals/ModalHost';
```

Inside the `App` function, place `<ModalHost />` directly inside `<AuthProvider>`, before `<OfflineBanner />`:

The `App` function body should look like this after the edit:

```tsx
function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ModalHost />
          <OfflineBanner />
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              {/* ... all existing routes unchanged ... */}
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/modals/ModalHost.test.tsx
git commit -m "feat: wire ModalHost into App root"
```

---

## Task 6: PersonPicker

**Files:**
- Create: `frontend/src/components/entity-pickers/PersonPicker.tsx`
- Create: `frontend/src/components/entity-pickers/PersonPicker.module.css`
- Create: `frontend/src/components/entity-pickers/PersonPicker.test.tsx`

**Interfaces:**
- Consumes:
  - `PersonSearch` from `@/components/PersonSearch/PersonSearch` (existing component, not modified)
  - `PersonResult` from `@/components/PersonSearch/PersonSearch`
  - `useModal()` from `@/components/modals/useModal`
  - `getPersonDisplayName`, `getPersonDates` from `@/utils/entityDisplay`
- Produces:
  ```ts
  interface PersonPickerProps {
    label?: string;
    value?: string | null;         // ID of currently selected person
    defaultSearch?: string;        // placeholder text and PersonEditor default; PersonSearch has no initial-query prop
    onSelect: (person: PersonResult) => void;
    onClear?: () => void;
  }
  ```

Note: `PersonPicker` calls `openModal<PersonResult>('PersonEditor', { mode: 'create' })`. `PersonEditor` is registered in Task 7.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/entity-pickers/PersonPicker.test.tsx`:

```tsx
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useModalStore } from '@/components/modals/modalStore';
import PersonPicker from './PersonPicker';

vi.mock('@/components/PersonSearch/PersonSearch', () => ({
  default: ({ onSelect, onCreateNew }: {
    onSelect: (p: { id: string; given_name: string | null; surname: string | null; birth_date: string | null; death_date: string | null; photo_url: string | null }) => void;
    onCreateNew?: () => void;
    placeholder?: string;
  }) => (
    <div>
      <input data-testid="search-input" placeholder="Search" />
      <button
        data-testid="select-person"
        onClick={() => onSelect({ id: 'p1', given_name: 'Mary', surname: 'Johnson', birth_date: '1884', death_date: null, photo_url: null })}
      >
        Select Mary
      </button>
      {onCreateNew && (
        <button data-testid="create-new" onClick={onCreateNew}>
          Create New
        </button>
      )}
    </div>
  ),
}));

beforeEach(() => {
  useModalStore.setState({ stack: [] });
});

describe('PersonPicker', () => {
  it('shows placeholder text when no person is selected', () => {
    const onSelect = vi.fn();
    render(<PersonPicker label="Spouse" onSelect={onSelect} />);
    expect(screen.getByText('Select a person…')).toBeInTheDocument();
  });

  it('calls onSelect when a person is chosen from search', () => {
    const onSelect = vi.fn();
    render(<PersonPicker label="Spouse" onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Select a person…'));
    fireEvent.click(screen.getByTestId('select-person'));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1', given_name: 'Mary' })
    );
  });

  it('shows selected person name when value is provided', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'p1',
        primary_name: { given_name: 'Mary', surname: 'Johnson' },
        names: [{ given_name: 'Mary', surname: 'Johnson', is_primary: 1 }],
        events: [],
      }),
    });
    const onSelect = vi.fn();
    await act(async () => {
      render(<PersonPicker label="Spouse" value="p1" onSelect={onSelect} />);
    });
    expect(screen.getByText('Mary Johnson')).toBeInTheDocument();
  });

  it('calls onClear when clear button is clicked', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'p1',
        primary_name: { given_name: 'Mary', surname: 'Johnson' },
        names: [{ given_name: 'Mary', surname: 'Johnson', is_primary: 1 }],
        events: [],
      }),
    });
    const onClear = vi.fn();
    const onSelect = vi.fn();
    await act(async () => {
      render(<PersonPicker label="Spouse" value="p1" onSelect={onSelect} onClear={onClear} />);
    });
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(onClear).toHaveBeenCalled();
  });

  it('opens PersonEditor modal when Create New is clicked', () => {
    const onSelect = vi.fn();
    render(<PersonPicker label="Spouse" onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Select a person…'));
    fireEvent.click(screen.getByTestId('create-new'));
    expect(useModalStore.getState().stack).toHaveLength(1);
    expect(useModalStore.getState().stack[0].component).toBe('PersonEditor');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend && npx vitest run src/components/entity-pickers/PersonPicker.test.tsx
```

Expected: FAIL — `Cannot find module './PersonPicker'`

- [ ] **Step 3: Create `frontend/src/components/entity-pickers/PersonPicker.module.css`**

```css
.root {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
}

.trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-md);
  background: var(--color-bg-primary);
  cursor: pointer;
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  min-height: 2.5rem;
  text-align: left;
}

.triggerRow {
  display: flex;
  align-items: stretch;
  gap: var(--space-1);
}

.triggerRow .trigger {
  flex: 1;
}

.trigger:hover {
  border-color: var(--color-primary-500);
}

.placeholder {
  color: var(--color-text-tertiary);
}

.selectedName {
  font-weight: var(--font-weight-medium);
}

.selectedDates {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.clearBtn {
  background: none;
  border: none;
  padding: var(--space-1);
  cursor: pointer;
  color: var(--color-text-tertiary);
  line-height: 1;
  font-size: var(--font-size-base);
}

.clearBtn:hover {
  color: var(--color-error);
}

.searchContainer {
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-md);
  padding: var(--space-2);
  background: var(--color-bg-primary);
}
```

- [ ] **Step 4: Create `frontend/src/components/entity-pickers/PersonPicker.tsx`**

```tsx
import React, { useState, useEffect } from 'react';
import PersonSearch from '@/components/PersonSearch/PersonSearch';
import type { PersonResult } from '@/components/PersonSearch/PersonSearch';
import { useModal } from '@/components/modals/useModal';
import { getPersonDisplayName, getPersonDates } from '@/utils/entityDisplay';
import styles from './PersonPicker.module.css';

interface PersonPickerProps {
  label?: string;
  value?: string | null;
  defaultSearch?: string;
  onSelect: (person: PersonResult) => void;
  onClear?: () => void;
}

interface PersonApiResponse {
  id: string;
  given_name?: string | null;
  surname?: string | null;
  birth_date?: string | null;
  death_date?: string | null;
  photo_url?: string | null;
  primary_name?: { given_name: string | null; surname: string | null } | null;
  names?: Array<{ given_name: string | null; surname: string | null; is_primary?: number }>;
}

function toPersonResult(data: PersonApiResponse): PersonResult {
  const primaryName =
    data.primary_name ??
    data.names?.find((name) => name.is_primary === 1) ??
    data.names?.[0] ??
    null;

  return {
    id: data.id,
    given_name: data.given_name ?? primaryName?.given_name ?? null,
    surname: data.surname ?? primaryName?.surname ?? null,
    birth_date: data.birth_date ?? null,
    death_date: data.death_date ?? null,
    photo_url: data.photo_url ?? null,
  };
}

const PersonPicker: React.FC<PersonPickerProps> = ({
  label,
  value,
  defaultSearch,
  onSelect,
  onClear,
}) => {
  const { openModal } = useModal();
  const [isOpen, setIsOpen] = useState(false);
  const [resolvedPerson, setResolvedPerson] = useState<PersonResult | null>(null);

  useEffect(() => {
    if (!value) {
      setResolvedPerson(null);
      return;
    }
    fetch(`/api/v1/people/${value}`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load person');
        return r.json();
      })
      .then((data: PersonApiResponse) => setResolvedPerson(toPersonResult(data)))
      .catch(() => setResolvedPerson(null));
  }, [value]);

  const handleSelect = (person: PersonResult) => {
    setResolvedPerson(person);
    setIsOpen(false);
    onSelect(person);
  };

  const handleCreateNew = async () => {
    setIsOpen(false);
    const result = await openModal<PersonResult>('PersonEditor', {
      mode: 'create',
      defaults: defaultSearch ? { given_name: defaultSearch } : undefined,
    });
    if (result.action === 'created' || result.action === 'selected') {
      setResolvedPerson(result.entity);
      onSelect(result.entity);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setResolvedPerson(null);
    onClear?.();
  };

  return (
    <div className={styles.root}>
      {label && <span className={styles.label}>{label}</span>}

      {!isOpen && (
        <div className={styles.triggerRow}>
          <button
            type="button"
            className={styles.trigger}
            onClick={() => setIsOpen(true)}
          >
            {resolvedPerson ? (
              <span>
                <span>
                  <span className={styles.selectedName}>
                    {getPersonDisplayName(resolvedPerson)}
                  </span>
                  {getPersonDates(resolvedPerson) && (
                    <span className={styles.selectedDates}>
                      {' '}— {getPersonDates(resolvedPerson)}
                    </span>
                  )}
                </span>
              </span>
            ) : (
              <span className={styles.placeholder}>Select a person…</span>
            )}
          </button>
          {resolvedPerson && onClear && (
            <button
              type="button"
              className={styles.clearBtn}
              aria-label="Clear selection"
              onClick={handleClear}
            >
              ×
            </button>
          )}
        </div>
      )}

      {isOpen && (
        <div className={styles.searchContainer}>
          <PersonSearch
            onSelect={handleSelect}
            onCreateNew={handleCreateNew}
            placeholder={defaultSearch ?? 'Search for a person…'}
          />
        </div>
      )}
    </div>
  );
};

export default PersonPicker;
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/components/entity-pickers/PersonPicker.test.tsx
```

Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/entity-pickers/
git commit -m "feat: add PersonPicker with inline create-new support"
```

---

## Task 7: PersonEditor

**Files:**
- Create: `frontend/src/components/entity-editors/PersonEditor.tsx`
- Create: `frontend/src/components/entity-editors/PersonEditor.module.css`
- Create: `frontend/src/components/entity-editors/PersonEditor.test.tsx`
- Modify: `frontend/src/components/modals/ModalManager.tsx` — add `PersonEditor` to registry

**Interfaces:**
- Consumes:
  - `ModalEditorProps` from `@/components/modals/modalTypes`
  - `PersonSummary` from `@/types/genealogy`
  - Form components from `@/components/Form`
  - `Button` from `@/components/Button/Button`
- Props (merged with ModalEditorProps):
  ```ts
  interface PersonEditorProps extends ModalEditorProps {
    mode: 'create' | 'edit';
    personId?: string;
    defaults?: { given_name?: string; surname?: string; sex?: 'M' | 'F' | 'X' | 'U' };
  }
  ```
- API: `POST /api/v1/people` with body:
  ```json
  {
    "sex": "U",
    "is_living": 1,
    "is_private": 0,
    "names": [{ "name_type": "birth", "given_name": "...", "surname": "...", "is_primary": 1 }]
  }
  ```
- On save success: calls `onClose({ action: 'created', entityType: 'person', entity: PersonSummary })`
- On cancel: calls `onClose({ action: 'cancelled' })`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/entity-editors/PersonEditor.test.tsx`:

```tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PersonEditor from './PersonEditor';

const noop = () => {};

describe('PersonEditor', () => {
  it('renders a dialog with correct aria attributes', () => {
    render(
      <PersonEditor mode="create" modalId="m1" onClose={noop} />
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Add Person')).toBeInTheDocument();
  });

  it('pre-fills given name from defaults', () => {
    render(
      <PersonEditor
        mode="create"
        defaults={{ given_name: 'Mary' }}
        modalId="m1"
        onClose={noop}
      />
    );
    expect(screen.getByLabelText('Given Name')).toHaveValue('Mary');
  });

  it('calls onClose with cancelled when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<PersonEditor mode="create" modalId="m1" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledWith({ action: 'cancelled' });
  });

  it('submits form and calls onClose with created result', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'p2', sex: 'M', names: [{ given_name: 'John', surname: 'Smith', is_primary: 1 }] }),
    });

    const onClose = vi.fn();
    render(<PersonEditor mode="create" modalId="m1" onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Given Name'), { target: { value: 'John' } });
    fireEvent.change(screen.getByLabelText('Surname'), { target: { value: 'Smith' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'created',
          entityType: 'person',
          entity: expect.objectContaining({
            id: 'p2',
            given_name: 'John',
            surname: 'Smith',
          }),
        })
      );
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/people',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sex: 'U',
          is_living: 1,
          is_private: 0,
          names: [
            {
              name_type: 'birth',
              given_name: 'John',
              surname: 'Smith',
              is_primary: 1,
            },
          ],
        }),
      })
    );
  });

  it('shows an error message when the API call fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Failed to create person' }),
    });

    render(<PersonEditor mode="create" modalId="m1" onClose={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to create person');
    });
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend && npx vitest run src/components/entity-editors/PersonEditor.test.tsx
```

Expected: FAIL — `Cannot find module './PersonEditor'`

- [ ] **Step 3: Create `frontend/src/components/entity-editors/PersonEditor.module.css`**

```css
.overlay {
  background: var(--color-bg-primary);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl);
  padding: var(--space-6);
  width: min(480px, 95vw);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin: 0;
}

.closeBtn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--font-size-xl);
  color: var(--color-text-tertiary);
  line-height: 1;
  padding: var(--space-1);
}

.closeBtn:hover {
  color: var(--color-text-primary);
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.error {
  color: var(--color-error);
  font-size: var(--font-size-sm);
  padding: var(--space-2) var(--space-3);
  background: color-mix(in srgb, var(--color-error) 10%, transparent);
  border-radius: var(--radius-md);
}
```

- [ ] **Step 4: Create `frontend/src/components/entity-editors/PersonEditor.tsx`**

```tsx
import React, { useState } from 'react';
import Button from '@/components/Button/Button';
import { Label, Input, Select } from '@/components/Form';
import FormGroup from '@/components/Form/FormGroup';
import type { ModalEditorProps, ModalResult } from '@/components/modals/modalTypes';
import type { PersonSummary } from '@/types/genealogy';
import styles from './PersonEditor.module.css';

interface PersonEditorProps extends ModalEditorProps {
  mode: 'create' | 'edit';
  personId?: string;
  defaults?: { given_name?: string; surname?: string; sex?: 'M' | 'F' | 'X' | 'U' };
}

const PersonEditor: React.FC<PersonEditorProps> = ({
  mode,
  defaults,
  modalId: _modalId,
  onClose,
}) => {
  const [givenName, setGivenName] = useState(defaults?.given_name ?? '');
  const [surname, setSurname] = useState(defaults?.surname ?? '');
  const [sex, setSex] = useState<'M' | 'F' | 'X' | 'U'>(defaults?.sex ?? 'U');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const title = mode === 'create' ? 'Add Person' : 'Edit Person';

  const handleCancel = () => onClose({ action: 'cancelled' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/v1/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sex,
          is_living: 1,
          is_private: 0,
          names: [
            {
              name_type: 'birth',
              given_name: givenName || null,
              surname: surname || null,
              is_primary: 1,
            },
          ],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Failed to save person');
        return;
      }

      const primaryName = Array.isArray(data.names)
        ? data.names.find((n: { is_primary: number }) => n.is_primary === 1) ?? data.names[0]
        : null;

      const entity: PersonSummary = {
        id: data.id,
        given_name: primaryName?.given_name ?? null,
        surname: primaryName?.surname ?? null,
        birth_date: null,
        death_date: null,
        photo_url: null,
      };

      const result: ModalResult<PersonSummary> = {
        action: 'created',
        entityType: 'person',
        entity,
      };
      onClose(result as ModalResult<unknown>);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="person-editor-title"
      className={styles.overlay}
    >
      <div className={styles.header}>
        <h2 id="person-editor-title" className={styles.title}>
          {title}
        </h2>
        <button
          type="button"
          className={styles.closeBtn}
          aria-label="Close"
          onClick={handleCancel}
        >
          ×
        </button>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.row}>
          <FormGroup>
            <Label htmlFor="pe-given-name">Given Name</Label>
            <Input
              id="pe-given-name"
              value={givenName}
              onChange={(e) => setGivenName(e.target.value)}
              autoFocus
            />
          </FormGroup>

          <FormGroup>
            <Label htmlFor="pe-surname">Surname</Label>
            <Input
              id="pe-surname"
              value={surname}
              onChange={(e) => setSurname(e.target.value)}
            />
          </FormGroup>
        </div>

        <FormGroup>
          <Label htmlFor="pe-sex">Sex</Label>
          <Select
            id="pe-sex"
            value={sex}
            onChange={(e) => setSex(e.target.value as typeof sex)}
          >
            <option value="U">Unknown</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
            <option value="X">Non-binary / Other</option>
          </Select>
        </FormGroup>

        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <Button type="button" variant="ghost" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={isLoading}>
            Save
          </Button>
        </div>
      </form>
    </div>
  );
};

export default PersonEditor;
```

- [ ] **Step 5: Register PersonEditor in ModalManager**

In `frontend/src/components/modals/ModalManager.tsx`, update the imports and registry:

```tsx
// Add this import after the existing imports
import PersonEditor from '@/components/entity-editors/PersonEditor';

// Update the REGISTRY object
export const REGISTRY: ModalRegistry = {
  PersonEditor: PersonEditor as React.ComponentType<ModalEditorProps & Record<string, unknown>>,
};
```

- [ ] **Step 6: Run all modal + editor tests**

```bash
cd frontend && npx vitest run src/components/entity-editors/PersonEditor.test.tsx src/components/modals/
```

Expected: PASS (all tests)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/entity-editors/PersonEditor.tsx frontend/src/components/entity-editors/PersonEditor.module.css frontend/src/components/entity-editors/PersonEditor.test.tsx frontend/src/components/modals/ModalManager.tsx
git commit -m "feat: add PersonEditor modal and register in ModalManager"
```

---

## Task 8: FamilyEditor

**Files:**
- Create: `frontend/src/components/entity-editors/FamilyEditor.tsx`
- Create: `frontend/src/components/entity-editors/FamilyEditor.module.css`
- Create: `frontend/src/components/entity-editors/FamilyEditor.test.tsx`
- Modify: `frontend/src/components/modals/ModalManager.tsx` — add `FamilyEditor` to registry

**Interfaces:**
- Consumes:
  - `PersonPicker` from `@/components/entity-pickers/PersonPicker`
  - `PersonResult` from `@/components/PersonSearch/PersonSearch`
  - `ModalEditorProps` from `@/components/modals/modalTypes`
  - `FamilySummary` from `@/types/genealogy`
- Props:
  ```ts
  interface FamilyEditorProps extends ModalEditorProps {
    mode: 'create';
    defaults?: { spouse1_id?: string; spouse2_id?: string };
  }
  ```
- API create: `POST /api/v1/families` with body `{ spouse1_id, spouse2_id, marriage_date, marriage_place }`
- On save success: `onClose({ action: 'created', entityType: 'family', entity: FamilySummary })`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/entity-editors/FamilyEditor.test.tsx`:

```tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useModalStore } from '@/components/modals/modalStore';
import FamilyEditor from './FamilyEditor';

vi.mock('@/components/entity-pickers/PersonPicker', () => ({
  default: ({
    label,
    onSelect,
  }: {
    label?: string;
    value?: string | null;
    onSelect: (p: { id: string; given_name: string | null; surname: string | null; birth_date: string | null; death_date: string | null; photo_url: string | null }) => void;
    onClear?: () => void;
  }) => (
    <div>
      <span>{label}</span>
      <button
        data-testid={`pick-${label?.toLowerCase().replace(/\s/g, '-')}`}
        onClick={() =>
          onSelect({ id: 'p1', given_name: 'Mary', surname: 'Johnson', birth_date: null, death_date: null, photo_url: null })
        }
      >
        Pick {label}
      </button>
    </div>
  ),
}));

const noop = () => {};

beforeEach(() => {
  useModalStore.setState({ stack: [] });
});

describe('FamilyEditor', () => {
  it('renders a dialog with spouse pickers', () => {
    render(<FamilyEditor mode="create" modalId="m1" onClose={noop} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Add Family')).toBeInTheDocument();
    expect(screen.getByText('Spouse 1')).toBeInTheDocument();
    expect(screen.getByText('Spouse 2')).toBeInTheDocument();
  });

  it('calls onClose with cancelled when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<FamilyEditor mode="create" modalId="m1" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledWith({ action: 'cancelled' });
  });

  it('saves family with selected spouses', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'f1',
        spouse1_id: 'p1',
        spouse2_id: null,
        marriage_date: null,
        marriage_place: null,
      }),
    });
    const onClose = vi.fn();
    render(<FamilyEditor mode="create" modalId="m1" onClose={onClose} />);

    fireEvent.click(screen.getByTestId('pick-spouse-1'));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'created', entityType: 'family' })
      );
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/families',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"spouse1_id":"p1"'),
      })
    );
  });

  it('shows an error when save fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Failed to create family' }),
    });
    render(<FamilyEditor mode="create" modalId="m1" onClose={noop} />);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to create family');
    });
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend && npx vitest run src/components/entity-editors/FamilyEditor.test.tsx
```

Expected: FAIL — `Cannot find module './FamilyEditor'`

- [ ] **Step 3: Create `frontend/src/components/entity-editors/FamilyEditor.module.css`**

```css
.overlay {
  background: var(--color-bg-primary);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl);
  padding: var(--space-6);
  width: min(520px, 95vw);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin: 0;
}

.closeBtn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--font-size-xl);
  color: var(--color-text-tertiary);
  line-height: 1;
  padding: var(--space-1);
}

.closeBtn:hover {
  color: var(--color-text-primary);
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.divider {
  border: none;
  border-top: 1px solid var(--color-gray-200);
  margin: 0;
}

.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.sectionTitle {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.error {
  color: var(--color-error);
  font-size: var(--font-size-sm);
  padding: var(--space-2) var(--space-3);
  background: color-mix(in srgb, var(--color-error) 10%, transparent);
  border-radius: var(--radius-md);
}
```

- [ ] **Step 4: Create `frontend/src/components/entity-editors/FamilyEditor.tsx`**

```tsx
import React, { useState } from 'react';
import Button from '@/components/Button/Button';
import { Label, Input } from '@/components/Form';
import FormGroup from '@/components/Form/FormGroup';
import PersonPicker from '@/components/entity-pickers/PersonPicker';
import type { PersonResult } from '@/components/PersonSearch/PersonSearch';
import type { ModalEditorProps, ModalResult } from '@/components/modals/modalTypes';
import type { FamilySummary, PersonSummary } from '@/types/genealogy';
import styles from './FamilyEditor.module.css';

interface FamilyEditorProps extends ModalEditorProps {
  mode: 'create';
  defaults?: { spouse1_id?: string; spouse2_id?: string };
}

const FamilyEditor: React.FC<FamilyEditorProps> = ({
  defaults,
  modalId: _modalId,
  onClose,
}) => {
  const [spouse1, setSpouse1] = useState<PersonResult | null>(null);
  const [spouse2, setSpouse2] = useState<PersonResult | null>(null);
  const [marriageDate, setMarriageDate] = useState('');
  const [marriagePlace, setMarriagePlace] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const title = 'Add Family';

  const handleCancel = () => onClose({ action: 'cancelled' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const body = {
      spouse1_id: spouse1?.id ?? defaults?.spouse1_id ?? null,
      spouse2_id: spouse2?.id ?? defaults?.spouse2_id ?? null,
      marriage_date: marriageDate || null,
      marriage_place: marriagePlace || null,
    };

    try {
      const res = await fetch('/api/v1/families', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Failed to save family');
        return;
      }

      const toSummary = (p: PersonResult | null): PersonSummary | null =>
        p
          ? { id: p.id, given_name: p.given_name, surname: p.surname, birth_date: p.birth_date, death_date: p.death_date, photo_url: p.photo_url }
          : null;

      const entity: FamilySummary = {
        id: data.id,
        spouse1_id: data.spouse1_id,
        spouse2_id: data.spouse2_id,
        spouse1: toSummary(spouse1),
        spouse2: toSummary(spouse2),
        marriage_date: data.marriage_date,
        marriage_place: data.marriage_place,
      };

      const result: ModalResult<FamilySummary> = {
        action: 'created',
        entityType: 'family',
        entity,
      };
      onClose(result as ModalResult<unknown>);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="family-editor-title"
      className={styles.overlay}
    >
      <div className={styles.header}>
        <h2 id="family-editor-title" className={styles.title}>
          {title}
        </h2>
        <button
          type="button"
          className={styles.closeBtn}
          aria-label="Close"
          onClick={handleCancel}
        >
          ×
        </button>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <p className={styles.sectionTitle}>Partners</p>

        <PersonPicker
          label="Spouse 1"
          value={defaults?.spouse1_id}
          onSelect={setSpouse1}
          onClear={() => setSpouse1(null)}
        />

        <PersonPicker
          label="Spouse 2"
          value={defaults?.spouse2_id}
          onSelect={setSpouse2}
          onClear={() => setSpouse2(null)}
        />

        <hr className={styles.divider} />

        <p className={styles.sectionTitle}>Marriage</p>

        <div className={styles.row}>
          <FormGroup>
            <Label htmlFor="fe-marriage-date">Date</Label>
            <Input
              id="fe-marriage-date"
              value={marriageDate}
              onChange={(e) => setMarriageDate(e.target.value)}
              placeholder="e.g. 14 Jun 1910"
            />
          </FormGroup>

          <FormGroup>
            <Label htmlFor="fe-marriage-place">Place</Label>
            <Input
              id="fe-marriage-place"
              value={marriagePlace}
              onChange={(e) => setMarriagePlace(e.target.value)}
              placeholder="e.g. Boston, MA"
            />
          </FormGroup>
        </div>

        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <Button type="button" variant="ghost" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={isLoading}>
            Save
          </Button>
        </div>
      </form>
    </div>
  );
};

export default FamilyEditor;
```

- [ ] **Step 5: Register FamilyEditor in ModalManager**

In `frontend/src/components/modals/ModalManager.tsx`, update the imports and registry:

```tsx
// Add alongside PersonEditor import
import FamilyEditor from '@/components/entity-editors/FamilyEditor';

// Updated REGISTRY
export const REGISTRY: ModalRegistry = {
  PersonEditor: PersonEditor as React.ComponentType<ModalEditorProps & Record<string, unknown>>,
  FamilyEditor: FamilyEditor as React.ComponentType<ModalEditorProps & Record<string, unknown>>,
};
```

- [ ] **Step 6: Run all tests**

```bash
cd frontend && npx vitest run src/components/entity-editors/FamilyEditor.test.tsx src/components/entity-editors/PersonEditor.test.tsx src/components/modals/ src/components/entity-pickers/ src/utils/entityDisplay.test.ts src/types/genealogy.test.ts
```

Expected: PASS (all tests)

- [ ] **Step 7: Full type check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/entity-editors/FamilyEditor.tsx frontend/src/components/entity-editors/FamilyEditor.module.css frontend/src/components/entity-editors/FamilyEditor.test.tsx frontend/src/components/modals/ModalManager.tsx
git commit -m "feat: add FamilyEditor with PersonPicker spouse fields and register in ModalManager"
```

---

## Task 9: Picker-to-Editor Workflow Integration Test

**Files:**
- Create: `frontend/src/components/entity-pickers/PersonPicker.workflow.test.tsx`

**Interfaces:**
- Consumes: `PersonPicker` from Task 6
- Consumes: production `ModalManager` registry after Task 7 has registered `PersonEditor`
- Verifies: `PersonPicker` create-new flow opens `PersonEditor`, saves via `/api/v1/people`, and calls `onSelect` with the created `PersonResult`

- [ ] **Step 1: Write the workflow test**

Create `frontend/src/components/entity-pickers/PersonPicker.workflow.test.tsx`:

```tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useModalStore } from '@/components/modals/modalStore';
import ModalManager from '@/components/modals/ModalManager';
import PersonPicker from './PersonPicker';

vi.mock('@/components/PersonSearch/PersonSearch', () => ({
  default: ({
    onCreateNew,
  }: {
    onSelect: (p: { id: string; given_name: string | null; surname: string | null; birth_date: string | null; death_date: string | null; photo_url: string | null }) => void;
    onCreateNew?: () => void;
    placeholder?: string;
  }) => (
    <button type="button" data-testid="create-new" onClick={onCreateNew}>
      Create New
    </button>
  ),
}));

beforeEach(() => {
  useModalStore.setState({ stack: [] });
});

describe('PersonPicker create-new workflow', () => {
  it('opens PersonEditor and selects the created person', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'p-new',
        sex: 'U',
        names: [{ given_name: 'Ada', surname: 'Lovelace', is_primary: 1 }],
      }),
    });

    const onSelect = vi.fn();
    render(
      <>
        <PersonPicker label="Spouse" defaultSearch="Ada" onSelect={onSelect} />
        <ModalManager />
      </>
    );

    fireEvent.click(screen.getByText('Select a person…'));
    fireEvent.click(screen.getByTestId('create-new'));

    expect(screen.getByRole('dialog')).toHaveTextContent('Add Person');
    expect(screen.getByLabelText('Given Name')).toHaveValue('Ada');

    fireEvent.change(screen.getByLabelText('Surname'), { target: { value: 'Lovelace' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'p-new',
          given_name: 'Ada',
          surname: 'Lovelace',
        })
      );
    });
  });
});
```

- [ ] **Step 2: Run workflow test**

```bash
cd frontend && npx vitest run src/components/entity-pickers/PersonPicker.workflow.test.tsx
```

Expected: PASS

- [ ] **Step 3: Run all related frontend tests and type-check**

```bash
cd frontend
npx vitest run src/components/entity-pickers/ src/components/entity-editors/ src/components/modals/ src/utils/entityDisplay.test.ts src/types/genealogy.test.ts
npx tsc --noEmit
```

Expected: all tests PASS; type-check reports no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/entity-pickers/PersonPicker.workflow.test.tsx
git commit -m "test: cover PersonPicker create-new modal workflow"
```

---

## Self-Review: Spec Coverage

| Spec requirement | Task that implements it |
|---|---|
| ModalManager opens, stacks, closes modals | Tasks 3, 4 |
| ModalResult typed contract | Task 1 |
| useModal hook | Task 3 |
| ModalHost wired to App | Task 5 |
| PersonPicker: search, select, create-new | Task 6 |
| PersonPicker create-new integration flow | Task 9 |
| PersonEditor: create mode with minimal fields | Task 7 |
| FamilyEditor with PersonPicker spouse fields | Task 8 |
| Editors do NOT directly import each other | Enforced — FamilyEditor uses PersonPicker, not PersonEditor directly |
| Display name helpers | Task 2 |
| Escape key closes top modal | Task 4 (ModalManager) |
| Backdrop click closes top modal | Task 4 (ModalManager) |
| FocusTrap on active modal | Task 4 (ModalManager wraps each layer in FocusTrap) |
| ARIA roles on dialogs | Tasks 7, 8 |
| ADRs for open decisions | Recorded in plan header |

**Gaps left for future phases (out of MVP scope):**
- LocationPicker / LocationEditor (Phase 5)
- SourcePicker / SourceEditor / CitationEditor (Phase 6)
- MediaPicker / MediaEditor (Phase 7)
- Duplicate detection (Phase 8)
- Breadcrumbs, unsaved-changes guard, draft saving, mobile drawers (Phase 9)
- PersonEditor edit mode (needs fetch of existing person + PUT endpoint)
- FamilyEditor edit mode (needs fetch of existing family, role-aware PUT handling, and existing spouse hydration)
- Children list in FamilyEditor (needs `POST /api/v1/families/:id/members`)

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-22-entity-editor-picker-modal-system.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — Fresh subagent per task, review between tasks, fast iteration. Use `superpowers:subagent-driven-development`.

**2. Inline Execution** — Execute tasks in this session with checkpoints. Use `superpowers:executing-plans`.

Which approach?
