# Product Vision: An Interactive Genealogy Workspace

## Beyond a Genealogy Database

While reviewing Apex Family Tree, one realization became increasingly clear:

**Apex should not aspire to be another genealogy database.**

There are already many excellent genealogy applications that excel at storing records, importing GEDCOM files, and presenting countless forms for entering data. Most of them are feature-rich, but many also feel like database front-ends.

Apex has the opportunity to become something different.

Instead of asking:

> "How do users edit genealogy records?"

Apex should ask:

> **"How do people naturally explore, understand, and preserve their family's story?"**

This distinction changes nearly every design decision.

---

# The Workspace Philosophy

The family tree should not simply be another page within the application.

It should become **the application itself.**

Rather than navigating between disconnected pages and modal dialogs, the tree becomes the user's primary workspace.

Everything else exists to support that workspace.

Just as architects work from blueprints and designers work from canvases, genealogists should work from the living structure of their family.

The tree is always visible.

The context changes.

The workspace remains.

---

# The Canvas is Alive

Today's interaction model often looks like this:

```
Tree
   ↓
Click
   ↓
Modal
   ↓
Edit
   ↓
Close
```

Instead, the interaction should feel more like this:

```
Canvas
    ├── Person Inspector
    ├── Relationship Inspector
    ├── Timeline
    ├── Sources
    ├── Media
    ├── Search
    └── Activity
```

Nothing disappears.

Nothing interrupts the user's train of thought.

The workspace simply adapts to whatever the user is currently exploring.

---

# Tell Stories, Not Records

The database stores records.

People remember stories.

A genealogist rarely thinks:

> "I need to edit Family Record #23."

Instead they think:

* John married Mary.
* They had three children.
* John remarried Susan.
* Susan adopted John's youngest son.
* Their family moved from Vermont to Massachusetts.

The interface should reinforce this natural way of thinking.

Every interaction should make the family story easier to understand.

---

# Inspect, Don't Edit

Instead of presenting an "Edit Person" dialog, selecting a person should feel like inspecting an object inside a workspace.

The inspector might summarize:

**John Smith**

* Born 1931
* Married twice
* Five children
* Twelve documented events
* Three photographs
* Last updated yesterday

The user can then make edits naturally without leaving the workspace.

Likewise, selecting a marriage or family union should shift the inspector to describe that relationship rather than opening an entirely separate editing experience.

---

# The Workspace Evolves Around the User

The canvas remains fixed.

Only the context changes.

Selecting different objects changes the available tools.

Selecting a person reveals person tools.

Selecting a relationship reveals relationship tools.

Selecting a source reveals citation tools.

Selecting a photograph reveals media tools.

The application feels intelligent because it responds to what the user is currently investigating.

---

# Hide the Database

Internally, the application will always contain people, families, events, media, places, and sources.

The user does not need to think about these tables.

Instead they should experience:

* A family tree
* A timeline
* A collection of memories
* A collection of photographs
* Historical places
* Documents
* Stories

The database becomes an implementation detail.

The workspace becomes the product.

---

# A Living Family Archive

The long-term vision for Apex extends beyond genealogy.

It becomes a digital family archive.

The family tree acts as the entry point into a much richer collection of knowledge.

Every person connects naturally to:

* Events
* Photographs
* Documents
* Audio recordings
* Video
* Maps
* Military records
* Census records
* Letters
* Personal stories
* Source citations

Rather than navigating separate modules, users discover these artifacts organically while exploring the tree.

---

# Guiding Design Principle

Every design decision should answer one question:

> **Does this help someone better understand their family's story?**

If the answer is yes, it probably belongs in Apex.

If the answer is simply "it exposes another database record," then the interaction should be reconsidered.

This principle provides a consistent compass for future development and helps ensure that the application grows into a cohesive workspace instead of an increasingly complex collection of forms.

---

# Vision Statement

**Apex Family Tree is not a genealogy database.**

It is an interactive genealogy workspace designed to help families explore, document, preserve, and share their history.

The tree is not merely a visualization.

It is the center of the experience.

Everything else exists to enrich the story that grows from it.
