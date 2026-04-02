#!/bin/sh
set -e

# PUID/PGID user remapping
PUID=${PUID:-1000}
PGID=${PGID:-1000}

echo "Starting Apex Family Tree..."
echo "  UID: $PUID"
echo "  GID: $PGID"

# Create group and user if they don't exist
if ! getent group aft > /dev/null 2>&1; then
  addgroup -g "$PGID" aft
fi

if ! getent passwd aft > /dev/null 2>&1; then
  adduser -u "$PUID" -G aft -D -H aft
fi

# Ensure data directory ownership
chown -R "$PUID:$PGID" /app/data

# Run the application as the aft user
exec su-exec aft "$@"
