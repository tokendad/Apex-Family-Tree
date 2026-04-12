# Apex Family Tree (AFT) — Copilot Instructions

## Project Overview

Apex Family Tree (AFT) is a self-hosted, Docker-centric family genealogy web application. It supports GEDCOM 5.5.1/7.0 import/export, features an interactive SVG-based family tree canvas, wizard-driven data entry, and role-based access control (Admin/Editor/Limited Editor/Viewer). Always refer to the project as "Apex Family Tree" or "AFT" — never "TreeRoots".

## Technology Stack

- **Frontend:** React 18 + TypeScript (Vite 5), React Router v6, CSS Modules + CSS custom properties, Zustand (canvas state), React Context (auth)
- **Backend:** Node.js 20 LTS, Express 4, TypeScript, ESM (`"type": "module"`)
- **Database:** SQLite 3.45+ via better-sqlite3 (sync API), WAL mode, embedded at `/app/data/treeroots.db`
- **Auth:** JWT access + refresh tokens in httpOnly cookies, Argon2id password hashing
- **Testing:** Vitest (jsdom environment for frontend, node for backend)
- **Docker:** Single container `neuman1812/ApexFamily:latest`, port 3000

## Commands

```bash
npm run dev              # Start frontend + backend concurrently
npm run build            # Build both packages (frontend then backend)
npm run test             # Run all tests
npm run lint             # ESLint (flat config)
npm run format           # Prettier
npm run format:check     # Check formatting without changes
```

### Single-workspace commands

```bash
npm run dev -w frontend     # Frontend dev server only (port 5173, proxies /api to :3000)
npm run dev -w backend      # Backend dev server only (tsx watch)
npm run build -w frontend   # tsc -b && vite build
npm run build -w backend    # tsc
npm run test -w frontend    # Frontend tests only
npm run test -w backend     # Backend tests only
```

### Running a single test file

```bash
npx vitest run path/to/file.test.ts              # Run one test file
npx vitest run -t "test name pattern"             # Run by test name
npx vitest run path/to/file.test.ts -w frontend   # Single file in workspace
```

## Architecture

### Monorepo structure

npm workspaces with two packages: `frontend/` (`@aft/frontend`) and `backend/` (`@aft/backend`). Shared TypeScript config lives in `tsconfig.base.json` (strict mode, `noUnusedLocals`, `noUnusedParameters`). ESLint 9 flat config at root.

### Backend layers

1. **Routes** (`backend/src/routes/`) — Express routers handling HTTP. All v1 routes are mounted under `/api/v1/` and require authentication via `requireAuth` middleware. Route-level authorization uses `requireRole('admin', 'editor', ...)`.
2. **Services** (`backend/src/services/`) — Business logic (auth, GEDCOM import/export, backup, email, encryption). GEDCOM logic lives in `services/gedcom/`.
3. **Repositories** (`backend/src/repositories/`) — Database access layer. All extend `BaseRepository` (provides `db` getter, `generateId()`, `now()`). Instantiated per-request in route handlers (e.g., `new PersonRepository()`).
4. **Providers** (`backend/src/providers/`) — Pluggable backends for storage, secrets, and logging. Factory functions (`createStorageProvider()`, etc.) switch between local and GCP implementations based on env vars.
5. **Middleware** (`backend/src/middleware/`) — `auth.ts` (JWT verification, role checking), `validate.ts` (request body validation rules), `firstRun.ts` (setup detection).
6. **Migrations** (`backend/src/migrations/`) — Numbered SQL files (`001-*.sql` through `031-*.sql`). Custom migrator with SHA-256 checksum verification. Never modify an applied migration — add a new numbered file instead.

### Frontend layers

1. **Pages** (`frontend/src/pages/`) — Route-level components, each with a colocated `.module.css` file. Pages use **default exports** and are **lazy-loaded** via `React.lazy()` in `App.tsx`.
2. **Components** (`frontend/src/components/`) — Reusable UI components in `{Name}/` subdirectories. Exported through barrel file at `components/index.ts`.
3. **Contexts** (`frontend/src/contexts/`) — `AuthContext` manages user state, login/logout, and first-run setup detection.
4. **Stores** (`frontend/src/stores/`) — Zustand stores (currently `canvasStore.ts` for the SVG tree canvas state).
5. **Hooks** (`frontend/src/hooks/`) — Custom hooks for permissions, person wizard, touch gestures, tree data, online status.
6. **Styles** (`frontend/src/styles/`) — `tokens.css` (design tokens as CSS custom properties), `global.css`, `reset.css`, `responsive.css`.

### Auth flow

- Login issues JWT access token (15m) + refresh token (7d) as httpOnly cookies
- `requireAuth` middleware reads `access_token` cookie → attaches `req.user` (type `TokenPayload`)
- `requireRole(...roles)` middleware checks `req.user.role` against allowed roles
- Roles: `admin`, `editor`, `limited_editor`, `viewer`

### Database

- SQLite via better-sqlite3 (synchronous API — no async/await needed for DB calls)
- Connection is a singleton module (`db/connection.ts`), initialized at startup with WAL mode and performance PRAGMAs
- Foreign keys are enforced (`PRAGMA foreign_keys = ON`)

## Key Conventions

### TypeScript & ESM

- Both packages use `@/` path alias mapping to `src/`
- **Backend imports must use `.js` extensions** (ESM requirement): `import { Foo } from './foo.js'`
- Frontend imports do not need extensions (Vite resolves them)
- `@types/express@5` types `req.params` values as `string | string[]`. Route files define a local `paramStr()` helper to safely extract string params: `function paramStr(val: string | string[]): string { return Array.isArray(val) ? val[0] : val; }`

### API patterns

- REST API at `/api/v1/`, all routes require auth
- Auth routes at `/api/auth/` (login, register, refresh — no auth required)
- Health check at `/api/health`
- Keyset pagination: routes accept `cursor` and `limit` query params, return `{ data, nextCursor }`
- Validation via `validate()` middleware with declarative rules
- Error responses: `{ error: string, details?: string[] }`

### CSS

- CSS Modules (`.module.css`) for all component styles
- Design tokens as CSS custom properties in `tokens.css` (colors, spacing, radii, fonts)
- Reference tokens like `var(--color-primary-600)`, `var(--radius-md)`, `var(--font-family)`

### Testing

- Colocate test files as `*.test.ts(x)` next to source files
- Frontend tests use jsdom + Testing Library (setup in `src/test/setup.ts`)
- Backend tests use node environment

### Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <description>`. Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`.

### Documentation

- `Docs/Guides/` is tracked in git (user-facing docs)
- `Docs/Design/`, `Docs/Phase/`, `Docs/Research/` are gitignored (local-only)
