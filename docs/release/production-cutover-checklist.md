# Open AutoDM Production Cutover Checklist

Status: **planning only**. This document records the release sequence; it does not authorize or perform a production change. The production database and Worker have not been modified by this release-prep pass.

## Preflight snapshot

Before using this runbook, re-check the actual target project's migration history, project plan, Security Advisor, extension locations, cron jobs, workload counts, and the exact application deployment. Staging observations do not prove production is in the same state. Keep raw ACL output and detailed live security findings in a private operator record, not in this public repository.

Cloudflare production preflight observation (read-only, 2026-10-28): the Worker Domain record maps `app.opendm.in` to service `open-autodm-production` / environment `production`, and no production Cron Trigger is configured. The Worker script settings also include the tag `cf:service=open-autodm-staging` alongside `cf:environment=production`. Verify whether this is stale metadata before cutover; the domain mapping currently points to the production service, so do not infer a routing failure from the tag alone. Resolve any confirmed metadata/configuration discrepancy only through a separately reviewed production change.

## Read-only SQL preflight and postflight

Run these queries separately against the exact target Supabase project before and after the migration window. They are **read-only**. Do not combine them with the operator's mutating migration or scheduling commands. A missing expected function or any unexpected grant is a stop condition until explained.

### 1. Verify extension placement and any existing processor schedule

```sql
SELECT e.extname, n.nspname AS extension_schema, e.extversion
FROM pg_extension e
JOIN pg_namespace n ON n.oid = e.extnamespace
WHERE e.extname IN ('pg_cron', 'pg_net')
ORDER BY e.extname;

-- Safe before and after migration: these return NULL when the relation is absent.
SELECT to_regclass('cron.job') AS cron_job_catalog,
       to_regclass('net.http_request_queue') AS pg_net_request_queue;

-- Only run the following cron.job queries if cron_job_catalog above is non-NULL.
-- Read only the app's expected processor job; do not print unrelated job commands.
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'open-autodm-process-jobs';

-- Inspect recent executions; a SQL success does not alone prove the HTTP response was successful.
SELECT d.jobid, j.jobname, d.status, d.return_message, d.start_time, d.end_time
FROM cron.job_run_details d
JOIN cron.job j USING (jobid)
WHERE j.jobname = 'open-autodm-process-jobs'
ORDER BY d.start_time DESC
LIMIT 10;

-- Only run this count if pg_net_request_queue above is non-NULL.
SELECT count(*) AS queued_http_requests
FROM net.http_request_queue;
```

Before moving `pg_net`, its request queue must be empty and all cron jobs that call `net.http_*` must be paused with their in-flight runs finished. The guarded migration aborts if these conditions are not met. Do not use a live `CRON_SECRET` for an ad hoc smoke test.

### 2. Verify exact privileged-function ACLs

The migrations restrict these functions to `service_role`. Run this query before and after migration to check every required signature and role grant:

```sql
WITH expected(signature) AS (
  VALUES
    ('public.check_and_record_dm_rate_limit(uuid,integer)'),
    ('public.claim_due_jobs(integer)'),
    ('public.cleanup_old_rows()'),
    ('public.increment_automation_dms_sent(uuid)'),
    ('public.record_contact_interaction(uuid,text,text,text,uuid)'),
    ('public.update_contact_profile(uuid,text,text,boolean)'),
    ('public.handle_new_user()'),
    ('public.get_traffic_guard_status(uuid)'),
    ('public.traffic_guard_pause_account(uuid,uuid)'),
    ('public.traffic_guard_resume_account(uuid,uuid)')
),
resolved AS (
  SELECT signature, to_regprocedure(signature) AS fn
  FROM expected
)
SELECT
  signature,
  fn IS NOT NULL AS exists,
  CASE WHEN fn IS NOT NULL THEN has_function_privilege('anon', fn, 'EXECUTE') END AS anon_execute,
  CASE WHEN fn IS NOT NULL THEN has_function_privilege('authenticated', fn, 'EXECUTE') END AS authenticated_execute,
  CASE WHEN fn IS NOT NULL THEN has_function_privilege('service_role', fn, 'EXECUTE') END AS service_role_execute
FROM resolved
ORDER BY signature;
```

For these backend-only functions, expected postflight is: all signatures exist, `anon_execute = false`, `authenticated_execute = false`, and `service_role_execute = true`. Any deviation blocks the cutover.

