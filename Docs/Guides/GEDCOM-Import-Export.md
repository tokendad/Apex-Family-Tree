# GEDCOM Import & Export

This guide explains how to import family tree data from other genealogy software into Apex Family Tree (AFT), and how to export your tree for use elsewhere.

---

## What Is GEDCOM?

**GEDCOM** (GEnealogical Data COMmunication) is the standard file format used by genealogy software to exchange family tree data. A GEDCOM file (`.ged`) is a plain-text file that contains information about individuals, families, events, sources, and media references in a structured format.

GEDCOM files allow you to:
- **Migrate** your tree from one genealogy application to another
- **Share** your research with family members who use different software
- **Back up** your genealogy data in a portable, universal format

### Supported Versions

AFT supports two versions of GEDCOM:

| Version | Support | Best For |
|---|---|---|
| **GEDCOM 5.5.1** | Full import and export | Maximum compatibility with existing software |
| **GEDCOM 7.0** | Export support | Modern tools and future-proofing |

> **Tip:** If you're not sure which version to use, **GEDCOM 5.5.1** is the safest choice for compatibility. Nearly all genealogy software can read and write this format.

---

## Importing a GEDCOM File

Importing allows you to bring in family tree data from other applications like FamilySearch, Ancestry, Gramps, Legacy Family Tree, RootsMagic, and many others.

> **Note:** Importing requires at least a **Limited Editor** role.

### Step 1: Upload Your File

1. From the tree canvas, click the **Import GEDCOM** button in the toolbar
2. Either **drag and drop** your `.ged` file into the upload area, or **click to browse** and select it from your computer
3. AFT begins parsing and validating the file

### Step 2: Review Validation Results

After uploading, AFT displays a **validation summary** showing what was found in the file:

- **Individuals** — Total number of person records
- **Families** — Total number of family group records
- **Sources** — Total number of source records
- **Media references** — Total number of media/object records
- **Unrecognized tags** — Any GEDCOM tags that AFT doesn't understand (these won't cause the import to fail, but the data for those tags won't be imported)
- **Validation errors** — Any structural problems with the file

> **Note:** Unrecognized tags are common — many genealogy programs add custom tags (prefixed with an underscore, like `_MILT` or `_ADDR`). These are safely skipped without affecting the rest of the import.

If the file has critical validation errors, you'll see a message explaining the issue and the import cannot proceed until the file is corrected.

### Step 3: Resolve Conflicts

If your tree already contains data, AFT checks for **conflicts** — situations where an imported record matches an existing person in your tree (typically matched by GEDCOM ID from a previous import).

For each conflict, you can choose one of three resolutions:

| Resolution | What Happens |
|---|---|
| **Skip** | Keep your existing data unchanged; ignore the incoming record |
| **Overwrite** | Replace your existing data with the incoming record |
| **Merge** | Combine both records, keeping data from both where possible |

You can set a **global strategy** (apply the same choice to all conflicts) or resolve conflicts **per record** if you prefer more control.

> **Tip:** If this is your first import into an empty tree, there won't be any conflicts and this step is skipped automatically.

### Step 4: Monitor Import Progress

After resolving conflicts (or if there are none), click **Start Import** to begin processing. A progress bar shows the import status:

- Records being processed
- Current progress percentage
- Estimated time remaining

> **Note:** Large GEDCOM files with thousands of records may take a few minutes to import. The import runs in the background — you can safely navigate away and check back later.

### Step 5: Post-Import Review

When the import completes, you'll see a **completion summary**:

- ✅ **People added** — New person records created
- ✅ **People updated** — Existing records that were updated (overwrite/merge)
- ⏭️ **People skipped** — Records that were skipped due to conflicts
- ✅ **Families linked** — Family relationship records established
- 📎 **Media referenced** — Media records found (note: actual media files are not included in GEDCOM — only references)

Click **View Tree** to navigate to the canvas and explore your imported data.

> **Tip:** After a large import, it's a good idea to spot-check a few key individuals to make sure their data looks correct. Pay attention to dates, relationships, and name spellings.

---

## Exporting Your Tree

Exporting creates a GEDCOM file from your AFT data that can be opened in other genealogy software.

### Accessing the Export Tool

Navigate to **Reports > Export GEDCOM** (or go directly to `/reports/export`).

### Choose Your Export Format

| Format | Description |
|---|---|
| **GEDCOM 5.5.1** | Maximum compatibility — works with virtually all genealogy software |
| **GEDCOM 7.0** | Modern format with improved Unicode support and multimedia handling |

> **Tip:** Choose 5.5.1 unless you know the receiving software specifically supports GEDCOM 7.0.

### Choose Your Export Scope

You don't have to export your entire tree. Choose the scope that fits your needs:

| Scope | Description |
|---|---|
| **Full tree** | Exports every person and family in your database |
| **Ancestors of a person** | Exports only the ancestors (parents, grandparents, etc.) of a selected person |
| **Descendants of a person** | Exports only the descendants (children, grandchildren, etc.) of a selected person |
| **Date range** | Exports only people with events falling within a specific date range |

For ancestor or descendant exports, you'll be prompted to select the root person and optionally limit the number of generations.

### Choose Media Handling

GEDCOM files can reference media (photos, documents) in different ways:

| Option | Description | File Size |
|---|---|---|
| **ZIP archive** | Media files are bundled in a ZIP alongside the `.ged` file | Larger (includes all media) |
| **Embedded (Base64)** | Media files are encoded directly into the GEDCOM file | Largest (single file, but can be very large) |
| **Links only** | Only file references are included; no actual media data | Smallest (just the `.ged` file) |

