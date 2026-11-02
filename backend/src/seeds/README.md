# Development seed trees

A GEDCOM file placed here is development seed data: a tree large enough to show
what the app does with a real archive. Apply one with

```bash
npm run seed:tree -w backend                        # src/seeds/queen.ged
npm run seed:tree -w backend -- /path/to/tree.ged   # any other file
```

The script refuses a database that already holds people. It goes through the
GEDCOM importer, which mints fresh ids on every run, so a second run would
duplicate the tree rather than update it — and refusing a non-empty database is
also what stops a misdirected `DATA_DIR` from writing demo data into somebody's
archive. To reseed, remove the database file and let the next start recreate the
schema.

It records the import against the oldest admin account, so an account has to
exist first: `npm run seed:dev -w backend`, or the setup page.

## queen.ged

The example Queen tree — the British royal family, about 4,700 people and 2,900
families. Not tracked in git: it is megabytes of demo data that only development
needs. Fetch or build it when you want it.

**Disclaimer carried over from the source:** this dataset exists to demonstrate
software. It makes no claim to genealogical or factual accuracy and should not
be used as a reference.

### Where it comes from

Two routes to the same tree:

1. **GEDCOM directly**, `queen/Queen.ged` from
   <https://github.com/D-Jeffrey/gedcom-samples> — GEDCOM 5.5.1, UTF-8,
   dedicated to the public domain under CC0 1.0. Nothing to convert.

   ```bash
   curl -sSLo backend/src/seeds/queen.ged \
     https://raw.githubusercontent.com/D-Jeffrey/gedcom-samples/main/queen/Queen.ged
   ```

2. **From the Gramps example tree**,
   <https://github.com/DavidMStraub/gramps-web-example-tree-queen>, which is the
   same genealogical core plus portraits and biography excerpts. It ships as
   Gramps XML, so it needs converting:

   ```bash
   gramps -i queen.gramps -e backend/src/seeds/queen.ged
   ```

   Note the licensing difference. The Gramps dataset as a whole is CC BY-SA 4.0,
   driven by its Wikipedia-sourced media and text, which requires attribution and
   ShareAlike on anything built from it; the genealogical data underneath is the
   CC0 material from route 1. Either way the media is not imported — `seed:tree`
   reads the GEDCOM and nothing else.

### What it replaced

A hand-written `british-monarchy.sql`, 25 people, applied by `seedMonarchy.ts`.
Small enough to read, too small to exercise paging, the tree renderer at depth,
duplicate detection, or the places and events pages. Recoverable from git
history if a tiny fixture is ever wanted again.
