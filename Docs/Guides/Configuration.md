# Configuration Reference

This guide documents all configuration options for Apex Family Tree (AFT), including environment variables, volume layout, SMTP email setup, feature flags, and integration options.

---

## Environment Variables

Environment variables are set in your `.env` file or directly in the `environment` section of `docker-compose.yml`. They configure the container's behavior at startup.

### Core Settings

| Variable | Type | Default | Required | Description |
|---|---|---|---|---|
| `PORT` | Integer | `3000` | No | The host port that maps to the container's internal port 3000. Change this if port 3000 is already in use. |
| `NODE_ENV` | String | `production` | No | Application environment. Use `production` for normal operation. `development` enables additional logging and debug features. |
| `TZ` | String | `UTC` | No | Timezone for the container. Affects log timestamps and date handling. Use IANA timezone format (e.g., `America/New_York`, `Europe/London`, `Asia/Tokyo`). |

### Security

| Variable | Type | Default | Required | Description |
|---|---|---|---|---|
| `APP_SECRET` | String | — | **Yes** | Encryption key used to encrypt sensitive data stored in the database (e.g., SMTP passwords). Must be at least 32 characters. If not set, features requiring encryption (like SMTP) are disabled with a warning. |
| `JWT_SECRET` | String | — | **Yes** | Secret key used to sign JWT authentication tokens. Must be at least 32 characters. Changing this will invalidate all existing user sessions. |
| `JWT_ACCESS_EXPIRY` | String | `15m` | No | How long an access token is valid. Uses shorthand notation: `15m` = 15 minutes, `1h` = 1 hour. Shorter values are more secure but require more frequent token refreshes. |
| `JWT_REFRESH_EXPIRY` | String | `7d` | No | How long a refresh token is valid. Uses shorthand notation: `7d` = 7 days, `30d` = 30 days. This controls how long a user stays logged in without re-authenticating. |
| `COOKIE_SECURE` | Boolean | `false` | No | When `true`, JWT cookies are sent only over HTTPS. Set to `true` in production when using a reverse proxy with TLS. Leave `false` for local/HTTP-only setups. |

Generate secure random values with:

```bash
openssl rand -hex 32
```

> **Warning:** Never commit `APP_SECRET` or `JWT_SECRET` to version control. Keep them in your `.env` file and ensure `.env` is in your `.gitignore`.

> **Warning:** If you lose your `APP_SECRET`, any encrypted settings (like SMTP passwords) will become unreadable. You'll need to re-enter them in the application settings after setting a new secret.

### File Permissions

| Variable | Type | Default | Required | Description |
|---|---|---|---|---|
| `PUID` | Integer | `1000` | No | User ID for file ownership inside the container. Set to match your host user's UID so that files in `.data/` are accessible. |
| `PGID` | Integer | `1000` | No | Group ID for file ownership inside the container. Set to match your host user's GID. |
| `UMASK` | String | `0022` | No | File creation permission mask. `0022` means new files are readable by everyone but writable only by the owner. Use `0077` for more restrictive permissions. |

Find your user's IDs:

```bash
id $USER
# Output: uid=1000(youruser) gid=1000(youruser) ...
```

### Logging

| Variable | Type | Default | Required | Description |
|---|---|---|---|---|
| `LOG_LEVEL` | String | `INFO` | No | Controls logging verbosity. Options: `DEBUG`, `INFO`, `WARN`, `ERROR`. `DEBUG` is verbose and intended for troubleshooting only. |
| `LOG_FORMAT` | String | `json` | No | Log output format. `json` produces structured JSON logs (best for log aggregation tools). `text` produces human-readable logs (best for reading in a terminal). |
| `LOG_MAX_BYTES` | Integer | `10485760` | No | Maximum size of a single log file in bytes before it's rotated. Default: 10 MB (10,485,760 bytes). |
| `LOG_BACKUP_COUNT` | Integer | `5` | No | Number of rotated log files to retain. When a log file reaches `LOG_MAX_BYTES`, it's rotated and the oldest file beyond this count is deleted. |

> **Tip:** For most users, the defaults are fine. If you're troubleshooting an issue, temporarily set `LOG_LEVEL=DEBUG` and `LOG_FORMAT=text`, then restart the container.

