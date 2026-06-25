# Design: MarriageEditor Modal

**Date:** 2026-06-25
**Status:** Approved

---

## Overview

When a user adds a "Marriage" event from either the PersonEditModal or the VitalEventsStep wizard, the generic event form is insufficient — it has no way to link a spouse. This design replaces the inline marriage event form with a dedicated `MarriageEditor` modal that creates both an event record and a family (relationship) record, with an optional non-blocking warning when the selected spouse already has an active marriage on record.

---

## MarriageEditor Component

### Location

`frontend/src/components/entity-editors/MarriageEditor.tsx`
`frontend/src/components/entity-editors/MarriageEditor.module.css`

Registered in `ModalManager` alongside `PersonEditor`, `FamilyEditor`, and `MediaEditor`.

### Props

```typescript
interface MarriageEditorProps extends ModalEditorProps {
  personId: string;      // The person being edited (one side of the marriage)
  personName: string;    // Display name shown in header: "Adding marriage for Jane Smith"
  onSaved?: () => void;  // Called after both records are successfully created
}
```

### Layout

```
┌─────────────────────────────────────────┐
│  Add Marriage · Jane Smith        [✕]   │  ← header
├─────────────────────────────────────────┤
│  Spouse                                 │
│  [PersonPicker — search or create]      │
│                                         │
│  ⚠ John Doe already has an active       │  ← warning banner (conditional)
│    marriage on record. Consider         │
│    adding a Divorce or Death event      │
│    to that record first.                │
│                                         │
│  Marriage Date   [______________]       │
│  Marriage Place  [______________]       │
│  Notes           [______________]       │
├─────────────────────────────────────────┤
│                   [Cancel]  [Save]      │
└─────────────────────────────────────────┘
```

### Fields

| Field | Maps to | Notes |
|-------|---------|-------|
| Spouse | `families.spouse2_id` | PersonPicker; optional. If blank, only event is created. |
| Marriage Date | `events.event_date` + `families.marriage_date` | Shared value written to both records |
| Marriage Place | `events.event_place` + `families.marriage_place` | Shared value written to both records |
| Notes | `events.description` | Only written to event record |

### Save Behavior

When the user clicks Save, two sequential API calls are made:

1. `POST /api/v1/events/people/{personId}/events`
   ```json
   { "event_type": "marriage", "event_date": "...", "event_place": "...", "description": "..." }
   ```

2. `POST /api/v1/families` *(only if a spouse was selected)*
   ```json
   { "spouse1_id": "{personId}", "spouse2_id": "{spouseId}", "marriage_date": "...", "marriage_place": "..." }
   ```

If either call fails, an inline save error is shown and the modal stays open for retry. On success, `onSaved?.()` is called and the modal closes.

### Warning Banner

After a spouse is selected, the frontend calls `GET /api/v1/families/person/{spouseId}/active`. If `activeMarriages.length > 0`, an amber warning banner is shown:

> ⚠ **[Spouse Name]** already has an active marriage on record. You may want to add a Divorce, Death, or Annulment event to that relationship first.

- Styled as amber/warning (matching the tree filter banner pattern)
- `role="status"` — informational, not blocking
- Save button remains enabled
- Banner disappears if the spouse is cleared

---

## Backend: New Endpoint

### `GET /api/v1/families/person/:personId/active`

Returns active (non-divorced) families for a given person.

**Response:**
```json
{
  "activeMarriages": [
    {
      "id": "string",
      "spouse1_id": "string | null",
      "spouse2_id": "string | null",
      "marriage_date": "string | null"
    }
  ]
}
```

**Implementation:** New `findActiveByPerson(personId: string)` method on `FamilyRepository`:

```sql
SELECT id, spouse1_id, spouse2_id, marriage_date
FROM families
WHERE (spouse1_id = ? OR spouse2_id = ?)
  AND divorce_date IS NULL
```

Route added to `backend/src/routes/families.ts` **before** the `/:id` catch-all.

---

## Integration Points

### PersonEditModal (Events Tab)

- The "marriage" option remains in the event type dropdown
- When `event_type === 'marriage'` is selected, the inline date/place/description form is suppressed
- A single **"Add Marriage →"** button replaces the form fields, calling `openModal('MarriageEditor', { personId, personName })`
- `onSaved` callback: refetches `GET /api/v1/people/{id}` to refresh both the events list and the families/relationships section

### VitalEventsStep (Person Wizard)

- `"Marriage"` is removed from `ADDITIONAL_EVENT_TYPES`
- A separate **"Add Marriage"** button is added beneath the additional events list
- **Create mode** (new person not yet saved): button is disabled with tooltip *"Save the person first, then add the marriage"*
- **Edit mode** (existing person): button calls `openModal('MarriageEditor', { personId, personName })`
- `onSaved` callback: appends a read-only summary chip to the step — *"Married · [Spouse Name] · [Date]"* — confirming the record was created without allowing mid-wizard editing

---

## Files Changed

| File | Action | Change |
|------|--------|--------|
| `frontend/src/components/entity-editors/MarriageEditor.tsx` | Create | New modal component |
| `frontend/src/components/entity-editors/MarriageEditor.module.css` | Create | Modal styles |
| `frontend/src/components/modals/ModalManager.tsx` | Modify | Add MarriageEditor to REGISTRY |
| `frontend/src/pages/PersonEditModal.tsx` | Modify | Intercept marriage event type → open MarriageEditor |
| `frontend/src/components/WizardSteps/VitalEventsStep.tsx` | Modify | Remove marriage from event types, add "Add Marriage" button |
| `backend/src/routes/families.ts` | Modify | Add `GET /families/person/:personId/active` route |
| `backend/src/repositories/FamilyRepository.ts` | Modify | Add `findActiveByPerson(personId)` method |

---

## Verification Checklist

- [ ] "Add Marriage →" button appears in PersonEditModal events tab when marriage is selected
- [ ] MarriageEditor modal opens centered with correct person name in header
- [ ] PersonPicker allows searching existing people and creating a new person via PersonEditor
- [ ] Warning banner appears when selected spouse already has an active marriage (no divorce on record)
- [ ] Warning banner disappears when spouse is cleared
- [ ] Save with spouse: both event record and family record are created
- [ ] Save without spouse: only event record is created, no family record
- [ ] Save error shown inline if either API call fails; modal stays open
- [ ] After save: PersonEditModal events list and families section both refresh
- [ ] VitalEventsStep: "Marriage" removed from ADDITIONAL_EVENT_TYPES dropdown
- [ ] VitalEventsStep: "Add Marriage" button disabled in create mode with tooltip
- [ ] VitalEventsStep: "Add Marriage" button enabled in edit mode, opens MarriageEditor
- [ ] VitalEventsStep: summary chip appears after successful save
- [ ] `GET /api/v1/families/person/:personId/active` returns correct active marriages
- [ ] Warning check does not block Save
- [ ] No TypeScript errors (`tsc --noEmit`)
