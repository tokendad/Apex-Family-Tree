# Apex Family Tree (AFT) — AI Agent Instructions

This file provides context for AI coding agents working on this repository.

## Project

Apex Family Tree (AFT) — self-hosted, Docker-centric family genealogy web app.

## Stack

- **Frontend:** React 18 + TypeScript, Vite 5, React Router v6, CSS Modules, Zustand (canvas state)
- **Backend:** Node.js 20, Express 4, TypeScript, better-sqlite3 (WAL mode)
- **Auth:** JWT httpOnly cookies, Argon2id
- **Testing:** Vitest (jsdom for frontend, node for backend)
- **Docker:** Single container, port 3000, volume at `/app/data`

## Structure

- `frontend/` — React app (npm workspace `@aft/frontend`)
- `backend/` — Express API (npm workspace `@aft/backend`)
- `Docs/Guides/` — User documentation (tracked in git)
- Path alias `@/` → `src/` in both packages

## Commands

```bash
npm run dev          # Dev mode (frontend + backend)
npm run build        # Build both packages
npm run test         # Run all tests
npm run lint         # ESLint
npm run format       # Prettier
```

## Key Conventions

- REST API at `/api/v1/`, keyset pagination
- Repository pattern for database access
- CSS Modules + `tokens.css` design tokens
- Colocated tests: `*.test.ts(x)` next to source
- Structured error responses
- Project name is "Apex Family Tree" or "AFT" (never "TreeRoots")
