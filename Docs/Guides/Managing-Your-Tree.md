# Managing Your Tree

This guide covers everything you need to know about building and managing your family tree in Apex Family Tree (AFT) — from creating your first person to navigating complex family structures.

---

## Understanding the Tree Canvas

The family tree canvas is the heart of AFT. It displays your family as an interactive SVG visualization with person cards connected by relationship lines.

### Person Cards

Each person in your tree is represented by a card on the canvas:

```
┌─────────────────────────────────┐
│ [Avatar]  Given name             │
│           Surname                │
│           b. 1950 · d. 2020      │
└─────────────────────────────────┘
```

Cards are color-coded to help you understand relationships at a glance:

| Card Style | Meaning |
|---|---|
| **Teal background** with teal border and **HOME** badge | Your Home Person |
| **White** with amber border | Spouse of the selected/home person |
| **White** with dashed gray border | Sibling |
| **White** with solid gray border | All other people |

### Connector Lines

Relationships are shown as lines between cards:

| Line Style | Meaning |
|---|---|
| **Solid line** (vertical) | Parent → Child connection |
| **Dashed line** | Sibling branch |
| **Solid line** (horizontal) | Spouse / partner connection |
| **Small circle** on spouse line | Marriage node (child lines descend from here) |

### Generation Layout

The tree is organized in horizontal rows by generation:

- **Ancestors** expand **upward** from the Home Person's generation
- **Descendants** expand **downward**
- Generation labels ("GEN 1", "GEN 2", etc.) appear on the left side of each row

---

## Navigating the Tree

### Pan and Zoom

| Action | Desktop | Mobile/Tablet |
|---|---|---|
| **Pan** (move around) | Click and drag on empty canvas | Touch and drag |
| **Zoom in/out** | Mouse wheel or trackpad scroll | Pinch to zoom |
| **Center view** | Click "Center view" in the toolbar | Click "Center view" in the toolbar |

The zoom range is 50% to 200%. The current zoom percentage is displayed in the canvas toolbar.

### Generation Slider

In the left sidebar, use the **Generations** slider to control how many generations are visible:

- **Range:** 2 to 6 generations
- **Default:** 3 generations
- Adjusting the slider automatically reloads the tree data for the selected depth

### Filtering

The sidebar also provides filter checkboxes to control which relationships are displayed:

- **Ancestors** — Show/hide ancestor generations
- **Descendants** — Show/hide descendant generations
- **Spouses** — Show/hide spouse cards

---

## Creating a New Person

Click the **+ Create new person** button in the canvas toolbar to open the person creation wizard. You can also click any **+ Add child**, **+ Add spouse**, or **+ Add parent** placeholder card on the canvas — the wizard will open pre-populated with the appropriate relationship.

The wizard has four steps. You can navigate between steps at any time, and you only need to fill in the fields you know — most fields are optional.

### Step 1: Personal Info

This step captures the person's basic identity.

**Fields:**

1. **Photo** *(optional)* — Click or drag-and-drop to upload a profile photo (JPG or PNG, max 10 MB). A preview appears in the avatar circle.

2. **Prefix** — Title or honorific (e.g., Dr., Rev., Sir)

3. **Given name(s)** — The person's first and middle names

4. **Surname / Birth name** — Family name at birth

5. **Suffix** — Generational or professional suffix (e.g., Jr., III, Esq.)

6. **Also known as (AKA)** — Nicknames or alternate names

7. **Sex** — Select one:
   - Male
   - Female
   - Non-binary
   - Unknown

8. **Living status** — Select one:
   - Living
   - Deceased
   - Unknown

9. **Privacy** — Controls who can see this person's details:
   - **Public** — Visible to all users
   - **Family only** — Visible to logged-in users only
   - **Private** — Visible to Admins and Editors only

> **Tip:** An info box at the bottom reminds you that birth dates, death dates, and other events are entered in the next step.

Click **Next** to proceed to Step 2.

### Step 2: Vital Events

This step records life events with dates and places.

**Fixed events** (always shown):

| Event | Fields | Notes |
|---|---|---|
| **Birth** | Date, Place | |
| **Marriage** | Date, Place | Full details are entered in the Relationships step |
| **Death** | Date, Place | Leave blank if person is living |