Check the trigger helper's pinned search path separately:

```sql
SELECT p.oid::regprocedure AS function_name, p.proconfig
FROM pg_proc p
WHERE p.oid = to_regprocedure('public.handle_updated_at()');
```

### 3. Verify existing table grants and future-object defaults

```sql
-- Inspect current direct table rights for client roles.
SELECT table_name, grantee,
       string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;

-- Catch explicit table/sequence ACLs granted to PUBLIC as well.
SELECT n.nspname AS schema_name, c.relname AS object_name,
       CASE c.relkind
         WHEN 'r' THEN 'table'
         WHEN 'p' THEN 'partitioned_table'
         WHEN 'v' THEN 'view'
         WHEN 'm' THEN 'materialized_view'
         WHEN 'f' THEN 'foreign_table'
         WHEN 'S' THEN 'sequence'
         ELSE c.relkind::text
       END AS object_type,
       a.privilege_type, a.is_grantable
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(c.relacl) a
WHERE n.nspname = 'public'
  AND a.grantee = 0
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
ORDER BY object_type, object_name, privilege_type;

-- Inspect defaults for objects created by the postgres migration owner.
SELECT d.defaclrole::regrole::text AS owner_role,
       COALESCE(n.nspname, '<global>') AS schema_name,
       d.defaclobjtype AS object_type,
       d.defaclacl::text AS default_acl
FROM pg_default_acl d
LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
WHERE d.defaclrole = (SELECT oid FROM pg_roles WHERE rolname = 'postgres')
  AND (d.defaclnamespace = 0 OR n.nspname = 'public')
ORDER BY schema_name, object_type;
```

Postflight expectations: `anon` has no direct table privileges; `authenticated` has only the deliberately retained grants for tables covered by intended owner-scoped RLS policies; the service-only tables (including `app_settings`, `debug_events`, `job_queue`, `dm_rate_events`, and `comment_traffic_events`) have no direct client grants. In the `postgres` default ACL for `public`, `anon` and `authenticated` must not appear; only the owner and intentionally granted `service_role` rights should remain. Any unexpected grant blocks cutover. In the explicit `PUBLIC` table/view/sequence ACL query, postflight should return zero rows. Do not treat RLS as a mitigation for broad `TRUNCATE` or `REFERENCES` rights: PostgreSQL documents that these whole-table privileges are not subject to row-security policies ([PostgreSQL 17 RLS documentation](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)). Any client `TRUNCATE`/`REFERENCES` grant is a hard stop until removed or explicitly justified.

Postflight should show an empty search path configuration (`search_path=""`). Rerun Security Advisor and retain the full output in the private operator record.


Check the current draft PR for the latest CI run before each cutover attempt; never treat a historical green run as validation of a newer commit. Staging release-prep migrations and the `pg_net` relocation have been verified. A live staging invalid-HMAC request returned 403 and an unauthenticated cron request returned 401; post-probe checks showed no webhook debug writes, no queued/processing work, and an empty HTTP request queue. No production secrets were retrieved or changed.

## Release blockers

Do not merge or schedule live processing until all of the following have an owner and pass:

1. Review the eight SQL migrations below against the exact deployed application commit, determine which versions are actually missing in the target environment, and approve a production maintenance window.
2. Take/verify a restorable production backup or point-in-time recovery option. Save the current migration ledger, Security Advisor output, relevant function ACLs, extension state, scheduler state, and non-sensitive workload counts in the private operator record.
3. Coordinate the same strong random `CRON_SECRET` value between the production Cloudflare Worker secret and Supabase Vault. Cloudflare does not return a secret's value on read, so do not assume the two values match merely because both bindings exist.
4. Apply the migrations, then verify privileges, the trigger function search path, extension schemas, and Security Advisor results before enabling the production schedule.
5. Create exactly one production job named `open-autodm-process-jobs` only after the operator authorizes periodic processing. This endpoint can process queued jobs, refresh live Instagram tokens, and clean up rows; it must not be manually called with valid credentials as a casual smoke test.
6. Complete the real Meta OAuth consent/callback flow and a valid signed webhook event on staging with a dedicated test Instagram account. Unit tests cover valid/invalid HMAC signatures but are not a substitute for Meta's live round-trip.
7. Enable leaked-password protection if the target plan supports it, or record the explicit risk acceptance/upgrade decision. Then rerun the Security Advisor. Do not automatically upgrade the plan.