### Media Storage

| Variable | Type | Default | Required | Description |
|---|---|---|---|---|
| `MEDIA_PATH` | String | `/app/data/media` | No | Filesystem path (inside the container) where media files are stored. Defaults to the `media/` subdirectory inside the data volume. Set this to use a separate volume or mount point for photos and documents. |

By default, media files live alongside the database inside `/app/data/media`. To store media on a separate host directory (e.g., an existing photo library), add a second volume mount and point `MEDIA_PATH` to it:

```yaml
volumes:
  - .data/:/app/data
  - /path/to/your/photos:/media/photos
environment:
  - MEDIA_PATH=/media/photos
```

The application automatically creates `photos/` and `documents/` subdirectories inside the configured `MEDIA_PATH` on startup.

---

## Complete .env Example

Here's a fully documented `.env` file with all available variables:

```bash
# ============================================================
# Apex Family Tree — Environment Configuration
# ============================================================

# --- Required Secrets ---
# Generate with: openssl rand -hex 32
APP_SECRET=change-me-to-a-random-32-char-string
JWT_SECRET=change-me-to-another-random-32-char-string

# --- Server ---
PORT=3000
NODE_ENV=production

# --- JWT Token Expiry ---
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# --- Cookie Security ---
# Set to true when behind a TLS reverse proxy
COOKIE_SECURE=false

# --- Timezone ---
TZ=UTC

# --- File Permissions ---
PUID=1000
PGID=1000
UMASK=0022

# --- Logging ---
LOG_LEVEL=INFO
LOG_FORMAT=json
LOG_MAX_BYTES=10485760
LOG_BACKUP_COUNT=5

# --- Media Storage (optional) ---
# Uncomment to use a custom media directory inside the container
# MEDIA_PATH=/media/photos
```

---

## Volume Layout

AFT uses a single volume mount that maps a host directory to `/app/data` inside the container:

```yaml
volumes:
  - .data/:/app/data
```

### Directory Structure

```
.data/                          # Host directory (your persistent data)
│
├── treeroots.db                # SQLite database (all application data)
├── treeroots.db-wal            # SQLite WAL journal (auto-managed)
├── treeroots.db-shm            # SQLite shared memory (auto-managed)
│
├── media/                      # Uploaded media files
│   ├── persons/                # Person-specific media
│   │   └── {person_id}/       # Files organized by person UUID
│   │       └── {uuid}.jpg     # UUID-named files to prevent collisions
│   └── families/               # Family-specific media
│       └── {family_id}/
│
├── imports/                    # Uploaded GEDCOM files
│   └── {job_id}.ged           # Named by import job UUID
│
├── exports/                    # Generated GEDCOM exports
│   └── {export_id}.ged        # Named by export job UUID
│
├── backups/                    # Automatic database backups
│   └── treeroots-YYYYMMDD-HHMMSS.db
│
└── logs/                       # Application logs
    └── app.log                 # Current log file (rotated based on LOG_MAX_BYTES)
```

### Size Estimates

| Component | Typical Size | Notes |
|---|---|---|
| Database | 1–100 MB | Depends on number of people. 10,000 people ≈ 10–20 MB |
| Media | Varies widely | Each photo is 1–10 MB. A tree with 500 photos could be 1–5 GB |
| Backups | 5–500 MB | Multiple copies of the database; auto-managed by retention policy |
| Logs | Up to 50 MB | Controlled by `LOG_MAX_BYTES` × `LOG_BACKUP_COUNT` |
| Imports/Exports | Varies | GEDCOM files are typically 1–50 MB |

> **Tip:** Monitor the total size of `.data/` periodically, especially after importing media-heavy GEDCOM files.

---

## In-App Settings

After logging in as an Admin, navigate to **Settings** (`/settings`) to configure additional options that are stored in the database.

### Instance Settings

| Setting | Description | Default |
|---|---|---|
| **Site name** | Display name shown in the navbar and page titles | "TreeRoots" |
| **Custom domain** | Your instance's domain name (used in invite emails and links) | None |
| **Allow registration** | Whether public self-registration is enabled (not recommended) | Disabled (invite-only) |
| **Default privacy** | Default privacy level for newly created persons | Public |
| **Default generations** | Number of generations shown on the tree canvas by default | 3 |

