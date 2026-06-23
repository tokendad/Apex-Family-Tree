# Entity Editor and Picker Modal System Plan

## Project Context

This plan describes a reusable modal and editor workflow for a family tree application. The goal is to let users create, edit, select, and link genealogy records from anywhere in the app without breaking their current workflow.

The main idea is not simply "modals calling other modals." A better architecture is:

> Entity Picker + Entity Editor + Modal Manager

This allows one workflow, such as adding a family, to request related data, such as a spouse, child, source, media item, or location, and create that missing data inline when needed.

---

## Problem Being Solved

Family tree software requires many connected record types:

- People
- Families
- Relationships
- Events
- Locations
- Sources
- Citations
- Media
- Notes
- Repositories

When a user is editing one record, they often discover that a related record does not exist yet.

Example:

1. User is adding a family.
2. User needs to add a spouse.
3. The spouse does not exist in the database.
4. User should be able to create that person without leaving the Family editor.
5. After saving the new person, the Family editor should automatically receive and link that person.

The system should make this smooth, reusable, and consistent across the application.

---

## Recommended Terminology

Use the following terminology in code, documentation, and development prompts.

### Preferred Terms

- Entity Editor
- Entity Picker
- Modal Manager
- Dialog Stack
- Inline Create Workflow
- Create-on-the-fly Entity Selection
- Genealogy Record Editor
- Relationship Picker

### Avoid Describing It As

- "Modal calls modal"
- "Nested popup system"
- "Popup chain"

Those descriptions are technically understandable, but they can lead to tangled component dependencies.

### Recommended Description

> Implement a reusable Entity Editor and Entity Picker system. Each major genealogy record type should have a reusable editor component. Any form that references another entity should use an Entity Picker that allows the user to search existing records, select one, or create a new one inline. Creation should be handled through a centralized Modal Manager or Dialog Stack so nested workflows can return the newly created entity back to the original form without tightly coupling components.

---

## Core Architecture

The system should be built around three main pieces:

```text
Entity Picker -> Entity Editor -> Modal Manager
```

### Entity Picker

An Entity Picker is responsible for searching, selecting, and optionally creating an entity.

Examples:

- PersonPicker
- SourcePicker
- LocationPicker
- MediaPicker
- FamilyPicker
- RepositoryPicker
- EventPicker

Each picker should support:

- Search existing records
- Display possible matches
- Select an existing record
- Create a new record
- Edit a selected record
- Return the selected or created entity to the parent workflow

### Entity Editor

An Entity Editor is responsible for creating or editing a specific record type.

Examples:

- PersonEditor
- FamilyEditor
- SourceEditor
- CitationEditor
- MediaEditor
- LocationEditor
- EventEditor
- RepositoryEditor
- NoteEditor

Each editor should support at least these modes:

```text
create
edit
view
select
```

Example:

```tsx
<PersonEditor mode="create" />
<PersonEditor mode="edit" personId="person_123" />
```

### Modal Manager

The Modal Manager should be the only system responsible for opening, stacking, closing, and returning results from modals.

Editors should not directly import and control each other.

Instead of this:

```text
FamilyEditor imports PersonEditor
PersonEditor imports SourceEditor
SourceEditor imports LocationEditor
```

Use this:

```text
FamilyEditor requests PersonEditor from ModalManager
PersonEditor returns a result
FamilyEditor receives the result
```

---

## Example Workflow: Add Family With New Spouse

```text
1. User opens FamilyEditor.
2. User clicks Add Spouse.
3. FamilyEditor opens PersonPicker.
4. User searches for the spouse.
5. No matching person is found.
6. User clicks Create New Person.
7. PersonEditor opens in create mode.
8. User enters the new person.
9. User saves.
10. PersonEditor returns the new person record.
11. PersonPicker returns that person to FamilyEditor.
12. FamilyEditor links the person as a spouse.
13. User saves the family.
```

The user should feel like this is one continuous workflow.

---

## Example Workflow: Add Birth Event With New Location and Source

