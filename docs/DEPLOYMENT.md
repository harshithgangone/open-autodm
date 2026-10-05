# VPS deployment

The deployment consists of a Next.js app and a persistent worker, with PostgreSQL and authentication in hosted Supabase. The transport and existing automation loops run independently. Hourly maintenance refreshes Instagram tokens and removes old records.

## Database

For a fresh project, put a PostgreSQL connection URI from Supabase **Connect → Session pooler** in your local `.env.local` as `DATABASE_URL`. URL-encode special characters in the database password. Install Node.js 24 and run:

```sh
npm ci
npm run migrate
```

The migration runner applies all SQL files in filename order, uses verified TLS with the official public Supabase CA in `supabase/certs/prod-ca-2021.crt`, and records versions and SHA-256 checksums in `open_autodm_migrations`. Repeated runs skip applied files. `DATABASE_SSL_CA` can specify a different CA file. A database whose original migrations were applied manually should apply only `20261003000001_bot_transport.sql` through SQL Editor; the runner expects its own migration tracking from a fresh installation.

The transport migration also revokes default PUBLIC execution privileges on existing engine/contact RPCs; the service-role client retains access. Browser access to the new transport tables is denied. Management and bot API requests enforce ownership before using the service client.

## Runtime configuration

Copy `.env.example` to `.env.local` and fill the configuration. Modern key names are `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`; the application also accepts the upstream legacy aliases. Set `APP_OWNER_EMAILS` to the existing Supabase Auth owner's email. The panel uses email/password sign-in; create that user through Supabase Auth.

Generate `TOKEN_ENCRYPTION_KEY` and `CRON_SECRET` once. Keep the encryption key with configuration backups; changing it prevents reading existing Instagram tokens and integration signing secrets. `.env.local` is excluded from Git and the Docker build context. `DATABASE_URL` is required only by the migration machine; omit it from the server app/worker environment.

Set `NEXT_PUBLIC_APP_URL` to the final HTTPS origin before building. The Supabase project URL and publishable key are embedded in browser assets; the secret key is runtime-only.

```sh
docker compose --env-file .env.local build app
docker compose --env-file .env.local up -d --wait
```

The app binds to `127.0.0.1:3018`; configure an HTTPS reverse proxy in front of it. Memory limits are 768 MiB for the app and 384 MiB for the worker, with one CPU each. These are limits rather than traffic-capacity estimates. Check actual memory, queue age and database load under the intended message volume. Container logs rotate at three 10 MiB files per service.

For an existing Caddy Docker network, set `CADDY_NETWORK` to its name and use the override:

```sh
docker compose --env-file .env.local -f compose.yaml -f compose.production.yaml up -d --wait
```

Only the app joins that network, under the alias `open-autodm-app`. The default external network name is `caddy`. Example proxy configuration:

```caddyfile
autodm.example.com {
    encode zstd gzip
    reverse_proxy open-autodm-app:3000
}
```

Back up and validate the candidate Caddy configuration before a graceful reload. Choose the reload method supported by the installed Caddy configuration. File bind mounts require preserving the mounted file inode when updating its contents.

## Headless access

Optionally configure `OWNER_API_TOKEN_HASH` (SHA-256 of a complete `adm_…` management token) and `OWNER_API_USER_ID` (an existing Supabase Auth owner's UUID). The server verifies the current owner and email allowlist. Only the caller stores the raw token. Runtime configuration changes require recreating the containers. See [AGENT_API.md](AGENT_API.md) for authentication and instance/account/integration operations without panel sign-in.

## Instagram pilot

1. Configure the Meta app through the existing setup UI or `/api/setup`.
2. Register the returned callback URL, webhook URL and verification token with Meta.
3. Obtain the OAuth URL through `/api/instagram/connect`, or use the existing connection UI. The account owner grants consent with Meta.
4. Confirm the Professional Instagram account appears in `/api/instagram/accounts`.
5. Register an external bot integration and bind the account UUID to it.
6. Test a real incoming DM, signed bot event, queued reply and confirmed delivery before connecting more accounts.

The persistent worker handles background processing; an additional Supabase cron schedule is unnecessary for this VPS stack. Meta permissions, app mode and live delivery require a real-account pilot. Tests using simulated Meta do not validate those prerequisites. This transport's Docker/Node.js path is tested; Vercel and Cloudflare behavior for the new transport has not been validated.

## Health, retention and checks

`GET /api/health` returns 200 when the database and transport schema are reachable, otherwise 503. Check the worker separately: it must remain running, processing jobs must finish, and due pending jobs must progress. The app health endpoint does not prove worker progress or Meta delivery.

Completed raw webhooks are retained for 7 days; terminal transport jobs, messages and idempotency records for 30 days. External bots maintain their AI conversation history. Plan database backups, encryption-key recovery and monitoring for failed jobs and `delivery_unknown`. Supabase project suspension makes health unavailable; persisted pending work remains in the database.

Checks: `npm test`, `npm run test:integration`, `npm run typecheck`, `npm run build`, `npm audit`. Integration tests use a disposable PostgreSQL instance and simulated Auth/REST and Meta endpoints, with real production route/store code and real SQL. Set `TEST_PG_BIN` if PostgreSQL binaries are not in `/opt/homebrew/opt/postgresql@16/bin`. CI uses PostgreSQL 16 on Ubuntu and Node.js 24. The 100-integration fairness test validates routing/queue behavior; it is not a production load benchmark.
