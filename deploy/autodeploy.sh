#!/usr/bin/env bash
# Runs on the server from a systemd timer. When origin/main has a new commit it
# checks the code, deploys the Convex functions (`npx convex deploy`, as the
# Convex docs describe), builds and restarts the web app, and rolls back to the
# previous image if the new one doesn't become healthy.
set -uo pipefail

ROOT=${ROOT:-/opt/hypedrive-crm}
SRC=$ROOT/src
BRANCH=${BRANCH:-main}
HEALTH_URL=${HEALTH_URL:-https://sales.hypedrive.app/api/health}
LOG=${LOG:-/var/log/hypedrive-crm-deploy.log}
NODE_IMAGE=node:22-alpine

main() {
  exec 9>/var/lock/hypedrive-crm-deploy.lock
  flock -n 9 || exit 0
  exec >>"$LOG" 2>&1

  cd "$SRC" || exit 1
  git fetch --quiet origin "$BRANCH" || { echo "$(date -u +%FT%TZ) fetch failed"; exit 0; }
  NEW=$(git rev-parse "origin/$BRANCH")
  [ "$NEW" = "$(cat "$ROOT/.deployed-sha" 2>/dev/null)" ] && exit 0
  [ "$NEW" = "$(cat "$ROOT/.failed-sha" 2>/dev/null)" ] && exit 0

  echo "== $(date -u +%FT%TZ) deploying ${NEW:0:9}: $(git log -1 --format=%s "origin/$BRANCH")"
  git reset --hard --quiet "origin/$BRANCH"

  fail() {
    echo "!! $1"
    echo "$NEW" > "$ROOT/.failed-sha"
    exit 1
  }

  cd "$ROOT"
  cmp -s "$SRC/deploy/compose.prod.yml" compose.yml || cp "$SRC/deploy/compose.prod.yml" compose.yml
  cmp -s "$SRC/deploy/backup.sh" backup.sh || { cp "$SRC/deploy/backup.sh" backup.sh && chmod 700 backup.sh; }
  KEY=$(docker compose exec -T backend ./generate_admin_key.sh | tail -1)
  [ -n "$KEY" ] || fail "could not create a Convex admin key"

  docker run --rm --network hypedrive-crm_internal \
    -v "$SRC":/app -v hdcrm-npm-cache:/root/.npm -w /app \
    -e CONVEX_SELF_HOSTED_URL=http://backend:3210 \
    -e CONVEX_SELF_HOSTED_ADMIN_KEY="$KEY" \
    "$NODE_IMAGE" sh -c 'npm ci --no-audit --no-fund && npm run check && npx convex deploy -y' \
    || fail "checks or convex deploy failed; the running version is unchanged"

  (docker tag hypedrive-crm-web:latest hypedrive-crm-web:previous || true)
  docker compose build web || fail "web build failed; the running version is unchanged"
  docker compose up -d web || fail "could not start web"

  for _ in $(seq 1 24); do
    if curl -fsS --max-time 10 "$HEALTH_URL" | grep -q '"ok":true'; then
      echo "$NEW" > "$ROOT/.deployed-sha"
      rm -f "$ROOT/.failed-sha"
      echo "healthy ${NEW:0:9}"
      exit 0
    fi
    sleep 5
  done

  docker tag hypedrive-crm-web:previous hypedrive-crm-web:latest
  docker compose up -d web
  fail "web was not healthy in two minutes; rolled back to the previous image"
}

# The checkout this script lives in is replaced while it runs; bash must have read it all by then.
main "$@"
exit $?