```text
1. User opens PersonEditor.
2. User adds a Birth event.
3. User clicks Birth Location.
4. LocationPicker opens.
5. User searches for the location.
6. Location does not exist.
7. LocationEditor opens in create mode.
8. User saves location.
9. Birth event receives the new locationId.
10. User clicks Add Source.
11. SourcePicker opens.
12. User selects or creates a source.
13. CitationEditor opens to capture page number, URL, transcription, and confidence.
14. Citation is linked to the Birth event.
```

---

## Recommended Project Structure

```text
src/
  components/
    modals/
      ModalManager.tsx
      ModalHost.tsx
      modalTypes.ts
      useModal.ts

    entity-editors/
      PersonEditor.tsx
      FamilyEditor.tsx
      SourceEditor.tsx
      CitationEditor.tsx
      MediaEditor.tsx
      LocationEditor.tsx
      EventEditor.tsx
      RepositoryEditor.tsx
      NoteEditor.tsx

    entity-pickers/
      PersonPicker.tsx
      FamilyPicker.tsx
      SourcePicker.tsx
      CitationPicker.tsx
      MediaPicker.tsx
      LocationPicker.tsx
      EventPicker.tsx
      RepositoryPicker.tsx

  features/
    people/
      peopleApi.ts
      peopleTypes.ts
      peopleUtils.ts

    families/
      familiesApi.ts
      familiesTypes.ts

    sources/
      sourcesApi.ts
      sourcesTypes.ts

    media/
      mediaApi.ts
      mediaTypes.ts

    locations/
      locationsApi.ts
      locationsTypes.ts

    events/
      eventsApi.ts
      eventsTypes.ts

  types/
    genealogy.ts

  services/
    api/
      apiClient.ts
```

---

## Recommended Entity Types

### Person

Represents an individual.

Suggested fields:

```ts
// Matches PersonResult from PersonSearch and the API response shape.
// Names live in a separate names table — given_name/surname come from
// the primary name row joined to the person record.
type PersonSummary = {
  id: string;
  given_name: string | null;
  surname: string | null;
  birth_date: string | null;
  death_date: string | null;
  photo_url: string | null;   // served as /api/v1/media/:id — never a raw file path
};
```

### Family

Represents a family unit or partnership.

Suggested fields:

```ts
// Matches the actual families table schema.
// Children are stored in a separate family_members join table — there is
// no childIds column. Events are per-person, not per-family.
type FamilySummary = {
  id: string;
  spouse1_id: string | null;
  spouse2_id: string | null;
  spouse1: PersonSummary | null;   // joined for display
  spouse2: PersonSummary | null;
  marriage_date: string | null;
  marriage_place: string | null;
};
```

### Relationship

Represents a connection between two people.

Suggested fields:

```ts
type Relationship = {
  id: string;
  person1Id: string;
  person2Id: string;
  type:
    | "spouse"
    | "parent"
    | "child"
    | "sibling"
    | "adoptive_parent"
    | "step_parent"
    | "guardian"
    | "custom";
  startDate?: string;
  endDate?: string;
  notes?: string;
};
```

### Event

Represents a life event.

Suggested event types:

```text
birth
death
marriage
divorce
residence
burial
baptism
immigration
military
occupation
education
custom
```

Suggested fields:

```ts
type Event = {
  id: string;
  type: string;
  date?: string;
  dateOriginalText?: string;
  locationId?: string;
  personIds?: string[];
  familyId?: string;
  citationIds: string[];
  notes?: string;
};
```

### Source

Represents the source itself.

Examples:

- 1900 United States Census
- Birth Certificate of John Smith
- Family Bible
- FindAGrave memorial
- Newspaper obituary

Suggested fields:

```ts
type Source = {
  id: string;
  title: string;
  author?: string;
  publisher?: string;
  publicationDate?: string;
  repositoryId?: string;
  url?: string;
  notes?: string;
};
```

### Citation

Represents the use of a source to support a specific fact.

A source is the thing. A citation is the use of that thing as evidence.

Suggested fields:

```ts
type Citation = {
  id: string;
  sourceId: string;
  linkedEntityType: "person" | "family" | "event" | "relationship" | "media";
  linkedEntityId: string;
  detail?: string;
  pageNumber?: string;
  url?: string;
  transcription?: string;
  citationText?: string;
  confidence?: "low" | "medium" | "high";
  notes?: string;
};
```

