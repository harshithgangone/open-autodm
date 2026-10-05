import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { databaseFixture, restFixture, listen, body, json } from "./fixture";
import { encrypt, hmacSha256Hex } from "../src/lib/crypto";
import {
  transportStore,
  type TransportJob,
  type TransportMessage,
} from "../src/lib/transport/store";
import {
  drainTransport,
  type TransportPorts,
} from "../src/lib/transport/worker";
import { deliverWebhook } from "../src/lib/transport/http";
import { MetaRejected } from "../src/lib/transport/meta";
import {
  createIntegration,
  listIntegrations,
  bindAccount,
  getAccountIntegration,
  pauseConversation,
  sendMessage,
  getMessage,
  rotateCredentials,
  hash,
} from "../src/lib/transport/api";
import { persistWebhook, receiveWebhook } from "../src/lib/transport/inbox";
import { processWebhookPayload } from "../src/lib/automation/processWebhook";
import type { MetaWebhookBody } from "../src/lib/types";

let db: Awaited<ReturnType<typeof databaseFixture>>;
let rest: Server;
let api: string;
const owner = randomUUID(),
  other = randomUUID(),
  key = "ab".repeat(32),
  secret = "fixture-signing-secret";
const auth = "fixture-owner-token",
  token = `bot_${"a".repeat(64)}`;
