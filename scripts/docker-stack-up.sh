#!/usr/bin/env bash
# Full stack: requires Compose (plugin or docker-compose binary).
set -euo pipefail
_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${_SCRIPT_DIR}/docker-ensure.sh"

ROOT="$(cd "${_SCRIPT_DIR}/.." && pwd)"
cd "$ROOT"

if docker compose version &>/dev/null 2>&1; then
  exec docker compose up --build
fi

if command -v docker-compose &>/dev/null; then
  exec docker-compose up --build
fi

echo >&2 "Docker Compose is required for docker:up (builds app + db)."
echo >&2 "Enable the Compose V2 plugin in Docker Desktop, or install docker-compose."
echo >&2 "For database only, use: npm run docker:db"
exit 1
