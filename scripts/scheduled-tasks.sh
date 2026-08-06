#!/usr/bin/env bash
# Invokes the endpoints nothing was calling. There was no cron and no systemd
# timer on this host, so OOF entries were never reconciled (a user turning off
# their Outlook auto-reply stayed "out" until an admin clicked Sync by hand) and
# reminders were never sent at all.
#
# Both endpoints are idempotent and safe to re-run. They use different auth
# conventions, which is deliberate on their side, not a mistake here:
#   /api/reminders/send   -> Authorization: Bearer <CRON_SECRET>
#   /api/admin/oof-sync   -> x-cron-secret: <CRON_SECRET>
set -uo pipefail

BASE="http://localhost:3000"
ENV_FILE="/opt/teampulse/.env.local"
SECRET="$(sed -n 's/^CRON_SECRET=//p' "$ENV_FILE" | head -1 | tr -d '"'"'"' ')"

if [ -z "$SECRET" ]; then
  echo "$(date -Iseconds) [fatal] CRON_SECRET missing from $ENV_FILE" >&2
  exit 1
fi

task="${1:-all}"

run() {
  local name="$1" hdr="$2" url="$3" timeout="$4"
  local out code
  out=$(mktemp)
  code=$(curl -s -o "$out" -w '%{http_code}' --max-time "$timeout" \
         -X POST -H "$hdr" "$BASE$url" || echo 000)
  echo "$(date -Iseconds) [$name] HTTP $code $(head -c 400 "$out")"
  rm -f "$out"
  [ "$code" = "200" ]
}

rc=0
if [ "$task" = "reminders" ] || [ "$task" = "all" ]; then
  run reminders "Authorization: Bearer $SECRET" /api/reminders/send 60 || rc=1
fi
if [ "$task" = "oof" ] || [ "$task" = "all" ]; then
  run oof "x-cron-secret: $SECRET" /api/admin/oof-sync 300 || rc=1
fi
exit $rc