### Session Settings

| Setting | Description | Default |
|---|---|---|
| **Session expiry** | How long a login session lasts | 8 hours |
| **Remember me duration** | Session length when "Remember me" is checked at login | 30 days |
| **Invite expiry** | How long an invite link remains valid | 48 hours |

### GEDCOM Defaults

| Setting | Description | Default |
|---|---|---|
| **Default export version** | GEDCOM version used for exports | 5.5.1 |

---

## SMTP Email Configuration

SMTP (Simple Mail Transfer Protocol) is required for sending invitation emails, password reset emails, and any other email notifications. Configure SMTP in the **Settings** screen after logging in as Admin.

### SMTP Settings

| Setting | Description | Example |
|---|---|---|
| **SMTP Host** | Hostname of your email server | `smtp.gmail.com`, `smtp.mailgun.org` |
| **SMTP Port** | Server port | `587` (STARTTLS), `465` (SSL), `25` (unencrypted) |
| **SMTP Secure** | Use TLS/STARTTLS encryption | Enabled (recommended) |
| **SMTP Username** | Login username for the mail server | `your-email@gmail.com` |
| **SMTP Password** | Login password or app-specific password | (encrypted in database) |
| **From Address** | The "From" email address for outbound emails | `noreply@yourdomain.com` |
| **From Name** | The display name for outbound emails | Your site name |

> **Note:** The SMTP password is encrypted in the database using your `APP_SECRET`. If `APP_SECRET` is not set, SMTP configuration is disabled.

### Common Provider Examples

#### Gmail