## Backup and recovery verification procedure

This is a required **pre-migration gate**, not a statement that a backup already exists. The connected project metadata and SQL tools do not expose backup inventory or prove restorability. The production organization has previously been observed on the Free plan; Supabase's current backup guide says automatic daily backups are included on Pro/Team/Enterprise and recommends manual exports for Free projects. Do not assume a platform backup or PITR is available until you verify it in the production Dashboard or through the read-only Management API.

Official references:
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/reference/api/v1-list-all-backups
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

### A. Inspect available platform backups (read only)

1. Open the **production** project explicitly, then open **Database → Backups** and **Point in Time** if shown. Record the most recent completed backup/recovery point and retention window. Do not click Restore.
2. Alternatively, list backup metadata through the Management API using a token with the minimum required read scope. Do this from a trusted terminal; keep the token out of shell history, repository files, screenshots, logs, chat and CI. The endpoint is read-only:

```bash
read -r -s -p "Supabase Management API token: " SUPABASE_ACCESS_TOKEN
printf '\n'
export SUPABASE_ACCESS_TOKEN
read -r -p "Confirmed production project ref: " PROJECT_REF
export PROJECT_REF

curl --fail --silent --show-error \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/backups" |
  jq '{walg_enabled, pitr_enabled, physical_backup_data,
       backups: [.backups[]? | {id, status, inserted_at, is_physical_backup}]}'

unset SUPABASE_ACCESS_TOKEN PROJECT_REF
```

Confirm the project ref against the production Dashboard before the request. A successful API response with an empty backup list does **not** count as a recovery path. Save only the non-secret metadata needed for the change record.

### B. If no usable platform backup exists

Do not proceed with production DDL until a recovery path is approved. On a Free project, make a protected logical export as a supplement and independently verify its coverage/restoration plan. Supabase CLI dumps do not automatically constitute a complete copy of all Supabase project state; confirm how Auth users, Storage metadata/files, Vault secrets, project configuration and encryption keys will be recovered. Never upload database dumps to this repository, PR, issue, chat or CI artifacts.

Use a private, encrypted destination outside the repository. In a trusted terminal, obtain the database connection string from the production Dashboard without pasting it into a command literal, then run the current Supabase CLI backup sequence:

```bash
set -eu
umask 077
supabase --version
# Install/verify Docker first; the Supabase CLI runs pg_dump inside a container.
BACKUP_DIR="$HOME/private-backups/open-autodm-production-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Obtain the connection string from the Production Dashboard's Connect panel.
# Prefer the session pooler, and percent-encode special characters in the password.
# Keep it out of command history, repository files, screenshots and chat.
read -r -s -p "Production database connection string: " SUPABASE_DB_URL
printf '\n'
export SUPABASE_DB_URL

supabase db dump --db-url "$SUPABASE_DB_URL" -f "$BACKUP_DIR/roles.sql" --role-only
supabase db dump --db-url "$SUPABASE_DB_URL" -f "$BACKUP_DIR/schema.sql"
supabase db dump --db-url "$SUPABASE_DB_URL" -f "$BACKUP_DIR/data.sql" --use-copy --data-only \\
  -x "storage.buckets_vectors" -x "storage.vector_indexes"

unset SUPABASE_DB_URL
chmod 600 "$BACKUP_DIR"/*.sql
shasum -a 256 "$BACKUP_DIR"/*.sql > "$BACKUP_DIR/SHA256SUMS"
printf 'Backup files and hashes saved under: %s\n' "$BACKUP_DIR"
```

Important: Supabase CLI `db dump` applies Supabase-specific filtering; the documented command does not include all managed schemas (including `auth` and `storage`) or Storage object bytes. The data command excludes the Storage vector tables as required by the current Supabase instructions. Inspect the CLI output and generated files; do not describe these SQL files as a full Supabase project backup.

Do not treat those logical dumps as the final go/no-go gate by themselves. Validate the files, record their secure storage location and timestamp privately, and rehearse the restore on an isolated scratch project or otherwise prove that the selected platform backup is restorable. Never test restore against production or reset the current staging project as a substitute. If the application needs Auth users, Storage files/metadata, Vault secrets, provider settings or encryption keys for recoverability, document and test their separate recovery path too. If a complete recovery path cannot be demonstrated, stop the cutover and obtain approval for an appropriate backup-capable plan or recovery strategy; do not change the billing plan automatically.

