# 🌳 Apex Family Tree (AFT)

A self-hosted family genealogy web application that puts you in full control of your family's history. Runs as a single Docker container with an embedded SQLite database — no external services required.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-neuman1812%2FApexFamily-blue?logo=docker)](https://hub.docker.com/r/neuman1812/ApexFamily)

---

## Features

- 🌳 **Interactive SVG family tree canvas** with pan, zoom, and generation controls
- 👤 **4-step person creation wizard** with relationship linking
- 📥 **GEDCOM 5.5.1 and 7.0** import/export for compatibility with other genealogy software
- 🔒 **Role-based access control** — Admin, Editor, Limited Editor, Viewer
- ✉️ **User invitation system** with email-based onboarding
- 📷 **Media management** with photo uploads and thumbnails
- 📚 **Source and citation tracking** for documenting research
- 🔍 **Full-text search** across all persons
- ⚙️ **Admin dashboard** with user management, app settings, and feature flags
- 💾 **Automatic database backups** with configurable retention
- ☁️ **Optional Google Cloud integration** — GCS storage, Secret Manager, Cloud Logging
- 📱 **Responsive design** — desktop, tablet, and mobile
- 🐳 **Docker-first deployment** — single container, no external database

---

## Quick Start

```bash
docker run -d \
  --name ApexFamily \
  -p 3000:3000 \
  -v ./data:/app/data \
  -e APP_SECRET=$(openssl rand -base64 32) \
  -e JWT_SECRET=$(openssl rand -base64 32) \
  neuman1812/ApexFamily:latest
```

Then visit **http://localhost:3000** to create your admin account.

---

## Docker Compose (Recommended)

Create a `docker-compose.yml`:

```yaml
services:
  apex-family-tree:
    image: neuman1812/ApexFamily:latest
    container_name: apex-family-tree
    ports:
      - "${PORT:-3000}:3000"
    volumes:
      - ./.data:/app/data
    environment:
      - NODE_ENV=${NODE_ENV:-production}
      - PORT=3000
      - APP_SECRET=${APP_SECRET:-change-me-to-a-random-secret}
      - JWT_SECRET=${JWT_SECRET:-change-me-to-another-random-secret}
      - JWT_ACCESS_EXPIRY=${JWT_ACCESS_EXPIRY:-15m}
      - JWT_REFRESH_EXPIRY=${JWT_REFRESH_EXPIRY:-7d}
      - LOG_LEVEL=${LOG_LEVEL:-info}
      - LOG_FORMAT=${LOG_FORMAT:-json}
      - PUID=${PUID:-1000}
      - PGID=${PGID:-1000}
    restart: unless-stopped
```

Create a `.env` file with your secrets:

```bash
APP_SECRET=your-random-secret-here    # openssl rand -base64 32
JWT_SECRET=another-random-secret-here  # openssl rand -base64 32
```

Start the application:

```bash
docker compose up -d
```

> ⚠️ **Always generate unique, random values** for `APP_SECRET` and `JWT_SECRET`. Never use the placeholder defaults in production.

---

## Documentation

### User Guides

| Guide | Description |
|---|---|
| [Getting Started](Docs/Guides/Getting-Started.md) | First-time setup wizard and interface overview |
| [Deployment](Docs/Guides/Deployment.md) | Docker deployment, reverse proxy, and updates |
| [Configuration](Docs/Guides/Configuration.md) | Environment variables, SMTP, feature flags |
| [Managing Your Tree](Docs/Guides/Managing-Your-Tree.md) | Creating and editing people, navigating the canvas |
| [GEDCOM Import & Export](Docs/Guides/GEDCOM-Import-Export.md) | Working with GEDCOM files |
| [User Management](Docs/Guides/User-Management.md) | Roles, invitations, and access control |
| [Backup & Restore](Docs/Guides/Backup-Restore.md) | Automatic backups, manual backups, disaster recovery |

### Developer Docs

| Document | Description |
|---|---|
| [Development Setup](Docs/Guides/Development-Setup.md) | Local development environment and workflow |
| [Architecture](Docs/Guides/Architecture.md) | System design, data model, and component overview |
| [API Reference](Docs/Guides/API-Reference.md) | REST API endpoints and request/response formats |
| [Contributing](CONTRIBUTING.md) | How to contribute to the project |

### GitHub Wiki

The [GitHub Wiki](https://github.com/tokendad/Apex-Family-Tree/wiki) mirrors the user guides above and provides quick-start instructions.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, Zustand, React Router v6 |
| **Backend** | Node.js 20, Express, TypeScript |
| **Database** | SQLite via better-sqlite3 (WAL mode) |
| **Auth** | JWT (access + refresh tokens) with Argon2id password hashing |
| **Container** | Docker (node:20-alpine, multi-stage build) |
| **Styling** | CSS Modules with design tokens |
| **Testing** | Vitest, Testing Library |

---

## Development

```bash
# Clone the repository
git clone https://github.com/tokendad/Apex-Family-Tree.git
cd Apex-Family-Tree

# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Start development servers (frontend + backend concurrently)
npm run dev

# Build for production
npm run build

# Run tests
npm run test

# Lint
npm run lint

# Format code
npm run format
```

The frontend dev server runs on **http://localhost:5173** and proxies API calls to the backend on port 3000.

See the [Development Setup Guide](Docs/Guides/Development-Setup.md) for detailed instructions.

---

## Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) for details on:

- Development workflow
- Branch naming conventions
- Commit message format
- PR requirements

---

## License

This project is licensed under the [MIT License](LICENSE).
