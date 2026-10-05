/** External example bot. Replace only the reply generation with your own agent. */
import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";

const api = process.env.TRANSPORT_API_URL;
const token = process.env.BOT_TOKEN;
const secret = process.env.BOT_WEBHOOK_SECRET;
if (!api || !token || !secret)
  throw new Error(
    "TRANSPORT_API_URL, BOT_TOKEN and BOT_WEBHOOK_SECRET are required",
  );
const server = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/events") {
    res.writeHead(404).end();
    return;
  }
  let size = 0;
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of req) {
      const b = Buffer.from(chunk);
      size += b.length;
      if (size > 65536) throw new Error("too_large");
      chunks.push(b);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    const timestamp = String(req.headers["x-bot-timestamp"] ?? "");
    const supplied = String(req.headers["x-bot-signature"] ?? "");
    const expected = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex")}`;
    if (
      !/^\d+$/.test(timestamp) ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
      supplied.length !== expected.length ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    ) {
      res.writeHead(403).end();
      return;
    }
    const event = JSON.parse(raw);
    if (
      event.type !== "message.received" ||
      event.event_id !== req.headers["x-bot-event-id"]
    )
      throw new Error("invalid_event");
    const response = await fetch(`${api.replace(/\/$/, "")}/api/v1/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `echo:${event.event_id}`,
      },
      body: JSON.stringify({
        conversation_id: event.conversation_id,
        in_reply_to_event_id: event.event_id,
        text: `Эхо: ${event.message.text}`.slice(0, 1000),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("reply_rejected");
    // Retrying the same webhook reuses the same key; the service deduplicates it.
    res.writeHead(202).end();
  } catch {
    res.writeHead(503).end();
  }
});
server.requestTimeout = 10000;
server.listen(Number(process.env.BOT_PORT ?? 8788), "127.0.0.1", () =>
  console.log("Example bot listening on /events"),
);
