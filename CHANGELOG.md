# Changelog

All notable changes to the Apex Family Tree project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-15

### Added
- Interactive SVG family tree canvas with pan/zoom and generation controls
- 4-step person creation wizard (Personal Info, Vital Events, Relationships, Media & Notes)
- GEDCOM 5.5.1 and 7.0 import with validation, conflict detection, and resolution workflow
- GEDCOM 5.5.1 and 7.0 export with scope filtering (full, ancestors, descendants, date range)
- Role-based access control with four roles (Admin, Editor, Limited Editor, Viewer)
- User invitation system with email-based registration
- Media management with photo uploads, thumbnails, and per-person galleries
- Source and citation tracking for documenting genealogical research
- Full-text search across all person names (FTS5)
- Admin dashboard with user management and role administration
- Application settings with AES-256-GCM encrypted storage for sensitive values
- Feature flags system for toggling capabilities
- Automatic database backups (startup, pre-migration, post-import, daily)
- Docker deployment with multi-stage build and PUID/PGID support
- Optional Google Cloud integration (GCS storage, Secret Manager, Cloud Logging)
- Provider pattern for pluggable storage, secrets, and logging backends
- SQLite database with WAL mode and 30 migration files
- JWT authentication with Argon2id password hashing and refresh token rotation
- SMTP email support for invitations and password resets
- Responsive design for desktop, tablet, and mobile
- CSS Modules with design token system
- Health check endpoint with Docker HEALTHCHECK
- 7 user guides (Getting Started, Deployment, Configuration, Managing Your Tree, GEDCOM, User Management, Backup & Restore)
- Developer documentation (Development Setup, Architecture, API Reference)
- Contributing guide with workflow and conventions
- GitHub Wiki documentation
