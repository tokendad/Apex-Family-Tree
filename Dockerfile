# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /build

# Copy package files first for layer caching
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/

RUN npm ci

# Copy source
COPY tsconfig.base.json tsconfig.json ./
COPY frontend/ frontend/
COPY backend/ backend/

# Build both packages
RUN npm run build

# ---- Production Stage ----
FROM node:20-alpine AS production

LABEL maintainer="tokendad"
LABEL org.opencontainers.image.title="Apex Family Tree"
LABEL org.opencontainers.image.description="Self-hosted family genealogy web application"
LABEL org.opencontainers.image.source="https://github.com/tokendad/Apex-Family-Tree"

WORKDIR /app

# Install su-exec for user remapping
RUN apk add --no-cache su-exec

# Install production dependencies only
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
RUN npm ci --omit=dev && npm cache clean --force

# Copy built artifacts
COPY --from=builder /build/frontend/dist frontend/dist/
COPY --from=builder /build/backend/dist backend/dist/
COPY --from=builder /build/backend/src/migrations backend/dist/migrations/

# Copy entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create data directory
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "backend/dist/index.js"]
