# Apex Family Tree

# Architecture of Ideas

> *Software architecture defines how code is organized.*
>
> *The Architecture of Ideas defines how decisions are made.*

This document describes the guiding principles behind Apex Family Tree. These principles are intended to outlive any particular user interface, framework, or technology stack. Every feature, workflow, and design decision should be measured against these ideas.

---

# Principle 1 — Preserve Legacy, Not Just Lineage

Traditional genealogy software focuses on lineage.

Who was related to whom.

When they were born.

When they died.

Apex goes further.

Our purpose is to preserve legacy.

Legacy includes:

* Relationships
* Stories
* Photographs
* Documents
* Traditions
* Artifacts
* Memories
* Places
* Historical context

A family is more than its family tree.

---

# Principle 2 — The Tree Is the Workspace

The family tree is not simply a report.

It is not merely a visualization.

The tree is the primary workspace.

Users should spend most of their time exploring the tree rather than navigating menus or filling out forms.

The application should adapt around the tree instead of forcing users away from it.

---

# Principle 3 — Context Is More Valuable Than Data

Individual records have limited value.

Context creates meaning.

A photograph connected to a person, a place, an event, and a story becomes exponentially more valuable than the same photograph stored in isolation.

Every feature should strengthen connections between information.

---

# Principle 4 — Artifacts Are First-Class Citizens

A photograph is not an attachment.

A letter is not a file.

A recipe is not simply media.

Artifacts represent tangible pieces of family history.

Each artifact deserves its own identity, metadata, relationships, provenance, and story.

Artifacts should stand beside people and events as core objects within the archive.

---

# Principle 5 — Hide the Database

Users should never need to understand database tables.

Internally, Apex may contain people, unions, events, sources, places, media, and artifacts.

Externally, users should experience stories.

The software should present natural concepts rather than technical structures.

---

# Principle 6 — The Software Should Invite Exploration

Users should feel encouraged to wander.

A photograph leads to a person.

A person leads to a marriage.

A marriage leads to a place.

A place leads to another family.

Discovery should feel effortless and rewarding.

The archive should encourage curiosity.

---

# Principle 7 — Every Object Has a Story

Everything in the archive should answer questions beyond "What is this?"

People have life stories.

Places have history.

Artifacts have provenance.

Relationships have meaning.

Events have consequences.

Nothing exists in isolation.

---

# Principle 8 — Preserve Provenance

Family history is strengthened by understanding where information came from.

Every artifact, document, and story should preserve its own history.

Questions such as:

* Who owned this?
* Who scanned it?
* Where is the original?
* Who identified the people in this photograph?
* When was this information added?

...are part of the archive itself.

Preserving provenance protects trust while enriching future generations' understanding of their family's history.

---

# Principle 9 — Design for Generations

Most software is designed to be used today.

Apex should also be designed to be inherited.

Decisions should consider not only today's users but grandchildren who may one day explore the archive with no firsthand knowledge of the people it contains.

The archive should remain understandable decades into the future.

---

# Principle 10 — The Archive Is Never Finished

A family archive is never complete.

New stories emerge.

Additional photographs are discovered.

Relationships become clearer.

Corrections are made.

The application should embrace continual discovery rather than implying completeness.

Every visit should provide an opportunity to learn something new.

---

# The North Star

Every design discussion should eventually arrive at one simple question:

> **Does this help preserve, discover, or understand a family's legacy?**

If the answer is yes, it belongs in Apex.

If not, reconsider the design.

Technology will evolve.

User interfaces will evolve.

Frameworks will evolve.

These principles should remain.
