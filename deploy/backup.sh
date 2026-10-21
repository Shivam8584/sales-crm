#!/bin/sh
# Nightly from root's cron: dumps the CRM Postgres and the Convex data volume, keeps 14 days.
set -eu
cd "$(dirname "$0")"
DB=$(sed -n 's/^PG_DATABASE=//p' .env)
DB=${DB:-hypedrive_crm}
STAMP=$(date -u +%Y-%m-%d)
mkdir -p backups
umask 077

docker compose exec -T postgres pg_dump -U convex -d "$DB" -Fc >"backups/$DB-$STAMP.dump.tmp"
mv "backups/$DB-$STAMP.dump.tmp" "backups/$DB-$STAMP.dump"

docker compose exec -T backend tar -C /convex/data -czf - storage credentials >"backups/convex-data-$STAMP.tgz.tmp"
mv "backups/convex-data-$STAMP.tgz.tmp" "backups/convex-data-$STAMP.tgz"

find backups -type f \( -name '*.dump' -o -name '*.tgz' \) -mtime +13 -delete
find backups -type f -name '*.tmp' -mtime +1 -delete
