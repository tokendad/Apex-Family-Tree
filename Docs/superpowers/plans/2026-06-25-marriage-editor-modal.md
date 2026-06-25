# MarriageEditor Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bare "Marriage" event form with a dedicated `MarriageEditor` modal that creates both an event record and a family (relationship) record, with a non-blocking warning when the selected spouse already has an active marriage on record.

**Architecture:** A new `MarriageEditor` modal component (registered in `ModalManager`) is opened whenever the user selects "Marriage" in either the PersonEditModal events tab or the VitalEventsStep wizard. It uses the existing `PersonPicker` for spouse selection and fires two sequential API calls on save. A new `GET /families/person/:personId/active` endpoint powered by a new `FamilyRepository.findActiveByPerson()` method supplies the warning-check data.

**Tech Stack:** TypeScript, React, Express, better-sqlite3, CSS Modules, Vitest, supertest

## Global Constraints

- CSS: use CSS Modules + design tokens only (`var(--...)`) — no Tailwind, no hardcoded colours
- No new npm dependencies
- All new routes must be placed **before** the `/:id` catch-all in `families.ts`
- `MarriageEditor` props interface must extend `ModalEditorProps` from `@/components/modals/modalTypes`
- Warning banner uses `role="status"` (informational), error uses `role="alert"` (blocking)
- Spouse is optional — if no spouse selected, only the event record is created
- `tsc --noEmit` must pass after every task

---

### Task 1: Backend — `findActiveByPerson` + active-marriages endpoint

**Files:**
- Modify: `backend/src/repositories/FamilyRepository.ts` (after `getMembers` method, line 211)
- Modify: `backend/src/routes/families.ts` (insert before `GET /families/:id` at line 72)
- Create: `backend/src/routes/families.active.test.ts`

**Interfaces:**
- Produces: `GET /api/v1/families/person/:personId/active` → `{ activeMarriages: ActiveMarriage[] }`
  where `ActiveMarriage = { id: string; spouse1_id: string | null; spouse2_id: string | null; marriage_date: string | null }`
- Produces: `FamilyRepository.findActiveByPerson(personId: string): ActiveMarriage[]`

---

- [ ] **Step 1: Write the failing test**

