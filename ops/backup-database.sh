#!/usr/bin/env bash
# Saitlify database backup: dumps the application's data (schema "public") and encrypts it with a passphrase.
# Needs: pg_dump (PostgreSQL client) and gpg. Used by .github/workflows/database-backup.yml; can also be run anywhere with those tools.
#   BACKUP_DATABASE_URL  connection string of the database to back up (Supabase: the SESSION pooler string, port 5432)
#   BACKUP_PASSPHRASE    passphrase that encrypts the file (keep it somewhere safe: without it the backup cannot be opened)
# Neither value is ever printed. Usage: ops/backup-database.sh [output-folder]
set -euo pipefail
: "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL is not set}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is not set}"
out="${1:-.}"
mkdir -p "$out"
dump="$(mktemp)"
trap 'rm -f "$dump"' EXIT
pg_dump --format=custom --no-owner --no-privileges --schema=public --file="$dump" "$BACKUP_DATABASE_URL"
file="$out/saitlify-$(date -u +%Y%m%dT%H%M%SZ).dump.gpg"
gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 --symmetric --cipher-algo AES256 --output "$file" "$dump" 3<<<"$BACKUP_PASSPHRASE"
echo "Backup written: $file ($(wc -c <"$file") bytes)"
sha256sum "$file"