| Setting | Value |
|---|---|
| SMTP Host | `smtp.gmail.com` |
| SMTP Port | `587` |
| Secure | Yes |
| Username | Your Gmail address |
| Password | An [App Password](https://support.google.com/accounts/answer/185833) (not your account password) |

> **Warning:** Gmail requires an "App Password" if you have 2-factor authentication enabled (which you should). Your regular Gmail password will not work.

#### Mailgun

| Setting | Value |
|---|---|
| SMTP Host | `smtp.mailgun.org` |
| SMTP Port | `587` |
| Secure | Yes |
| Username | Your Mailgun SMTP username |
| Password | Your Mailgun SMTP password |

#### Amazon SES

| Setting | Value |
|---|---|
| SMTP Host | `email-smtp.us-east-1.amazonaws.com` (region-specific) |
| SMTP Port | `587` |
| Secure | Yes |
| Username | Your SES SMTP access key |
| Password | Your SES SMTP secret key |

### Testing SMTP

After configuring SMTP, use the **Send test email** button in the Settings screen to verify the configuration works. The test email is sent to the logged-in admin's email address.

---

## Feature Flags

AFT includes a feature flag system that allows enabling or disabling specific features without code changes. Feature flags are managed in the database and can be toggled by Admins.

### Available Flags

| Flag | Default | Description |
|---|---|---|
| `gedcom_import` | Enabled | GEDCOM file import functionality |
| `gedcom_export` | Enabled | GEDCOM file export functionality |
| `media_upload` | Enabled | Photo and document upload capability |
| `video_links` | Enabled | Ability to link external video URLs |
| `password_reset` | Disabled | Password reset via email (requires SMTP to be configured) |
| `invite_users` | Enabled | Admin invite-link user onboarding |
| `pedigree_chart` | Disabled | Pedigree chart view (planned feature) |
| `timeline_view` | Disabled | Person timeline view (planned feature) |
| `reports` | Disabled | Reports module (planned feature) |

> **Note:** Disabled flags for planned features indicate that the feature is not yet implemented. They will be enabled by default when the feature is released. You can also enable them early to test experimental features.

---

## Google Cloud Integration (Optional)

For users deploying on Google Cloud Platform, AFT supports optional integrations with GCP services:

### Google Cloud Storage (GCS)

Use GCS as an alternative storage backend for media files instead of the local filesystem.

**Benefits:**
- Virtually unlimited storage
- Built-in redundancy and durability
- CDN integration for faster media delivery

**Configuration:**
Set these in the application settings or via environment variables:

| Variable | Description |
|---|---|
| `GCS_BUCKET` | GCS bucket name for media storage |
| `GCS_PROJECT_ID` | Your Google Cloud project ID |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to your GCP service account JSON key file |

### Google Secret Manager

Store `APP_SECRET` and `JWT_SECRET` in Google Secret Manager instead of environment variables.

**Benefits:**
- Centralized secret management
- Audit logging of secret access
- Automatic secret rotation support

### Google Cloud Logging

Send application logs to Cloud Logging (formerly Stackdriver) for centralized log management.

> **Note:** GCP integrations are optional and intended for advanced deployments. For most self-hosted setups, the default local storage and logging are perfectly adequate.

---

## Performance Tuning

### Database Performance

AFT configures SQLite for optimal performance at startup. These settings are applied automatically and don't require manual tuning:

| Setting | Value | Purpose |
|---|---|---|
| `journal_mode` | `WAL` | Enables concurrent reads and writes |
| `synchronous` | `NORMAL` | Balanced durability and performance |
| `foreign_keys` | `ON` | Enforces referential integrity |
| `temp_store` | `MEMORY` | Uses RAM for temp tables (faster) |
| `mmap_size` | `268435456` (256 MB) | Memory-mapped I/O for faster reads |
| `cache_size` | `-32000` (~32 MB) | Page cache for frequently accessed data |
| `busy_timeout` | `5000` (5 seconds) | Wait time when database is locked |

### Log Performance

If you notice performance issues related to logging:

1. Set `LOG_LEVEL=WARN` or `LOG_LEVEL=ERROR` to reduce log volume
2. Decrease `LOG_MAX_BYTES` if disk I/O is a concern
3. Use `LOG_FORMAT=json` for production — it's slightly more efficient to write than formatted text

### Media Performance

- Uploaded photos are automatically resized to a maximum of 800px on the longest side
- Thumbnails (48×48px) are generated and served for list views and the detail panel
- For trees with many photos, ensure your `.data/` volume is on fast storage (SSD recommended)

---

## Docker Compose Reference

Here's the complete `docker-compose.yml` with all supported options:

```yaml
services:
  apexfamily:
    image: neuman1812/ApexFamily:latest
    container_name: ApexFamily
    ports:
      - "${PORT:-3000}:3000"
    environment:
      # Required secrets
      - APP_SECRET=${APP_SECRET}
      - JWT_SECRET=${JWT_SECRET}
      # Server config
      - NODE_ENV=${NODE_ENV:-production}
      # JWT token expiry
      - JWT_ACCESS_EXPIRY=${JWT_ACCESS_EXPIRY:-15m}
      - JWT_REFRESH_EXPIRY=${JWT_REFRESH_EXPIRY:-7d}
      # Cookie security (set true behind TLS)
      - COOKIE_SECURE=${COOKIE_SECURE:-false}
      # File permissions
      - PUID=${PUID:-1000}
      - PGID=${PGID:-1000}
      - UMASK=${UMASK:-0022}
      # Timezone
      - TZ=${TZ:-UTC}
      # Logging
      - LOG_LEVEL=${LOG_LEVEL:-INFO}
      - LOG_DIR=/app/data/logs
      - LOG_FORMAT=${LOG_FORMAT:-json}
      - LOG_MAX_BYTES=${LOG_MAX_BYTES:-10485760}
      - LOG_BACKUP_COUNT=${LOG_BACKUP_COUNT:-5}
      # Media storage (optional — defaults to /app/data/media)
      # - MEDIA_PATH=/media/photos
    volumes:
      - .data/:/app/data
      # Optional: mount a separate host directory for media
      # - /path/to/your/photos:/media/photos
    restart: unless-stopped
```

> **Tip:** The `LOG_DIR` is set to `/app/data/logs` (inside the container) so that logs are persisted to your host volume. You generally don't need to change this.

---

## Related Guides

- [Deployment Guide](Deployment.md) — Setting up AFT for the first time
- [Backup & Restore](Backup-Restore.md) — Understanding data persistence and backups
- [User Management](User-Management.md) — SMTP is needed for user invitations
- [Getting Started](Getting-Started.md) — Configuring your instance during initial setup