> **Tip:** For sharing with family members, **ZIP archive** is usually the best choice — they get the tree data and all photos in one download. For quick backups, **links only** keeps the file small.

### Download Your File

Click **Export** to generate the file. Once processing completes, the download starts automatically. The file is also saved in your instance's export directory (`.data/exports/`) for later retrieval.

---

## GEDCOM Tag Mapping

Understanding how AFT fields map to GEDCOM tags can be helpful when troubleshooting import or export issues:

| AFT Field | GEDCOM Tag | Notes |
|---|---|---|
| Given name | `GIVN` under `NAME` | |
| Surname | `SURN` under `NAME` | |
| Also known as | `_AKA` or `NAME` with `NICK` | |
| Birth date/place | `BIRT DATE`, `BIRT PLAC` | |
| Death date/place | `DEAT DATE`, `DEAT PLAC` | |
| Marriage date/place | `MARR DATE`, `MARR PLAC` | On the `FAM` (family) record |
| Divorce date | `DIV DATE` | On the `FAM` record |
| Adoption | `ADOP` | With `FAMC` reference to the adoptive family |
| Occupation | `OCCU` | |
| Notes | `NOTE` | |
| Sources | `SOUR` / `CITA` | |
| Media | `OBJE` | |
| Sex | `SEX` | `M`, `F`, `U` (5.5.1) or `M`, `F`, `X`, `U` (7.0) |

### Date Format in GEDCOM

GEDCOM uses a specific date format. AFT preserves these formats during import and generates them during export:

| Format | Example |
|---|---|
| Exact date | `15 MAR 1920` |
| Year only | `1920` |
| Month and year | `MAR 1920` |
| Approximate | `ABT 1920` |
| Before | `BEF 1920` |
| After | `AFT 1920` |
| Between | `BET 1910 AND 1920` |
| Calculated | `CAL 1920` |
| Estimated | `EST 1920` |

> **Note:** Month abbreviations in GEDCOM are always three-letter English abbreviations: `JAN`, `FEB`, `MAR`, `APR`, `MAY`, `JUN`, `JUL`, `AUG`, `SEP`, `OCT`, `NOV`, `DEC`.

---

## Compatibility with Other Software

AFT's GEDCOM support is designed to work well with popular genealogy applications:

### Importing From

| Software | Notes |
|---|---|
| **FamilySearch** | Export from FamilySearch as GEDCOM 5.5.1; imports cleanly into AFT |
| **Ancestry** | Download your tree as a GEDCOM file from Ancestry's settings page |
| **Gramps** | Export as GEDCOM 5.5.1 for best compatibility |
| **RootsMagic** | Export as GEDCOM; AFT handles RootsMagic's custom tags gracefully |
| **Legacy Family Tree** | Standard GEDCOM export works well |
| **MyHeritage** | Export as GEDCOM from your account settings |
| **MacFamilyTree** | Export as GEDCOM 5.5.1 |

### Exporting To

When exporting from AFT to use in another application:

- Use **GEDCOM 5.5.1** for maximum compatibility
- Use **GEDCOM 7.0** only if the target software explicitly supports it
- Include media as a **ZIP archive** if the target software supports media import
- For **FamilySearch** upload: use GEDCOM 5.5.1, links-only media

> **Tip:** After importing your AFT export into another application, spot-check a few individuals to confirm that names, dates, relationships, and sources transferred correctly.

---

## Troubleshooting

### Import Issues

**"Unrecognized tags" warning**

This is normal. Many genealogy applications add custom (non-standard) GEDCOM tags. These tags are safely skipped. The standard data (names, dates, relationships) will still import correctly.

**"Validation error" preventing import**

Check that:
- The file has a `.ged` extension
- The file is a valid GEDCOM file (not a ZIP or other archive)
- The file encoding is UTF-8 or ANSEL (other encodings may cause issues)
- The file is not larger than the upload limit

**Missing relationships after import**

This can happen if:
- Family records (`FAM`) in the GEDCOM file reference individuals (`INDI`) that don't exist in the file
- The GEDCOM file has broken cross-references (e.g., `@I999@` referenced but never defined)

Check the import completion summary for any flagged records.

**Duplicate people after import**

If you import the same GEDCOM file twice, AFT uses GEDCOM IDs to detect matches. On the second import, you'll be given conflict resolution options. Choose **Skip** to avoid creating duplicates.

### Export Issues

**Dates look wrong in the target application**

Different applications display GEDCOM dates differently. The underlying data is correct — it's usually a display issue. Verify by opening the `.ged` file in a text editor and checking the `DATE` values.

**Missing media in export**

If you chose "Links only" for media handling, the target application won't have the actual photo files — only references. Re-export with "ZIP archive" to include the media.

**Non-binary sex value shows as "Unknown"**

GEDCOM 5.5.1 only supports `M`, `F`, and `U` for sex. AFT maps "Non-binary" to `U` (Unknown) in 5.5.1 exports. If you export as GEDCOM 7.0, the value `X` is used instead.

---

## Related Guides

- [Getting Started](Getting-Started.md) — Initial setup (includes importing during onboarding)
- [Managing Your Tree](Managing-Your-Tree.md) — Working with person records after import
- [Backup & Restore](Backup-Restore.md) — Using GEDCOM export as a backup strategy
- [Configuration Reference](Configuration.md) — Setting default export format and other GEDCOM options
