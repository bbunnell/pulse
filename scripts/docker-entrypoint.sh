#!/bin/sh
set -e
node scripts/wait-for-db.mjs
node scripts/migrate.mjs
exec "$@"
