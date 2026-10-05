import { decrypt, hmacSha256Hex } from "@/lib/crypto";
import { getEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { deliverWebhook } from "./http";
import { MetaRejected, sendTransportDm } from "./meta";
import {
  transportStore,
  type TransportStore,
  type TransportJob,
  type JobContext,
} from "./store";

const log = createLogger("bot-transport");
export interface TransportPorts {
  encryptionKey: string;
  routeWebhook(body: unknown): Promise<unknown>;
  deliver(
    url: string,
    body: string,
    headers: Record<string, string>,
  ): Promise<void>;
  send(
    account: string,
    recipient: string,
    text: string,
    token: string,
  ): Promise<string>;
  pauseAccount?(accountId: string): Promise<void>;
}
async function runJob(
  store: TransportStore,
  ports: TransportPorts,
  job: TransportJob,
) {
  const finish = (
    state: string,
    error: string | null = null,
    external: string | null = null,
    delay = 0,
  ) =>
    store.rpc<boolean>("transport_finish", {
      p_job: job.id,
      p_token: job.claim_token,
      p_state: state,
      p_error: error,
      p_external: external,
      p_delay: delay,
    });
  let context: JobContext | null;
  try {
    context = await store.rpc<JobContext | null>("transport_context", {
      p_job: job.id,
      p_token: job.claim_token,
    });
  } catch {
    // This RPC may have committed the send marker before its HTTP response was lost.
    // Keep its lease; reclamation determines queued vs delivery_unknown safely.
    log.warn(
      { jobId: job.id },
      "Context unavailable; lease recovery will resolve the job",
    );
    return;
  }
  if (!context) return;
  if (job.kind === "send") {
    let token: string;
    try {
      token = decrypt(
        context.account.access_token_encrypted,
        ports.encryptionKey,
      );
    } catch {
      await finish("failed", "token_decryption_failed");
      return;
    }
    let external: string;
    try {
      external = await ports.send(
        context.account.instagram_user_id,
        context.conversation.sender_id,
        context.message.text,
        token,
      );
    } catch (error) {
      if (error instanceof MetaRejected) {
        // Save the known rejection before any optional account pause call.
        await finish(
          error.retryable ? "retry" : "failed",
          error.message,
          null,
          900,
        );
        if (error.policyBlocked) await ports.pauseAccount?.(context.account.id);
      } else await finish("delivery_unknown", "meta_outcome_unknown");
      return;
    }
    // If this write fails, the durable sending marker prevents a duplicate send.
    await finish("done", null, external);
    return;
  }
  try {
    if (job.kind === "webhook") await ports.routeWebhook(context.body);
    else {
      const event = {
        version: "1",
        event_id: context.message.id,
        type: "message.received",
        integration_id: context.integration.id,
        account_id: context.account.id,
        conversation_id: context.conversation.id,
        message: {
          id: context.message.id,
          external_id: context.message.external_id,
          text: context.message.text,
        },
        sender: { external_id: context.conversation.sender_id },
        occurred_at: context.message.occurred_at,
      };
      const body = JSON.stringify(event);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const secret = decrypt(
        context.integration.signing_secret_encrypted,
        ports.encryptionKey,
      );
      await ports.deliver(context.integration.webhook_url, body, {
        "content-type": "application/json",
        "x-bot-event-id": event.event_id,
        "x-bot-timestamp": timestamp,
        "x-bot-signature": `sha256=${hmacSha256Hex(secret, `${timestamp}.${body}`)}`,
      });
    }
  } catch {
    // No endpoint response or message text is logged; recipients deduplicate by event_id.
    await finish(
      "retry",
      job.kind === "webhook" ? "routing_failed" : "bot_delivery_failed",
      null,
      Math.min(3600, 5 * 2 ** job.attempts),
    );
    return;
  }
  await finish("done");
}
export async function drainTransport(
  store: TransportStore,
  ports: TransportPorts,
  limit = 16,
) {
  const jobs = await store.rpc<TransportJob[]>("transport_claim", {
    p_limit: limit,
  });
  const results = await Promise.allSettled(
    jobs.map((job) => runJob(store, ports, job)),
  );
  for (let i = 0; i < results.length; i++)
    if (results[i]?.status === "rejected") {
      log.warn(
        { jobId: jobs[i]?.id },
        "Transport job interrupted; durable lease retained",
      );
    }
  return jobs.length;
}
export async function processTransportJobs(limit = 16) {
  const { processWebhookPayload } =
    await import("@/lib/automation/processWebhook");
  const { pauseAccount } = await import("@/lib/automation/processJob");
  return drainTransport(
    transportStore,
    {
      encryptionKey: getEnv().TOKEN_ENCRYPTION_KEY,
      routeWebhook: (body) =>
        processWebhookPayload(
          body as Parameters<typeof processWebhookPayload>[0],
        ),
      deliver: deliverWebhook,
      send: sendTransportDm,
      pauseAccount: (id) => pauseAccount(id, "Meta policy block (code 368)"),
    },
    limit,
  );
}
