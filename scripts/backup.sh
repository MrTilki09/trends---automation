#!/usr/bin/env sh
# Nightly Postgres backup. Run from the repo directory on the server, e.g. via host cron:
#   15 2 * * * cd /opt/trend-pool && ./scripts/backup.sh >> backups/backup.log 2>&1
# Writes backups/trendpool-YYYYMMDD-HHMM.sql.gz and keeps the last KEEP_DAYS days.
# Make sure the backups/ folder is copied off the server (rclone, restic, rsync...).
set -eu

KEEP_DAYS="${KEEP_DAYS:-14}"
DIR="$(dirname "$0")/../backups"
mkdir -p "$DIR"
FILE="$DIR/trendpool-$(date +%Y%m%d-%H%M).sql.gz"

# pg_dump runs inside the db container, so no Postgres tools are needed on the host.
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' | gzip > "$FILE"
echo "$(date -Is) backup written: $FILE ($(du -h "$FILE" | cut -f1))"

find "$DIR" -name 'trendpool-*.sql.gz' -mtime +"$KEEP_DAYS" -delete

# Restore (into an empty database):
#   gunzip -c backups/trendpool-XXXX.sql.gz | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
