# Architecture

This document describes the high-level architecture of Apex Family Tree (AFT), covering the frontend, backend, database, authentication, and key subsystems.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Docker Container                         │
│  (node:20-alpine)                                           │
│                                                              │
│  ┌────────────────┐    ┌──────────────────────────────────┐ │
│  │   Frontend      │    │   Backend (Express)              │ │
│  │   Static Files  │    │                                  │ │
│  │   (Vite build)  │    │  Routes → Services → Repos → DB │ │
│  │                 │    │                                  │ │
│  │  React 18 SPA   │───▶│  /api/*  endpoints               │ │
│  │  served by      │    │  JWT auth middleware             │ │
│  │  Express static │    │  Provider pattern (Storage,      │ │
│  │                 │    │   Secrets, Logging)              │ │
│  └────────────────┘    └──────────┬───────────────────────┘ │
│                                    │                         │
│                         ┌──────────▼──────────┐             │
│                         │   SQLite (WAL mode)  │             │
│                         │   treeroots.db       │             │
│                         │   better-sqlite3     │             │
│                         └─────────────────────┘             │
│                                                              │
│  Volume: /app/data (DB, media, backups, logs, exports)      │
└─────────────────────────────────────────────────────────────┘
```

In production, the Express server serves both the compiled frontend static files and the REST API. In development, Vite's dev server (port 5173) proxies `/api` requests to the Express backend (port 3000).

---

## Frontend Architecture

### Technology

| Concern | Solution |
|---|---|
| UI Library | React 18 |
| Language | TypeScript (strict mode) |
| Build Tool | Vite 5 |
| Routing | React Router v6 (BrowserRouter) |
| State Management | Zustand (single `canvasStore`) |
| Auth State | React Context (`AuthContext`) |
| Styling | CSS Modules + design tokens (`tokens.css`) |
| Testing | Vitest + Testing Library |

### Routing

Routes are defined in `App.tsx` using React Router v6:

- **Public routes**: `/login`, `/setup`, `/register/:token`, `/forgot-password`, `/reset-password`
- **Protected routes** (require auth): `/` (tree), `/people`, `/families`, `/sources`, `/media`, `/import`, `/export`
- **Admin routes** (require admin role): `/admin/users`, `/admin/settings`

Route guards are implemented via `<ProtectedRoute>` and `<AdminRoute>` wrapper components.

### State Management

**Zustand store** (`canvasStore.ts`) manages the tree canvas state:
- Tree data: nodes, families, connector lines
- View state: zoom (0.5–2.0×), pan offset, selected person
- UI state: context menu position, loading, hover

**Auth context** (`AuthContext.tsx`) manages authentication:
- Current user, loading state, `isAuthenticated`, `needsSetup`
- Methods: `login()`, `logout()`, `setup()`, `refreshUser()`

### Key Components

| Component | Purpose |
|---|---|
| `TreeCanvas` | SVG-based family tree visualization with pan/zoom |
| `WizardModal` + `WizardSteps` | 4-step person creation/edit wizard |
| `PersonCard` | Individual person node on the canvas (color-coded by sex) |
| `DetailPanel` | Right sidebar showing selected person details |
| `ContextMenu` | Right-click menu for person actions |
| `AppShell` | Layout wrapper (navbar + sidebar + main + detail panel) |
| `CanvasToolbar` | Toolbar with add person, import, and zoom controls |
| `ConnectorLines` | SVG lines connecting family members |

### CSS Architecture

- **CSS Modules**: Each component has a co-located `.module.css` file for scoped styles
- **Design tokens** (`styles/tokens.css`): CSS custom properties for colors, typography, spacing, shadows
- **Global styles**: `global.css`, `reset.css`, `responsive.css` for base styles and responsive breakpoints
- **Color scheme**: Primary teal, accent amber, sex-based card colors (blue/pink/teal/gray)

---

## Backend Architecture

### Technology

| Concern | Solution |
|---|---|
| Runtime | Node.js 20 |
| Framework | Express 4 |
| Language | TypeScript (strict mode, ESM) |
| Database | better-sqlite3 (synchronous SQLite) |
| Auth | jsonwebtoken + argon2 |
| File Uploads | multer |
| Security | helmet, cors, cookie-parser |
| Logging | morgan + custom logger |

### Layered Architecture

```
HTTP Request
    │
    ▼
┌─────────────┐
│  Middleware  │  helmet, cors, json, cookies, morgan, firstRun, auth
└──────┬──────┘
       ▼
┌─────────────┐
│   Routes    │  13 route files under src/routes/
└──────┬──────┘
       ▼
┌─────────────┐
│  Services   │  Business logic (auth, GEDCOM, backup, email, encryption)
└──────┬──────┘
       ▼
┌──────────────┐
│ Repositories │  9 repositories — data access via better-sqlite3
└──────┬───────┘
       ▼
┌─────────────┐
│   SQLite    │  treeroots.db (WAL mode)
└─────────────┘
```

### Middleware Stack

Applied in order in `index.ts`:

1. **helmet** — Security headers (CSP disabled for frontend compatibility)
2. **cors** — Cross-origin resource sharing
3. **express.json** — JSON body parsing (10 MB limit)
4. **express.urlencoded** — URL-encoded body parsing
5. **cookie-parser** — Cookie parsing for JWT tokens
6. **morgan** — HTTP request logging
7. **firstRunCheck** — Blocks all requests except `/api/auth/setup` and `/api/health` until an admin exists

Route-level middleware:
- **requireAuth** — Verifies JWT access token from cookies
- **requireRole(...roles)** — Checks user role against allowed roles
- **validate(rules)** — Request body validation

### Route Modules

| Route File | Mount Path | Key Endpoints |
|---|---|---|
| `health.ts` | `/api/health` | GET health check |
| `auth.ts` | `/api/auth` | POST setup, login, logout, refresh; GET me |
| `people.ts` | `/api/v1/people` | CRUD, relationships, search |
| `families.ts` | `/api/v1/families` | CRUD, member management |
| `events.ts` | `/api/v1/events` | Life event CRUD for persons |
| `sources.ts` | `/api/v1/sources` | Source and citation CRUD |
| `media.ts` | `/api/v1/media` | Upload, link, delete media files |
| `tree.ts` | `/api/v1/tree` | Ancestor/descendant tree queries |
| `homePerson.ts` | `/api/v1/home-person` | Get/set user's home person |
| `gedcom.ts` | `/api/v1/gedcom` | Import workflow, export with scopes |
| `admin.ts` | `/api/v1/admin` | User management (admin only) |
| `settings.ts` | `/api/v1/admin` | App settings, feature flags (admin only) |

### Repositories

| Repository | Manages |
|---|---|
| `UserRepository` | Users, auth credentials, roles |
| `PersonRepository` | Persons, names, full-text search |
| `FamilyRepository` | Family units, members, spouse links |
| `EventRepository` | Life events (birth, death, marriage, etc.) |
| `SourceRepository` | Sources, repositories, citations |
| `MediaRepository` | Media items and entity links |
| `ImportRepository` | Import jobs, conflicts, XREF maps |
| `SettingsRepository` | App settings, feature flags |

---

## Database

### Engine

- **SQLite** via `better-sqlite3` (synchronous, in-process)
- **WAL mode** for concurrent read/write support
- Database file: `/app/data/treeroots.db`

### Pragmas (Applied at Startup)

| Pragma | Value | Purpose |
|---|---|---|
| `journal_mode` | WAL | Concurrent reads and writes |
| `synchronous` | NORMAL | Balanced durability/performance |
| `foreign_keys` | ON | Referential integrity |
| `temp_store` | MEMORY | In-memory temp tables |
| `mmap_size` | 268435456 (256 MB) | Memory-mapped I/O |
| `cache_size` | -32000 (~32 MB) | Page cache |
| `busy_timeout` | 5000 ms | Wait on lock contention |

### Migrations

30 migration files in `backend/src/migrations/` (numbered `001` through `030`). Migrations run automatically on startup via `migrator.ts`.

### Key Tables

| Table | Purpose |
|---|---|
| `users` | User accounts with role, status, home_person_id |
| `persons` | Core person records (sex, living status, privacy, gedcom_id) |
| `names` | Person names (multiple per person, with primary flag) |
| `families` | Family units linking spouses with marriage/divorce data |
| `family_members` | Child-to-family links with relationship type |
| `events` | Life events (birth, death, burial, occupation, etc.) |
| `sources` | Source records with title, author, publisher |
| `source_citations` | Citations linking sources to entities |
| `source_repositories` | Archive/library/website references |
| `media_items` | Media file metadata |
| `person_media`, `family_media`, `event_media` | Entity-to-media join tables |
| `persons_fts` | Full-text search virtual table (FTS5) |
| `import_jobs`, `import_conflicts`, `gedcom_xref_map` | GEDCOM import tracking |
| `export_jobs` | GEDCOM export tracking |
| `app_settings` | Key-value app configuration (supports encrypted values) |
| `feature_flags` | Feature toggle system |
| `invite_tokens`, `refresh_tokens`, `password_reset_tokens` | Auth token storage |
| `audit_log` | General audit trail |
| `backup_log` | Backup operation tracking |

---

## Authentication Flow

### Overview

AFT uses **JWT-based authentication** with short-lived access tokens and long-lived refresh tokens, stored in HttpOnly cookies.

```
Login
  │
  ├─ Verify password (Argon2id)
  ├─ Generate access token (15 min)
  ├─ Generate refresh token (7 days)
  ├─ Store refresh token hash in DB
  └─ Set HttpOnly cookies (access_token, refresh_token)

API Request
  │
  ├─ Extract access_token from cookie
  ├─ Verify JWT signature
  └─ Attach user to req.user

Token Refresh
  │
  ├─ Extract refresh_token from cookie
  ├─ Lookup hash in DB, verify not expired
  ├─ Delete old refresh token (rotation)
  ├─ Generate new token pair
  └─ Set new cookies
```

### Password Hashing

- Algorithm: **Argon2id** (memory-hard, GPU-resistant)
- Parameters: memoryCost=65536, timeCost=3, parallelism=4

### Role Hierarchy

| Role | Capability |
|---|---|
| **Admin** | Full access: users, settings, all data operations |
| **Editor** | CRUD on all tree data, GEDCOM import, delete |
| **Limited Editor** | Create and edit tree data, no delete |
| **Viewer** | Read-only access to tree and data |

---

## GEDCOM Processing Pipeline

### Import Flow

```
1. Upload .ged file
   └─ POST /api/v1/gedcom/import (multipart)
       ↓
2. Parse & Validate
   └─ parser.ts: Line-level GEDCOM parsing
   └─ tagMapper.ts: Map tags to app models
   └─ Detect version (5.5.1 / 7.0)
   └─ Identify conflicts with existing data
       ↓
3. Conflict Resolution (if data exists)
   └─ GET /import/:jobId/conflicts
   └─ POST /import/:jobId/conflicts (skip/overwrite/merge)
       ↓
4. Process Import
   └─ POST /import/:jobId/process
   └─ Create persons, names, families, events, sources
   └─ Build XREF map for ID translation
   └─ Generate audit trail
       ↓
5. Completion
   └─ Return statistics (persons/families/events added)
```

### Export Flow

```
1. Configure Export
   └─ POST /api/v1/gedcom/export
   └─ Choose version: 5.5.1 or 7.0
   └─ Choose scope: full, ancestors, descendants, date range
   └─ Choose media handling: ZIP, embedded, links only
       ↓
2. Gather Data
   └─ Query persons in scope (recursive for ancestors/descendants)
   └─ Load names, events, families, sources, media
       ↓
3. Generate GEDCOM
   └─ exporter551.ts or exporter70.ts
   └─ Write to /app/data/exports/
       ↓
4. Download
   └─ GET /export/:jobId/download
```

---

## Provider Pattern

AFT uses a **provider pattern** for pluggable backends, allowing seamless switching between local and Google Cloud services via environment variables.

```
┌──────────────────┐
│  Provider Factory │  (providers/factory.ts)
└────────┬─────────┘
         │
    ┌────┴─────────────────────┬──────────────────────┐
    ▼                          ▼                      ▼
┌──────────┐          ┌──────────────┐        ┌────────────┐
│ Storage  │          │   Secrets    │        │  Logging   │
│ Provider │          │   Provider   │        │  Provider  │
├──────────┤          ├──────────────┤        ├────────────┤
│ Local FS │          │ Local file   │        │ Console    │
│ GCS      │          │ GCP Secret   │        │ GCP Cloud  │
│          │          │ Manager      │        │ Logging    │
└──────────┘          └──────────────┘        └────────────┘
```

Environment variables control which implementation is used:

| Variable | Options | Default |
|---|---|---|
| `STORAGE_BACKEND` | `local`, `gcs` | `local` |
| `SECRET_BACKEND` | `local`, `gcp-secret-manager` | `local` |
| `LOG_BACKEND` | `local`, `gcp-logging` | `local` |

---

## Docker Container Structure

### Multi-Stage Build

```dockerfile
# Stage 1: Builder
FROM node:20-alpine AS builder
# Install all deps, build frontend + backend

# Stage 2: Production
FROM node:20-alpine AS production
# Install production deps only
# Copy built frontend/dist and backend/dist
# Copy migrations (needed at runtime)
# Set up entrypoint with PUID/PGID user remapping
```

### Runtime Layout

```
/app/
├── frontend/dist/           # Compiled React SPA
├── backend/dist/            # Compiled Express server
│   └── migrations/          # SQL migration files
├── node_modules/            # Production dependencies only
├── data/                    # Mounted volume
│   ├── treeroots.db         # SQLite database
│   ├── media/               # Uploaded files
│   ├── backups/             # Automatic backups
│   ├── imports/             # GEDCOM uploads
│   ├── exports/             # GEDCOM downloads
│   └── logs/                # Application logs
├── entrypoint.sh            # PUID/PGID setup, launches app
└── package.json
```

### Health Check

```
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3
  CMD wget -qO- http://localhost:3000/api/health || exit 1
```

---

## Related Docs

- [Development Setup](Development-Setup.md) — Local dev environment
- [API Reference](API-Reference.md) — REST API endpoints
- [Configuration](Configuration.md) — Environment variables and settings
