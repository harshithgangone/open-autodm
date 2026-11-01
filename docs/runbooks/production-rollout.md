# Open AutoDM production rollout plan

**Scope:** Open AutoDM production only. This is an evidence-based rollout plan; it does not itself authorize a production deployment or production database migration. The current Production Worker traffic split and Production database are left unchanged.

**Last read-only audit:** 2026-11-01 (Asia/Kolkata)

## 1. Production baseline

Supabase project `bprohzkpizicsmyscvtx` is healthy and runs PostgreSQL 17.11.

Read-only application baseline:
- Active Instagram accounts: 1
- Active automations: 0
- Open `job_queue` rows (pending/processing/held): 0
- Open `dm_jobs` rows (pending/processing/queued): 0
- DMs recorded in the last 24 hours: 0

Do not assume zero activity is permanent. Recheck these values immediately before any production DDL or deployment.

## 2. Cloudflare runtime compatibility

### Finding

The application server environment validator in `src/lib/env.ts` reads `SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_ENCRYPTION_KEY`, and `CRON_SECRET` from `process.env`.

Production Worker `open-autodm-production` currently has:
- Compatibility date: `2025-03-25`
- Compatibility flags: `nodejs_compat`
- Missing flag: `nodejs_compat_populate_process_env`

The release branch's `wrangler.jsonc` already declares the missing flag. Staging also has it. Cloudflare's compatibility documentation says automatic population of `process.env` is not the default for compatibility dates before 2025-04-01 unless the flag is explicitly enabled.

