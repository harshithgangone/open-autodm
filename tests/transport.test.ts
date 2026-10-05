import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { ownerIdForApiToken } from "../src/lib/ownerApiToken";
import {
  publicAddress,
  resolveEndpoint,
  deliverWebhook,
} from "../src/lib/transport/http";
import { readBody, replySchema } from "../src/lib/transport/api";
import { webhookSchema } from "../src/lib/transport/inbox";
import { listen } from "./fixture";

test("internal, mapped, multicast and reserved addresses are blocked", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "192.168.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("8.8.8.8"), true);
  assert.equal(publicAddress("2606:4700:4700::1111"), true);
});
test("endpoint policy rejects private HTTPS, HTTP, credentials and fragments", async () => {
  delete process.env.BOT_WEBHOOK_ALLOWED_HOSTS;
  for (const url of [
    "https://127.0.0.1/",
    "http://8.8.8.8/",
    "https://user:pass@example.com/",
    "https://example.com/#x",
  ])
    await assert.rejects(resolveEndpoint(url));
});
test("webhook client does not follow redirects to a private target", async () => {
  process.env.BOT_WEBHOOK_ALLOWED_HOSTS = "127.0.0.1";
  let targetHits = 0;
  const target = createServer((_req, res) => {
    targetHits++;
    res.end();
  });
  const to = await listen(target);
  const redirect = createServer((_req, res) =>
    res.writeHead(302, { Location: to }).end(),
  );
  const from = await listen(redirect);
  try {
    await assert.rejects(deliverWebhook(from, "{}", {}), /bot_http_302/);
    assert.equal(targetHits, 0);
  } finally {
    redirect.closeAllConnections();
    target.closeAllConnections();
    await Promise.all([
      new Promise<void>((r) => redirect.close(() => r())),
      new Promise<void>((r) => target.close(() => r())),
    ]);
    delete process.env.BOT_WEBHOOK_ALLOWED_HOSTS;
  }
});
test("API request size and causal reply schema", async () => {
  await assert.rejects(
    readBody(
      new Request("http://api", { method: "POST", body: "x".repeat(8193) }),
    ),
    /body_too_large/,
  );
  assert.equal(
    replySchema.safeParse({ conversation_id: "x", text: "hello" }).success,
    false,
  );
  assert.equal(
    webhookSchema.safeParse({
      object: "instagram",
      entry: [
        {
          id: "x",
          time: 1,
          messaging: [
            {
              sender: { id: "u" },
              recipient: { id: "x" },
              timestamp: 1,
              message: { mid: "m", text: "Hi" },
            },
          ],
        },
      ],
    }).success,
    true,
  );
});

test("configured panel owners are enforced independently of integration tokens", async () => {
  const { isOwnerAllowed } = await import("../src/lib/access");
  const prior = process.env.APP_OWNER_EMAILS;
  try {
    process.env.APP_OWNER_EMAILS = "owner@example.com, Second@example.com";
    assert.equal(isOwnerAllowed("OWNER@example.com"), true);
    assert.equal(isOwnerAllowed("second@example.com"), true);
    assert.equal(isOwnerAllowed("stranger@example.com"), false);
    assert.equal(isOwnerAllowed(undefined), false);
  } finally {
    if (prior === undefined) delete process.env.APP_OWNER_EMAILS;
    else process.env.APP_OWNER_EMAILS = prior;
  }
});

test("headless management token requires a matching hash and configured owner", () => {
  const previousHash = process.env.OWNER_API_TOKEN_HASH;
  const previousOwner = process.env.OWNER_API_USER_ID;
  const token = `adm_${"c".repeat(64)}`;
  const owner = "11111111-1111-4111-8111-111111111111";
  try {
    delete process.env.OWNER_API_TOKEN_HASH;
    assert.equal(ownerIdForApiToken(token), null);
    process.env.OWNER_API_TOKEN_HASH = createHash("sha256").update(token).digest("hex");
    process.env.OWNER_API_USER_ID = owner;
    assert.equal(ownerIdForApiToken(token), owner);
    assert.equal(ownerIdForApiToken(`adm_${"d".repeat(64)}`), null);
    assert.equal(ownerIdForApiToken(`bot_${"c".repeat(64)}`), null);
    process.env.OWNER_API_TOKEN_HASH = "malformed";
    assert.equal(ownerIdForApiToken(token), null);
    process.env.OWNER_API_TOKEN_HASH = createHash("sha256").update(token).digest("hex");
    process.env.OWNER_API_USER_ID = "not-a-user-id";
    assert.equal(ownerIdForApiToken(token), null);
  } finally {
    if (previousHash === undefined) delete process.env.OWNER_API_TOKEN_HASH;
    else process.env.OWNER_API_TOKEN_HASH = previousHash;
    if (previousOwner === undefined) delete process.env.OWNER_API_USER_ID;
    else process.env.OWNER_API_USER_ID = previousOwner;
  }
});
