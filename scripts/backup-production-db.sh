#!/usr/bin/env bash
#
# Create a private, manual logical backup of the Open AutoDM production
# database using the official Supabase CLI. This script is read-only.
#
# The database password is requested with terminal echo disabled. It is
# intentionally not persisted in the backup directory or written to logs.
# The CLI requires a connection URI, so the password is present briefly in
# the CLI process arguments while each dump runs. Run this only on a trusted
# local machine and do not share process listings or terminal diagnostics.
#
set -Eeuo pipefail
umask 077

PROJECT_REF="${SUPABASE_PROJECT_REF:-bprohzkpizicsmyscvtx}"
BACKUP_ROOT="${OPEN_AUTODM_BACKUP_DIR:-$HOME/open-autodm-backups}"
DB_NAME="${SUPABASE_DB_NAME:-postgres}"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

command -v supabase >/dev/null 2>&1 || fail "Supabase CLI not found. Install it first: brew install supabase/tap/supabase"
command -v docker >/dev/null 2>&1 || fail "Docker CLI not found. Install Docker Desktop and open it before running this script."
command -v python3 >/dev/null 2>&1 || fail "Python 3 is required to safely URL-encode the connection credentials."

docker info >/dev/null 2>&1 || fail "Docker Desktop is not running. Start Docker Desktop and retry."

[[ "$PROJECT_REF" =~ ^[a-z0-9]{20}$ ]] || fail "SUPABASE_PROJECT_REF does not look like a Supabase project ref."
[[ "$DB_NAME" =~ ^[A-Za-z0-9_.-]+$ ]] || fail "SUPABASE_DB_NAME contains unsupported characters."

printf '\nOpen AutoDM production database backup\n'
printf 'Project ref: %s\n' "$PROJECT_REF"
printf 'Backup destination: %s\n' "$BACKUP_ROOT"
printf '\nIn Supabase Dashboard → Project → Connect, select the Session pooler (recommended) or Direct connection.\n'
printf 'Enter the connection fields exactly as shown. Do not paste the full URI here.\n\n'

read -r -p "Database host: " DB_HOST
read -r -p "Database port: " DB_PORT
read -r -p "Database username: " DB_USER
read -r -s -p "Database password (hidden): " DB_PASSWORD
printf '\n'

[[ "$DB_HOST" =~ ^[A-Za-z0-9.-]+$ ]] || fail "Database host contains unsupported characters."
[[ "$DB_PORT" =~ ^[0-9]{1,5}$ ]] || fail "Database port must be numeric."
(( DB_PORT > 0 && DB_PORT <= 65535 )) || fail "Database port is outside the valid range."
[[ "$DB_USER" =~ ^[A-Za-z0-9_.-]+$ ]] || fail "Database username contains unsupported characters."
if [[ "$DB_HOST" == *.pooler.supabase.com ]]; then
  [[ "$DB_USER" == "postgres.$PROJECT_REF" ]] || fail "Pooler username does not match the production project ref."
elif [[ "$DB_HOST" == "db.$PROJECT_REF.supabase.co" || "$DB_HOST" == "db.$PROJECT_REF.supabase.com" ]]; then
  [[ "$DB_USER" == "postgres" ]] || fail "Direct database username should be postgres."
else
  fail "Database host does not identify the configured Open AutoDM production project. Re-check Dashboard → Connect."
fi
[[ -n "$DB_PASSWORD" ]] || fail "Database password cannot be empty."
[[ "$DB_PASSWORD" != *$'\n'* && "$DB_PASSWORD" != *$'\r'* ]] || fail "Password must not contain newline characters."

mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"
BACKUP_DIR="$BACKUP_ROOT/${PROJECT_REF}-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -m 700 "$BACKUP_DIR" || fail "Backup destination already exists or cannot be created: $BACKUP_DIR"

cleanup() {
  unset DB_PASSWORD DATABASE_URL ENCODED_PASSWORD
}
trap cleanup EXIT

# Encode credentials for a libpq connection URI. Never print the URI.
ENCODED_PASSWORD="$(DB_PASSWORD="$DB_PASSWORD" python3 -c 'import os, urllib.parse; print(urllib.parse.quote(os.environ["DB_PASSWORD"], safe=""))')"
DATABASE_URL="postgresql://${DB_USER}:${ENCODED_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require"

CLI_VERSION="$(supabase --version 2>/dev/null | head -n 1 || true)"
[[ -n "$CLI_VERSION" ]] || fail "Unable to determine Supabase CLI version."

printf '\nCreating role, schema, and data exports...\n'
printf 'The password is not printed, but is briefly visible in the local CLI process arguments while each export runs.\n'

supabase db dump --db-url "$DATABASE_URL" --role-only -f "$BACKUP_DIR/roles.sql"
supabase db dump --db-url "$DATABASE_URL" -f "$BACKUP_DIR/schema.sql"
supabase db dump --db-url "$DATABASE_URL" --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes" -f "$BACKUP_DIR/data.sql"

for file in roles.sql schema.sql data.sql; do
  [[ -s "$BACKUP_DIR/$file" ]] || fail "Export file is missing or empty: $file"
  chmod 600 "$BACKUP_DIR/$file"
done

{
  printf 'Open AutoDM production logical backup\n'
  printf 'Project ref: %s\n' "$PROJECT_REF"
  printf 'Created UTC: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'Supabase CLI: %s\n' "$CLI_VERSION"
  printf 'Database host: %s\n' "$DB_HOST"
  printf 'Database port: %s\n' "$DB_PORT"
  printf 'Database name: %s\n' "$DB_NAME"
  printf '\n'
  printf 'Scope: Supabase CLI role, schema, and data exports for supported schemas.\n'
  printf 'Limitations: managed auth/storage schemas, Storage object bytes, platform Auth settings, and Worker secrets are not a full-project backup.\n'
  printf 'This is a logical database export, not a PITR recovery point. See the restore runbook.\n'
} > "$BACKUP_DIR/MANIFEST.txt"
chmod 600 "$BACKUP_DIR/MANIFEST.txt"

(
  cd "$BACKUP_DIR"
  shasum -a 256 roles.sql schema.sql data.sql MANIFEST.txt > SHA256SUMS.txt
)
chmod 600 "$BACKUP_DIR/SHA256SUMS.txt"

unset DB_PASSWORD DATABASE_URL ENCODED_PASSWORD

printf '\nBackup files created:\n'
ls -lh "$BACKUP_DIR/roles.sql" "$BACKUP_DIR/schema.sql" "$BACKUP_DIR/data.sql" "$BACKUP_DIR/MANIFEST.txt" "$BACKUP_DIR/SHA256SUMS.txt"
printf '\nSHA-256 checksums:\n'
cat "$BACKUP_DIR/SHA256SUMS.txt"

printf '\nBACKUP COMPLETE: %s\n' "$BACKUP_DIR"
printf 'Next: perform the restore verification in docs/runbooks/production-backup-and-restore.md before any production migration.\n'