let account: string, integration: string, conversation: string, event: string;
const req = (
  method: string,
  path: string,
  value?: unknown,
  bearer = auth,
  idem?: string,
) =>
  new Request(`${api}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
      ...(idem ? { "Idempotency-Key": idem } : {}),
    },
    ...(value ? { body: JSON.stringify(value) } : {}),
  });
const ports = (overrides: Partial<TransportPorts> = {}): TransportPorts => ({
  encryptionKey: key,
  routeWebhook: async (b) => processWebhookPayload(b as MetaWebhookBody),
  deliver: async () => {},
  send: async () => randomUUID(),
  ...overrides,
});
const queue = (
  idempotency = "reply",
  text = "Hello",
  i = integration,
  e = event,
  c = conversation,
) =>
  db.store.rpc<TransportMessage>("transport_queue_reply", {
    p_integration: i,
    p_conversation: c,
    p_event: e,
    p_text: text,
    p_key: idempotency,
    p_hash: hash(JSON.stringify({ c, e, text })),
  });
async function inbound(mid = "mid-1", sender = "fan-1", time = new Date()) {
  await db.store.rpc("transport_ingest_dm", {
    p_account: account,
    p_sender: sender,
    p_mid: mid,
    p_text: "Hi",
    p_occurred: time.toISOString(),
  });
  const m = (
    await db.pool.query(
      "SELECT * FROM bot_messages WHERE direction='inbound' AND external_id=$1",
      [mid],
    )
  ).rows[0];
  conversation = m.conversation_id;
  event = m.id;
  return m;
}
before(async () => {
  db = await databaseFixture();
  await db.pool.query("INSERT INTO auth.users(id) VALUES($1),($2)", [
    owner,
    other,
  ]);
  rest = restFixture(db.pool, db.store, {
    [`Bearer ${auth}`]: owner,
    "Bearer other-owner": other,
  });
  api = await listen(rest);
  process.env.NEXT_PUBLIC_SUPABASE_URL = api;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
    "fixture-publishable-key-at-least-20";
  process.env.SUPABASE_SECRET_KEY = "fixture-secret-key-at-least-20-characters";
  process.env.TOKEN_ENCRYPTION_KEY = key;
  process.env.CRON_SECRET = "fixture-cron-secret-20";
  process.env.BOT_WEBHOOK_ALLOWED_HOSTS = "127.0.0.1";
});
after(async () => {
  rest?.closeAllConnections();
  if (rest) await new Promise<void>((r) => rest.close(() => r()));
  await db?.close();
});
beforeEach(async () => {
  await db.pool.query(
    "TRUNCATE bot_transport_jobs,webhook_events,bot_messages,bot_conversations,account_bot_bindings,bot_integrations,instagram_accounts CASCADE",
  );
  account = randomUUID();
  integration = randomUUID();
  await db.pool.query(
    "INSERT INTO instagram_accounts(id,user_id,instagram_user_id,username,access_token_encrypted) VALUES($1,$2,$3,$4,$5)",
    [account, owner, "ig-1", "fixture", encrypt("fake-meta-token", key)],
  );
  await db.pool.query(
    "INSERT INTO bot_integrations(id,user_id,name,webhook_url,token_hash,signing_secret_encrypted) VALUES($1,$2,$3,$4,$5,$6)",
    [
      integration,
      owner,
      "fixture",
      `${api}/events`,
      hash(token),
      encrypt(secret, key),
    ],
  );
  await db.store.rpc("transport_bind", {
    p_user: owner,
    p_account: account,
    p_integration: integration,
  });
});

test("real API registers scoped credentials and enforces owner/token isolation", async () => {
  const response = await createIntegration(
    req("POST", "/integrations", {
      name: "External bot",
      webhook_url: `${api}/events`,
    }),
  );
  assert.equal(response.status, 201);
  const data = await response.json();
  assert.match(data.token, /^bot_/);
  assert.ok(data.webhook_secret);
  const stored = (
    await db.pool.query("SELECT * FROM bot_integrations WHERE id=$1", [data.id])
  ).rows[0];
  assert.notEqual(stored.token_hash, data.token);
  assert.notEqual(stored.signing_secret_encrypted, data.webhook_secret);
  const listing = await (
    await listIntegrations(req("GET", "/integrations"))
  ).json();
  assert.equal(listing.data.length, 2);
  assert.equal(JSON.stringify(listing).includes(data.token), false);
  assert.equal(JSON.stringify(listing).includes("signing_secret"), false);
  assert.equal(
    (
      await bindAccount(account)(
        req("PUT", "/bind", { integration_id: integration }, "other-owner"),
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await sendMessage(
        req(
          "POST",
          "/messages",
          {
            conversation_id: randomUUID(),
            in_reply_to_event_id: randomUUID(),
            text: "Hi",
          },
          "invalid",
          "x",
        ),
      )
    ).status,
    401,
  );
  await inbound();
  const r = await sendMessage(
    req(
      "POST",
      "/messages",
      {
        conversation_id: conversation,
        in_reply_to_event_id: event,
        text: "Hi",
      },
      token,
      "x",
    ),
  );
  assert.equal(r.status, 202);
  const m = await r.json();
  assert.equal(
    (
      await getMessage(m.message_id)(
        req("GET", "/messages", undefined, `bot_${"b".repeat(64)}`),
      )
    ).status,
    401,
  );
  const rotate = await rotateCredentials(integration)(
    req("POST", "/credentials"),
  );
  assert.equal(rotate.status, 200);
  assert.equal(
    (await getMessage(m.message_id)(req("GET", "/messages", undefined, token)))
      .status,
    401,
  );
});

test("headless owner credential preserves ownership and rejects disallowed or deleted owners", async () => {
  const token = `adm_${"c".repeat(64)}`;
  const previous = {
    hash: process.env.OWNER_API_TOKEN_HASH,
    user: process.env.OWNER_API_USER_ID,
    emails: process.env.APP_OWNER_EMAILS,
  };
  try {
    process.env.OWNER_API_TOKEN_HASH = hash(token);
    process.env.OWNER_API_USER_ID = owner;
    process.env.APP_OWNER_EMAILS = "fixture@example.invalid";
    const response = await createIntegration(req("POST", "/integrations", {
      name: "Headless agent", webhook_url: `${api}/events`,
    }, token));
    assert.equal(response.status, 201);
    const created = await response.json();
    const row = (await db.pool.query("SELECT user_id FROM bot_integrations WHERE id=$1", [created.id])).rows[0];
    assert.equal(row.user_id, owner);
    assert.equal((await listIntegrations(req("GET", "/integrations", undefined, `adm_${"d".repeat(64)}`))).status, 401);
    assert.equal((await bindAccount(account)(req("PUT", "/bind", {integration_id: integration}, token))).status, 200);
    const binding = await getAccountIntegration(account)(req("GET", "/bind", undefined, token));
    assert.equal(binding.status, 200);
    assert.equal((await binding.json()).integration_id, integration);
    process.env.OWNER_API_USER_ID = other;
    assert.equal((await bindAccount(account)(req("PUT", "/bind", {integration_id: integration}, token))).status, 404);
    assert.equal((await getAccountIntegration(account)(req("GET", "/bind", undefined, token))).status, 404);
    process.env.OWNER_API_USER_ID = owner;
    await db.pool.query("DELETE FROM account_bot_bindings WHERE account_id=$1", [account]);
    const detached = await getAccountIntegration(account)(req("GET", "/bind", undefined, token));
    assert.deepEqual(await detached.json(), { account_id: account, integration_id: null, revision: 0 });
    process.env.APP_OWNER_EMAILS = "different@example.invalid";
    assert.equal((await listIntegrations(req("GET", "/integrations", undefined, token))).status, 401);
    process.env.APP_OWNER_EMAILS = "fixture@example.invalid";
    process.env.OWNER_API_USER_ID = randomUUID();
    assert.equal((await listIntegrations(req("GET", "/integrations", undefined, token))).status, 401);
    // The management credential is not an integration's outgoing-message credential.
    assert.equal((await sendMessage(req("POST", "/messages", {}, token, "x"))).status, 401);
  } finally {
    for (const [key, value] of Object.entries({
      OWNER_API_TOKEN_HASH: previous.hash,
      OWNER_API_USER_ID: previous.user,
      APP_OWNER_EMAILS: previous.emails,
    })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("complete durable inbox → production routing → signed HTTP bot → reply API → fake Meta exchange", async () => {
  let hits = 0;
  let outgoing: string | null = null;
  const seenEvents: string[] = [];
  const bot = createServer(async (r, res) => {
    try {
      const raw = await body(r);
      const timestamp = String(r.headers["x-bot-timestamp"]);
      assert.equal(
        r.headers["x-bot-signature"],
        `sha256=${hmacSha256Hex(secret, `${timestamp}.${raw}`)}`,
      );
      const e = JSON.parse(raw);
      seenEvents.push(e.event_id);
      const reply = await sendMessage(
        req(
          "POST",
          "/messages",
          {
            conversation_id: e.conversation_id,
            in_reply_to_event_id: e.event_id,
            text: "Echo: " + e.message.text,
          },
          token,
          `echo:${e.event_id}`,
        ),
      );
      assert.equal(reply.status, 202);
      outgoing = (await reply.json()).message_id;
      res.writeHead(202).end();
    } catch {
      res.writeHead(503).end();
    }
  });
  const endpoint = await listen(bot);
  const meta = createServer(async (r, res) => {
    const data = JSON.parse(await body(r));
    assert.equal(data.account, "ig-1");
    assert.equal(data.recipient, "fan-1");
    assert.equal(data.text, "Echo: Hi");
    hits++;
    json(res, { message_id: "meta-result-1" });
  });
  const metaURL = await listen(meta);
  try {
    await db.pool.query(
      "UPDATE bot_integrations SET webhook_url=$1 WHERE id=$2",
      [endpoint, integration],
    );
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "ig-1",
          time: Math.floor(Date.now() / 1000),
          messaging: [
            {
              sender: { id: "fan-1" },
              recipient: { id: "ig-1" },
              timestamp: Date.now(),
              message: { mid: "meta-incoming-1", text: "Hi" },
            },
          ],
        },
      ],
    };
    const raw = JSON.stringify(payload);
    const ids = await Promise.all([persistWebhook(raw), persistWebhook(raw)]);
    assert.equal(ids[0], ids[1]);
    const p = ports({
      deliver: deliverWebhook,
      send: async (account, recipient, text) => {
        const r = await fetch(metaURL, {
          method: "POST",
          body: JSON.stringify({ account, recipient, text }),
        });
        return (await r.json()).message_id;
      },
    });
    await drainTransport(transportStore, p);
    await drainTransport(transportStore, p);
    await drainTransport(transportStore, p);
    assert.equal(hits, 1);
    assert.equal(seenEvents.length, 1);
    assert.ok(outgoing);
    const status = await (
      await getMessage(outgoing!)(req("GET", "/messages", undefined, token))
    ).json();
    assert.equal(status.status, "sent");
    assert.equal(status.external_id, "meta-result-1");
    // A different webhook envelope with the same mid also cannot duplicate the reply.
    payload.entry[0]!.time++;
    await persistWebhook(JSON.stringify(payload));
    await drainTransport(transportStore, p);
    await drainTransport(transportStore, p);
    assert.equal(hits, 1);
  } finally {
    bot.closeAllConnections();
    meta.closeAllConnections();
    await Promise.all([
      new Promise<void>((r) => bot.close(() => r())),
      new Promise<void>((r) => meta.close(() => r())),
    ]);
  }
});

test("concurrent idempotency, conflicting bodies and integration isolation", async () => {
  await inbound();
  const replies = await Promise.all(Array.from({ length: 15 }, () => queue()));
  assert.equal(new Set(replies.map((r) => r.id)).size, 1);
  await assert.rejects(queue("reply", "Different"), /idempotency_conflict/);
  await assert.rejects(queue("x", "Hello", randomUUID()), /not_found/);
  await assert.rejects(
    queue("x", "Hello", integration, randomUUID()),
    /not_found/,
  );
});

test("paused conversation, closed window, rebind and disabled integration block delivery", async () => {
  await inbound();
  await drainTransport(db.store, ports());
  assert.equal(
    (
      await pauseConversation(conversation)(
        req("PATCH", "/conversations", { paused: true }),
      )
    ).status,
    200,
  );
  await assert.rejects(queue(), /conversation_paused/);
  await db.pool.query(
    "UPDATE bot_conversations SET paused=false,last_inbound_at=now()-interval '25 hours'",
  );
  await assert.rejects(queue(), /window_closed/);
  await db.pool.query("UPDATE bot_conversations SET last_inbound_at=now()");
  const m = await queue();
  await db.store.rpc("transport_bind", {
    p_user: owner,
    p_account: account,
    p_integration: null,
  });
  let sends = 0;
  await drainTransport(
    db.store,
    ports({
      send: async () => {
        sends++;
        return "x";
      },
    }),
  );
  assert.equal(sends, 0);
  assert.equal(
    (
      await db.pool.query(
        "SELECT status,error_code FROM bot_messages WHERE id=$1",
        [m.id],
      )
    ).rows[0].error_code,
    "binding_changed",
  );
  await db.store.rpc("transport_bind", {
    p_user: owner,
    p_account: account,
    p_integration: integration,
  });
  await assert.rejects(queue("old-event"), /not_found/);
  await inbound("new-mid");
  await db.pool.query("UPDATE bot_integrations SET enabled=false");
  await assert.rejects(queue("disabled"), /not_found/);
});

test("multi-worker claims preserve one in-flight job per conversation and stale completion is fenced", async () => {
  await inbound();
  await drainTransport(db.store, ports());
  await queue("one");
  await queue("two");
  const claimed = await Promise.all([
    db.store.rpc<TransportJob[]>("transport_claim", { p_limit: 16 }),
    db.store.rpc<TransportJob[]>("transport_claim", { p_limit: 16 }),
  ]);
  const sends = claimed.flat().filter((j) => j.kind === "send");
  assert.equal(sends.length, 1);
  const j = sends[0]!;
  assert.equal(
    await db.store.rpc("transport_finish", {
      p_job: j.id,
      p_token: randomUUID(),
      p_state: "done",
    }),
    false,
  );
  await db.store.rpc("transport_finish", {
    p_job: j.id,
    p_token: j.claim_token,
    p_state: "done",
    p_external: "first",
  });
  const second = await db.store.rpc<TransportJob[]>("transport_claim", {
    p_limit: 16,
  });
  assert.equal(second.filter((j) => j.kind === "send").length, 1);
});

test("crash after send starts and network timeout become delivery_unknown without resend", async () => {
  await inbound();
  await drainTransport(db.store, ports());
  const m = await queue();
  const jobs = await db.store.rpc<TransportJob[]>("transport_claim", {
    p_limit: 16,
  });
  const send = jobs.find((j) => j.kind === "send")!;
  await db.store.rpc("transport_context", {
    p_job: send.id,
    p_token: send.claim_token,
  });
  await db.pool.query(
    "UPDATE bot_transport_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",
    [send.id],
  );
  let sends = 0;
  await drainTransport(
    db.store,
    ports({
      send: async () => {
        sends++;
        return "x";
      },
    }),
  );
  assert.equal(sends, 0);
  assert.equal(
    (await db.pool.query("SELECT status FROM bot_messages WHERE id=$1", [m.id]))
      .rows[0].status,
    "delivery_unknown",
  );
  const m2 = await queue("timeout");
  await drainTransport(
    db.store,
    ports({
      send: async () => {
        sends++;
        throw new Error("timeout");
      },
    }),
  );
  assert.equal(
    (
      await db.pool.query("SELECT status FROM bot_messages WHERE id=$1", [
        m2.id,
      ])
    ).rows[0].status,
    "delivery_unknown",
  );
  await drainTransport(
    db.store,
    ports({
      send: async () => {
        sends++;
        return "x";
      },
    }),
  );
  assert.equal(sends, 1);
});

test("rate limiter fails closed, pauses are deferred and known Meta rejections retry safely", async () => {
  await inbound();
  const m = await queue();
  await db.pool.query(
    "INSERT INTO dm_rate_events(instagram_account_id) SELECT $1 FROM generate_series(1,180)",
    [account],
  );
  let sends = 0;
  await drainTransport(
    db.store,
    ports({
      send: async () => {
        sends++;
        return "x";
      },
    }),
  );
  assert.equal(sends, 0);
  assert.equal(
    (await db.pool.query("SELECT status FROM bot_messages WHERE id=$1", [m.id]))
      .rows[0].status,
    "queued",
  );
  await db.pool.query("TRUNCATE dm_rate_events");
  await db.pool.query(
    "UPDATE bot_transport_jobs SET run_after=now(); UPDATE instagram_accounts SET paused_until=now()+interval '1 hour'",
  );
  await drainTransport(
    db.store,
    ports({
      send: async () => {
        sends++;
        return "x";
      },
    }),
  );
  assert.equal(sends, 0);
  await db.pool.query(
    "UPDATE instagram_accounts SET paused_until=NULL; UPDATE bot_transport_jobs SET run_after=now()",
  );
  await drainTransport(
    db.store,
    ports({
      send: async () => {
        sends++;
        throw new MetaRejected(4, true);
      },
    }),
  );
  assert.equal(sends, 1);
  assert.equal(
    (await db.pool.query("SELECT status FROM bot_messages WHERE id=$1", [m.id]))
      .rows[0].status,
    "queued",
  );
});

test("100 integrations progress fairly; a busy integration cannot occupy every claim", async () => {
  await db.pool.query(
    "TRUNCATE bot_transport_jobs,bot_messages,bot_conversations,account_bot_bindings,bot_integrations,instagram_accounts CASCADE",
  );
  for (let n = 0; n < 100; n++) {
    account = randomUUID();
    integration = randomUUID();
    await db.pool.query(
      "INSERT INTO instagram_accounts(id,user_id,instagram_user_id,username,access_token_encrypted) VALUES($1,$2,$3,$3,$4)",
      [account, owner, `ig-${n}`, encrypt("fake", key)],
    );
    await db.pool.query(
      "INSERT INTO bot_integrations(id,user_id,name,webhook_url,token_hash,signing_secret_encrypted) VALUES($1,$2,$3,$4,$5,$6)",
      [
        integration,
        owner,
        `bot-${n}`,
        api,
        hash(randomUUID()),
        encrypt(secret, key),
      ],
    );
    await db.store.rpc("transport_bind", {
      p_user: owner,
      p_account: account,
      p_integration: integration,
    });
    for (let k = 0; k < (n === 0 ? 50 : 1); k++)
      await inbound(`mid-${n}-${k}`, `fan-${k}`);
  }
  const seen = new Set<string>();
  let batches = 0;
  while (seen.size < 100 && batches < 10) {
    const jobs = await db.store.rpc<
      (TransportJob & { integration_id: string })[]
    >("transport_claim", { p_limit: 16 });
    batches++;
    assert.equal(new Set(jobs.map((j) => j.integration_id)).size, jobs.length);
    for (const j of jobs) {
      seen.add(j.integration_id);
      await db.store.rpc("transport_finish", {
        p_job: j.id,
        p_token: j.claim_token,
        p_state: "done",
      });
    }
  }
  assert.equal(seen.size, 100);
  assert.ok(batches <= 7);
});

test("anonymous users cannot read credentials or invoke transport RPCs", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("SET ROLE anon");
    await assert.rejects(
      client.query("SELECT token_hash FROM bot_integrations"),
      /permission denied/,
    );
    await assert.rejects(
      client.query("SELECT transport_claim(1)"),
      /permission denied/,
    );
  } finally {
    await client.query("RESET ROLE");
    client.release();
  }
});

test("Meta acknowledgement requires a committed inbox and rejects failed persistence", async () => {
  const raw = JSON.stringify({
    object: "instagram",
    entry: [{ id: "ig-1", time: 1 }],
  });
  const request = () =>
    new Request(`${api}/api/webhook`, {
      method: "POST",
      body: raw,
      headers: {
        "x-hub-signature-256": `sha256=${hmacSha256Hex(secret, raw)}`,
      },
    });
  assert.equal((await receiveWebhook(request(), [secret])).status, 200);
  assert.equal(
    (
      await db.pool.query(
        "SELECT count(*)::int n FROM bot_transport_jobs WHERE kind='webhook'",
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await receiveWebhook(request(), [secret], async () => {
        throw new Error("database unavailable");
      })
    ).status,
    503,
  );
  assert.equal((await receiveWebhook(request(), ["wrong"])).status, 403);
});
