#!/usr/bin/env bash
# Ships the web app to the server and rolls back if it doesn't come up healthy.
# Convex functions are deployed separately (`npx convex deploy`), before this.
set -euo pipefail

HOST=${DEPLOY_HOST:-ampere2}
REMOTE=${DEPLOY_DIR:-/opt/hypedrive-crm}
HEALTH_URL=${HEALTH_URL:-https://sales.hypedrive.app/api/health}

cd "$(dirname "$0")/.."
FILES=$(mktemp)
trap 'rm -f "$FILES"' EXIT
git ls-files -co --exclude-standard > "$FILES"

rsync -a --files-from="$FILES" --rsync-path="sudo rsync" ./ "$HOST:$REMOTE/src/"

# --files-from never deletes, so drop files that were removed from the repo.
ssh "$HOST" "sudo find $REMOTE/src -path '*/node_modules' -prune -o -path '*/.next' -prune -o -type f -printf '%P\n'" \
  | LC_ALL=C sort | LC_ALL=C comm -23 - <(LC_ALL=C sort "$FILES") \
  | { grep -v '^\.env' || true; } \
  | ssh "$HOST" "sudo sh -c 'cd $REMOTE/src && xargs -r -d \"\\n\" rm -f'"

ssh "$HOST" "sudo sh -c 'cd $REMOTE \
  && (docker tag hypedrive-crm-web:latest hypedrive-crm-web:previous || true) \
  && docker compose build web \
  && docker compose up -d web'"

for _ in $(seq 1 24); do
  if curl -fsS --max-time 10 "$HEALTH_URL" | grep -q '"ok":true'; then
    echo "healthy"
    exit 0
  fi
  sleep 5
done

echo "web did not become healthy; rolling back" >&2
ssh "$HOST" "sudo sh -c 'cd $REMOTE \
  && docker tag hypedrive-crm-web:previous hypedrive-crm-web:latest \
  && docker compose up -d web'"
exit 1
