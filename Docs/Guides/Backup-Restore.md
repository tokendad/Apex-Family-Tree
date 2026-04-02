# Backup & Restore

Your family tree data is irreplaceable. This guide explains how Apex Family Tree (AFT) protects your data with automatic backups, and how you can create manual backups and restore from them if needed.

---

## What Gets Backed Up

All of AFT's data lives in a single directory on your host system: the `.data/` volume mount. This directory contains:

| Path | Contents |
|---|---|
| `.data/treeroots.db` | SQLite database — all people, families, events, users, settings |
| `.data/media/` | Uploaded photos and documents |
| `.data/imports/` | Uploaded GEDCOM files |
| `.data/exports/` | Generated GEDCOM export files |
| `.data/backups/` | Automatic database backup snapshots |
| `.data/logs/` | Application log files |

> **Note:** The database file (`treeroots.db`) contains all your genealogy data, user accounts, and application settings. The `media/` directory contains your uploaded files. Together, these two are the most critical items to protect.

---

## Automatic Backups

AFT creates automatic database backups at several key moments. These backups use SQLite's built-in Online Backup API, which creates consistent snapshots without interrupting the running application.

### When Automatic Backups Happen

| Trigger | When | What's Backed Up |
|---|---|---|
| **Startup backup** | Every time the container starts (if the database already exists) | Full database snapshot |
| **Pre-migration backup** | Before any database schema migrations run during an update | Full database snapshot |
| **Post-import backup** | After every successful GEDCOM import | Full database snapshot |
| **Scheduled backup** | Daily at midnight UTC | Full database snapshot |

### Backup Location and Naming

Automatic backups are stored in:

```
.data/backups/
```

Each backup file is named with a timestamp:

```
treeroots-YYYYMMDD-HHMMSS.db
```

For example: `treeroots-20250615-143022.db`

### Backup Retention Policy

AFT automatically manages backup retention to prevent the backup directory from growing indefinitely:

| Backup Type | Retention |
|---|---|
| Startup backups | Last **5** are kept |
| Post-import backups | Last **10** are kept |
| Scheduled daily backups | Last **30** are kept |
| Pre-migration backups | Kept **permanently** (timestamped, never auto-deleted) |

When a new backup is created, AFT checks the backup directory and removes the oldest files beyond the retention count for that type.

> **Tip:** Pre-migration backups are never automatically deleted because they represent a known-good state before a schema change. If disk space becomes a concern, you can manually remove old pre-migration backups after confirming the corresponding update was successful.

---

## Manual Backup via Docker Volume

For a complete backup of all your data (database, media, logs, everything), copy the entire `.data/` directory from your host system.

### Simple File Copy

```bash
# Stop the container for a fully consistent backup
docker compose down

# Copy the entire data directory
cp -r .data/ /path/to/your/backup/aft-backup-$(date +%Y%m%d)/

# Restart the container
docker compose up -d
```

> **Warning:** For maximum consistency, stop the container before copying. If you copy while AFT is running, the database's WAL (Write-Ahead Log) file may contain uncommitted changes. SQLite handles this gracefully on the next startup, but stopping the container guarantees a perfectly clean backup.

### Backup While Running (Hot Backup)

If you can't afford downtime, you can still create a reliable backup:

1. **Copy the automatic backup** — The `.data/backups/` directory already contains recent database snapshots created by the Online Backup API, which are guaranteed to be consistent:

   ```bash
   # Find the most recent automatic backup
   ls -lt .data/backups/

   # Copy it along with the media directory
   mkdir -p /path/to/backup/aft-$(date +%Y%m%d)
   cp .data/backups/treeroots-*.db /path/to/backup/aft-$(date +%Y%m%d)/
   cp -r .data/media/ /path/to/backup/aft-$(date +%Y%m%d)/media/
   ```

2. **Use a compressed archive:**

   ```bash
   tar -czf /path/to/backup/aft-backup-$(date +%Y%m%d).tar.gz .data/
   ```

### Automated Backup Script (Cron)

Set up a cron job on your host system for regular backups:

```bash
# Edit your crontab
crontab -e
```

Add a line for daily backups at 2:00 AM:

```
0 2 * * * cd /path/to/apex-family-tree && tar -czf /path/to/backups/aft-$(date +\%Y\%m\%d).tar.gz .data/ 2>/dev/null
```

> **Tip:** For off-site backups, pipe the output to a cloud storage tool like `rclone`, or use a dedicated backup solution like Restic, Borgbackup, or Duplicati targeting the `.data/` directory.

---

## Restoring from a Backup

### Restoring the Database Only

If you need to restore just the database (e.g., after accidental data deletion or a failed migration):

1. **Stop the container:**

   ```bash
   docker compose down
   ```

2. **List available backups and choose the most recent good one:**

   ```bash
   ls -lt .data/backups/
   ```

3. **Replace the current database with the backup:**

   ```bash
   cp .data/backups/treeroots-YYYYMMDD-HHMMSS.db .data/treeroots.db
   ```

