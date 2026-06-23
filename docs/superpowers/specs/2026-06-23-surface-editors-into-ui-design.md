# Design: Surface Entity Editors into UI

**Date:** 2026-06-23  
**Status:** Approved

## Problem

PersonEditor, FamilyEditor, and PersonPicker were built but not wired to any reachable UI. The "Add Person" and "Add Family" buttons navigate to dead routes (`/people/new`, `/families/new`). Empty spouse slots on FamilyDetailPage offer no action. PersonDetailPage has no way to create a family from a person's profile.

## Scope

Four targeted page edits. No new components, no new routes.

---

## Integration Points

### 1. PeoplePage — "Add Person" button

**Current:** `onClick={() => navigate('/people/new')}` (hits catch-all 404)

**New:** Call `openModal<PersonResult>('PersonEditor', { mode: 'create' })`. On `action: 'created'`, navigate to `/people/${result.entity.id}`. On `action: 'cancelled'`, do nothing.

`PersonResult` is the shape returned by PersonEditor: `{ id, given_name, surname, birth_date, death_date, photo_url }` (matches `PersonSummary`).

---

### 2. FamiliesPage — "Add Family" button

**Current:** `onClick={() => navigate('/families/new')}` (hits catch-all 404)

**New:** Call `openModal<FamilySummary>('FamilyEditor', { mode: 'create' })`. On `action: 'created'`, navigate to `/families/${result.entity.id}`. On `action: 'cancelled'`, do nothing.

`FamilySummary.id` is the newly created family's id.

---

### 3. FamilyDetailPage — empty spouse slots

**Current:** `SpouseCard` renders "Not recorded" text with no action when `person` is null.

**New:** When `person` is null and the user `canEdit`, render a `PersonPicker` component in place of "Not recorded". Selecting an existing person or creating a new one (via PersonPicker's built-in "Create New" flow) triggers a `PUT /api/v1/families/:id` with `{ spouse1_id }` or `{ spouse2_id }` set to the selected person's id. On success, call `fetchFamily()` to re-fetch and refresh the view.

`SpouseCard` gains props:
- `slot: 'spouse1' | 'spouse2'` — which field to update
- `onAssign: (personId: string) => Promise<void>` — called after picker selects/creates

The existing edit form (marriage date/place/divorce) is unchanged.

Error from the PATCH is surfaced in the page-level `error` state.

---

### 4. PersonDetailPage — "Add Family" button

**Current:** Relationships section shows family cards but has no create action.

**New:** A `+ Add Family` button appears at the top of the "Family relationships" section, behind `canCreate`. Clicking it calls:

```ts
openModal<FamilySummary>('FamilyEditor', { mode: 'create', defaults: { spouse1_id: id } })
```

On `action: 'created'`, navigate to `/families/${result.entity.id}`.

---

## Data Flow Summary

```
PeoplePage "+ Add Person"
  → openModal('PersonEditor', { mode: 'create' })
  → ModalResult<PersonSummary>
  → navigate('/people/:id')

FamiliesPage "+ Add Family"
  → openModal('FamilyEditor', { mode: 'create' })
  → ModalResult<FamilySummary>
  → navigate('/families/:id')

FamilyDetailPage empty spouse slot
  → PersonPicker (search or create)
  → PUT /api/v1/families/:id { spouse1_id | spouse2_id }
  → fetchFamily() re-fetch

PersonDetailPage "+ Add Family"
  → openModal('FamilyEditor', { mode: 'create', defaults: { spouse1_id: currentPersonId } })
  → ModalResult<FamilySummary>
  → navigate('/families/:id')
```

## What is NOT in scope

- Removing/replacing spouses already assigned (edit mode for spouse fields)
- Adding children from FamilyDetailPage
- PersonDetailPage "child of" family creation
- Any changes to the modal system itself
