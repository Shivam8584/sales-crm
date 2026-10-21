#!/bin/sh
# Nightly from root's cron: dumps the CRM Postgres and the Convex data volume,
# keeps 14 days on disk and 30 days in R2 (when R2_BUCKET is set in .env).
set -eu
cd "$(dirname "$0")"
env_value() { sed -n "s/^$1=//p" .env; }
DB=$(env_value PG_DATABASE)
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

BUCKET=$(env_value R2_BUCKET)
if [ -n "$BUCKET" ]; then
  # .env isn't sourced: the dashboard's htpasswd line contains `$`.
  RCLONE_CONFIG=/dev/null
  RCLONE_CONFIG_R2_TYPE=s3
  RCLONE_CONFIG_R2_PROVIDER=Cloudflare
  RCLONE_CONFIG_R2_ENDPOINT=$(env_value R2_ENDPOINT)
  RCLONE_CONFIG_R2_ACCESS_KEY_ID=$(env_value R2_ACCESS_KEY_ID)
  RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=$(env_value R2_SECRET_ACCESS_KEY)
  RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
  export RCLONE_CONFIG RCLONE_CONFIG_R2_TYPE RCLONE_CONFIG_R2_PROVIDER RCLONE_CONFIG_R2_ENDPOINT \
    RCLONE_CONFIG_R2_ACCESS_KEY_ID RCLONE_CONFIG_R2_SECRET_ACCESS_KEY RCLONE_CONFIG_R2_NO_CHECK_BUCKET
  rclone copy backups "r2:$BUCKET/$STAMP" --include "*-$STAMP.dump" --include "*-$STAMP.tgz"
  rclone delete "r2:$BUCKET" --min-age 30d
  rclone rmdirs "r2:$BUCKET" --leave-root
fi
echo "$(date -u +%FT%TZ) backup $STAMP ok"
