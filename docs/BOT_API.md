# External bot transport API

The service transports messages between Instagram and external handlers. Each bot owns its logic, AI history and model/provider calls. One account has one current integration; an integration can serve multiple accounts. Integration counts are represented by database records rather than a hardcoded account limit.

## Register and bind

Management requests use `Authorization: Bearer <Supabase user access_token>` or an optional configured `adm_…` owner token. See [AGENT_API.md](AGENT_API.md) for headless instance management. API responses use `Cache-Control: no-store`.

```http
POST /api/v1/integrations
Content-Type: application/json
Authorization: Bearer <owner credential>

{"name":"My bot","webhook_url":"https://bot.example.com/events"}
```

The 201 response includes `id`, `token` and `webhook_secret`. Credentials are returned only at creation or rotation; the database stores a token hash and an encrypted signing secret.

```http
PUT /api/v1/accounts/<account UUID>/integration
Content-Type: application/json
Authorization: Bearer <owner credential>

{"integration_id":"<integration UUID>"}
```

The account UUID is the internal `id` from `GET /api/instagram/accounts`. `GET` on the binding path reads `account_id`, `integration_id`, `revision`; `DELETE` detaches it. Changes increment the binding revision. Old-revision events/replies cannot start delivery after a rebind; a request already in flight to Meta may finish.

| Method and path | Operation |
| --- | --- |
| `GET /api/v1/integrations?cursor=<UUID>` | List up to 50 owner integrations and `next_cursor` |
| `PATCH /api/v1/integrations/<id>` | Update `name`, `webhook_url`, `enabled` |
| `POST /api/v1/integrations/<id>/credentials` | Rotate both integration credentials |
| `PATCH /api/v1/conversations/<id>` | Set `{"paused":true}` or `{"paused":false}` |

Conversation pause or a disabled integration defers pending jobs, with another check after 60 seconds. The messaging window is checked again immediately before sending.

## Incoming event

The service sends `POST` to the bot's registered `webhook_url`:

```json
{
  "version": "1",
  "event_id": "<UUID>",
  "type": "message.received",
  "integration_id": "<UUID>",
  "account_id": "<UUID>",
  "conversation_id": "<UUID>",
  "message": {
    "id": "<same event UUID>",
    "external_id": "<Meta mid>",
    "text": "Hello"
  },
  "sender": { "external_id": "<Instagram scoped sender ID>" },
  "occurred_at": "2026-10-03T20:00:00+00:00"
}
```

Headers: `X-Bot-Event-Id`, `X-Bot-Timestamp` (Unix seconds), `X-Bot-Signature`. The signature is `sha256=` followed by the hex HMAC-SHA256 of `<timestamp>.<raw HTTP body>`, using `webhook_secret`. Verify the original bytes, a ±5 minute time window, and event-id deduplication.

Any HTTP 2xx acknowledges receipt. Retries preserve the event ID and body, with a fresh timestamp/signature. Delivery is at least once; the bot must deduplicate. There are at most 10 attempts, initially delayed by 5 seconds and then doubled up to one hour. Exhausted jobs remain `failed` in `bot_transport_jobs`; operator intervention is required to replay them. For slow AI generation, persist the event and promptly return 202, then submit the reply separately.

Bound accounts route text DMs and text Story replies to the bot. `SESSION_*` buttons continue existing automation sessions. Unbound accounts retain keyword automation handling, and comments retain their existing path. Echo, read/delivery, self-message and mismatched-recipient events are excluded. Attachments without text are not forwarded in this release.

## Outgoing reply

```http
POST /api/v1/messages
Authorization: Bearer <integration token>
Idempotency-Key: answer:<event UUID>:1
Content-Type: application/json

{"conversation_id":"<UUID>","in_reply_to_event_id":"<event UUID>","text":"Hey!"}
```

A 202 response contains `message_id`, `conversation_id`, `status`, `external_id`, `error_code`. Text length is 1–1000 characters; request bodies are limited to 8 KiB. `in_reply_to_event_id` is required and must belong to the conversation and current binding. The server resolves account and recipient. An integration can access only its own messages and bound conversations.

The same idempotency key and request body return the existing message; changed text/conversation/event with the same key returns 409. Keys are 1–128 characters, from letters, digits, `_ . : -`, and unique within the integration. Preserve the key when retrying. Multiple replies to one event use separate keys.

`GET /api/v1/messages/<message_id>` with the integration credential returns delivery state:

- `queued`: waiting for a send.
- `sending`: the Meta request has started.
- `sent`: Meta returned a message ID.
- `failed`: confirmed rejection, closed messaging window or changed binding.
- `delivery_unknown`: the request may have succeeded without confirmation. Automatic resending is stopped; inspect the actual conversation before deciding to send again.

Bot APIs use 401 for invalid credentials, 404 for inaccessible resources, 409 for conflict/pause/closed window, 413/415 for body size/format, and 503 for temporary database unavailability. Invalid Meta webhook signatures return 403.

## Client and delivery behavior

`npm run bot:example` runs an external signed echo handler at `127.0.0.1:8788/events`. Configure `TRANSPORT_API_URL`, `BOT_TOKEN`, `BOT_WEBHOOK_SECRET` and optionally `BOT_PORT`. Replace reply generation in `scripts/echo-bot.ts` with the desired AI backend. Provider keys belong to that external backend.

Bot endpoints must use HTTPS and resolve to public addresses. DNS is checked during registration and each delivery, and the validated IP is pinned to the connection. Redirects are not followed. Explicit `BOT_WEBHOOK_ALLOWED_HOSTS` entries permit trusted internal endpoints, including HTTP. For the local example allow `127.0.0.1`; in Docker use the trusted bot container's DNS name.

Bot and Meta requests have 10 second timeouts. The transport queue runs independently of existing automation jobs. Jobs of one direction in a conversation are serial. Fair claims limit each integration's share of a batch; multiple workers coordinate through atomic claims and fenced lease tokens.

Meta webhook receipt commits the raw payload and routing job before acknowledging 200. Completed raw events are retained for 7 days, terminal jobs/messages/idempotency records for 30 days. AI history belongs to the external bot. Backups and failed/unknown-delivery monitoring remain operator responsibilities. See [DEPLOYMENT.md](DEPLOYMENT.md) for runtime and verification details.
