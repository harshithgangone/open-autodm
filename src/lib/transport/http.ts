import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { Agent, request } from "undici";

export function publicAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}

/** Resolve again at delivery time; pin the checked IP for the actual connection. */
export async function resolveEndpoint(value: string) {
  const url = new URL(value);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const allow = (process.env.BOT_WEBHOOK_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const internal = allow.includes(host);
  if (
    url.username ||
    url.password ||
    url.hash ||
    (url.protocol !== "https:" && !(internal && url.protocol === "http:"))
  ) {
    throw new Error("invalid_webhook_url");
  }
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await lookup(host, { all: true });
  if (
    !addresses.length ||
    (!internal && addresses.some((x) => !publicAddress(x.address)))
  )
    throw new Error("unsafe_webhook_address");
  return { url, addresses };
}

export async function deliverWebhook(
  url: string,
  body: string,
  headers: Record<string, string>,
): Promise<void> {
  const resolved = await resolveEndpoint(url);
  const address =
    resolved.addresses.find((x) => x.family === 4) ?? resolved.addresses[0]!;
  const dispatcher = new Agent({
    connect: {
      lookup(_hostname, options, callback) {
        if (options.all) callback(null, [address]);
        else callback(null, address.address, address.family);
      },
    },
  });
  try {
    const response = await request(resolved.url, {
      method: "POST",
      body,
      headers,
      dispatcher,
      headersTimeout: 10_000,
      bodyTimeout: 10_000,
      signal: AbortSignal.timeout(10_000),
    });
    // The HTTP status acknowledges the event. Do not download arbitrary bot output.
    response.body.on("error", () => {
      /* expected cancellation of an untrusted body */
    });
    response.body.destroy();
    if (response.statusCode < 200 || response.statusCode >= 300)
      throw new Error(`bot_http_${response.statusCode}`);
  } finally {
    await dispatcher.close();
  }
}
