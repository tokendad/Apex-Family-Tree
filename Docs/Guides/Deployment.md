# Deployment Guide

This guide covers everything you need to deploy Apex Family Tree (AFT) on your own server using Docker. AFT runs as a single container with an embedded SQLite database — no external database server required.

---

## Prerequisites

Before you begin, make sure you have the following installed on your server:

- **Docker** (version 20.10 or later) — [Install Docker](https://docs.docker.com/get-docker/)
- **Docker Compose** (version 2.0 or later) — Included with Docker Desktop, or [install separately](https://docs.docker.com/compose/install/)

You can verify your installation by running:

```bash
docker --version
docker compose version
```

> **Note:** AFT is designed for x86_64 (AMD64) architecture. ARM support (e.g., Raspberry Pi) may be available in future releases.

---

## Quick Start

### 1. Create a Project Directory

```bash
mkdir apex-family-tree
cd apex-family-tree
```

### 2. Create the Docker Compose File

Create a file called `docker-compose.yml` with the following content:

```yaml
services:
  apexfamily:
    image: neuman1812/ApexFamily:latest
    container_name: ApexFamily
    ports:
      - "${PORT:-3000}:3000"
    environment:
      - PUID=${PUID:-1000}
      - PGID=${PGID:-1000}
      - UMASK=${UMASK:-0022}
      - TZ=${TZ:-UTC}
      - NODE_ENV=${NODE_ENV:-production}
      - APP_SECRET=${APP_SECRET}
      - JWT_SECRET=${JWT_SECRET}
      - LOG_LEVEL=${LOG_LEVEL:-INFO}
      - LOG_DIR=/app/data/logs
      - LOG_FORMAT=${LOG_FORMAT:-json}
      - LOG_MAX_BYTES=${LOG_MAX_BYTES:-10485760}
      - LOG_BACKUP_COUNT=${LOG_BACKUP_COUNT:-5}
    volumes:
      - .data/:/app/data
    restart: unless-stopped
```

### 3. Create an Environment File

Create a `.env` file in the same directory to set your secrets and preferences:

```bash
# Required: Generate unique secrets for your instance
# Use: openssl rand -hex 32
APP_SECRET=your-random-secret-here-at-least-32-characters
JWT_SECRET=another-random-secret-here-at-least-32-characters

# Optional: Customize these as needed
PORT=3000
TZ=America/New_York
PUID=1000
PGID=1000
LOG_LEVEL=INFO
```

> **Warning:** Always generate unique, random values for `APP_SECRET` and `JWT_SECRET`. Never use the placeholder values shown above. Generate them with:
> ```bash
> openssl rand -hex 32
> ```

> **Warning:** Never commit your `.env` file to version control. Add it to your `.gitignore`.

### 4. Start AFT

```bash
docker compose up -d
```

### 5. Open Your Browser

Navigate to `http://localhost:3000` (or replace `localhost` with your server's IP address).

On first launch, you'll be guided through the **Admin Setup Wizard** to create your admin account and configure your instance. See the [Getting Started Guide](Getting-Started.md) for a walkthrough of this process.

---

## Environment Variables Reference

| Variable | Default | Required | Description |
|---|---|---|---|
| `PORT` | `3000` | No | Host port that maps to the container's port 3000 |
| `NODE_ENV` | `production` | No | Application environment (`production` or `development`) |
| `APP_SECRET` | — | **Yes** | Encryption key for sensitive data (SMTP passwords). Min 32 characters. If not set, SMTP features are disabled. |
| `JWT_SECRET` | — | **Yes** | Secret key for signing JWT authentication tokens. Min 32 characters. |
| `PUID` | `1000` | No | User ID for file ownership inside the container |
| `PGID` | `1000` | No | Group ID for file ownership inside the container |
| `UMASK` | `0022` | No | File creation permission mask |
| `TZ` | `UTC` | No | Timezone for the container (e.g., `America/New_York`, `Europe/London`) |
| `LOG_LEVEL` | `INFO` | No | Logging verbosity: `DEBUG`, `INFO`, `WARN`, or `ERROR` |
| `LOG_FORMAT` | `json` | No | Log output format: `json` (structured) or `text` (human-readable) |
| `LOG_MAX_BYTES` | `10485760` | No | Maximum log file size in bytes before rotation (default: 10 MB) |
| `LOG_BACKUP_COUNT` | `5` | No | Number of rotated log files to keep |

### Setting PUID and PGID

The `PUID` and `PGID` variables control which user and group own the files created by AFT inside the container. This matters when you need the files in `.data/` to be readable by a specific user on your host system.

To find your user's IDs:

```bash
id $USER
# Example output: uid=1000(youruser) gid=1000(youruser) ...
```

Set `PUID` and `PGID` in your `.env` file to match.

---

## Volume and Data Persistence

AFT stores all persistent data in a single volume mount:

```
.data/ (on your host) → /app/data (inside the container)
```

This directory contains everything AFT needs to preserve across container restarts and updates:

```
.data/
├── treeroots.db          # SQLite database (all your genealogy data)
├── treeroots.db-wal      # SQLite WAL journal (auto-managed)
├── treeroots.db-shm      # SQLite shared memory (auto-managed)
├── media/                # Uploaded photos and documents
│   ├── persons/          # Per-person media files
│   └── families/         # Per-family media files
├── imports/              # Uploaded GEDCOM files
├── exports/              # Generated GEDCOM export files
├── backups/              # Automated database backups
└── logs/                 # Application log files
```

> **Warning:** Never delete the `.data/` directory while the container is running. This is where all your family data lives.

> **Tip:** Back up the entire `.data/` directory regularly. See the [Backup & Restore Guide](Backup-Restore.md) for strategies and schedules.

---

## Reverse Proxy Setup

If you want to access AFT through a custom domain with HTTPS (recommended for security), set up a reverse proxy in front of the container.

### Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name tree.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/tree.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tree.yourdomain.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;

    # Proxy to AFT
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support (if needed in future)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # File upload size (for GEDCOM imports and media)
        client_max_body_size 50M;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name tree.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

### Traefik

If you're using Traefik as your reverse proxy, add labels to the AFT service in your `docker-compose.yml`:

```yaml
services:
  apexfamily:
    image: neuman1812/ApexFamily:latest
    container_name: ApexFamily
    # Remove the ports section when using Traefik
    environment:
      - PUID=${PUID:-1000}
      - PGID=${PGID:-1000}
      - UMASK=${UMASK:-0022}
      - TZ=${TZ:-UTC}
      - APP_SECRET=${APP_SECRET}
      - JWT_SECRET=${JWT_SECRET}
      - LOG_LEVEL=${LOG_LEVEL:-INFO}
      - LOG_DIR=/app/data/logs
      - LOG_FORMAT=${LOG_FORMAT:-json}
    volumes:
      - .data/:/app/data
    restart: unless-stopped
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.apexfamily.rule=Host(`tree.yourdomain.com`)"
      - "traefik.http.routers.apexfamily.entrypoints=websecure"
      - "traefik.http.routers.apexfamily.tls.certresolver=letsencrypt"
      - "traefik.http.services.apexfamily.loadbalancer.server.port=3000"
    networks:
      - traefik

networks:
  traefik:
    external: true
```

### Caddy

Caddy handles HTTPS automatically. Add this to your `Caddyfile`:

```
tree.yourdomain.com {
    reverse_proxy localhost:3000
}
```

Or use Caddy in Docker alongside AFT in your `docker-compose.yml`:

```yaml
services:
  apexfamily:
    image: neuman1812/ApexFamily:latest
    container_name: ApexFamily
    environment:
      - PUID=${PUID:-1000}
      - PGID=${PGID:-1000}
      - TZ=${TZ:-UTC}
      - APP_SECRET=${APP_SECRET}
      - JWT_SECRET=${JWT_SECRET}
    volumes:
      - .data/:/app/data
    restart: unless-stopped

  caddy:
    image: caddy:2
    container_name: caddy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    restart: unless-stopped

volumes:
  caddy_data:
  caddy_config:
```

> **Tip:** When using a reverse proxy, you can remove the `ports` section from the AFT service since the proxy handles external access. This prevents direct access to port 3000.

---

## Updating to a New Version

Updating AFT is straightforward:

### 1. Pull the Latest Image

```bash
docker compose pull
```

### 2. Recreate the Container

```bash
docker compose up -d
```

Docker Compose will automatically stop the old container and start a new one with the updated image. Your data is preserved in the `.data/` volume.

> **Note:** AFT automatically creates a backup before running any database migrations during startup. You can find these backups in `.data/backups/`. See the [Backup & Restore Guide](Backup-Restore.md) for more details.

> **Tip:** Check the release notes before updating to understand what has changed. Major version updates may include breaking changes.

### Rolling Back an Update

If something goes wrong after an update:

1. Stop the container:
   ```bash
   docker compose down
   ```

2. Restore from a pre-migration backup (see [Backup & Restore Guide](Backup-Restore.md)):
   ```bash
   cp .data/backups/treeroots-YYYYMMDD-HHMMSS.db .data/treeroots.db
   rm -f .data/treeroots.db-wal .data/treeroots.db-shm
   ```

3. Pin the previous image version in `docker-compose.yml`:
   ```yaml
   image: neuman1812/ApexFamily:v1.2.3  # Replace with the previous version tag
   ```

4. Restart:
   ```bash
   docker compose up -d
   ```

---

## Troubleshooting

### Container won't start

**Check the logs:**
```bash
docker compose logs apexfamily
```

**Common causes:**
- Port 3000 is already in use — Change `PORT` in your `.env` file
- Permission issues with `.data/` — Make sure the directory exists and is writable. Check `PUID`/`PGID` values
- Missing secrets — Ensure `APP_SECRET` and `JWT_SECRET` are set in your `.env` file

### "Cannot connect" in the browser

1. Verify the container is running:
   ```bash
   docker compose ps
   ```
2. Check the container health:
   ```bash
   curl http://localhost:3000/api/health
   ```
3. Confirm the port mapping is correct:
   ```bash
   docker compose port apexfamily 3000
   ```

### Database errors on startup

If the container exits immediately with a database error:

1. Check for a corrupted database — Look for error messages about integrity check failures
2. Restore from the most recent backup:
   ```bash
   docker compose down
   ls -lt .data/backups/    # Find the most recent backup
   cp .data/backups/treeroots-YYYYMMDD-HHMMSS.db .data/treeroots.db
   rm -f .data/treeroots.db-wal .data/treeroots.db-shm
   docker compose up -d
   ```

### Permission denied errors

If you see file permission errors in the logs:

1. Check the current ownership of `.data/`:
   ```bash
   ls -la .data/
   ```
2. Set `PUID` and `PGID` in your `.env` to match the user that owns the directory:
   ```bash
   id $USER    # Find your uid and gid
   ```
3. Alternatively, fix ownership manually:
   ```bash
   sudo chown -R 1000:1000 .data/
   ```

### GEDCOM import fails

- Maximum file size for uploads is 50 MB for documents
- Ensure the file has a `.ged` extension
- Check the container logs for parsing errors
- See the [GEDCOM Import & Export Guide](GEDCOM-Import-Export.md) for troubleshooting import issues

---

## Related Guides

- [Getting Started](Getting-Started.md) — First-time setup wizard walkthrough
- [Configuration Reference](Configuration.md) — Complete settings documentation
- [Backup & Restore](Backup-Restore.md) — Protecting your data
- [User Management](User-Management.md) — Managing users and roles
