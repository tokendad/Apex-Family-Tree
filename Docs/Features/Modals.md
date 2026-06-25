# Modals Reference

This document lists every modal in the application, where it is triggered, and what it contains.

---

## Modal Infrastructure

The application uses two distinct modal systems:

**Entity-editor stack (ModalManager / ModalHost)** — A Zustand-powered modal stack that renders entity editors as centered overlays with a shared dark backdrop. Modals in this system are registered in `ModalManager.tsx` and opened via the `useModal()` hook. Supports stacked modals (e.g. opening a PersonEditor from inside a MarriageEditor).

**Standalone modals** — Simpler, self-contained components that manage their own `open` boolean state and are rendered directly in their parent page's JSX.

---

## Entity-Editor Modals (ModalManager stack)

### PersonEditor

**File:** `frontend/src/components/entity-editors/PersonEditor.tsx`

**Triggered from:** PersonPicker (when the user clicks "Create New Person"), FamilyEditor, MarriageEditor

**Mode:** `create` | `edit`

**Contents:**
- Prefix, Given Name, Middle Name, Surname, Suffix
- Nickname
- Display Name (optional override)
- Sex (Male / Female / Non-binary / Unknown)
- Save / Cancel actions
- Inline error banner on API failure

**On save:** POSTs to `POST /api/v1/people`, returns `{ action: 'created', entityType: 'person', entity: PersonSummary }` to the caller.

---

### FamilyEditor

**File:** `frontend/src/components/entity-editors/FamilyEditor.tsx`

**Triggered from:** Admin panel or any surface that creates a standalone family/relationship record (not tied to a specific marriage event).

**Mode:** `create` only

**Contents:**
- Spouse 1 — PersonPicker (search existing or create new via PersonEditor)
- Spouse 2 — PersonPicker (search existing or create new via PersonEditor)
- Marriage Date
- Marriage Place
- Save / Cancel actions
- Inline error banner on API failure

**On save:** POSTs to `POST /api/v1/families`, creates a `families` record linking the two spouses.

---

### MarriageEditor

**File:** `frontend/src/components/entity-editors/MarriageEditor.tsx`

**Triggered from:**
- PersonEditModal → Events tab (when "Marriage" is selected as event type, "Add Marriage →" button appears)
- VitalEventsStep wizard step (dedicated "Add Marriage" button, disabled until the person is first saved)

**Contents:**
- Spouse — PersonPicker (search existing or create new via PersonEditor); optional
- Active-marriage warning banner — amber, non-blocking. Appears when the selected spouse already has an active (non-divorced) marriage on record. Prompts the user to consider adding a Divorce, Death, or Annulment event first.
- Marriage Date
- Marriage Place
- Notes (written to the event record only)
- Save / Cancel actions
- Inline error banner on API failure

**On save (two records created):**
1. `POST /api/v1/events/people/{personId}/events` — creates a `marriage` event for the primary person (always)
2. `POST /api/v1/families` — creates a `families` relationship record (only if a spouse was selected)
3. Best-effort `POST /api/v1/events/people/{spouseId}/events` — creates a `marriage` event on the spouse's record (only if a spouse was selected; failure is logged but does not block the save)

**On close:** Returns `{ action: 'created', entityType: 'marriage', entity: { spouseName, marriageDate } }` to the caller.

---

### MediaEditor

**File:** `frontend/src/components/entity-editors/MediaEditor.tsx`

**Triggered from:** MediaPage (clicking any thumbnail in the gallery opens the media detail view)

**Contents:**
- Hero image (full-width) or document icon + download link (for PDFs)
- MediaPersonTagger — face/region tagging tool, auto-enabled for images
- Editable fields (inline click-to-edit): Title, Date Taken, Description
- Tagged People — chips with remove button; add-person dropdown (editors+)
- Linked Families — chips with remove button; add-family dropdown (editors+)
- Linked Events — chips with remove button; add-event dropdown (editors+)
- Read-only metadata: uploaded by, date added, original filename, file size
- Delete button (admin only) — requires two-click confirmation; permanently removes the file

