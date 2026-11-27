#!/usr/bin/env bash
# Saitlify database restore into an EMPTY database (for example a separate, empty Supabase project).
# It refuses to run if the target is not empty or if it is the same database the backup came from.
#   RESTORE_DATABASE_URL connection string of the EMPTY target database (Supabase: the SESSION pooler string, port 5432)
#   BACKUP_PASSPHRASE    the passphrase used when the backup was made
#   BACKUP_DATABASE_URL  (optional) the source database; only used to refuse restoring into it
# Usage: ops/restore-database.sh <backup-file.dump.gpg>
set -euo pipefail
file="${1:?Usage: ops/restore-database.sh <backup-file.dump.gpg>}"
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is not set}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is not set}"
if [ -n "${BACKUP_DATABASE_URL:-}" ] && [ "$RESTORE_DATABASE_URL" = "$BACKUP_DATABASE_URL" ]; then
  echo "Refusing: the restore target is the same database the backup came from." >&2
  exit 1
fi
tables="$(psql "$RESTORE_DATABASE_URL" -tA -c "select count(*) from information_schema.tables where table_schema = 'public'")"
if [ "$tables" != "0" ]; then
  echo "Refusing: the target database is not empty ($tables tables in schema public). Nothing was changed." >&2
  exit 1
fi
dump="$(mktemp)"
trap 'rm -f "$dump"' EXIT
gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 --decrypt --output "$dump" "$file" 3<<<"$BACKUP_PASSPHRASE"
# The target already has its own (empty) "public" schema, so the dump's instruction to create it is left out.
list="$(mktemp)"
trap 'rm -f "$dump" "$list"' EXIT
pg_restore --list "$dump" | grep -v -E '^[0-9]+; [0-9]+ [0-9]+ (SCHEMA|COMMENT) - (SCHEMA )?public( |$)' >"$list"
pg_restore --no-owner --no-privileges --exit-on-error --use-list="$list" --dbname="$RESTORE_DATABASE_URL" "$dump"
echo "Restore finished. Row counts in the restored database:"
psql "$RESTORE_DATABASE_URL" -tA -F ' : ' -f "$(dirname "$0")/verify-counts.sql"
