#!/bin/sh
set -e

# PUID/PGID user remapping
PUID=${PUID:-1000}
PGID=${PGID:-1000}

echo "Starting Apex Family Tree..."
echo "  UID: $PUID"
echo "  GID: $PGID"

# Create group if the GID doesn't exist; ignore errors if GID is in use
if ! getent group "$PGID" > /dev/null 2>&1; then
  addgroup -g "$PGID" aft
fi

# Resolve the group name for the target GID
GROUP_NAME=$(getent group "$PGID" | cut -d: -f1)

# Create user if the UID doesn't exist; ignore errors if UID is in use
if ! getent passwd "$PUID" > /dev/null 2>&1; then
  adduser -u "$PUID" -G "$GROUP_NAME" -D -H aft
fi

# Ensure data directory ownership
chown -R "$PUID:$PGID" /app/data

# Run the application as the target UID
exec su-exec "$PUID:$PGID" "$@"