Create `backend/src/routes/families.active.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { buildApp } from '../app.js';

let db: ReturnType<typeof Database>;
let app: ReturnType<typeof buildApp>;

function seed() {
  db.exec(`
    INSERT INTO persons (id, sex, is_living, is_private, created_at, updated_at)
    VALUES
      ('p1', 'M', 1, 0, '2024-01-01', '2024-01-01'),
      ('p2', 'F', 1, 0, '2024-01-01', '2024-01-01'),
      ('p3', 'F', 1, 0, '2024-01-01', '2024-01-01');
    INSERT INTO families (id, spouse1_id, spouse2_id, marriage_date, divorce_date, created_at, updated_at)
    VALUES
      ('f1', 'p1', 'p2', '1 Jan 1990', NULL, '2024-01-01', '2024-01-01'),
      ('f2', 'p1', 'p3', '1 Jan 2005', '1 Jan 2010', '2024-01-01', '2024-01-01');
  `);
}

beforeEach(() => {
  db = new Database(':memory:');
  // Run migrations to build schema
  const migrations = [
    `CREATE TABLE persons (id TEXT PRIMARY KEY, sex TEXT, is_living INTEGER, is_private INTEGER, created_at TEXT, updated_at TEXT, display_name TEXT, home_person_id TEXT, notes TEXT)`,
    `CREATE TABLE names (id TEXT PRIMARY KEY, person_id TEXT, given_name TEXT, surname TEXT, is_primary INTEGER, sort_order INTEGER, name_type TEXT, middle_name TEXT, prefix TEXT, suffix TEXT, nickname TEXT, created_at TEXT, updated_at TEXT)`,
    `CREATE TABLE families (id TEXT PRIMARY KEY, spouse1_id TEXT, spouse2_id TEXT, marriage_date TEXT, marriage_date_qualifier TEXT, marriage_date_sort_key TEXT, marriage_place TEXT, divorce_date TEXT, divorce_place TEXT, gedcom_id TEXT, created_at TEXT, updated_at TEXT)`,
    `CREATE TABLE family_members (id TEXT PRIMARY KEY, family_id TEXT, person_id TEXT, role TEXT, sort_order INTEGER, created_at TEXT)`,
    `CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT)`,
  ];
  for (const sql of migrations) db.exec(sql);
  seed();
  app = buildApp(db);
});

afterEach(() => db.close());

describe('GET /api/v1/families/person/:personId/active', () => {
  it('returns active marriages (divorce_date IS NULL) for the person', async () => {
    const res = await request(app).get('/api/v1/families/person/p1/active');
    expect(res.status).toBe(200);
    expect(res.body.activeMarriages).toHaveLength(1);
    expect(res.body.activeMarriages[0].id).toBe('f1');
  });

  it('excludes marriages with a divorce_date', async () => {
    const res = await request(app).get('/api/v1/families/person/p1/active');
    const ids = res.body.activeMarriages.map((m: { id: string }) => m.id);
    expect(ids).not.toContain('f2');
  });

  it('returns empty array when person has no active marriages', async () => {
    const res = await request(app).get('/api/v1/families/person/p3/active');
    expect(res.status).toBe(200);
    expect(res.body.activeMarriages).toHaveLength(0);
  });

  it('returns the marriage regardless of which spouse slot the person is in', async () => {
    // p2 is in spouse2 slot of f1
    const res = await request(app).get('/api/v1/families/person/p2/active');
    expect(res.body.activeMarriages).toHaveLength(1);
    expect(res.body.activeMarriages[0].id).toBe('f1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /data/Projects/AFT/backend && npx vitest run src/routes/families.active.test.ts
```

Expected: FAIL — `buildApp` does not accept a db argument or route doesn't exist yet.

- [ ] **Step 3: Add `findActiveByPerson` to FamilyRepository**

In `backend/src/repositories/FamilyRepository.ts`, add this method after `getMembers` (after line 211, before the closing `}`):

```typescript
  findActiveByPerson(personId: string): { id: string; spouse1_id: string | null; spouse2_id: string | null; marriage_date: string | null }[] {
    return this.db.prepare(
      `SELECT id, spouse1_id, spouse2_id, marriage_date
       FROM families
       WHERE (spouse1_id = ? OR spouse2_id = ?)
         AND divorce_date IS NULL`
    ).all(personId, personId) as { id: string; spouse1_id: string | null; spouse2_id: string | null; marriage_date: string | null }[];
  }
```

- [ ] **Step 4: Add `GET /families/person/:personId/active` route**

In `backend/src/routes/families.ts`, insert the following block **between** the `POST /families` handler (ending at line 70) and the `GET /families/:id` handler (starting at line 72):

```typescript
// GET /families/person/:personId/active — Get active (non-divorced) marriages for a person
familiesRouter.get('/person/:personId/active', (req, res) => {
  try {
    const repo = new FamilyRepository();
    const personId = paramStr(req.params.personId);
    const activeMarriages = repo.findActiveByPerson(personId);
    res.json({ activeMarriages });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get active marriages' });
  }
});
```

- [ ] **Step 5: Check whether `buildApp` accepts a db injection (for tests)**

```bash
grep -n "buildApp\|export function buildApp\|export const buildApp" /data/Projects/AFT/backend/src/app.ts | head -5
```

If `buildApp` already accepts a `db` parameter, the test as written will work. If not, check how the existing `tree.test.ts` bootstraps the app and mirror that pattern exactly in the test file you just created. Update `families.active.test.ts` to match.

- [ ] **Step 6: Run the test suite**