**On save (inline edits):** PUTs to `PUT /api/v1/media/:id`; updates the gallery card in place via `onMediaUpdated` callback.

**On delete:** DELETEs via `DELETE /api/v1/media/:id`; removes the item from the gallery via `onMediaDeleted` callback.

---

## Standalone Modals

### PersonEditModal

**File:** `frontend/src/components/PersonEditModal/PersonEditModal.tsx`

**Triggered from:** TreePage (clicking a person node or "Edit Person" from the context panel)

**Type:** Full-screen tabbed modal for viewing and editing all details of a single person.

**Tabs:**

| Tab | Contents |
|-----|----------|
| **Basic Info** | Sex, Living/Private flags, Display Name; name records (birth name, married name, AKA, nickname, formal, religious) with add/edit/delete; each name has Prefix, Given, Middle, Surname, Suffix, Nickname, Primary flag |
| **Relationships** | Parent families (families where this person is listed as a child); spouse families (families where this person is a spouse); each family links to the other party's name and the family record |
| **Events** | List of life events with date, place, description; Add Event form with event type dropdown (birth, death, burial, baptism, graduation, immigration, occupation, etc.); selecting "Marriage" suppresses the inline form and shows an "Add Marriage →" button that opens MarriageEditor |
| **Media** | Gallery of media items linked to this person; clicking a thumbnail opens MediaEditor |
| **Notes** | Free-text notes field for the person record |

---

### Add Person Wizard (WizardModal)

**File:** `frontend/src/components/WizardModal/WizardModal.tsx` (shell)
**Steps:** `frontend/src/components/WizardSteps/`

**Triggered from:** TreePage "Add Person" button

**Type:** Multi-step wizard rendered inside the WizardModal shell, which provides Back/Next/Save navigation, a step indicator, and an unsaved-changes confirmation on close.

**Steps:**

| Step | Name | Contents |
|------|------|----------|
| 1 | **Personal Info** | Given Name, Surname, Prefix, Suffix, Middle Name, Nickname, Sex, Living flag, Privacy flag |
| 2 | **Vital Events** | Birth date/place, Death date/place, Burial date/place; additional events (Baptism, Christening, Immigration, Graduation, etc.) via add-event chips; "Add Marriage" button — disabled in create mode (person must be saved first), enabled in edit mode and opens MarriageEditor |
| 3 | **Relationships** | Parent family picker; spouse family picker |
| 4 | **Media & Notes** | Photo upload or link; free-text notes |

---

### InviteUserModal

**File:** `frontend/src/components/InviteUserModal/InviteUserModal.tsx`

**Triggered from:** Admin panel → Users tab → "Invite User" button

**Contents:**
- Email address
- Role (Viewer / Editor / Limited Editor / Admin)
- Optional personal message
- Save / Cancel actions
- On success: displays the generated invite link/token so the admin can share it

**On save:** POSTs to the invite endpoint; displays the resulting invite token inline.

---

### CreateUserModal

**File:** `frontend/src/components/CreateUserModal/CreateUserModal.tsx`

**Triggered from:** Admin panel → Users tab → "Create User" button

**Contents:**
- Email address
- Display Name
- Password + Confirm Password
- Role (Viewer / Editor / Limited Editor / Admin)
- Save / Cancel actions
- Inline success/error feedback

**On save:** POSTs to the user creation endpoint; creates the account directly without requiring an invite flow.

---

## Entity Pickers (not modals, but modal-adjacent)

### PersonPicker

**File:** `frontend/src/components/entity-pickers/PersonPicker.tsx`

Not a modal itself — an inline search-and-select component embedded inside FamilyEditor and MarriageEditor. Provides a text search field that queries existing people; shows a "Create New Person" option that opens PersonEditor in a stacked modal. Returns a `PersonResult` to the parent editor.
