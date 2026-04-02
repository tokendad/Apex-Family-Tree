# Development Setup

This guide walks you through setting up a local development environment for Apex Family Tree (AFT).

---

## Prerequisites

| Tool | Minimum Version | Check Command |
|---|---|---|
| **Node.js** | 20.x | `node --version` |
| **npm** | 9.x | `npm --version` |
| **Git** | 2.x | `git --version` |

> **Note:** AFT uses npm workspaces. Yarn and pnpm are not currently supported.

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/tokendad/Apex-Family-Tree.git
cd Apex-Family-Tree
```

### 2. Install Dependencies

```bash
npm install
```

This installs dependencies for the root workspace, the `frontend/` workspace, and the `backend/` workspace in a single command.

### 3. Set Up Environment Variables

```bash
cp .env.example .env
```

The defaults in `.env.example` are configured for local development. For development, the placeholder secrets are acceptable — just make sure to use real secrets in production.

### 4. Start the Development Server

```bash
npm run dev
```

This runs both the frontend and backend concurrently:
- **Frontend** (Vite): http://localhost:5173 — with hot module replacement
- **Backend** (tsx): http://localhost:3000 — with auto-restart on changes

The Vite dev server proxies all `/api` requests to the backend at port 3000.

On first visit, you'll be prompted to create an admin account through the setup wizard.

---

## Available Scripts

All scripts are run from the project root:

| Command | Description |
|---|---|
| `npm run dev` | Start frontend + backend dev servers concurrently |
| `npm run build` | Build both frontend and backend for production |
| `npm run test` | Run tests for both workspaces |
| `npm run lint` | Lint all source files with ESLint |
| `npm run format` | Format all files with Prettier |
| `npm run format:check` | Check formatting without making changes |

### Workspace-Specific Scripts

```bash
# Frontend only
npm run dev -w frontend
npm run build -w frontend    # tsc + vite build
npm run test -w frontend

# Backend only
npm run dev -w backend
npm run build -w backend     # tsc
npm run test -w backend
```

---

## Project Structure

```
Apex-Family-Tree/
├── frontend/                # React + Vite frontend application
│   ├── src/
│   │   ├── components/      # Reusable UI components (35+)
│   │   ├── pages/           # Page-level route components
│   │   ├── stores/          # Zustand state stores
│   │   ├── contexts/        # React context providers
│   │   ├── hooks/           # Custom React hooks
│   │   ├── utils/           # Utility functions
│   │   ├── styles/          # Global CSS and design tokens
│   │   ├── App.tsx          # Root component with routing
│   │   └── main.tsx         # Entry point
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── backend/                 # Node.js + Express backend
│   ├── src/
│   │   ├── routes/          # Express route handlers
│   │   ├── services/        # Business logic
│   │   ├── repositories/    # Data access layer
│   │   ├── middleware/       # Express middleware
│   │   ├── providers/       # Storage/secrets/logging providers
│   │   ├── migrations/      # SQLite migration files
│   │   ├── db/              # Database connection and migrator
│   │   ├── types/           # TypeScript type definitions
│   │   ├── utils/           # Backend utilities
│   │   └── index.ts         # Express app entry point
│   ├── tsconfig.json
│   └── package.json
│
├── Docs/                    # Documentation
│   ├── Guides/              # User and developer guides
│   ├── Design/              # Design documents
│   └── Phase/               # Development phase plans
│
├── docker-compose.yml       # Production Docker Compose config
├── Dockerfile               # Multi-stage Docker build
├── entrypoint.sh            # Container entrypoint (PUID/PGID)
├── .env.example             # Environment variable template
├── eslint.config.js         # ESLint 9 flat config
├── .prettierrc              # Prettier configuration
├── tsconfig.base.json       # Shared TypeScript config
├── tsconfig.json            # Root TypeScript config
└── package.json             # Root workspace config
```

---

## Path Aliases

Both the frontend and backend use the `@/` path alias to reference the `src/` directory:

```typescript
// Instead of relative paths:
import { useAuth } from '../../../contexts/AuthContext';

// Use the alias:
import { useAuth } from '@/contexts/AuthContext';
```

This alias is configured in:
- **Frontend**: `frontend/tsconfig.json` (paths) and `frontend/vite.config.ts` (resolve.alias)
- **Backend**: `backend/tsconfig.json` (paths)

---

## TypeScript Conventions

- **Strict mode** is enabled across the project (`tsconfig.base.json`)
- **Backend imports** use `.js` extensions in import paths (required for ESM with the TypeScript `nodenext` module resolution)
  ```typescript
  // Backend: use .js extension even for .ts source files
  import { db } from '../db/connection.js';
  ```
- **Frontend imports** do not need file extensions (Vite handles resolution)
  ```typescript
  // Frontend: no extension needed
  import Button from '@/components/Button/Button';
  ```

---

## Database

During development, the SQLite database is created automatically at `.data/treeroots.db` (relative to the backend working directory). Migrations run on every startup.

The database uses **WAL (Write-Ahead Logging) mode** for concurrent read/write support.

---

## Code Style

AFT uses **ESLint 9** (flat config) and **Prettier** for consistent code formatting:

- ESLint config: `eslint.config.js`
- Prettier config: `.prettierrc`

Run before committing:

```bash
npm run lint
npm run format
```

---

## Building for Production

```bash
npm run build
```

This produces:
- `frontend/dist/` — Static HTML/CSS/JS assets
- `backend/dist/` — Compiled JavaScript

To test the production build locally with Docker:

```bash
docker compose build
docker compose up -d
```

---

## Related Docs

- [Architecture](Architecture.md) — System design and data model
- [API Reference](API-Reference.md) — REST API endpoints
- [Contributing](../../CONTRIBUTING.md) — Contribution workflow and guidelines