### Media

Represents uploaded images, documents, audio, or video.

Suggested fields:

```ts
type Media = {
  id: string;
  title: string;
  fileUrl: string;
  fileType: "image" | "document" | "audio" | "video" | "other";
  linkedPersonIds?: string[];
  linkedFamilyIds?: string[];
  linkedEventIds?: string[];
  linkedSourceIds?: string[];
  date?: string;
  locationId?: string;
  notes?: string;
};
```

### Location

Represents a place.

Suggested fields:

```ts
type Location = {
  id: string;
  name: string;
  address?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  historicalName?: string;
  modernName?: string;
  notes?: string;
};
```

### Repository

Represents where a source is held.

Examples:

- National Archives
- Ancestry.com
- FamilySearch
- Local courthouse
- Personal collection

Suggested fields:

```ts
type Repository = {
  id: string;
  name: string;
  type?: "archive" | "website" | "library" | "courthouse" | "personal_collection" | "other";
  url?: string;
  locationId?: string;
  notes?: string;
};
```

---

## Modal Result Contract

Every modal should return a predictable result.

Example result for a created person:

```ts
type ModalResult<T> =
  | {
      action: "created" | "updated" | "selected";
      entityType: string;
      entity: T;
    }
  | {
      action: "cancelled";
    };
```

Example:

```ts
{
  action: "created",
  entityType: "person",
  entity: {
    id: "person_123",
    given_name: "Mary",
    surname: "Johnson",
    birth_date: null,
    death_date: null,
    photo_url: null
  }
}
```

This allows the parent form to continue cleanly after a child modal closes.

---

## Modal Manager Concept

The Modal Manager should support an API similar to this:

```ts
// The project uses plain useState — no react-hook-form.
const result = await openModal<PersonSummary>("PersonEditor", {
  mode: "create",
  defaults: {
    surname: "Johnson"
  }
});

if (result.action === "created") {
  setSpouse2Id(result.entity.id);
}
```

### Responsibilities

The Modal Manager should handle:

- Opening modals
- Closing modals
- Modal stacking
- Passing props to modals
- Returning results to the caller
- Preventing broken modal chains
- Handling cancel events
- Supporting breadcrumbs or back navigation for nested workflows

---

## UX Recommendations

### Use Pickers Before Editors

Any field that references another entity should use a picker.

Examples:

```text
Spouse field -> PersonPicker
Child field -> PersonPicker
Birthplace field -> LocationPicker
Source field -> SourcePicker
Media field -> MediaPicker
Repository field -> RepositoryPicker
```

### Quick Create vs Full Edit

Use this rule:

```text
Quick create = modal or drawer
Complex edit = full page
```

For example:

- Quickly adding a person from FamilyEditor can be a modal.
- Deep editing a person with many events, sources, and media may deserve a full page.

### Avoid Deep Modal Nesting

Avoid this if possible:

```text
Family modal
  Person modal
    Source modal
      Location modal
        Media modal
```

Better options:

1. Use a modal stack with breadcrumbs.
2. Use side drawers.
3. Use quick-create forms for simple records.
4. Save the current draft and open complex records in full-page edit mode.

### Breadcrumb Example

```text
Family > Add Spouse > New Person > Birth Location
```

### Duplicate Prevention

Before creating a new person, location, source, or family, the app should search for likely existing matches.

Example:

```text
Possible existing people:
- Mary Johnson, born 1884, Boston
- Mary A. Johnson, born about 1885, Massachusetts
```

The user should be offered:

- Use existing
- Create anyway
- Compare records

This is especially important in genealogy software.

---

## Component Design Examples

### PersonPicker

Responsibilities:

- Search people by name, date, location, and family links
- Display likely matches
- Select existing person
- Create new person
- Return selected or created person

Example props:

```ts
// onSelect receives a PersonResult (snake_case) — the shape PersonSearch
// already passes. No relationshipContext prop — pickers stay generic (ADR-004).
type PersonPickerProps = {
  label?: string;
  value?: string | null;        // current selection by person ID
  defaultSearch?: string;
  onSelect: (person: PersonResult) => void;
  onClear?: () => void;
};
```