```bash
cd /data/Projects/AFT/backend && npx vitest run src/routes/families.active.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 7: Type-check**

```bash
cd /data/Projects/AFT/backend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
cd /data/Projects/AFT && git add backend/src/repositories/FamilyRepository.ts backend/src/routes/families.ts backend/src/routes/families.active.test.ts
git commit -m "feat: add findActiveByPerson and GET /families/person/:personId/active endpoint"
```

---

### Task 2: Frontend — `MarriageEditor` component + ModalManager registration

**Files:**
- Create: `frontend/src/components/entity-editors/MarriageEditor.tsx`
- Create: `frontend/src/components/entity-editors/MarriageEditor.module.css`
- Modify: `frontend/src/components/modals/ModalManager.tsx` (add import + registry entry)

**Interfaces:**
- Consumes: `PersonPicker` from `@/components/entity-pickers/PersonPicker` — props: `label`, `value`, `onSelect`, `onClear`
- Consumes: `PersonResult` from `@/components/PersonSearch/PersonSearch`
- Consumes: `ModalEditorProps` from `@/components/modals/modalTypes`
- Consumes: `GET /api/v1/families/person/{spouseId}/active` (from Task 1)
- Consumes: `POST /api/v1/events/people/{personId}/events`
- Consumes: `POST /api/v1/families`
- Produces: `MarriageEditor` registered in `ModalManager.REGISTRY` under key `'MarriageEditor'`
- Produces: modal accepts `{ personId: string; personName: string; onSaved?: () => void }`

---

- [ ] **Step 1: Create `MarriageEditor.module.css`**

Create `frontend/src/components/entity-editors/MarriageEditor.module.css` with the following content (identical structure to `FamilyEditor.module.css`, plus `.warning` class):

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

.warning {
  font-size: var(--font-size-sm);
  padding: var(--space-2) var(--space-3);
  background: color-mix(in srgb, #f59e0b 12%, transparent);
  border: 1px solid color-mix(in srgb, #f59e0b 40%, transparent);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
}
```

- [ ] **Step 2: Create `MarriageEditor.tsx`**

Create `frontend/src/components/entity-editors/MarriageEditor.tsx`:

```tsx
import React, { useState } from 'react';
import Button from '@/components/Button/Button';
import { Label, Input } from '@/components/Form';
import FormGroup from '@/components/Form/FormGroup';
import PersonPicker from '@/components/entity-pickers/PersonPicker';
import type { PersonResult } from '@/components/PersonSearch/PersonSearch';
import type { ModalEditorProps } from '@/components/modals/modalTypes';
import styles from './MarriageEditor.module.css';

interface MarriageEditorProps extends ModalEditorProps {
  personId: string;
  personName: string;
  onSaved?: () => void;
}

interface ActiveMarriage {
  id: string;
  spouse1_id: string | null;
  spouse2_id: string | null;
  marriage_date: string | null;
}

const MarriageEditor: React.FC<MarriageEditorProps> = ({
  personId,
  personName,
  onSaved,
  modalId,
  onClose,
}) => {
  const [spouse, setSpouse] = useState<PersonResult | null>(null);
  const [marriageDate, setMarriageDate] = useState('');
  const [marriagePlace, setMarriagePlace] = useState('');
  const [notes, setNotes] = useState('');
  const [activeMarriages, setActiveMarriages] = useState<ActiveMarriage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSpouseSelect = async (person: PersonResult) => {
    setSpouse(person);
    try {
      const res = await fetch(`/api/v1/families/person/${person.id}/active`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setActiveMarriages(data.activeMarriages ?? []);
      }
    } catch {
      setActiveMarriages([]);
    }
  };

  const handleSpouseClear = () => {
    setSpouse(null);
    setActiveMarriages([]);
  };

  const handleCancel = () => onClose({ action: 'cancelled' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Always create the marriage event
      const eventRes = await fetch(`/api/v1/events/people/${personId}/events`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'marriage',
          event_date: marriageDate || null,
          event_place: marriagePlace || null,
          description: notes || null,
        }),
      });

      if (!eventRes.ok) {
        let message = `HTTP ${eventRes.status}`;
        try {
          const err = await eventRes.json();
          message = err.error ?? message;
        } catch { /* non-JSON */ }
        setError(`Failed to save marriage event: ${message}`);
        return;
      }

      // Create the family record only when a spouse is selected
      if (spouse) {
        const familyRes = await fetch('/api/v1/families', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            spouse1_id: personId,
            spouse2_id: spouse.id,
            marriage_date: marriageDate || null,
            marriage_place: marriagePlace || null,
          }),
        });

        if (!familyRes.ok) {
          let message = `HTTP ${familyRes.status}`;
          try {
            const err = await familyRes.json();
            message = err.error ?? message;
          } catch { /* non-JSON */ }
          setError(`Marriage event saved, but failed to create family record: ${message}`);
          return;
        }
      }

      onSaved?.();
      onClose({
        action: 'created',
        entityType: 'marriage',
        entity: {
          spouseName: spouse?.displayName ?? null,
          marriageDate: marriageDate || null,
        },
      });
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
      aria-labelledby={`marriage-editor-title-${modalId}`}
      className={styles.overlay}
    >
      <div className={styles.header}>
        <h2 id={`marriage-editor-title-${modalId}`} className={styles.title}>
          Add Marriage · {personName}
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
        <p className={styles.sectionTitle}>Spouse</p>

        <PersonPicker
          label="Spouse"
          onSelect={handleSpouseSelect}
          onClear={handleSpouseClear}
        />

        {activeMarriages.length > 0 && (
          <p role="status" className={styles.warning}>
            ⚠ <strong>{spouse?.displayName}</strong> already has an active marriage on
            record. You may want to add a Divorce, Death, or Annulment event to that
            relationship first.
          </p>
        )}

        <hr className={styles.divider} />

        <p className={styles.sectionTitle}>Details</p>

        <div className={styles.row}>
          <FormGroup>
            <Label htmlFor={`me-date-${modalId}`}>Marriage Date</Label>
            <Input
              id={`me-date-${modalId}`}
              value={marriageDate}
              onChange={(e) => setMarriageDate(e.target.value)}
              placeholder="e.g. 14 Jun 1910"
            />
          </FormGroup>

          <FormGroup>
            <Label htmlFor={`me-place-${modalId}`}>Marriage Place</Label>
            <Input
              id={`me-place-${modalId}`}
              value={marriagePlace}
              onChange={(e) => setMarriagePlace(e.target.value)}
              placeholder="e.g. Boston, MA"
            />
          </FormGroup>
        </div>

        <FormGroup>
          <Label htmlFor={`me-notes-${modalId}`}>Notes</Label>
          <Input
            id={`me-notes-${modalId}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional details…"
          />
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

export default MarriageEditor;
```

- [ ] **Step 3: Register MarriageEditor in ModalManager**

In `frontend/src/components/modals/ModalManager.tsx`, add the import after the `MediaEditor` import (line 6):

```typescript
import MarriageEditor from '@/components/entity-editors/MarriageEditor';
```

Then add to the `REGISTRY` object (after the `MediaEditor` entry on line 21):

```typescript
  MarriageEditor: MarriageEditor as unknown as React.ComponentType<ModalEditorProps & Record<string, unknown>>,
