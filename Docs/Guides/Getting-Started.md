# Getting Started with Apex Family Tree

Welcome to **Apex Family Tree (AFT)** — a self-hosted, Docker-based family genealogy application that puts you in control of your family's history. This guide will walk you through your first experience with AFT, from your initial login to navigating the family tree canvas.

---

## What Is Apex Family Tree?

Apex Family Tree is a web application for building, viewing, and sharing your family tree. It runs entirely on your own server inside a single Docker container — no cloud accounts, no subscriptions, and no family data ever leaves your network.

**Key highlights:**

- 🌳 **Interactive family tree canvas** — Explore your ancestry with a visual, pan-and-zoom SVG tree
- 👤 **Wizard-driven person creation** — Add family members step-by-step with guided forms
- 📂 **GEDCOM import & export** — Bring in existing trees from other software or export yours
- 👥 **Multi-user with roles** — Invite family members with appropriate access levels
- 🐳 **Single Docker container** — Simple deployment with no external database required

---

## First Login: The Admin Setup Wizard

When you start AFT for the first time, the application detects that no users exist yet and automatically redirects you to the **Admin Onboarding Wizard**. This is a one-time setup process with four steps.

### Step 1: Welcome

The wizard begins with a welcome screen that confirms your Docker instance is healthy. AFT checks the application health endpoint in the background to make sure everything is running correctly.

Click **Next** to proceed.

### Step 2: Create Your Admin Account

This is where you create the first — and most powerful — user account.

1. Enter your **First name** and **Last name**
2. Enter your **Email address** (this will be your login username)
3. Choose a strong **Password** and confirm it

Click **Create admin account** to continue.

> **Note:** This account has full Admin privileges. You can create additional admin accounts later, but this first account is essential for managing your instance.

> **Tip:** The footer of this screen reminds you: *"This instance runs entirely on your own server. No family data is sent externally."*

### Step 3: Configure Your Instance

Personalize your AFT installation:

1. **Site name** — Give your tree a name (e.g., "The Johnson Family Tree"). This appears in the navbar and page titles.
2. **Custom domain** *(optional)* — If you're accessing AFT through a domain name, enter it here.
3. **Registration policy** — Choose whether to allow or disallow self-registration (invite-only is recommended).

Click **Next** to continue.

### Step 4: Import or Skip GEDCOM

If you already have a family tree in another application, you can import it right away:

- **Import a GEDCOM file** — Upload a `.ged` file to populate your tree with existing data
- **Skip for now** — Start fresh and add people manually

> **Tip:** If you're not sure whether you have a GEDCOM file, skip this step. You can always import one later from the tree canvas toolbar. See the [GEDCOM Import & Export Guide](GEDCOM-Import-Export.md) for details.

After completing Step 4, you'll be redirected to the **Login** screen. Log in with the email and password you just created.

---

## Understanding the Home Person

Every user in AFT has a **Home Person** — the individual in the tree that serves as your starting point. When you log in and navigate to the tree canvas, the view automatically centers on your Home Person.

- The Home Person's card is visually distinct: it has a **teal background** and a **HOME badge**
- You can set any person in the tree as your Home Person
- Each user can have a different Home Person, so family members each see the tree from their own perspective

> **Tip:** To set a Home Person, right-click on any person card on the canvas and select **Set as home person** (requires Admin or Editor role).

---

## Quick Tour of the Main Interface

After logging in, you'll land on the **Main Dashboard** — the heart of AFT. The interface is divided into four main areas:

```
┌─────────────────────────────────────────────────────┐
│  NAVBAR                                              │
├──────────┬────────────────────────────┬──────────────┤
│          │                            │              │
│ SIDEBAR  │       TREE CANVAS          │ DETAIL PANEL │
│          │                            │              │
│          │                            │              │
└──────────┴────────────────────────────┴──────────────┘
```

### Navbar (Top)

The navigation bar spans the top of the screen and includes:

- **Logo and site name** — Click to return to your Home Person view
- **Navigation links** — My Tree | People | Sources | Media | Reports | Settings
- **User area** — Your display name and avatar (click for account options and logout)

### Sidebar (Left, 190px)

The left sidebar provides controls for the tree view:

- **View options** — Switch between Family tree, Pedigree chart, Descendant list, and Timeline
- **Filters** — Toggle visibility of Ancestors, Descendants, and Spouses
- **Generation slider** — Control how many generations are displayed (range: 2–6, default: 3)
- **Tree stats** — Shows the tree name, person count, and family count at the bottom

### Tree Canvas (Center)

The main canvas displays your family tree as an interactive SVG visualization:

- **Pan** — Click and drag on empty canvas space to move around
- **Zoom** — Use your mouse wheel or trackpad to zoom in and out (50%–200%)
- **Person cards** — Each person is shown as a small card with their name, birth/death dates, and avatar
- **Connector lines** — Solid lines connect parents to children; dashed lines indicate siblings; horizontal lines connect spouses
- **Marriage nodes** — Small circles at the midpoint between spouses, from which child lines descend

**Card interactions:**

| Action | What Happens |
|---|---|
| Single click | Selects the person and updates the Detail Panel |
| Double click | Opens the person edit wizard |
| Right click | Opens a context menu with actions (edit, add child, add spouse, etc.) |

### Detail Panel (Right, 230px)

When you select a person card, the right panel displays their details:

- **Avatar and name** with birth/death dates
- **Vital information** — Birthplace, occupation, GEDCOM ID
- **Relationships** — List of linked family members (parents, spouses, children)
- **Media thumbnails** — Photos and documents attached to this person
- **Action buttons** — Edit, + Relation, Sources

### Canvas Toolbar

Between the navbar and the canvas, a toolbar provides quick actions:

- **+ Create new person** — Opens the person creation wizard
- **Import GEDCOM** — Upload a `.ged` file
- **Zoom controls** — Zoom in, zoom out, current zoom percentage, and Center view button

---

## Next Steps

Now that you're familiar with the interface, here are the recommended next steps:

### Add Your First Person

Click the **+ Create new person** button in the canvas toolbar to start building your tree. The wizard walks you through four steps: personal info, vital events, relationships, and media. See the [Managing Your Tree Guide](Managing-Your-Tree.md) for a detailed walkthrough.

### Import an Existing Tree

If you have a GEDCOM file from another genealogy application (like FamilySearch, Ancestry, or Gramps), click **Import GEDCOM** in the toolbar. See the [GEDCOM Import & Export Guide](GEDCOM-Import-Export.md) for step-by-step instructions.

### Invite Family Members

Ready to collaborate? Invite family members to view or contribute to the tree. Navigate to **Settings > User Management** and click **+ Invite user**. See the [User Management Guide](User-Management.md) for role descriptions and the invite process.

### Set Up Backups

Your family data is precious. Make sure you understand how backups work and consider setting up an external backup schedule. See the [Backup & Restore Guide](Backup-Restore.md).

---

## Related Guides

- [Deployment Guide](Deployment.md) — How to install and run AFT
- [Managing Your Tree](Managing-Your-Tree.md) — Creating and editing people in your tree
- [GEDCOM Import & Export](GEDCOM-Import-Export.md) — Working with GEDCOM files
- [User Management](User-Management.md) — Inviting and managing users
- [Backup & Restore](Backup-Restore.md) — Protecting your data
- [Configuration Reference](Configuration.md) — All settings and environment variables