**Date format:**

AFT supports GEDCOM-standard date qualifiers for flexible, historically accurate dates:

| Qualifier | Meaning | Example |
|---|---|---|
| *(none)* | Exact date | `15 MAR 1920` |
| `ABT` | About / approximately | `ABT 1920` |
| `BEF` | Before | `BEF 1920` |
| `AFT` | After | `AFT 1920` |
| `BET...AND` | Between two dates | `BET 1910 AND 1920` |
| `CAL` | Calculated from other data | `CAL 1920` |
| `EST` | Estimated | `EST 1920` |

You can enter just a year (`1920`), a month and year (`MAR 1920`), or a full date (`15 MAR 1920`).

> **Tip:** A helper text below each date field reminds you of the supported qualifiers.

**Additional events:**

Below the fixed events, you'll see a collection of clickable **event tags** for additional GEDCOM-standard life events:

> Adoption · Baptism · Bar/Bat Mitzvah · Burial · Census · Christening · Divorce · Emigration · Immigration · Military service · Naturalization · Occupation · Probate · Retirement · Will · Custom event...

Click any tag to expand an inline form with Date and Place fields for that event. Click **Custom event...** to define your own event type.

Click **Next** to proceed to Step 3.

### Step 3: Link Relationships

This step connects the person to their family members.

#### Adding Parents

1. Expand the **"Add parents"** section
2. **Father** — Start typing a name to search existing people, or click **"New person"** to create a new father inline
3. **Mother** — Same as above
4. **Relationship type** — How this person is related to the parents:
   - Biological
   - Adopted
   - Foster
   - Step-parent
   - Guardian

#### Adding a Spouse / Partner

1. Expand the **"Add spouse"** section
2. **Spouse** — Search for an existing person or click **"New person"**
3. **Marriage date** and **Marriage place**
4. **Union status:**
   - Married
   - Divorced
   - Separated
   - Common law
   - Engaged
5. **Divorce date** — This field appears only when the status is "Divorced" or "Separated"

**Searching for existing people:**

When you start typing in a search field (after 2 or more characters), an autocomplete dropdown appears showing matching people with:
- Avatar initials
- Full name
- Birth year
- GEDCOM ID

Select a result to link that person as the relationship.

**Creating a new person inline:**

If the person doesn't exist in your tree yet, click the **"New person"** button. A minimal form appears asking for just a name and sex. The new person is created and automatically linked — no need to go through the full wizard for them right now. You can always edit their full details later.

Click **Next** to proceed to Step 4.

### Step 4: Media & Notes

This step adds supporting materials.

#### Media

Upload photos, documents, and other files associated with this person:

- **Supported formats:** JPG, PNG, PDF
- **Videos:** Enter an external URL (YouTube, Vimeo, etc.) — videos are linked, not uploaded
- **Photo size limit:** 10 MB per file
- **Document size limit:** 50 MB per file
- Each media item has a **caption** field for descriptions

#### Notes

A free-text area for any additional information about this person. There's no character limit. This is stored as a GEDCOM NOTE tag and will be preserved during import/export.

#### Sources

Add source citations to document where your information came from:

- **Title** — Name of the source (e.g., "1920 US Federal Census")
- **Author** — Who created the source
- **Date** — When the source was created or published
- **Repository** — Where the source is held (e.g., "National Archives")
- **Page / Citation** — Specific location within the source (e.g., "Page 42, Line 7")

You can add multiple sources. Click **+ Add source** to add additional entries.

Click **Save** to create the person. They'll appear on the tree canvas immediately.

---

## Editing an Existing Person

There are several ways to edit a person's information:

### From the Canvas

- **Double-click** on a person card to open the edit wizard with their current data pre-filled
- **Right-click** on a person card and select **"Edit person"** from the context menu

### From the Detail Panel

- Select a person by clicking their card, then click the **Edit** button in the detail panel's action footer

The edit wizard uses the same four-step layout as the creation wizard, with all existing data pre-filled. Navigate between steps to update any information, then click **Save**.

---

## Using the Context Menu

Right-click (or long-press on mobile) on any person card to open the context menu:

| Action | Description | Who Can Use |
|---|---|---|
| **Edit person** | Open the edit wizard | Limited Editor and above |
| **Add child** | Create a new child for this person | Limited Editor and above |
| **Add spouse** | Create a new spouse/partner for this person | Limited Editor and above |
| **Add parent** | Add a parent (only available if fewer than 2 parents are linked) | Limited Editor and above |
| **Set as home person** | Make this person your Home Person | Admin, Editor |
| **Copy GEDCOM ID** | Copy the GEDCOM identifier to your clipboard | All users |
| **View sources** | See all source citations for this person | All users |
| **Delete person** | Remove this person from the tree (with confirmation) | Admin, Editor |

> **Warning:** Deleting a person is a significant action. A confirmation dialog will appear asking you to confirm. Deleted persons are soft-deleted (recoverable) rather than permanently removed, to preserve tree integrity.

---

## Setting a Home Person

Your Home Person is the individual that the tree centers on when you first log in or click "Center view." To set a new Home Person:

1. **Right-click** on the person card you want to set as your Home Person
2. Select **"Set as home person"** from the context menu

The selected person's card will update to show the teal background and **HOME** badge. The tree view will re-center on this person.

> **Note:** Each user has their own Home Person setting. Changing your Home Person doesn't affect other users.

> **Note:** Setting a Home Person requires **Admin** or **Editor** role.

---

## Using Search to Find People

AFT provides full-text search to quickly find anyone in your tree:

1. Use the **search input** in the left sidebar's Filter section
2. Start typing a name — results appear after 2 or more characters
3. The search matches against given names, surnames, nicknames, and all alternate name records
4. Search handles diacritics gracefully — searching for "Muller" will also find "Müller"
5. Use prefix matching — typing "Smi" will find "Smith", "Smithson", etc.

Click on a search result to navigate to that person on the canvas and select their card.

---

## Understanding Privacy Settings

Each person in your tree has a **Privacy** setting that controls visibility:

| Level | Who Can See | Best For |
|---|---|---|
| **Public** | All users of your AFT instance | Historical/deceased relatives |
| **Family only** | Logged-in users only | Most family members |
| **Private** | Admins and Editors only | Sensitive situations, incomplete records |

> **Tip:** The default privacy level for new persons is configurable in the application settings. See the [Configuration Guide](Configuration.md) for details.

Privacy settings affect what information is returned by the API. Viewers will not see Private persons on the tree canvas at all. Family-only persons are visible to anyone logged in but would be excluded from any public-facing exports.

---

## Working with the "+ Add" Placeholder Cards

On the canvas, you'll notice dashed-border cards with a `+` icon near existing people:

- **+ Add child** — Appears below a person or couple
- **+ Add spouse** — Appears next to a person without a partner
- **+ Add parent** — Appears above a person with fewer than 2 parents linked

Clicking any of these opens the Create New Person wizard with the relationship **pre-seeded**. For example, clicking "+ Add child" below John and Jane Smith will automatically link the new person as a child of that couple in Step 3 of the wizard.

---

## Tips for Building Your Tree

1. **Start with what you know.** Begin with yourself and your immediate family, then work outward to extended relatives.

2. **Use GEDCOM dates wisely.** If you only know an approximate year, use `ABT 1920` rather than leaving the field blank. This preserves the information you do have.

3. **Add sources as you go.** It's much easier to record where you found information when it's fresh in your mind than to go back and add sources later.

4. **Upload photos early.** Attach photos to person records as you create them. The avatar photo helps everyone quickly identify who's who on the tree.

5. **Use privacy settings proactively.** Mark living people as "Family only" or "Private" to protect their information.

6. **Import first, refine later.** If you're migrating from another genealogy tool, import your GEDCOM file first, then use AFT's editing tools to clean up and enhance the data. See the [GEDCOM Import & Export Guide](GEDCOM-Import-Export.md).

---

## Related Guides

- [Getting Started](Getting-Started.md) — First-time setup and interface overview
- [GEDCOM Import & Export](GEDCOM-Import-Export.md) — Importing and exporting GEDCOM files
- [User Management](User-Management.md) — Understanding roles and permissions
- [Configuration Reference](Configuration.md) — All settings and environment variables