```

The REGISTRY block should now look like:

```typescript
export const REGISTRY: ModalRegistry = {
  PersonEditor: PersonEditor as unknown as React.ComponentType<ModalEditorProps & Record<string, unknown>>,
  FamilyEditor: FamilyEditor as unknown as React.ComponentType<ModalEditorProps & Record<string, unknown>>,
  MediaEditor: MediaEditor as unknown as React.ComponentType<ModalEditorProps & Record<string, unknown>>,
  MarriageEditor: MarriageEditor as unknown as React.ComponentType<ModalEditorProps & Record<string, unknown>>,
};
```

- [ ] **Step 4: Type-check**

```bash
cd /data/Projects/AFT/frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd /data/Projects/AFT && git add frontend/src/components/entity-editors/MarriageEditor.tsx frontend/src/components/entity-editors/MarriageEditor.module.css frontend/src/components/modals/ModalManager.tsx
git commit -m "feat: add MarriageEditor modal component and register in ModalManager"
```

---

### Task 3: Frontend — PersonEditModal integration

**Files:**
- Modify: `frontend/src/components/PersonEditModal/PersonEditModal.tsx`

**Interfaces:**
- Consumes: `useModal` from `@/components/modals/useModal` — `const { openModal } = useModal()`
- Consumes: `MarriageEditor` registered as `'MarriageEditor'` in ModalManager (from Task 2)
- The `personId` prop and `displayName` prop are already available in the component

---

- [ ] **Step 1: Add `useModal` import**

In `frontend/src/components/PersonEditModal/PersonEditModal.tsx`, add to the existing imports:

```typescript
import { useModal } from '@/components/modals/useModal';
```

- [ ] **Step 2: Instantiate `useModal` in the component body**

In the component body (after existing `useState` declarations, around line 280), add:

```typescript
  const { openModal } = useModal();
```

- [ ] **Step 3: Add `handleAddMarriage` function**

After the `handleAddEvent` function (after line 747), add:

```typescript
  const handleAddMarriage = async () => {
    if (!personId) return;
    await openModal('MarriageEditor', {
      personId,
      personName: displayName,
      onSaved: () => {
        refreshPersonData();
        onSaved();
      },
    });
  };
