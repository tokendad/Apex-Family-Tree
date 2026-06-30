# Apex Family Legacy
# Core UX Layout Pattern

## Purpose

This document defines the core layout pattern for Apex Family Legacy 2.0.

The goal is to establish a reusable UX structure that can work across all major archive object pages:

- Person
- Artifact
- Event
- Place
- Story
- Collection
- Claim

This is not a final visual design specification.

It is a product-level layout rule that should guide future screens and implementation decisions.

---

# Core Layout Rule

The Apex Family Legacy interface should separate navigation, inspection, relationships, and actions clearly.

The guiding rule is:

```text
Navigation = where to go
Tabs = what to inspect
Connected To = what this object relates to
Actions = what you can do here
```

This rule should apply consistently across object detail pages.

---

# Why This Pattern Exists

Apex Family Legacy is not only a tree application.

It is a connected digital family archive.

The UX must help users understand:

- What object they are viewing.
- What information is known about it.
- What other archive objects it connects to.
- What actions they can take next.

The interface should avoid mixing these concerns together.

When navigation, page content, connected relationships, and edit actions are mixed together, the screen becomes noisy and difficult to adapt to mobile.

This pattern keeps the page cleaner.

---

# Top-Level Navigation

Top-level navigation answers:

> Where do I want to go?

Recommended long-term navigation:

```text
Tree
People
Artifacts
Collections
Stories
Places
Timeline
Search
```

The tree remains important, but it becomes one major view of the archive rather than the entire product.

Top-level navigation should not contain page-specific commands.

For example, `People` is navigation.

`Connect Artifact` is not navigation.

---

# Context Actions Menu

The context Actions menu answers:

> What can I do here?

Actions should be separated from normal navigation and placed in a consistent top-right command location.

Example desktop pattern:

```text
Tree | People | Artifacts | Collections | Stories | Places | Timeline      Search | Actions | User
```

Example mobile pattern:

```text
Menu        Apex Family Legacy        Actions
```

On mobile, the Actions menu may open as a bottom sheet.

On desktop, it may open as a dropdown, popover, or drawer.

---

# Actions Are Context-Aware

The Actions menu changes based on the current object type.

The same button remains in the same place, but the commands inside it are specific to the page.

## Person page actions

```text
Connect Artifact
Add Story
Add Event
Add Relationship
Add Claim
Edit Person
Set as Home Person
```

## Artifact page actions

```text
Connect Person
Connect Event
Connect Place
Add to Collection
Add Story
Add Claim
Add Transcript
Record Provenance
Edit Artifact
```

## Event page actions

```text
Connect Person
Connect Artifact
Connect Place
Add Story
Add Claim
Add to Collection
Edit Event
```

## Place page actions

```text
Connect Person
Connect Event
Connect Artifact
Add Story
Add to Collection
View Timeline
Edit Place
```

## Collection page actions

```text
Add Artifact
Add Person
Add Event
Add Story
Reorder Items
Set Cover Artifact
Edit Collection
```

The action list should eventually be driven by:

- Current object type
- User role
- Object state
- Enabled feature flags
- Implemented relationship types

---

# Avoid Duplicate Action Buttons

Page sections should not duplicate the same creation or connection commands that already exist in the Actions menu.

For example, on a Person page:

Do not show all of these at once:

```text
Top-right Actions → Connect Artifact
Profile header → + Connect Artifact
Connected Artifacts section → + Connect Artifact
Connected To panel → + Connect
```

That creates redundant paths for the same command.

Preferred rule:

```text
Actions menu owns creation, editing, and connection commands.
Content sections display archive content.
```

A page may still have a single strong page-level shortcut in special cases, but the default should be to avoid duplicates.

If the Actions menu is clear and easy to access, most object-specific commands should live there.

---

# Object Identity Header

Every object detail page should begin with a clear identity area.

The identity header answers:

> What am I looking at?

For a Person page, this may include:

- Name
- Lifespan
- Primary photo or initials
- Short biographical summary
- Key counts such as artifacts, stories, events, claims, collections
- Privacy or visibility indicator

For an Artifact page, this may include:

- Artifact title
- Artifact type
- Date or date range
- Evidence classification
- Preview thumbnail
- Short description

For an Event page, this may include:

- Event title
- Date or date range
- Place
- Summary
- Connected people count
- Connected artifact count

The header should be human-readable.

It should not feel like a raw database record.

---

# Main Detail Area

The main detail area answers:

> What do we know about this object?

This area should hold the primary page content and tabbed views.

It should be focused on viewing and understanding information, not presenting every possible command.

Common content examples:

- Overview
- Timeline
- Artifacts
- Stories
- Events
- Claims
- Transcript
- Provenance
- Related objects

---

# Tabs

Tabs answer:

> What aspect of this object do I want to inspect?

Tabs should organize different views of the same object.

Recommended Person tabs:

```text
Overview
Timeline
Artifacts
Stories
Claims
```

Recommended Artifact tabs:

```text
Overview
Transcript
Claims
Provenance
Related Artifacts
```

Recommended Event tabs:

```text
Overview
People
Artifacts
Stories
Claims
```

Tabs should not become command menus.

A tab should show content, not duplicate the Actions menu.

---

# Connected To Panel

The Connected To panel answers:

> What is this object related to?

This is one of the most important UX patterns in Apex Family Legacy.

Every major archive object should eventually have a Connected To section or panel.

It may show relationships such as:

- People
- Artifacts
- Events
- Places
- Stories
- Collections
- Claims

The Connected To panel is for exploration.

It should make relationships visible and clickable.

It should generally not be a command center.

Preferred behavior:

```text
Click a connected object → open that object
Use Actions menu → create or edit connections
```

This keeps browsing and editing separate.

---

# Recommended Desktop Layout

