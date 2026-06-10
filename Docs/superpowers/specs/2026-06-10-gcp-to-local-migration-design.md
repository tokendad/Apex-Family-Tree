# GCP → Local Migration Design
**Date:** 2026-06-10

## Summary

Migrate Apex Family Tree from a Google Cloud project to the local Docker stack at
`/data/DockerConfigs/docker-compose.yaml`. The GCP project (`apex-family-tree`) is
empty — no active services, no data to migrate — so this is purely a configuration
task: add the service to the main stack, set secrets, verify it runs, and delete the
GCP project.

---

## Current State

| GCP Service | Status |
|---|---|
| Cloud Run | Never enabled |
| Compute Engine | Never enabled |
| Secret Manager | Never enabled |
| GCS buckets | 0 buckets |
| Cloud Logging | Audit trail only (gcloud admin activity) |

The app has been running locally via the standalone `/data/Projects/AFT/docker-compose.yml`.
`/data/DockerConfigs/AFT/` already exists with live data (SQLite db, media, backups).

The app's provider abstraction already supports `local` backends for storage, secrets, and
logging — all defaulting to `local` when no GCP vars are set.

---

## Architecture

### No data migration required

All application data already lives at `/data/DockerConfigs/AFT/`. No GCS download,
no secret export, no log archiving needed.

### Consolidation into main Docker stack

The AFT service joins the existing stack in `/data/DockerConfigs/docker-compose.yaml`
alongside nesventory, civicdenovo, grampsweb, plex, etc. This follows the established
pattern: service definition in the compose file, secrets in `/data/DockerConfigs/.env`.

### Service configuration

```
Image:   neuman1812/apexfamily:latest   (built + pushed by existing CI)
Port:    3000:3000
Volumes: /data/DockerConfigs/AFT → /app/data
         /media/Personal/PersonalImages/Ancestry → /media/ancestry
Backends: STORAGE_BACKEND=local, SECRET_BACKEND=local, LOG_BACKEND=local
```

Secrets follow the `AFT_` prefix convention (matching `NESVENTORY_`, `GRAMPS_`, etc.):
- `AFT_APP_SECRET` — AES-256-GCM key for SMTP password encryption
- `AFT_JWT_SECRET` — JWT signing key

### GCP project deletion

After verifying the local service works, the GCP project is deleted via
`gcloud projects delete apex-family-tree`. Billing is unlinked as part of deletion.

---

## Components Changed

1. **`/data/DockerConfigs/docker-compose.yaml`** — add `apex-family-tree` service block
2. **`/data/DockerConfigs/.env`** — add `AFT_APP_SECRET` and `AFT_JWT_SECRET`
3. **GCP project** — delete `apex-family-tree`

No changes to the AFT application code, Dockerfile, or CI pipeline.

---

## Verification

After `docker compose up -d apex-family-tree`:
- Container reaches `running` state
- App responds at `http://localhost:3000`
- Login works (existing db at `/data/DockerConfigs/AFT/treeroots.db` is intact)
- Media images load correctly

---

## Error Handling

The app already has `restart: unless-stopped`. Watchtower will pick up future image
updates automatically (it watches all running containers).

---

## Out of Scope

- SMTP email configuration (optional; can be added later via `.env`)
- Reverse proxy / domain setup (separate concern)
- Standalone `/data/Projects/AFT/docker-compose.yml` — leave it in place for
  development use; it's independent of the main stack
