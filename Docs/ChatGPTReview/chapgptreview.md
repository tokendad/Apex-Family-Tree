Design Notes: Relationship Management UX

Overview

After reviewing the current architecture and relationship model, I believe the underlying data model is solid, but the user experience for creating and editing relationships can be improved.

The application correctly models genealogy around families (or unions) rather than simply connecting people together. This is an excellent architectural decision because marriages, partnerships, divorces, and parent-child relationships are naturally represented as their own entities.

The challenge is primarily one of user interface, not data structure.

---

Current Observation

Relationship management is currently centered around modal dialogs.

While modals work well for entering information, they are less effective for helping users understand how relationships fit into the larger family tree.

Genealogy is inherently visual. Users need to maintain context while making changes.

---

Recommendation

1. Use Modals Only for Quick Creation

Modals are appropriate when the user wants to:

- Create a new person
- Quickly add a spouse
- Add a child
- Create a parent

These are focused tasks with a clear beginning and end.

They should remain lightweight.

---

2. Move Relationship Editing into a Persistent Side Panel

Selecting a relationship should open a side panel rather than another modal.

Example:

Selecting the marriage connector between John and Mary would display:

- Partner A
- Partner B
- Relationship status
- Marriage date
- Marriage location
- Divorce information
- Notes
- Children belonging to this union

Keeping the family tree visible while editing provides much better context.

---

3. Make Relationships First-Class Objects

Rather than thinking of a marriage as "Person A connected to Person B," present it as its own editable object.

A relationship has its own properties:

- Marriage
- Partnership
- Divorce
- Separation
- Anniversary
- Notes
- Sources
- Children

The interface should reflect this.

---

4. Keep the Tree as the Primary Workspace

The family tree should remain the center of the experience.

Users should rarely lose sight of it.

Instead of opening multiple modal windows:

Tree → Select Person → Side Panel

Tree → Select Marriage → Side Panel

Tree → Select Child → Side Panel

This creates a much more fluid editing experience.

---

Suggested Interaction Model

Clicking a Person

Display:

- Basic information
- Parents
- Spouses / Partners
- Children
- Siblings
- Events
- Sources
- Media

Quick action buttons:

- Add Parent
- Add Child
- Add Spouse
- Edit Person
- Delete Person

---

Clicking a Marriage Connector

Display:

- Partner information
- Marriage details
- Divorce details
- Children of this union
- Relationship notes
- Sources

Quick actions:

- Add Child
- Edit Marriage
- End Relationship
- Delete Relationship

---

Why This Works Better

Users think in stories, not database records.

Instead of asking:

"I want to edit this family record."

they think:

"I want to change John's second marriage."

Keeping the tree visible while editing makes relationships much easier to understand and reduces confusion when multiple marriages, adoptions, or blended families are involved.

---

Long-Term Vision

I believe Apex Family Tree should evolve toward a workspace model rather than a collection of forms.

The tree becomes the primary canvas.

Everything else becomes contextual editing around that canvas.

This approach will scale much better as more advanced genealogy features are added, including:

- Multiple marriages
- Step-families
- Adoptive relationships
- Foster relationships
- Guardianships
- Unknown parents
- Complex blended families

The current data architecture already supports much of this. The next evolution should focus on making those relationships easier to understand visually rather than adding additional modal workflows.
