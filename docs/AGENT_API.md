# Headless management API

An HTTP client or AI agent can configure the instance and manage Instagram-to-bot routing without signing into the web panel. The external bot owns its model, prompt and conversation memory.

## Authentication

Send the owner's management credential as `Authorization: Bearer adm_<64 hex characters>` on every management request. The credential belongs to one existing Supabase Auth user; normal ownership checks and `APP_OWNER_EMAILS` still apply. A deleted or disallowed owner cannot use it. This optional credential is disabled unless both deployment settings are configured:

- `OWNER_API_TOKEN_HASH`: SHA-256 hex digest of the complete `adm_…` token.
- `OWNER_API_USER_ID`: existing owner's Supabase Auth UUID.

Generate 32 cryptographically random bytes for a new token. Keep the raw token in the caller's credential store. Set only its hash and the owner UUID in the server runtime environment, then recreate the containers. Replacing the hash revokes the previous credential; clearing the settings disables it. The credential has no automatic expiry. Supabase user session JWTs remain supported.

Management credentials and integration credentials have distinct permissions. An integration's `bot_…` token can submit replies and read its own delivery states. It cannot manage the instance. The management token cannot submit replies as an integration. Never place the management token in the bot's incoming webhook payload, URLs or public configuration.

## Manage the instance

All paths below are relative to the instance HTTPS base URL. JSON requests use `Content-Type: application/json`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/health` | Public database/schema health: 200 or 503 |
| `GET /api/setup` | Current Meta setup status and exact callback/webhook values |
| `POST /api/setup` | Save `metaAppId`, `metaAppSecret`, optional `metaFbAppSecret` |
| `GET /api/instagram/accounts` | Connected accounts and token/pause status; response `{accounts:[…]}` |
| `GET /api/instagram/connect` | Generate a signed Instagram OAuth URL; response `{url:"…"}` |
| `GET /api/instagram/subscription-status/{accountId}` | Check the account's Meta webhook subscriptions |
| `POST /api/instagram/resubscribe/{accountId}` | Renew webhook subscriptions |
| `POST /api/instagram/refresh/{accountId}` | Refresh a still-valid Instagram token |
| `DELETE /api/instagram/disconnect/{accountId}` | Remove an account and its dependent records |
| `GET /api/contacts?accountId={UUID}` | Captured audience contacts |
| `GET /api/analytics?accountId={UUID}&from=YYYY-MM-DD&to=YYYY-MM-DD` | Automation analytics |
| `GET /api/debug/events` | Recent processing events |

`accountId` is the internal UUID returned by `/api/instagram/accounts`, not the Instagram numeric ID. Meta app creation, required permissions and first account consent take place with Meta. The API generates the authorization link; the account owner opens it and grants access. Account connection completes at the signed callback, independently of a panel login. An expired or revoked Instagram token requires renewed authorization. The existing callback returns to `/settings` after completing the connection; the agent checks completion through `/api/instagram/accounts`.

Example Meta configuration:

```json
{"metaAppId":"123456789012345","metaAppSecret":"<32 hex characters>"}
```

The setup response provides `webhookUrl`, `webhookVerifyToken` and `oauthRedirectUri` for Meta configuration. A VPS worker already handles background processing; deployments using that worker do not need the wizard's optional Supabase cron schedule.

## Register and connect an external bot

1. Deploy or select the bot's HTTPS webhook endpoint.
2. `POST /api/v1/integrations` with `{"name":"My bot","webhook_url":"https://bot.example.com/events"}`.
3. Save the returned `id`, `token` and `webhook_secret` in the external bot's credential store. Secrets are returned only at creation or rotation.
4. Find the desired Instagram account UUID through `/api/instagram/accounts`.
5. `PUT /api/v1/accounts/{accountId}/integration` with `{"integration_id":"<integration UUID>"}`.
6. Check the binding with `GET` on the same path; it returns `account_id`, `integration_id`, `revision`. A never-bound account returns `integration_id:null, revision:0`.
7. Send a real incoming DM. Verify the bot receives a signed event and its reply reaches `sent` using the integration API.

One integration can serve multiple Instagram accounts. An account has at most one current integration. Adding more bots requires API records and bindings.

| Method and path | Purpose |
| --- | --- |
| `GET /api/v1/integrations?cursor={UUID}` | List integrations; response `{data:[…],next_cursor:…}` |
| `PATCH /api/v1/integrations/{id}` | Change `name`, `webhook_url` or `enabled` |
| `POST /api/v1/integrations/{id}/credentials` | Rotate the integration's token and signing secret |
| `DELETE /api/v1/accounts/{accountId}/integration` | Detach a bot while preserving the Instagram account |
| `PATCH /api/v1/conversations/{id}` | Set `{"paused":true}` or `{"paused":false}` |

The signed event, asynchronous reply API, idempotency and delivery states are documented in [BOT_API.md](BOT_API.md). This release transports text DMs and text story replies. Model selection, prompts, debounce and AI history are configured in the external bot. The core service has no API for those external settings.

## Minimal client

Provide the secret through the agent's credential store/environment, then call the API:

```sh
curl --fail-with-body "$AUTODM_URL/api/instagram/accounts" \
  -H "Authorization: Bearer $OWNER_API_TOKEN"
```

Read the current state before changing a binding. Store returned integration secrets before completing setup. Reuse the same `Idempotency-Key` when retrying an outgoing reply. Treat `202 queued` as acceptance into the queue; check its state to confirm delivery. A `delivery_unknown` result requires inspecting the actual conversation before another send.
