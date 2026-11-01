# Production database backup and restore verification

**Scope:** Open AutoDM production project only. This runbook creates a private, manual logical export and verifies that the supported application database objects can be restored into a disposable local Supabase stack. It does not deploy code, run production migrations, or modify production data.

## Why this is required

The linked Supabase organization is on the Free plan. Supabase documents automatic daily backups for Pro, Team, and Enterprise projects; Free-tier projects should create manual exports and keep off-site backups. Free plan does not provide the same daily backup/PITR recovery protection.

References:
- [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Supabase CLI db dump](https://supabase.com/docs/reference/cli/supabase-db-dump)

## 1. Prepare your Mac

Use a trusted Mac with FileVault or another encrypted disk enabled. Do not place database exports in this Git repository, iCloud Drive shared folders, public cloud buckets, or a support ticket.

Install the required tools if missing:

```bash
brew install supabase/tap/supabase
brew install postgresql@17
```

Install and open Docker Desktop. Confirm:

```bash
supabase --version
docker info
psql --version
```

The Supabase CLI uses Docker for `db dump`.

## 2. Create the production export

From the Open AutoDM repository root:

```bash
bash scripts/backup-production-db.sh
```

The script is pinned to production project ref `bprohzkpizicsmyscvtx`. It asks for the host, port, database username, and database password separately. Get these from **Supabase Dashboard → Project → Connect**. Use the **Session pooler** details by default; use the Direct connection only when your network supports it.

For the Session pooler, the database username should be `postgres.<production-project-ref>`. For Direct connection, the host and username are checked against the configured production project ref.

The password prompt is hidden. The script does not print or persist the password. The Supabase CLI requires a connection URI, so the password is briefly present in the local CLI process arguments while each export runs. Run this only on your own trusted Mac; do not share process listings or raw diagnostic logs.

The script creates a private folder under:

```
~/open-autodm-backups/<production-project-ref>-<UTC-timestamp>/
```

It writes:
- `roles.sql`
- `schema.sql`
- `data.sql`
- `MANIFEST.txt`
- `SHA256SUMS.txt`

The directory is mode 700 and the files are mode 600. The manifest contains the project ref, export time, CLI version, and host/port metadata, but no database password or connection URI.

After completion, verify checksums from the backup directory:

```bash
cd ~/open-autodm-backups/<backup-folder>
shasum -a 256 -c SHA256SUMS.txt
```

Every entry must report `OK`. Keep one copy on an encrypted local disk and one encrypted off-site copy. Do not upload the plaintext SQL exports to GitHub or the Open AutoDM repository.

## 3. Important limits of this export

This is a manual **logical database export**, not a full Supabase project backup or a PITR recovery point.

The Supabase CLI filters Supabase-managed schemas by default. In particular, this export does not provide a complete copy of:
- Supabase Auth-managed data and settings, including the Auth user/identity store.
- Supabase Storage metadata and the actual Storage object bytes.
- Platform-level Auth provider settings, project configuration, API keys, or Edge Function configuration.
- Cloudflare Worker secrets and runtime bindings.

Open AutoDM's `public.profiles.id` references `auth.users.id`. The public application data export therefore does not by itself recreate working Supabase login identities. The restore check below validates the custom application schema/data import, not an end-to-end user-authentication disaster recovery. A complete recovery plan must separately cover Auth users/identities and settings, Storage objects (if used), Supabase project settings, and Cloudflare secrets. Keep the original `TOKEN_ENCRYPTION_KEY` in a separate secrets manager: rows in `public.app_settings` and `public.instagram_accounts` contain encrypted values that cannot be decrypted without that key.

Do not describe this export as a complete backup until those additional recovery components are separately covered.

## 4. Restore verification on an isolated local Supabase stack

This verification creates a separate temporary local Supabase stack. It must never connect to production.

In a second terminal, create an empty temporary lab directory and start Supabase locally:

```bash
RESTORE_LAB="$(mktemp -d)"
cd "$RESTORE_LAB"
supabase init
supabase start
supabase status
```

Keep this terminal open. The default local database connection is normally:
- Host: `127.0.0.1`
- Port: `54322`
- Database: `postgres`
- Username: `postgres`
- Password: `postgres` (unless changed in the temporary local config)

Confirm the actual port/password shown by your local Supabase status/config before continuing. If another local Supabase stack is running, stop it or configure a separate port set; do not overwrite another developer's local database.

In the Open AutoDM repository terminal, run:

```bash
bash scripts/restore-verify-db.sh "$HOME/open-autodm-backups/<backup-folder>"
```

At the prompts, for the default local stack enter:
- Target label: `localrestore00000001`
- Host: `127.0.0.1`
- Port: `54322`
- Username: `postgres`
- Password: the local database password from the temporary stack (default `postgres`)

The script verifies the backup checksums first, rejects the known production project ref, accepts only an explicitly matching disposable Supabase host or the designated local target, and requires typing the exact confirmation string. The restore runs in a single transaction and stops at the first SQL error. The password is not printed or saved, but is briefly visible in the local `psql` process arguments.

If restore fails, stop. Keep the error for diagnosis, but redact host/user details if sharing logs. Do not edit a dump blindly and do not retry against production.

## 5. Post-restore checks

After a successful restore, connect to the local target:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
```

Run:

```sql
SELECT
  to_regclass('public.profiles') AS profiles,
  to_regclass('public.instagram_accounts') AS instagram_accounts,
  to_regclass('public.automations') AS automations,
  to_regclass('public.contacts') AS contacts,
  to_regclass('public.dm_jobs') AS dm_jobs,
  to_regclass('public.dm_sent_log') AS dm_sent_log,
  to_regclass('public.comment_traffic_incidents') AS comment_traffic_incidents;

SELECT 'profiles' AS table_name, count(*) FROM public.profiles
UNION ALL SELECT 'instagram_accounts', count(*) FROM public.instagram_accounts
UNION ALL SELECT 'automations', count(*) FROM public.automations
UNION ALL SELECT 'contacts', count(*) FROM public.contacts
UNION ALL SELECT 'dm_jobs', count(*) FROM public.dm_jobs
UNION ALL SELECT 'dm_sent_log', count(*) FROM public.dm_sent_log
UNION ALL SELECT 'comment_traffic_incidents', count(*) FROM public.comment_traffic_incidents
ORDER BY table_name;

SELECT extname FROM pg_extension ORDER BY extname;
```

All listed application tables should exist. Compare row counts with read-only counts from production taken at the time of the export. A mismatch must be understood before the backup gate is marked complete. Record:
- Backup folder path and UTC timestamp.
- CLI version and all SHA-256 checks passing.
- Successful disposable restore output.
- Post-restore table presence, row counts, and any known restore limitations.

The local restore is a schema/data import test. Because Supabase-managed Auth data is excluded by the CLI export, this test does not validate real login or identity recovery.

When done, stop only the temporary local stack from its temporary lab directory:

```bash
supabase stop
```

Do not run `supabase db reset` against any linked remote project.

## 6. Production release gate

Do not apply production migrations, change production Worker settings, or merge/deploy the release PR until all of the following have evidence:

1. Production export completed; all checksums pass.
2. An encrypted off-site copy exists.
3. A disposable restore completes and application table counts reconcile.
4. Auth/identity and Storage recovery limitations are accepted and separately documented.
5. The production Cloudflare runtime compatibility flag and scheduler/secret delivery checks are handled as separate release gates.

**Never run the restore script with production connection details. It is intentionally designed for a disposable destination only.**
