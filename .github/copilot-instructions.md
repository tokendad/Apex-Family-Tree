# Apex Family Tree (AFT) — Copilot Instructions

## Project Overview

Apex Family Tree (AFT) is a self-hosted, Docker-centric family genealogy web application. It supports GEDCOM 5.5.1/7.0 import/export, features an interactive SVG-based family tree canvas, wizard-driven data entry, and role-based access control (Admin/Editor/Limited Editor/Viewer).

## Technology Stack

- **Frontend:** React 18 + TypeScript (Vite 5), React Router v6, CSS Modules + CSS custom properties
- **Backend:** Node.js 20 LTS, Express 4, TypeScript
- **Database:** SQLite 3.45+ via better-sqlite3, WAL mode, embedded at `/app/data/treeroots.db`
- **Auth:** JWT (httpOnly cookies), Argon2id password hashing
- **State:** React Context (auth) + Zustand (canvas state)
- **Testing:** Vitest (jsdom for frontend, node for backend)
- **Docker:** Single container `neuman1812/ApexFamily:latest`, port 3000

## Project Structure

```
/
├── frontend/          # React + Vite app (@aft/frontend)
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── pages/        # Route-level page components
│   │   ├── hooks/        # Custom React hooks
│   │   ├── stores/       # Zustand stores
│   │   ├── styles/       # Global styles, tokens.css
│   │   └── test/         # Test setup
│   └── vite.config.ts
├── backend/           # Express API server (@aft/backend)
│   ├── src/
│   │   ├── routes/       # Express route handlers
│   │   ├── services/     # Business logic
│   │   ├── repositories/ # Database access layer
│   │   ├── middleware/    # Auth, logging, validation
│   │   ├── migrations/   # SQL migration files
│   │   └── types/        # TypeScript type definitions
│   └── vitest.config.ts
├── Docs/Guides/       # User-facing documentation (tracked in git)
├── tsconfig.base.json # Shared TypeScript config
├── eslint.config.js   # ESLint 9 flat config
└── docker-compose.yml # Development compose file
```

## Commands

```bash
npm run dev          # Start frontend + backend in dev mode
npm run build        # Build both packages
npm run test         # Run all tests
npm run lint         # Lint all code
npm run format       # Format all code with Prettier
npm run format:check # Check formatting without changing files
```

### Single package commands
```bash
npm run dev -w frontend    # Frontend dev server only
npm run dev -w backend     # Backend dev server only
npm run test -w frontend   # Frontend tests only
npm run test -w backend    # Backend tests only
```

## Domain Concepts

- **Person** — individual with attributes (name, birth/death dates, sex, living status, privacy)
- **Name** — person can have multiple names (given, surname, suffix, prefix, type)
- **Family** — grouping of spouses + children with marriage info
- **Event** — life events (birth, death, marriage, etc.) with GEDCOM date parsing
- **Source/Citation** — documentary evidence linked to persons/events
- **Media** — photos and documents, stored in `/app/data/media/`
- **GEDCOM** — standard genealogy interchange format (5.5.1 and 7.0)

## Conventions

- **Path aliases:** `@/` maps to `src/` in both packages
- **CSS:** CSS Modules for component styles, `tokens.css` for design tokens
- **API:** REST, versioned at `/api/v1/`, keyset pagination, Zod input validation
- **Database:** Repository pattern, custom migration runner, 30 ordered migrations
- **Auth:** JWT in httpOnly cookies, role-based middleware
- **Naming:** "Apex Family Tree" or "AFT" — never "TreeRoots"
- **Error handling:** Structured error responses with error codes
- **Testing:** Colocate test files as `*.test.ts(x)` next to source files