```

Note: `refreshPerson` is the function defined around line 328 that re-fetches `GET /api/v1/people/{personId}`. Check the exact function name in the file. If it is named differently (e.g. `loadPerson`), use that name instead.

- [ ] **Step 4: Intercept marriage type in the Add Event form**

In `renderEventsTab`, the Add Event form starts at line 1384. It shows the full form (type selector + date + place + description) when `showAddEvent === true`.

Find the JSX block where `addEventForm.event_type` drives the form. After the Type `<Select>` element (around line 1399), add a conditional that replaces the remaining form fields with the "Add Marriage →" button when `marriage` is selected:

Replace this section in `renderEventsTab` (starting at the `{showAddEvent && (` block around line 1384):

```tsx
      {showAddEvent && (
        <div className={[styles.nameEditExpanded, styles.addEventForm].join(' ')}>
          <div className={styles.formGrid}>
            <label className={styles.formLabel}>
              Type
              <Select
                value={addEventForm.event_type}
                onChange={(e) => setAddEventForm((f) => ({ ...f, event_type: e.target.value }))}
              >
                {Object.entries(EVENT_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
            {addEventForm.event_type === 'marriage' ? (
              <div className={styles.fullWidth}>
                <Button
                  variant="primary"
                  size="sm"
                  type="button"
                  onClick={() => {
                    setShowAddEvent(false);
                    handleAddMarriage();
                  }}
                >
                  Add Marriage →
                </Button>
              </div>
            ) : (
              <>
                <label className={styles.formLabel}>
                  Date
                  <Input
                    value={addEventForm.event_date}
                    onChange={(e) => setAddEventForm((f) => ({ ...f, event_date: e.target.value }))}
                    placeholder="e.g. 1 JAN 1900"
                  />
                </label>
                <label className={styles.formLabel}>
                  Place
                  <Input
                    value={addEventForm.event_place}
                    onChange={(e) => setAddEventForm((f) => ({ ...f, event_place: e.target.value }))}
                    placeholder="City, State, Country"
                  />
                </label>
                <label className={[styles.formLabel, styles.fullWidth].join(' ')}>
                  Description
                  <textarea
                    className={styles.notesTextarea}
                    value={addEventForm.description}
                    onChange={(e) =>
                      setAddEventForm((f) => ({ ...f, description: e.target.value }))
                    }
                    placeholder="Additional details…"
                    rows={2}
                  />
                </label>
              </>
            )}
          </div>
          {addEventError && (
            <span className={styles.saveError} role="alert">
              {addEventError}
            </span>
          )}
          {addEventForm.event_type !== 'marriage' && (
            <div className={styles.saveRow}>
              <Button
                variant="primary"
                size="sm"
                onClick={handleAddEvent}
                loading={addEventSaving}
              >
                Add Event
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowAddEvent(false);
                  setAddEventError(null);
                }}
                disabled={addEventSaving}
              >
                Cancel
              </Button>
            </div>
          )}
          {addEventForm.event_type === 'marriage' && (
            <div className={styles.saveRow}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowAddEvent(false);
                  setAddEventError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}
```

- [ ] **Step 5: Type-check**

```bash
cd /data/Projects/AFT/frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
cd /data/Projects/AFT && git add frontend/src/components/PersonEditModal/PersonEditModal.tsx
git commit -m "feat: intercept marriage event type in PersonEditModal to open MarriageEditor"
```

---

### Task 4: Frontend — VitalEventsStep integration

**Files:**
- Modify: `frontend/src/components/WizardSteps/VitalEventsStep.tsx`
- Modify: `frontend/src/components/WizardSteps/VitalEventsStep.module.css`
- Modify: `frontend/src/pages/TreePage.tsx` (pass `editPersonId` + `personDisplayName` to VitalEventsStep)

**Interfaces:**
- Consumes: `useModal` from `@/components/modals/useModal`
- Consumes: `MarriageEditor` registered as `'MarriageEditor'` (from Task 2)
- The `editPersonId` value comes from TreePage state (already tracked as `const [editPersonId, setEditPersonId] = useState<string | null>(null)`)

---

- [ ] **Step 1: Update `VitalEventsStep` props and remove Marriage from ADDITIONAL_EVENT_TYPES**

In `frontend/src/components/WizardSteps/VitalEventsStep.tsx`, make the following changes:

**a) Remove `'Marriage'` from the array (line 11):**

Change:
```typescript
const ADDITIONAL_EVENT_TYPES = [
  'Baptism',
  'Christening',
  'Marriage',
  'Burial',
  'Cremation',
  'Immigration',
  'Emigration',
  'Census',
  'Graduation',
  'Retirement',
];
```

To:
```typescript
const ADDITIONAL_EVENT_TYPES = [
  'Baptism',
  'Christening',
  'Burial',
  'Cremation',
  'Immigration',
  'Emigration',
  'Census',
  'Graduation',
  'Retirement',
];
```

**b) Add imports for `useModal` and `useState`:**

Add to the top of the file (after existing imports):

```typescript
import { useState } from 'react';
import { useModal } from '@/components/modals/useModal';
```

**c) Update `VitalEventsStepProps`:**

Change the interface from:
```typescript
interface VitalEventsStepProps {
  data: WizardFormData;
  onChange: <K extends keyof WizardFormData>(field: K, value: WizardFormData[K]) => void;
}
```

To:
```typescript
interface VitalEventsStepProps {
  data: WizardFormData;
  onChange: <K extends keyof WizardFormData>(field: K, value: WizardFormData[K]) => void;
  editPersonId?: string | null;
  personDisplayName?: string;
}
```

**d) Update the component signature and add internal state + hooks:**

Change:
```typescript
const VitalEventsStep: React.FC<VitalEventsStepProps> = ({ data, onChange }) => {
```

To:
```typescript
const VitalEventsStep: React.FC<VitalEventsStepProps> = ({ data, onChange, editPersonId, personDisplayName }) => {
  const { openModal } = useModal();
  const [marriageChips, setMarriageChips] = useState<string[]>([]);
```

**e) Add `handleAddMarriage` function inside the component (before the `return`):**

```typescript
  const handleAddMarriage = async () => {
    if (!editPersonId) return;
    const result = await openModal('MarriageEditor', {
      personId: editPersonId,
      personName: personDisplayName ?? 'this person',
      onSaved: () => {/* parent refreshes after wizard complete */},
    });
    if (result.action === 'created') {
      const { spouseName, marriageDate } = result.entity as { spouseName: string | null; marriageDate: string | null };
      const parts = ['Married', spouseName, marriageDate].filter(Boolean);
      setMarriageChips((prev) => [...prev, parts.join(' · ')]);
    }
  };
```

**f) Add "Add Marriage" section to the JSX, below the `<TagPicker>` element:**

After the closing `/>` of `<TagPicker ... />`, add:

```tsx
      <div className={styles.marriageSection}>
        <div className={styles.marriageSectionHeader}>
          <h4 className={styles.sectionTitle}>Marriage</h4>
          <button
            type="button"
            className={styles.addMarriageBtn}
            onClick={handleAddMarriage}
            disabled={!editPersonId}
            title={!editPersonId ? 'Save the person first, then add the marriage' : undefined}
          >
            + Add Marriage
          </button>
        </div>
        {marriageChips.map((chip, i) => (
          <span key={i} className={styles.marriageChip}>
            {chip}
          </span>
        ))}
      </div>
```

- [ ] **Step 2: Add CSS for marriage section to VitalEventsStep.module.css**

Append to `frontend/src/components/WizardSteps/VitalEventsStep.module.css`:

```css
.marriageSection {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.marriageSectionHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.addMarriageBtn {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-primary);
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  transition: background-color var(--transition-fast);
}

.addMarriageBtn:hover:not(:disabled) {
  background-color: var(--color-gray-100);
}

.addMarriageBtn:disabled {
  color: var(--color-text-tertiary);
  cursor: not-allowed;
}

.marriageChip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  background-color: var(--color-gray-100);
  border-radius: var(--radius-full);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}
```

- [ ] **Step 3: Update TreePage.tsx to pass `editPersonId` and `personDisplayName` to VitalEventsStep**

In `frontend/src/pages/TreePage.tsx`, find the `renderStep` function (around line 264). Change the VitalEventsStep line from:

```tsx
        return <VitalEventsStep data={wizard.data} onChange={wizard.updateField} />;
```

To:

```tsx
        return (
          <VitalEventsStep
            data={wizard.data}
            onChange={wizard.updateField}
            editPersonId={editPersonId}
            personDisplayName={
              [wizard.data.givenName, wizard.data.surname].filter(Boolean).join(' ') || undefined
            }
          />
        );
```

- [ ] **Step 4: Type-check**

```bash
cd /data/Projects/AFT/frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd /data/Projects/AFT && git add frontend/src/components/WizardSteps/VitalEventsStep.tsx frontend/src/components/WizardSteps/VitalEventsStep.module.css frontend/src/pages/TreePage.tsx
git commit -m "feat: replace Marriage event in VitalEventsStep with Add Marriage button wired to MarriageEditor"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| MarriageEditor modal registered in ModalManager | Task 2 |
| PersonPicker for spouse selection | Task 2 |
| Warning banner when spouse has active marriage | Task 2 |
| Save creates event record | Task 2 |
| Save creates family record (if spouse selected) | Task 2 |
| No family record if no spouse selected | Task 2 |
| Save error shown inline; modal stays open on failure | Task 2 |
| `GET /families/person/:personId/active` endpoint | Task 1 |
| `findActiveByPerson` in FamilyRepository | Task 1 |
| PersonEditModal: marriage type → "Add Marriage →" button | Task 3 |
| PersonEditModal: onSaved refreshes person data | Task 3 |
| VitalEventsStep: Marriage removed from ADDITIONAL_EVENT_TYPES | Task 4 |
| VitalEventsStep: "Add Marriage" button added | Task 4 |
| VitalEventsStep: button disabled in create mode with tooltip | Task 4 |
| VitalEventsStep: summary chip appears after save | Task 4 |
| Route placed before `/:id` catch-all | Task 1 |
| Warning uses `role="status"`, error uses `role="alert"` | Task 2 |
