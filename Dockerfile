# ---- Build Stage ----
FROM node:20-alpine AS builder

ARG VERSION=0.0.0

WORKDIR /build

ENV NPM_CONFIG_FETCH_RETRIES=5
ENV NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000
ENV NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000

RUN apk add --no-cache python3 make g++

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

ARG VERSION=0.0.0

LABEL maintainer="tokendad"
LABEL org.opencontainers.image.title="Apex Family Tree"
LABEL org.opencontainers.image.description="Self-hosted family genealogy web application"
LABEL org.opencontainers.image.source="https://github.com/tokendad/Apex-Family-Tree"

ENV APP_VERSION=${VERSION}
ENV NPM_CONFIG_FETCH_RETRIES=5
ENV NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000
ENV NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000

WORKDIR /app

# Install su-exec for user remapping
RUN apk add --no-cache su-exec libstdc++

# Install production dependencies only
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
  && npm ci --omit=dev \
  && npm cache clean --force \
  && apk del .build-deps

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