Reference: [Cloudflare — Enable auto-populating process.env](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#enable-auto-populating-processenv).

### Non-deployed candidate created

A new version was created from the latest uploaded Production Worker version with only the missing compatibility flag added:

- Worker: `open-autodm-production`
- Candidate version: `80fabba2-b665-4c08-92bc-6341880b7bac` (version 16)
- Compatibility date retained: `2025-03-25`
- Compatibility flags: `nodejs_compat`, `nodejs_compat_populate_process_env`
- Main module: `worker-entry.js`
- Existing binding names preserved: `AI`, `ASSETS`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_ENCRYPTION_KEY`

The candidate version is **not deployed**. A post-creation deployment read confirmed the live deployment is still:
- Version 13: 90%
- Version 15: 10%
- Candidate version 16: 0%

No secret values were read or changed. Do not deploy version 16 until its preview/smoke test and rollback procedure are approved. Cloudflare documents that creating a Worker version and deploying it are separate actions; version creation alone does not route live traffic.

Reference: [Cloudflare — Deployment management](https://developers.cloudflare.com/workers/versions-and-deployments/deployment-management/).

### Additional Worker metadata

The Production Worker has a stale tag `cf:service=open-autodm-staging` alongside `cf:environment=production`. This is metadata only; it has not been changed. Correct it in a separately reviewed metadata update that preserves all other tags and does not deploy a version.

## 3. Scheduler verification

Production uses the Cloudflare Worker `open-autodm-cron-dispatcher`:
- Schedule: `* * * * *` (every minute)
- `APP_URL` was verified as `https://app.opendm.in`
- Dispatcher source targets `/api/cron/process-jobs` with `Authorization: Bearer CRON_SECRET` and a 55-second request timeout.
- Production Supabase logs in the inspected 24-hour window showed 1,385 successful `claim_due_jobs` HTTP 200 calls and 1,386 successful `cleanup_old_rows` HTTP 204 calls, with roughly 59–60 calls per hour.

This is strong operational evidence that the dispatcher is reaching an authorized cron route. Cloudflare masks secret values, so exact equality of the dispatcher's and app Worker's `CRON_SECRET` values was not directly compared. Do not add a second scheduler or invoke the cron route manually as a smoke test; the route processes due work.

Production currently has neither `pg_cron` nor `pg_net` installed and has no `cron.job` catalog. Keep Cloudflare as the single scheduler.

## 4. Production migration inventory

As of this audit:
- Production migration history: 13 versions.
- Staging migration history: 23 versions.
- Release branch migration files: 23 versions.
- Production therefore has 10 pending migration versions from the release branch.

### Production-applicable migrations

After the two scheduler migrations below are made opt-in, apply the following migrations **in timestamp order**, one at a time, only after the updated release branch passes its validation workflow and a fresh backup/checksum check is recorded:

1. `20261028121508_restrict_service_role_rpcs`
2. `20261028121634_enable_staging_cron_extensions` — safe default is a no-op; installs DB scheduler extensions only when `open_autodm.enable_db_scheduler = 'true'`.
3. `20261028122007_pin_updated_at_search_path`
4. `20261028144525_harden_traffic_guard_rpcs`
5. `20261028144612_service_role_data_api_grants`
6. `20261028144658_tighten_public_default_privileges`
7. `20261028145034_restrict_legacy_object_grants`
8. `20261028145957_move_pg_net_to_extensions` — safe default is a no-op; relocation is only performed when DB-side scheduling has explicitly been enabled and all in-flight-job/queue preconditions pass.
9. `20261101102107_harden_traffic_guard_resume`
10. `20261101102552_separate_traffic_guard_pause_incident`

The two scheduler migrations were updated on the release branch so a default Production rollout does not install a second scheduler:
- `20261028121634_enable_staging_cron_extensions.sql` returns with a NOTICE unless the database setting `open_autodm.enable_db_scheduler` is exactly `true`.
- `20261028145957_move_pg_net_to_extensions.sql` returns with a NOTICE unless the same opt-in is enabled; with opt-in, it requires installed `pg_cron` and `pg_net`, no active `net.http_*` cron jobs, no in-flight matching jobs, and an empty `net.http_request_queue`.

The existing staging database had already applied the earlier versions of these migrations and still has its previously provisioned extensions. Editing a migration file does not rerun or remove an already-applied staging migration. Fresh environments will follow the updated opt-in behavior.

**Do not apply the old scheduler SQL from an earlier checkout.** Fetch the updated migration files from the release branch first.

### Expected application behaviour

The application uses `createServiceClient()` for privileged database operations. The security migrations restrict backend-only `SECURITY DEFINER` RPCs to `service_role` and restore targeted table grants for authenticated client paths. The rollout must be followed by authenticated browser-read smoke tests and server-route RPC tests.

The current Production Security Advisor baseline includes:
- 7 `SECURITY DEFINER` functions executable by `anon`
- 10 `SECURITY DEFINER` functions executable by `authenticated`
- 1 mutable search-path warning for `public.handle_updated_at()`
- 5 informational RLS-enabled/no-policy findings on service-only tables
- Leaked-password protection disabled

The first three should be rechecked after the applicable hardening migrations. The 5 service-only RLS INFO findings are not automatically solved by adding broad policies; retain service-only grants. Leaked-password protection is a separate Auth Dashboard setting and is not changed by SQL migrations.

## 5. Required rollout sequence

1. Confirm the latest release branch head and all CI jobs are green.
2. Revalidate the most recent Production logical backup checksums and keep encrypted local/off-site copies. The 2026-11-01 backup restore rehearsal passed, but take a fresh export immediately before DDL.
3. Validate the updated opt-in scheduler migrations on a clean disposable database. Specifically prove that, with the setting absent, both migrations complete as no-ops and leave `pg_cron`/`pg_net` absent; with the setting absent, no cron job can be created.
4. Preview/smoke-test Worker version 16 without routing production traffic. Confirm the app loads, runtime environment validation succeeds, public pages work, and authenticated server routes can initialize without exposing secret values. Do not call `/api/cron/process-jobs` for this test.
5. Only after explicit release approval, create a gradual Worker deployment that includes version 16 at a small traffic percentage. Preserve versions 13 and 15 in the deployment so rollback is immediate. Monitor Worker errors, 5xx, auth, and Supabase logs before increasing the percentage.
6. After app/runtime compatibility is proven, apply the 10 migrations above sequentially to Production using the updated SQL, checking migration status and key object privileges after every migration. Stop on the first error; do not retry blindly.
7. Re-run Supabase Security Advisor, migration list, exact function grants, default privileges, table access, FK validation, active account/automation/queue counts, and browser/server regression tests.
8. Keep the PR Draft until review is complete. Do not merge or declare release-ready based only on the database migration success.

## 6. Rollback and stop conditions

- Worker rollback: restore the previous known-good deployment percentages/versions. Do not delete versions 13 or 15 while they remain the rollback baseline.
- If a preview fails, leave version 16 undeployed and investigate.
- If any migration fails or post-migration grants/tests differ from the reviewed expectations, stop the sequence. Do not apply subsequent migrations.
- Database DDL rollback must use reviewed reverse SQL; do not restore the entire Production database for a privilege/function migration failure.
- Never enable DB-side cron while the Cloudflare dispatcher is active. If scheduler ownership ever changes, first pause/verify the current dispatcher and handle outstanding requests/queues.
- Keep Production, Staging, and the existing local `main` worktree separate.

## 7. Current release decision

**Not approved for full production release yet.** The Production backup/restore rehearsal and latest release-head CI passed. A compatibility candidate exists but is not deployed. Production security migrations remain pending. The next gate is clean disposable validation of the updated optional-scheduler migrations and a non-traffic Worker preview; production migrations and traffic rollout require a separate explicit approval.
