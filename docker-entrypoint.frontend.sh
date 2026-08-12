#!/bin/sh
set -eu

# node_modules lives in a named volume (frontend_node_modules in
# docker-compose.yaml) so the bind-mounted source doesn't shadow it with the
# host's own node_modules. That volume is only ever populated once (from the
# image's build-time `npm ci`), so without this check it would silently
# drift from package-lock.json any time a dependency changes on the host —
# this reconciles it against the live, bind-mounted lockfile on every start.
LOCKFILE_HASH_FILE="node_modules/.package-lock.sha256"
CURRENT_HASH=$(sha256sum package-lock.json | cut -d ' ' -f1)

if [ ! -f "$LOCKFILE_HASH_FILE" ] || [ "$(cat "$LOCKFILE_HASH_FILE")" != "$CURRENT_HASH" ]; then
  echo "[frontend] package-lock.json changed, running npm ci..."
  npm ci
  echo "$CURRENT_HASH" > "$LOCKFILE_HASH_FILE"
else
  echo "[frontend] node_modules already in sync with package-lock.json"
fi

exec "$@"