### FamilyEditor

Should include:

- Spouse 1 PersonPicker
- Spouse 2 PersonPicker
- Children PersonPicker
- Family events
- Family notes
- Family citations
- Family media

### SourcePicker

Should include:

- Search existing sources
- Filter by type
- Create source
- Edit selected source
- Attach citation after selection

### CitationEditor

Should include:

- Source selection
- Page or detail
- URL
- Date accessed
- Transcription
- Confidence
- Notes
- Linked fact/event/person/family

### MediaEditor

Should include:

- Upload or select existing file
- Title
- Date
- Location
- Linked source
- Linked event
- Notes

> **Note:** Person tagging (drawing rectangular regions on a media item and linking them to people) is already fully implemented by `MediaPersonTagger` (`frontend/src/components/MediaPersonTagger/MediaPersonTagger.tsx`). MediaEditor should embed `MediaPersonTagger` rather than re-implement tagging.

---

## Suggested Implementation Phases

### Phase 1: Define Data Types

Create shared TypeScript types for:

- Person
- Family
- Relationship
- Event
- Source
- Citation
- Media
- Location
- Repository
- ModalResult

Deliverables:

```text
src/types/genealogy.ts
src/components/modals/modalTypes.ts
```

### Phase 2: Build Modal Infrastructure

Create:

- ModalManager
- ModalHost
- useModal hook
- ModalResult contract
- Modal stack state

Deliverables:

```text
src/components/modals/ModalManager.tsx
src/components/modals/ModalHost.tsx
src/components/modals/useModal.ts
```

Acceptance criteria:

- A component can open a modal.
- A modal can return a result.
- A modal can be cancelled.
- Nested modals can return to their parent.

### Phase 3: Build First Entity Picker and Editor

Start with Person because it is central to all genealogy workflows.

Create:

- PersonPicker
- PersonEditor

Then immediately refactor:

- `MediaPersonTagger` — replace its local inline create form (`showCreatePerson` / `handleCreatePerson`) with `PersonPicker` → `ModalManager` so all "create person" entry points share one implementation.

Acceptance criteria:

- User can search people.
- User can select an existing person.
- User can create a new person.
- Newly created person is returned to the original workflow.
- `MediaPersonTagger`'s "Create New Person" flow routes through `PersonPicker` and returns a `ModalResult<PersonSummary>`.

### Phase 4: Build Family Editor

Create:

- FamilyEditor
- spouse fields using PersonPicker
- children list using PersonPicker
- family events section

Acceptance criteria:

- User can create a family using existing people.
- User can create a missing spouse inline.
- User can create a missing child inline.
- Family saves linked person IDs correctly.

### Phase 5: Add Location Support

Create:

- LocationPicker
- LocationEditor

Acceptance criteria:

- Events can link to locations.
- Missing locations can be created inline.
- Location duplicate suggestions appear before creation.

### Phase 6: Add Source and Citation Support

Create:

- SourcePicker
- SourceEditor
- CitationEditor

Acceptance criteria:

- A fact or event can be supported by a citation.
- Citation links to a source.
- Missing source can be created inline.
- Citation captures page/detail/transcription/confidence.

### Phase 7: Add Media Support

`MediaPersonTagger` (canvas-based person region tagging) is already production-complete in the codebase. Do not rebuild tagging.

Create:

- MediaPicker — search and select existing media items
- MediaEditor — upload/edit metadata + embed `MediaPersonTagger` for tagging

Refactor:

- Wire `MediaPersonTagger`'s inline "Create New Person" flow through `PersonPicker` → `ModalManager` so newly created persons return a `ModalResult<PersonSummary>` instead of using a local form.

Acceptance criteria:

- Media can be attached to people, families, events, and sources.
- Person tagging uses the existing `MediaPersonTagger` component (no duplicate implementation).
- Creating a new person from inside `MediaPersonTagger` routes through the ModalManager and returns to the tagger.

### Phase 8: Add Duplicate Detection

Add duplicate detection for:

- Person
- Location
- Source
- Family

Acceptance criteria:

- Before creating a record, app searches likely matches.
- User can select existing match.
- User can intentionally create a new record anyway.

### Phase 9: Polish UX

Add:

- Breadcrumbs for nested workflows
- Unsaved changes warning
- Keyboard escape behavior
- Draft saving
- Loading states
- Error states
- Mobile-friendly drawer behavior

---

## Technical Guardrails

### Avoid Tight Coupling

Entity editors should not directly import and launch other editors.

Bad:

```tsx
import PersonEditor from "../PersonEditor";
```

Better:

```tsx
const modal = useModal();
await modal.open("PersonEditor", props);
```

### Keep Entity Pickers Generic

A picker should not know too much about the form that launched it.

Good:

```tsx
<PersonPicker onSelect={(person) => setSpouse(person)} />
```

Bad:

```tsx
<PersonPicker familyEditorMode spouseNumber={2} />
```

### Return Full Entity Objects When Possible

When a user creates a new entity, return enough data for the parent UI to update immediately.

Good:

```ts
{
  id: "person_123",
  given_name: "Mary",
  surname: "Johnson",
  birth_date: "1884",
  death_date: null,
  photo_url: null
}
```

Not just:

```ts
"person_123"
```

> `displayName` is not a stored field — use `getPersonDisplayName(entity)` from `entityDisplay.ts` to derive it when needed.

### Standardize Display Names

Each entity should have a display helper in `frontend/src/utils/entityDisplay.ts`.

```ts
getPersonDisplayName(person)
getLocationDisplayName(location)
getSourceDisplayName(source)
getFamilyDisplayName(family)
```

**Important:** Three independent local copies of `personDisplayName` currently exist and must be deleted when `entityDisplay.ts` is introduced:

- `frontend/src/components/PersonSearch/PersonSearch.tsx:24` — `function personDisplayName(p: PersonResult)`
- `frontend/src/components/MediaPersonTagger/MediaPersonTagger.tsx:52` — `function personDisplayName(person: {...})`
- `backend/src/services/gedcom/mergeAnalysis.ts:27` — `function fullName(given, surname)` (backend copy; align separately)

This keeps pickers and editors consistent.

---

## Example Development Prompt for Codex or Copilot

```text
Implement a reusable Entity Picker and Entity Editor system for the family tree app.

Create a Modal Manager that supports opening named modals, passing props, stacking nested modals, and returning typed results to the caller.

Start with PersonPicker and PersonEditor.

PersonPicker should allow searching existing people, selecting a person, or creating a new person inline. If the user creates a new person, open PersonEditor in create mode through the Modal Manager. When saved, return the created person to PersonPicker, then return the selected person to the parent form.

Create a reusable ModalResult type with actions: created, updated, selected, cancelled.

Do not directly couple FamilyEditor to PersonEditor. All modal opening should happen through the Modal Manager or useModal hook.

After PersonPicker and PersonEditor work, update FamilyEditor so spouse and child fields use PersonPicker.
```

---

## MVP Scope

For the first working version, build only:

- ModalManager
- ModalHost
- useModal
- ModalResult type
- `entityDisplay.ts` (consolidate the three existing `personDisplayName` copies)
- PersonPicker
- PersonEditor
- FamilyEditor with spouse and child PersonPicker fields
- Refactor `MediaPersonTagger` inline create to use PersonPicker + ModalManager

Do not start with every modal at once.

Once this works, add:

1. LocationPicker and LocationEditor
2. SourcePicker and SourceEditor
3. CitationEditor
4. MediaPicker and MediaEditor (embedding existing `MediaPersonTagger`)

---

## Final Recommendation

The best implementation pattern is:

```text
Entity Picker + Entity Editor + Modal Manager
```

This gives the app the flexible workflow you want while keeping the code maintainable.

The family tree application should feel like the user can build records naturally:

- Add a family
- Add a missing spouse
- Add a missing child
- Add a marriage event
- Add a location
- Add a source
- Add a citation
- Return to the original family form with everything linked

The user should never feel forced to stop their current task, navigate elsewhere, create a missing record, and then come back manually.
