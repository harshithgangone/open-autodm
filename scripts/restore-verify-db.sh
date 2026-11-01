#!/usr/bin/env bash
#
# Restore a backup to a disposable, NON-PRODUCTION Supabase/Postgres target.
# This script refuses the known Open AutoDM production project ref.
#
set -Eeuo pipefail
umask 077

PRODUCTION_PROJECT_REF="bprohzkpizicsmyscvtx"
BACKUP_DIR="${1:-}"
DB_NAME="${RESTORE_DB_NAME:-postgres}"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

[[ -n "$BACKUP_DIR" ]] || fail "Usage: bash scripts/restore-verify-db.sh /path/to/backup-directory"
[[ -d "$BACKUP_DIR" ]] || fail "Backup directory not found: $BACKUP_DIR"
for file in roles.sql schema.sql data.sql SHA256SUMS.txt; do
  [[ -s "$BACKUP_DIR/$file" ]] || fail "Required backup file missing or empty: $file"
done
command -v psql >/dev/null 2>&1 || fail "psql not found. On macOS install it with: brew install postgresql@17"
command -v python3 >/dev/null 2>&1 || fail "Python 3 is required to URL-encode the connection credentials."

(
  cd "$BACKUP_DIR"
  shasum -a 256 -c SHA256SUMS.txt
) || fail "Backup checksum verification failed. Refusing to restore."

printf '\nDISPOSABLE RESTORE VERIFICATION\n'
printf 'This imports SQL into a target database. Never point it at production.\n\n'

read -r -p "Disposable target Supabase project ref: " TARGET_REF
[[ "$TARGET_REF" =~ ^[a-z0-9]{20}$ ]] || fail "Target ref does not look like a Supabase project ref."
[[ "$TARGET_REF" != "$PRODUCTION_PROJECT_REF" ]] || fail "Production project ref is forbidden."

read -r -p "Target database host: " DB_HOST
read -r -p "Target database port: " DB_PORT
read -r -p "Target database username: " DB_USER
read -r -s -p "Target database password (hidden): " DB_PASSWORD
printf '\n'

[[ "$DB_HOST" =~ ^[A-Za-z0-9.-]+$ ]] || fail "Database host contains unsupported characters."
[[ "$DB_PORT" =~ ^[0-9]{1,5}$ ]] || fail "Database port must be numeric."
(( DB_PORT > 0 && DB_PORT <= 65535 )) || fail "Database port is outside the valid range."
[[ "$DB_USER" =~ ^[A-Za-z0-9_.-]+$ ]] || fail "Database username contains unsupported characters."
if [[ "$DB_HOST" == *"$PRODUCTION_PROJECT_REF"* ]]; then
  fail "Production host detected. Refusing to run a restore against production."
elif [[ "$DB_HOST" == *.pooler.supabase.com ]]; then
  [[ "$DB_USER" == "postgres.$TARGET_REF" ]] || fail "Pooler username does not match the disposable target project ref."
elif [[ "$DB_HOST" == "db.$TARGET_REF.supabase.co" || "$DB_HOST" == "db.$TARGET_REF.supabase.com" ]]; then
  [[ "$DB_USER" == "postgres" ]] || fail "Direct database username should be postgres."
elif [[ "$DB_HOST" == "127.0.0.1" || "$DB_HOST" == "localhost" ]]; then
  [[ "$TARGET_REF" == "localrestore00000001" ]] || fail "Local PostgreSQL restore must use the localrestore00000001 target label."
else
  fail "Target host does not match the declared disposable Supabase project or local restore target."
fi
[[ -n "$DB_PASSWORD" ]] || fail "Database password cannot be empty."
[[ "$DB_PASSWORD" != *$'\n'* && "$DB_PASSWORD" != *$'\r'* ]] || fail "Password must not contain newline characters."
[[ "$DB_NAME" =~ ^[A-Za-z0-9_.-]+$ ]] || fail "RESTORE_DB_NAME contains unsupported characters."

cleanup() {
  unset DB_PASSWORD DATABASE_URL ENCODED_PASSWORD
}
trap cleanup EXIT

ENCODED_PASSWORD="$(DB_PASSWORD="$DB_PASSWORD" python3 -c 'import os, urllib.parse; print(urllib.parse.quote(os.environ["DB_PASSWORD"], safe=""))')"
DATABASE_URL="postgresql://${DB_USER}:${ENCODED_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require"

printf '\nTarget ref: %s\n' "$TARGET_REF"
printf 'Target host: %s\n' "$DB_HOST"
printf 'Backup directory: %s\n' "$BACKUP_DIR"
printf '\nBefore continuing, verify that this host belongs to the disposable target project in Supabase Dashboard.\n'
read -r -p "Type RESTORE ${TARGET_REF} to confirm this disposable target: " CONFIRM
[[ "$CONFIRM" == "RESTORE $TARGET_REF" ]] || fail "Confirmation did not match. No restore was run."

printf '\nStarting restore. This can change every custom object in the TARGET database.\n'
printf 'The password is not printed, but is briefly visible in the local psql process arguments.\n'

psql "$DATABASE_URL" \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file "$BACKUP_DIR/roles.sql" \
  --file "$BACKUP_DIR/schema.sql" \
  --command 'SET session_replication_role = replica' \
  --file "$BACKUP_DIR/data.sql"

unset DB_PASSWORD DATABASE_URL ENCODED_PASSWORD

printf '\nRESTORE COMMAND COMPLETED for disposable target %s.\n' "$TARGET_REF"
printf 'Now run the post-restore checks in docs/runbooks/production-backup-and-restore.md.\n'
