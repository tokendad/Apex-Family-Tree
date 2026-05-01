# 🌳 Apex Family Tree

A self-hosted family genealogy web application. Runs as a **single Docker container** with an embedded SQLite database — no external services required.

[![GitHub](https://img.shields.io/badge/GitHub-tokendad%2FApex--Family--Tree-blue?logo=github)](https://github.com/tokendad/Apex-Family-Tree)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/tokendad/Apex-Family-Tree/blob/main/LICENSE)

---

## Features

- 🌳 **Interactive SVG family tree canvas** — pan, zoom, and generation controls
- 👤 **4-step person wizard** — personal info, vital events, relationships, media & notes
- 📥 **GEDCOM 5.5.1 & 7.0** import and export with conflict detection
- 🔒 **Role-based access control** — Admin, Editor, Limited Editor, Viewer
- ✉️ **User invitation system** with email-based onboarding
- 📷 **Media management** — photo uploads, auto-thumbnails, per-person galleries
- 📚 **Source & citation tracking** for documenting genealogical research
- 🔍 **Full-text search** (SQLite FTS5) across all persons
- ⚙️ **Admin dashboard** — user management, app settings, feature flags
- 💾 **Automatic database backups** with configurable retention
- ☁️ **Optional GCP integration** — Cloud Storage, Secret Manager, Cloud Logging
- 📱 **Responsive design** — desktop, tablet, and mobile

---

## Quick Start

```bash
docker run -d \
  --name apex-family-tree \
  -p 3000:3000 \
  -v ./data:/app/data \
  -e APP_SECRET=$(openssl rand -hex 32) \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  neuman1812/apexfamily:latest
```

Visit **http://localhost:3000** to create your admin account.

---

## Docker Compose (Recommended)

**`docker-compose.yml`**

```yaml
services:
  apex-family-tree:
    image: neuman1812/apexfamily:latest
    container_name: apex-family-tree
    ports:
      - "${PORT:-3000}:3000"
    volumes:
      - ./.data:/app/data
    environment:
      - PUID=${PUID:-1000}
      - PGID=${PGID:-1000}
      - TZ=${TZ:-UTC}
      - NODE_ENV=production
      - APP_SECRET=${APP_SECRET}
      - JWT_SECRET=${JWT_SECRET}
      - JWT_ACCESS_EXPIRY=${JWT_ACCESS_EXPIRY:-15m}
      - JWT_REFRESH_EXPIRY=${JWT_REFRESH_EXPIRY:-7d}
      - COOKIE_SECURE=${COOKIE_SECURE:-false}
      - LOG_LEVEL=${LOG_LEVEL:-INFO}
      - LOG_FORMAT=${LOG_FORMAT:-json}
    restart: unless-stopped
```

**`.env`**

```bash
# Generate with: openssl rand -hex 32
APP_SECRET=your-random-secret-here
JWT_SECRET=another-random-secret-here

PORT=3000
TZ=America/New_York
PUID=1000
PGID=1000
```

```bash
docker compose up -d
```

> ⚠️ **Always generate unique random values for `APP_SECRET` and `JWT_SECRET`.** Never use placeholder defaults in production.

---

## Environment Variables

### Required

| Variable | Description |
|---|---|
| `APP_SECRET` | Encryption key for sensitive database values (min 32 chars). Generate with `openssl rand -hex 32`. |
| `JWT_SECRET` | JWT signing secret (min 32 chars). Changing this invalidates all active sessions. |

### Server

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Host port to expose |
| `NODE_ENV` | `production` | Application environment |
| `TZ` | `UTC` | Container timezone (IANA format, e.g. `America/New_York`) |

### Auth & Cookies

| Variable | Default | Description |
|---|---|---|
| `JWT_ACCESS_EXPIRY` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRY` | `7d` | Refresh token lifetime (controls session length) |
| `COOKIE_SECURE` | `false` | Set `true` when behind a TLS reverse proxy |

### File Permissions

| Variable | Default | Description |
|---|---|---|
| `PUID` | `1000` | User ID for volume file ownership |
| `PGID` | `1000` | Group ID for volume file ownership |
| `UMASK` | `0022` | File creation permission mask |

### Logging

| Variable | Default | Description |
|---|---|---|
| `LOG_LEVEL` | `INFO` | Verbosity: `DEBUG`, `INFO`, `WARN`, `ERROR` |
| `LOG_FORMAT` | `json` | `json` (structured) or `text` (human-readable) |
| `LOG_MAX_BYTES` | `10485760` | Max log file size before rotation (10 MB) |
| `LOG_BACKUP_COUNT` | `5` | Number of rotated log files to retain |

### Media Storage (Optional)

| Variable | Default | Description |
|---|---|---|
| `MEDIA_PATH` | `/app/data/media` | Path inside the container where photos are stored. Mount a second volume and point `MEDIA_PATH` to it to use an existing photo library. |

---

## Volumes

| Mount | Purpose |
|---|---|
| `/app/data` | **Required.** Persistent data: SQLite database, media files, backups, imports/exports, and logs. |

### Data Directory Layout

```
.data/
├── treeroots.db          # SQLite database (all application data)
├── media/                # Uploaded photos and documents
│   └── persons/{id}/     # Files organized by person UUID
├── backups/              # Automatic database backups
│   └── treeroots-YYYYMMDD-HHMMSS.db
├── imports/              # Uploaded GEDCOM files
├── exports/              # Generated GEDCOM exports
└── logs/                 # Rotated application logs
```

---

## Reverse Proxy (Nginx Example)

```nginx
server {
    listen 443 ssl;
    server_name tree.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

When behind TLS, set `COOKIE_SECURE=true` in your `.env`.

---

## Separate Media Volume (Optional)

To use an existing photo library on your host:

```yaml
volumes:
  - ./.data:/app/data
  - /path/to/your/photos:/media/photos
environment:
  - MEDIA_PATH=/media/photos
```

---

## Health Check

The container includes a built-in health check:

```
GET /api/health
```

Docker reports the container as `healthy` once this endpoint responds successfully.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite 5, Zustand |
| Backend | Node.js 20, Express 4, TypeScript |
| Database | SQLite via better-sqlite3 (WAL mode) |
| Auth | JWT httpOnly cookies, Argon2id hashing |
| Container | node:20-alpine, multi-stage build |

---

## Documentation & Support

| Resource | Link |
|---|---|
| 📖 Getting Started | [Getting-Started.md](https://github.com/tokendad/Apex-Family-Tree/blob/main/Docs/Guides/Getting-Started.md) |
| 🚀 Deployment Guide | [Deployment.md](https://github.com/tokendad/Apex-Family-Tree/blob/main/Docs/Guides/Deployment.md) |
| ⚙️ Configuration Reference | [Configuration.md](https://github.com/tokendad/Apex-Family-Tree/blob/main/Docs/Guides/Configuration.md) |
| 📥 GEDCOM Import & Export | [GEDCOM-Import-Export.md](https://github.com/tokendad/Apex-Family-Tree/blob/main/Docs/Guides/GEDCOM-Import-Export.md) |
| 👥 User Management | [User-Management.md](https://github.com/tokendad/Apex-Family-Tree/blob/main/Docs/Guides/User-Management.md) |
| 💾 Backup & Restore | [Backup-Restore.md](https://github.com/tokendad/Apex-Family-Tree/blob/main/Docs/Guides/Backup-Restore.md) |
| 🐛 Issues & Source | [GitHub Repository](https://github.com/tokendad/Apex-Family-Tree) |

---

## License

[MIT License](https://github.com/tokendad/Apex-Family-Tree/blob/main/LICENSE) — © tokendad
