# GCP → Local Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `apex-family-tree` to the main local Docker stack at `/data/DockerConfigs/docker-compose.yaml`, verify it runs against existing local data, and delete the empty GCP project.

**Architecture:** The app image (`neuman1812/apexfamily:latest`) is already on DockerHub via CI. Local data already exists at `/data/DockerConfigs/AFT/`. This migration is purely config: add the service block, wire up secrets, verify, shut down GCP.

**Tech Stack:** Docker Compose, gcloud CLI

---

## Files

| Action | Path |
|--------|------|
| Modify | `/data/DockerConfigs/docker-compose.yaml` |
| Modify | `/data/DockerConfigs/.env` |
| Delete (GCP) | GCP project `apex-family-tree` |

---

### Task 1: Add AFT secrets to `.env`

**Files:**
- Modify: `/data/DockerConfigs/.env`

- [ ] **Step 1: Generate two secrets**

```bash
openssl rand -base64 32   # copy as AFT_APP_SECRET
openssl rand -base64 32   # copy as AFT_JWT_SECRET
```

- [ ] **Step 2: Append the AFT section to `/data/DockerConfigs/.env`**

Open `/data/DockerConfigs/.env` and add the following block at the end of the file (substitute the generated values):

```dotenv
# -----------------------------------------------------------------------------
# Apex Family Tree (AFT)
# -----------------------------------------------------------------------------
AFT_APP_SECRET=<output of first openssl command>
AFT_JWT_SECRET=<output of second openssl command>
```

- [ ] **Step 3: Verify the values are present**

```bash
grep "AFT_" /data/DockerConfigs/.env
```

Expected output:
```
AFT_APP_SECRET=<your value>
AFT_JWT_SECRET=<your value>
```

---

### Task 2: Add `apex-family-tree` service to docker-compose.yaml

**Files:**
- Modify: `/data/DockerConfigs/docker-compose.yaml`

- [ ] **Step 1: Add the service block**

In `/data/DockerConfigs/docker-compose.yaml`, locate the `# ── CiviDeNovo` section (around line 506) and insert the following block **above** it (i.e., before `civicdenovo-db:`):

```yaml
  # ── Apex Family Tree ─────────────────────────────────────────────────────────

  apex-family-tree:
    container_name: apex-family-tree
    image: neuman1812/apexfamily:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - APP_SECRET=${AFT_APP_SECRET}
      - JWT_SECRET=${AFT_JWT_SECRET}
      - JWT_ACCESS_EXPIRY=15m
      - JWT_REFRESH_EXPIRY=7d
      - LOG_LEVEL=info
      - LOG_FORMAT=json
      - STORAGE_BACKEND=local
      - SECRET_BACKEND=local
      - LOG_BACKEND=local
      - MEDIA_PATH=/media/ancestry
      - COOKIE_SECURE=false
      - PUID=1000
      - PGID=1000
    volumes:
      - /data/DockerConfigs/AFT:/app/data
      - /media/Personal/PersonalImages/Ancestry:/media/ancestry

```

- [ ] **Step 2: Validate the compose file syntax**

```bash
docker compose -f /data/DockerConfigs/docker-compose.yaml config --quiet
```

Expected: no output, exit code 0. If there are errors, fix indentation.

---

### Task 3: Pull image and start the service

**Files:** none (runtime only)

- [ ] **Step 1: Pull the latest image**

```bash
docker pull neuman1812/apexfamily:latest
```

Expected: "Status: Image is up to date" or "Downloaded newer image".

- [ ] **Step 2: Start just the AFT service**

```bash
docker compose -f /data/DockerConfigs/docker-compose.yaml up -d apex-family-tree
```

Expected:
```
✔ Container apex-family-tree  Started
```

- [ ] **Step 3: Confirm the container is running**

```bash
docker ps --filter name=apex-family-tree --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

Expected:
```
NAMES               STATUS          PORTS
apex-family-tree    Up X seconds    0.0.0.0:3000->3000/tcp
```

- [ ] **Step 4: Check container logs for startup errors**

```bash
docker logs apex-family-tree --tail 30
```

Expected: server started / listening on port 3000. No `FATAL` or `Error:` lines.

---

### Task 4: Verify the app works end-to-end

**Files:** none (verification only)

- [ ] **Step 1: Hit the health/root endpoint**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

Expected: `200` or `302` (redirect to login). Any `5xx` means a startup problem — check `docker logs apex-family-tree`.

- [ ] **Step 2: Verify the database is loaded**

```bash
docker exec apex-family-tree ls /app/data/
```

Expected output includes `treeroots.db`.

- [ ] **Step 3: Open the app in a browser and log in**

Navigate to `http://localhost:3000`. Confirm:
- Login page loads
- You can log in with your existing credentials
- Your family tree data is visible

- [ ] **Step 4: Verify media images load**

In the UI, open a person with a photo. Confirm the image renders (not a broken image icon). This confirms the `/media/ancestry` volume mount is correct.

---

### Task 5: Delete the GCP project

> **Irreversible action** — only do this after Task 4 is fully verified.

**Files:** none (GCP only)

- [ ] **Step 1: Confirm the project ID**

```bash
gcloud projects describe apex-family-tree --format="value(projectId,name,lifecycleState)"
```

Expected:
```
apex-family-tree  Apex Family tree  ACTIVE
```

- [ ] **Step 2: Delete the project**

```bash
gcloud projects delete apex-family-tree
```

When prompted `Your project will be deleted`, type `y` and press Enter.

Expected:
```
Deleted [https://cloudresourcemanager.googleapis.com/v1/projects/apex-family-tree].
```

- [ ] **Step 3: Verify deletion**

```bash
gcloud projects describe apex-family-tree 2>&1
```

Expected: error mentioning `DELETE_REQUESTED` lifecycle state or "not found". That confirms it's gone (GCP holds it in DELETE_REQUESTED for 30 days before permanent removal).

- [ ] **Step 4: Restore default gcloud project (optional)**

If gcloud was pointing at `apex-family-tree`, restore it:

```bash
gcloud config set project civicmirror-2026
```

---

### Task 6: Commit the docker-compose changes

**Files:**
- `/data/DockerConfigs/docker-compose.yaml` (already modified in Task 2)

> Note: `/data/DockerConfigs/.env` is gitignored (contains secrets) — do not commit it.

- [ ] **Step 1: Commit from the DockerConfigs directory**

```bash
cd /data/DockerConfigs
git add docker-compose.yaml
git commit -m "feat: add apex-family-tree to local docker stack"
```

Expected:
```
[main <hash>] feat: add apex-family-tree to local docker stack
 1 file changed, 22 insertions(+)
```
