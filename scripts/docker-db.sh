#!/usr/bin/env bash
# Start Postgres when `docker compose` is unavailable (no Compose V2 plugin).
set -euo pipefail
_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${_SCRIPT_DIR}/docker-ensure.sh"

ROOT="$(cd "${_SCRIPT_DIR}/.." && pwd)"
cd "$ROOT"

if docker compose version &>/dev/null 2>&1; then
  exec docker compose up -d db
fi

if command -v docker-compose &>/dev/null; then
  exec docker-compose up -d db
fi

NAME="timeboard-db"
VOL="timeboard_postgres_data"
IMG="postgres:15-alpine"

if docker ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
  echo "Starting existing container $NAME..."
  docker start "$NAME"
  exit 0
fi

echo "Docker Compose not found; starting Postgres with docker run..."
docker volume create "$VOL" >/dev/null 2>&1 || true
docker run -d \
  --name "$NAME" \
  --restart unless-stopped \
  -p 5432:5432 \
  -e POSTGRES_USER=timeboard \
  -e POSTGRES_PASSWORD=timeboard \
  -e POSTGRES_DB=timeboard \
  -v "${VOL}:/var/lib/postgresql/data" \
  "$IMG"

echo "Postgres is up on localhost:5432 (database timeboard, user timeboard)."