4. **Remove stale WAL and SHM files:**

   ```bash
   rm -f .data/treeroots.db-wal
   rm -f .data/treeroots.db-shm
   ```

   > **Warning:** This step is important. The WAL and SHM files belong to the old database state. If you leave them in place, SQLite may try to replay changes from the old session, which could cause corruption with the restored database.

5. **Restart the container:**

   ```bash
   docker compose up -d
   ```

   On startup, AFT will run its integrity check and apply any pending migrations if the backup is from an older version.

### Full Data Restore

If you need to restore everything (database + media + all files):

1. **Stop the container:**

   ```bash
   docker compose down
   ```

2. **Replace the data directory with your backup:**

   ```bash
   # Remove the current data
   rm -rf .data/

   # Restore from your full backup
   cp -r /path/to/backup/aft-YYYYMMDD/ .data/

   # Or if using a compressed archive:
   tar -xzf /path/to/backup/aft-backup-YYYYMMDD.tar.gz
   ```

3. **Remove stale WAL and SHM files (if present):**

   ```bash
   rm -f .data/treeroots.db-wal
   rm -f .data/treeroots.db-shm
   ```

4. **Restart the container:**

   ```bash
   docker compose up -d
   ```

---

## Disaster Recovery

### Scenario: Database Is Corrupted

If AFT detects database corruption on startup, it will:
1. Log a critical error
2. Set the application health status to **DEGRADED**
3. Serve a maintenance page instead of the normal application
4. **Not** run migrations (to avoid further corruption)

**Recovery steps:**

```bash
# 1. Stop the container
docker compose down

# 2. List available backups (newest first)
ls -lt .data/backups/

# 3. Restore the most recent backup
cp .data/backups/treeroots-YYYYMMDD-HHMMSS.db .data/treeroots.db

# 4. Clean up WAL/SHM files
rm -f .data/treeroots.db-wal .data/treeroots.db-shm

# 5. Restart
docker compose up -d
```

### Scenario: Entire .data/ Directory Is Lost

If the volume mount directory is gone:

1. Restore from your most recent external backup (see Full Data Restore above)
2. If no external backup exists but you have a GEDCOM export file saved somewhere, you can:
   - Start AFT fresh (it will create a new database)
   - Complete the setup wizard
   - Import your GEDCOM file to recover the genealogy data

> **Warning:** A GEDCOM export does not include user accounts, application settings, or media files. Only the genealogy data (people, families, events, sources) can be recovered from a GEDCOM file. This is why regular full backups of the `.data/` directory are essential.

### Scenario: Failed Update

If an AFT update breaks something:

1. A pre-migration backup was created automatically
2. Follow the steps in the [Deployment Guide — Rolling Back an Update](Deployment.md) section
3. Pin the previous image version in `docker-compose.yml` until the issue is resolved

---

## Understanding SQLite and WAL Mode

AFT uses SQLite in **WAL (Write-Ahead Logging) mode**. This is important to understand for backups because:

- The database consists of up to **three files**: `treeroots.db`, `treeroots.db-wal`, and `treeroots.db-shm`
- The `-wal` file contains recent changes that haven't been checkpointed back to the main database file yet
- The `-shm` file is a shared-memory index used for WAL operations
- **All three files are needed** for a live copy to be consistent
- AFT's automatic backups use the Online Backup API, which handles this correctly by producing a single, self-contained `.db` file
- If you copy files manually while AFT is running, copy all three files together

> **Tip:** This is why the automatic backups in `.data/backups/` are the safest source for database restoration — they are always self-contained and consistent.

---

## Best Practices

1. **Don't rely solely on automatic backups.** The automatic backups are stored in the same `.data/` directory as the live database. If the storage device fails, you lose both the live data and the backups. Always maintain an **off-site backup** as well.

2. **Test your restore process.** Don't wait for a disaster to discover your backups are incomplete or corrupted. Periodically test restoring from a backup to a separate directory and verify the data.

3. **Use GEDCOM export as a secondary backup.** In addition to full data backups, periodically export your tree as a GEDCOM file and store it separately. This provides a portable, application-independent backup of your genealogy data. See the [GEDCOM Import & Export Guide](GEDCOM-Import-Export.md).

4. **Monitor backup disk usage.** Over time, automatic backups accumulate. While retention policies manage this, keep an eye on the total size of `.data/backups/`, especially after large GEDCOM imports.

5. **Document your backup schedule.** Write down where your backups are stored, how often they're created, and how to restore them. Share this information with a trusted family member in case you're unavailable.

6. **Back up before major changes.** Before importing a large GEDCOM file, running an update, or making significant edits, create a manual backup as extra insurance. AFT creates pre-import and pre-migration backups automatically, but having your own can't hurt.

---

## Related Guides

- [Deployment Guide](Deployment.md) — Setting up and updating AFT
- [GEDCOM Import & Export](GEDCOM-Import-Export.md) — Using GEDCOM export as a backup strategy
- [Configuration Reference](Configuration.md) — Log file and data directory settings