A reusable desktop object detail page may look like this:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Apex Family Legacy                           Search        Actions    User  │
├──────────────────────────────────────────────────────────────────────────────┤
│ Tree | People | Artifacts | Collections | Stories | Places | Timeline       │
├──────────────────────────────────────────────────────────────────────────────┤
│ Object Identity Header                                                       │
│ - photo / preview                                                            │
│ - title / name                                                               │
│ - summary                                                                    │
│ - key counts                                                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│ Overview | Timeline | Artifacts | Stories | Claims                          │
├───────────────────────────────────────────────────────────┬──────────────────┤
│ Main Detail Area                                           │ Connected To     │
│                                                           │ - People         │
│ - overview content                                        │ - Artifacts      │
│ - cards                                                   │ - Collections    │
│ - timeline items                                          │ - Places         │
│ - evidence summaries                                      │                  │
└───────────────────────────────────────────────────────────┴──────────────────┘
```

---

# Recommended Mobile Layout

On mobile, the layout should stack vertically.

Example:

```text
┌────────────────────────────────────┐
│ Menu   Apex Family Legacy  Actions │
├────────────────────────────────────┤
│ Object Identity Header             │
│ Photo / Preview                    │
│ Name / Title                       │
│ Summary                            │
├────────────────────────────────────┤
│ Horizontal Tabs                    │
├────────────────────────────────────┤
│ Main Detail Content                │
├────────────────────────────────────┤
│ Connected To                       │
└────────────────────────────────────┘
```

On mobile:

- Top navigation may collapse into a menu.
- Actions may open as a bottom sheet.
- Connected To should stack below the main content.
- Tabs should scroll horizontally if needed.
- Duplicate action buttons should be avoided even more aggressively.

---

# Person Page Example

For a Person page, the structure should be:

```text
Identity Header
- John LeFort
- 1931–2008
- Short summary
- Counts: artifacts, stories, events, claims, collections

Tabs
- Overview
- Timeline
- Artifacts
- Stories
- Claims

Main Content
- Recent artifacts
- Key life context
- Stories
- Claims and evidence summaries

Connected To
- Family
- Collections
- Places
- Related artifacts if useful

Actions Menu
- Connect Artifact
- Add Story
- Add Event
- Add Relationship
- Add Claim
- Edit Person
- Set as Home Person
```

Important note:

The Person page should not duplicate `Connect Artifact` in the header, artifact section, and Connected To panel if that action already exists in the Actions menu.

---

# Artifact Page Example

For an Artifact page, the structure should be:

```text
Identity Header
- WWII Draft Letter
- Type: Letter
- Date: 1942
- Evidence: Official Record
- Preview / thumbnail

Tabs
- Overview
- Transcript
- Claims
- Provenance
- Related Artifacts

Main Content
- Description
- What this artifact may tell us
- Claims supported
- Provenance summary

Connected To
- People
- Events
- Places
- Collections
- Claims

Actions Menu
- Connect Person
- Connect Event
- Connect Place
- Add to Collection
- Add Story
- Add Claim
- Add Transcript
- Record Provenance
- Edit Artifact
```

---

# UX Principle: Content First, Commands Second

The main page should help users understand the archive object.

Commands should remain available, but should not dominate the layout.

Users should first see:

```text
Who or what is this?
What do we know?
What is it connected to?
```

Then they can use Actions to add, edit, or connect more information.

---

# Relationship to the Archive Model

This layout supports the underlying archive model:

```text
Archive objects have identity.
Archive objects have details.
Archive objects connect to other archive objects.
Actions create or modify those connections.
```

The UX should make the graph understandable without exposing database complexity.

The user should not need to understand relationship tables, role contracts, or archive object IDs.

They should be able to say:

```text
This person appears in this photo.
This letter supports this claim.
This event happened at this place.
This story explains this artifact.
```

The interface should translate those human statements into structured archive relationships.

---

# Implementation Guidance

When implementing this pattern, prefer:

- A shared object detail layout component.
- A context-aware actions registry.
- Object-specific tab configuration.
- Object-specific Connected To grouping.
- Responsive stacking for mobile.

Possible conceptual components:

```text
ArchiveObjectLayout
ObjectIdentityHeader
ObjectTabs
ConnectedToPanel
ContextActionsMenu
```

The Actions menu should eventually be driven by object type and permissions.

Example conceptual configuration:

```text
objectType: person
primaryView: personProfile
actions:
  - connect_artifact
  - add_story
  - add_event
  - add_relationship
  - add_claim
  - edit_person
  - set_home_person

tabs:
  - overview
  - timeline
  - artifacts
  - stories
  - claims

connectedGroups:
  - family
  - artifacts
  - collections
  - places
```

---

# What Not To Do Yet

Do not redesign the entire application shell before the archive object loop works.

Do not rewrite the tree UX first.

Do not make every section editable inline immediately.

Do not expose all relationship model complexity in the UI.

Do not duplicate every action in every section.

Start with the simplest useful version:

```text
Person page
Artifact page
Connected To panel
Context Actions menu
Relationship creation drawer
```

---

# Current Prototype Reference

The older exploratory prototypes remain in the original reference folder:

```text
Docs/ChatGPTReview/UX_Concepts/
```

Those files are useful as design history and comparison references.

The canonical 2.0 UX documentation should live under:

```text
Docs/Apex_Family_Legacy_2.0/
```

---

# Summary

The core UX layout for Apex Family Legacy is:

```text
Navigation = where to go
Tabs = what to inspect
Connected To = what this object relates to
Actions = what you can do here
```

This pattern keeps the UI clean, supports mobile, and gives every archive object page a consistent structure.

It also reinforces the central product idea:

> Relationships are the threads that weave every person, place, event, story, and artifact into a living family archive.