Current official references:
- [Supabase database backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase CLI database dump](https://supabase.com/docs/reference/cli/supabase-db-dump)
- [Supabase backup and restore using CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)

### C. Record the recovery gate

Before production migration, the private operator record must contain:
- The exact production project identity and plan checked.
- Backup/PITR identifier and recovery point, or logical backup file hashes and protected location.
- Which platform state/data is included and which components require separate recovery.
- Evidence the backup is usable (preferably a successful restore rehearsal in an isolated project).
- Recovery owner, expected downtime and an explicit go/no-go decision.

Do not put database contents, credentials, secret values, user records or raw dumps in this public checklist.

## Migration order

Apply these eight existing migration files in timestamp order. Do not edit or skip historical migrations just to make the ledger look aligned.

1. `20261028121508_restrict_service_role_rpcs.sql`
2. `20261028121634_enable_staging_cron_extensions.sql`
3. `20261028122007_pin_updated_at_search_path.sql`
4. `20261028144525_harden_traffic_guard_rpcs.sql`
5. `20261028144612_service_role_data_api_grants.sql`
6. `20261028144658_tighten_public_default_privileges.sql`
7. `20261028145034_restrict_legacy_object_grants.sql`
8. `20261028145957_move_pg_net_to_extensions.sql`

Important notes:

- The extension migration deliberately creates `pg_cron` and `pg_net` first; the final guarded migration moves `pg_net` out of `public`. The last migration aborts if an active cron job calls `net.http_*`, a matching cron run is in flight, or the request queue is non-empty.
- `DROP EXTENSION pg_net` recreates extension-owned queue/response tables. It is only acceptable after confirming the request queue is empty and the short-lived response diagnostics are not needed. Never run it manually outside the guarded migration.
- The migrations revoke public/client execution of privileged functions and narrow existing grants. If the deployed app contains unreviewed direct client calls to the Data API, these grants can break them. Verify the application commit and perform a focused smoke test before proceeding.
- Do not run `supabase db push` until the CLI is explicitly linked to the production project and the dry-run's exact migration list has been reviewed. A staging link is not a production link.

## Staging Meta end-to-end verification (operator-run; no outbound messages)

These tests are still an outstanding release gate. They require the staging URL, an operator-controlled Meta app secret and a dedicated Meta/Instagram test account. Do not retrieve or print the app secret from application storage, and do not use a production token or a personal production Instagram account.

Read-only settings comparison found that staging and production are configured with the same Meta App ID. During a recent negative-path probe window, staging logged signature-verified webhook deliveries distinct from our missing/invalid-signature requests (which returned 403). An active Instagram account record for the same account was present in both staging and production.

**Containment performed on staging only (2026-10-28 18:58 UTC):** the cloned staging account record was set to `is_active = false`. The update was conditional on there being no active automations, queued/processing DM jobs, pending queue work, or recent DM sends; all were zero at preflight. A postflight check confirmed there are no active staging Instagram accounts, no queued work, and the staging processor remains healthy. Production's account record remains active and was not modified. This is a reversible staging safeguard, not a fix for Meta's app-level callback configuration.

Read-only recheck on 2026-10-28 around 19:09–19:10 UTC: signed deliveries continued, with five `entry_processing` and five `payload_routing` events after containment through 19:09:47 UTC. Every checked entry/routing row failed to match any connected staging account record. No `dm_event`, `shared_reel_event`, or `payload_processing` records were present since containment. Corresponding postflight checks showed zero DM sends, new follow-ups, private/public reply reservations, active Instagram accounts, active automations, queued/processing DM jobs, pending queue jobs, and pending HTTP requests. This bounds the observed effect; it does not identify the event source or resolve app-level routing. The source remains unattributed.

### Code-level webhook processing opt-out (included in the release-prep branch)

The webhook route now supports the explicit opt-out `META_WEBHOOK_PROCESSING_ENABLED=false`. When set, a correctly signed POST is acknowledged with HTTP 200 but exits before debug-event writes, payload parsing, queueing or `after()` background work. The GET verification challenge remains available. If the variable is unset, the existing processing behavior is preserved.

Before deploying this branch to the **staging Worker**, set `META_WEBHOOK_PROCESSING_ENABLED=false` in that Worker environment. Keep it false while staging is isolated, then verify the deployed version's behavior with the empty-entry signed smoke test and postflight counts. This flag does not affect code already deployed until the version containing the guard is deployed; do not assume the current staging runtime honors it. Do not set this variable to false in production as part of release preparation. The Wrangler configuration includes `nodejs_compat_populate_process_env` so Cloudflare runtime variables are available through `process.env`.

Treat this as a **release gate**: before any valid-signature test or OAuth round-trip, verify the current callback URL and subscribed Instagram account in Meta's developer dashboard, and determine whether staging is receiving live or test notifications for the shared app. The callback configuration is app-level for the normal Webhooks setup; do not assume staging is test-only based on its hostname. Keep the cloned staging account inactive until a dedicated staging app/test account or approved isolated callback/routing plan is confirmed. Do not change the Meta Dashboard, callback URL, app credentials, or production setup as part of this prep. Re-enable the staging account only as part of an approved test setup.

**Staging isolation change applied (2026-11-01):** the deployed staging Worker bundle contains the `META_WEBHOOK_PROCESSING_ENABLED=false` guard, and its compatibility flags include `nodejs_compat_populate_process_env`. The Cloudflare Worker now has a `secret_text` binding named `META_WEBHOOK_PROCESSING_ENABLED`, set to the literal value `false`; the API confirmed creation and a read-only settings check confirmed the binding is present. Staging Supabase currently reports zero active Instagram accounts. Production Worker bindings and its connected Instagram account were not changed.

A direct staging HTTP probe from the management runtime did not reach the application route; the request layer returned HTTP 403 with `requests to ... are not allowed`. Therefore the runtime behavior of the new guard is **not** yet live-probe verified. Keep the staging account inactive until the allowed network path and a dedicated test-account/routing plan are confirmed. A valid Meta HMAC-signed test event and real OAuth round-trip remain required before re-enabling an account.

### 1. Valid-signature webhook smoke test

Use the exact staging origin from the deployment dashboard. In a trusted terminal, enter the staging Meta app secret at the hidden prompt; do not place it in the command text or save it in a file. This sends only an empty-entry webhook payload, which must not enqueue DMs:

```bash
set -eu
read -r -s -p "Staging Meta App Secret (or matching Facebook App Secret for FB Login): " META_APP_SECRET
printf '\n'
export META_APP_SECRET
STAGING_APP_URL="https://open-autodm-staging.parvez-autodm-staging.workers.dev"
RAW_BODY='{"object":"instagram","entry":[]}'
RESPONSE_FILE="$(mktemp)"
cleanup() {
  unset META_APP_SECRET SIGNATURE RAW_BODY
  rm -f "$RESPONSE_FILE"
}
trap cleanup EXIT

SIGNATURE="$(printf '%s' "$RAW_BODY" | node -e 'const c=require("node:crypto");let b="";process.stdin.on("data",d=>b+=d);process.stdin.on("end",()=>process.stdout.write(c.createHmac("sha256",process.env.META_APP_SECRET).update(b).digest("hex")))')"

HTTP_STATUS="$(curl --silent --show-error --max-time 15 \
  -o "$RESPONSE_FILE" -w '%{http_code}' \
  -X POST "$STAGING_APP_URL/api/webhook" \
  -H "Content-Type: application/json" \
  -H "x-hub-signature-256: $SIGNATURE" \
  --data-binary "$RAW_BODY")"
printf 'HTTP %s\n' "$HTTP_STATUS"
cat "$RESPONSE_FILE"
test "$HTTP_STATUS" = "200"
grep -Fq '{"status":"ok"}' "$RESPONSE_FILE"

### 2. Real Meta OAuth consent/callback round-trip

1. Use a dedicated staging test user and Meta developer configuration with the exact staging callback URL and required permissions.
2. From the staging UI, start Instagram connect, complete Meta consent in the browser and return through the real callback.
3. Verify the app lands on the expected success state and associates only the test Instagram account. Check account ID, token presence/expiry metadata and callback error logs only; never select or print access-token or app-secret values.
4. Confirm no production account was changed, no automation was activated, no DM/reply was sent and no test event is queued. Remove the test connection or revoke it afterward according to the test-account procedure.
5. Save the timestamp, safe response/status, test account label and cleanup result in the private operator record.

Do not fake OAuth success by inserting a token directly into the database. If a dedicated test account or operator-controlled app credentials are unavailable, leave this gate unchecked rather than using production credentials.

## Production cron setup (operator runbook; do not run until authorized)

This section documents the Supabase Cron + `pg_net` option; it is **not** the selected production scheduler until the operator records that choice. The repo's Vercel schedule is not active on the current Cloudflare deployment.

**Scheduler reconciliation required (read-only snapshot, 2026-11-01):** Cloudflare currently has a separate `open-autodm-cron-dispatcher` Worker configured with a `* * * * *` Cron Trigger. Its `APP_URL` binding is present and its `CRON_SECRET` binding is configured; the production app Worker also has a `CRON_SECRET` binding. Cloudflare does not reveal secret values on read, so equality of the two secrets and successful delivery to `/api/cron/process-jobs` have **not** been verified. Separately, the production Supabase project currently has neither `pg_cron` nor `pg_net` installed and has no Supabase processor job. Treat the Cloudflare dispatcher as a potentially active scheduler until its execution is proven otherwise.

**Do not create the Supabase Cron job below while the Cloudflare dispatcher schedule remains enabled.** Select exactly one scheduler in the change record. If selecting Supabase Cron + `pg_net`, first disable the Cloudflare dispatcher's Cron Trigger through a separately reviewed change, then coordinate and verify the app Worker / Vault secret without printing it. If selecting the Cloudflare dispatcher, verify its target URL and matching secret through a safe non-processing validation path and do not add the Vault-backed Supabase job. The current state is a scheduler-selection blocker, not proof that either path is processing jobs successfully.

**Cloudflare runtime parity gate:** the current production app Worker reports only `nodejs_compat`; the release-prep `wrangler.jsonc` also enables `nodejs_compat_populate_process_env`. Verify that flag is present on the production Worker after the reviewed release deployment, because server environment validation reads runtime bindings through `process.env`.

### 1. Store the matching secret in Supabase Vault

Create a strong random secret via a secure operator workflow and set the exact same value as the Cloudflare Worker `CRON_SECRET` binding. Store it in Vault with this name:

`open_autodm_production_cron_secret`

Vault encrypts secrets at rest, and `vault.decrypted_secrets` exposes them to SQL that is authorized to read it. Do not print the decrypted value. Official reference: https://supabase.com/docs/guides/database/vault

### 2. Inspect before creating the job

After migrations, verify `pg_cron` exists, `pg_net` is installed in `extensions`, and there is no existing job with the name `open-autodm-process-jobs`. Review its schedule and command if one exists; do not create a duplicate.

### 3. Create the schedule once, after approval

The SQL below is a template only. Verify the production app URL and Vault secret name first. It must be run once by the production database owner after the migration checks and live-processing approval:

```sql
select cron.schedule(
  'open-autodm-process-jobs',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://app.opendm.in/api/cron/process-jobs',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'open_autodm_production_cron_secret'
          limit 1
        )
      ),
      timeout_milliseconds := 55000
    );
  $job$
);
```

This must not be added as an automatic data migration: enabling it can begin processing real queued jobs immediately. Do not invoke the endpoint manually using a valid secret just to see whether it works.

### 4. Verify the schedule and endpoint response

- Confirm exactly one active job named `open-autodm-process-jobs` on `* * * * *`.
- Read `cron.job_run_details` for recent successful runs.
- Check recent `net._http_response` rows for HTTP 200, no timeout, and an `ok: true` payload. A successful `cron.job_run_details` row only shows that the SQL command ran; it does not alone prove the HTTP endpoint succeeded.
- Confirm `net.http_request_queue` is empty after requests complete.
- Re-run Security Advisor and verify client roles cannot execute the privileged SECURITY DEFINER RPCs.
- If verification fails, pause/unschedule the job and use the approved recovery plan; do not flood retries or manually drain real jobs.

Official Supabase scheduling reference: https://supabase.com/docs/guides/cron
Official `pg_net` reference: https://supabase.com/docs/guides/database/extensions/pg_net

## Final go/no-go

**No-go until** production migrations are deliberately applied and verified, the production cron secret is coordinated without exposing it, the scheduler is configured exactly once and returns successful endpoint responses, the Meta flow is tested on staging, and the remaining Auth/plan decision is recorded. A successful CI run alone does not authorize a merge, migration, or deployment.
