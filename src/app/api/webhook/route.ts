/**
 * Meta webhook endpoint.
 *
 * GET  → subscription verification challenge (Meta portal setup)
 * POST → live events (comments, DMs, postbacks)
 *
 * Non-negotiable contract with Meta:
 *  1. HMAC-SHA256 signature verified over the RAW body BEFORE any processing.
 *     Invalid → 403; only encrypted settings are read before verification.
 *  2. Persist the event and routing job atomically before returning 200.
 *     after() provides a fast drain; the persistent worker recovers crashes.
 */

import { after } from "next/server";
import { getMetaSettings } from "@/lib/settings";
import { receiveWebhook } from "@/lib/transport/inbox";
import { processTransportJobs } from "@/lib/transport/worker";
import { processDueJobs } from "@/lib/automation/engine";
import { createLogger } from "@/lib/logger";
import { debugLog } from "@/lib/debugLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const logger = createLogger("webhook-route");

// ── GET /api/webhook - Meta verification challenge ──────────────────────────
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const challenge = url.searchParams.get("hub.challenge");
  const verifyToken = url.searchParams.get("hub.verify_token");

  const settings = await getMetaSettings();

  if (
    mode === "subscribe" &&
    settings &&
    verifyToken === settings.webhookVerifyToken
  ) {
    debugLog(
      "webhook",
      "info",
      "webhook_verify",
      "ok",
      "Meta webhook verification successful",
      {},
    );
    return new Response(challenge ?? "", { status: 200 });
  }

  debugLog(
    "webhook",
    "warn",
    "webhook_verify",
    "error",
    "Webhook verification failed - token mismatch or setup incomplete",
    {
      mode,
      configured: !!settings,
    },
  );
  return Response.json({ error: "Forbidden" }, { status: 403 });
}

// ── POST /api/webhook - live events ─────────────────────────────────────────
export async function POST(request: Request): Promise<Response> {
  const settings = await getMetaSettings();
  if (!settings) return Response.json({ error: "Forbidden" }, { status: 403 });
  const secrets = [settings.metaAppSecret, settings.metaFbAppSecret].filter(
    (s): s is string => Boolean(s),
  );
  const response = await receiveWebhook(request, secrets);
  if (response.status !== 200) return response;

  after(async () => {
    try {
      await processTransportJobs(16);
      await processTransportJobs(16);
      await processDueJobs(5);
    } catch {
      logger.warn(
        {},
        "Fast drain interrupted; durable jobs remain for the worker",
      );
    }
  });
  return response;
}
