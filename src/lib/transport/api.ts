import { createHash } from "node:crypto";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { encrypt, randomToken } from "@/lib/crypto";
import { getEnv } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveEndpoint } from "./http";
import { transportStore, type TransportMessage } from "./store";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function readBody(request: Request, max = 8192): Promise<string> {
  if (Number(request.headers.get("content-length") ?? 0) > max)
    throw new ApiError(413, "body_too_large");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "body_required");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new ApiError(413, "body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}
export async function jsonBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new ApiError(415, "json_required");
  let value: unknown;
  try {
    value = JSON.parse(await readBody(request));
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(400, "invalid_json");
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError(400, "invalid_body");
  return parsed.data;
}
export function apiRoute(fn: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    try {
      return await fn(request);
    } catch (error) {
      if (error instanceof ApiError)
        return Response.json(
          { error: error.message },
          { status: error.status, headers: { "Cache-Control": "no-store" } },
        );
      const message = error instanceof Error ? error.message : "";
      const status = (
        {
          not_found: 404,
          idempotency_conflict: 409,
          conversation_paused: 409,
          window_closed: 409,
        } as Record<string, number>
      )[message];
      return Response.json(
        { error: status ? message : "service_unavailable" },
        { status: status ?? 503, headers: { "Cache-Control": "no-store" } },
      );
    }
  };
}
export const respond = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function owner(request: Request) {
  if (!request.headers.get("authorization")?.startsWith("Bearer "))
    throw new ApiError(401, "unauthorized");
  const user = await getAuthenticatedUser(request);
  if (!user) throw new ApiError(401, "unauthorized");
  return user.id;
}
export async function integrationAuth(request: Request) {
  const bearer = request.headers.get("authorization") ?? "";
  if (!/^Bearer bot_[a-f0-9]{64}$/.test(bearer))
    throw new ApiError(401, "unauthorized");
  const { data, error } = await createServiceClient()
    .from("bot_integrations")
    .select("id")
    .eq("token_hash", hash(bearer.slice(7)))
    .maybeSingle();
  if (error) throw new Error("auth_unavailable");
  if (!data) throw new ApiError(401, "unauthorized");
  return data.id as string;
}
const uuid = z.string().uuid();
const credentials = () => ({
  token: `bot_${randomToken(32)}`,
  webhook_secret: randomToken(32),
});
const visible = "id,name,webhook_url,enabled,created_at";
export const createIntegration = apiRoute(async (request) => {
  const user = await owner(request);
  const input = await jsonBody(
    request,
    z
      .object({
        name: z.string().trim().min(1).max(100),
        webhook_url: z.string().url().max(2048),
      })
      .strict(),
  );
  try {
    await resolveEndpoint(input.webhook_url);
  } catch {
    throw new ApiError(400, "invalid_webhook_url");
  }
  const keys = credentials();
  const { data, error } = await createServiceClient()
    .from("bot_integrations")
    .insert({
      user_id: user,
      ...input,
      token_hash: hash(keys.token),
      signing_secret_encrypted: encrypt(
        keys.webhook_secret,
        getEnv().TOKEN_ENCRYPTION_KEY,
      ),
    })
    .select(visible)
    .single();
  if (error) throw new Error("db_unavailable");
  return respond({ ...data, ...keys }, 201);
});
export const listIntegrations = apiRoute(async (request) => {
  const user = await owner(request);
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  if (cursor && !uuid.safeParse(cursor).success)
    throw new ApiError(400, "invalid_cursor");
  let query = createServiceClient()
    .from("bot_integrations")
    .select(visible)
    .eq("user_id", user)
    .order("id")
    .limit(51);
  if (cursor) query = query.gt("id", cursor);
  const { data, error } = await query;
  if (error) throw new Error("db_unavailable");
  const rows = data ?? [];
  return respond({
    data: rows.slice(0, 50),
    next_cursor: rows.length > 50 ? rows[49]?.id : null,
  });
});
export function updateIntegration(id: string) {
  return apiRoute(async (request) => {
    if (!uuid.safeParse(id).success) throw new ApiError(404, "not_found");
    const user = await owner(request);
    const input = await jsonBody(
      request,
      z
        .object({
          name: z.string().trim().min(1).max(100).optional(),
          webhook_url: z.string().url().max(2048).optional(),
          enabled: z.boolean().optional(),
        })
        .strict(),
    );
    if (!Object.keys(input).length) throw new ApiError(400, "invalid_body");
    if (input.webhook_url) {
      try {
        await resolveEndpoint(input.webhook_url);
      } catch {
        throw new ApiError(400, "invalid_webhook_url");
      }
    }
    const { data, error } = await createServiceClient()
      .from("bot_integrations")
      .update(input)
      .eq("id", id)
      .eq("user_id", user)
      .select(visible)
      .maybeSingle();
    if (error) throw new Error("db_unavailable");
    if (!data) throw new ApiError(404, "not_found");
    return respond(data);
  });
}
export function rotateCredentials(id: string) {
  return apiRoute(async (request) => {
    const user = await owner(request);
    if (!uuid.safeParse(id).success) throw new ApiError(404, "not_found");
    const keys = credentials();
    const { data, error } = await createServiceClient()
      .from("bot_integrations")
      .update({
        token_hash: hash(keys.token),
        signing_secret_encrypted: encrypt(
          keys.webhook_secret,
          getEnv().TOKEN_ENCRYPTION_KEY,
        ),
      })
      .eq("id", id)
      .eq("user_id", user)
      .select("id")
      .maybeSingle();
    if (error) throw new Error("db_unavailable");
    if (!data) throw new ApiError(404, "not_found");
    return respond({ ...data, ...keys });
  });
}
export function getAccountIntegration(id: string) {
  return apiRoute(async (request) => {
    const user = await owner(request);
    if (!uuid.safeParse(id).success) throw new ApiError(404, "not_found");
    const db = createServiceClient();
    const { data: account, error: accountError } = await db
      .from("instagram_accounts").select("id")
      .eq("id", id).eq("user_id", user).maybeSingle();
    if (accountError) throw new Error("db_unavailable");
    if (!account) throw new ApiError(404, "not_found");
    const { data, error } = await db.from("account_bot_bindings")
      .select("account_id,integration_id,revision").eq("account_id", id).maybeSingle();
    if (error) throw new Error("db_unavailable");
    return respond(data ?? { account_id: id, integration_id: null, revision: 0 });
  });
}
export function bindAccount(id: string, detach = false) {
  return apiRoute(async (request) => {
    const user = await owner(request);
    if (!uuid.safeParse(id).success) throw new ApiError(404, "not_found");
    const integration = detach
      ? null
      : (await jsonBody(request, z.object({ integration_id: uuid }).strict()))
          .integration_id;
    const revision = await transportStore.rpc<number>("transport_bind", {
      p_user: user,
      p_account: id,
      p_integration: integration,
    });
    return respond({ account_id: id, integration_id: integration, revision });
  });
}
export function pauseConversation(id: string) {
  return apiRoute(async (request) => {
    const user = await owner(request);
    if (!uuid.safeParse(id).success) throw new ApiError(404, "not_found");
    const input = await jsonBody(
      request,
      z.object({ paused: z.boolean() }).strict(),
    );
    const db = createServiceClient();
    const { data: c, error: ce } = await db
      .from("bot_conversations")
      .select("account_id")
      .eq("id", id)
      .maybeSingle();
    if (ce) throw new Error("db_unavailable");
    if (!c) throw new ApiError(404, "not_found");
    const { data: a, error: ae } = await db
      .from("instagram_accounts")
      .select("id")
      .eq("id", c.account_id)
      .eq("user_id", user)
      .maybeSingle();
    if (ae) throw new Error("db_unavailable");
    if (!a) throw new ApiError(404, "not_found");
    const { data, error } = await db
      .from("bot_conversations")
      .update(input)
      .eq("id", id)
      .select("id,paused")
      .single();
    if (error) throw new Error("db_unavailable");
    return respond(data);
  });
}
export const replySchema = z
  .object({
    conversation_id: uuid,
    in_reply_to_event_id: uuid,
    text: z
      .string()
      .min(1)
      .max(1000)
      .refine((x) => x.trim().length > 0),
  })
  .strict();
export function messageResponse(m: TransportMessage) {
  return {
    message_id: m.id,
    conversation_id: m.conversation_id,
    status: m.status,
    external_id: m.external_id,
    error_code: m.error_code,
  };
}
export const sendMessage = apiRoute(async (request) => {
  const integration = await integrationAuth(request);
  const input = await jsonBody(request, replySchema);
  const key = request.headers.get("idempotency-key");
  if (!key || !/^[A-Za-z0-9_.:-]{1,128}$/.test(key))
    throw new ApiError(400, "idempotency_key_required");
  const data = await transportStore.rpc<TransportMessage>(
    "transport_queue_reply",
    {
      p_integration: integration,
      p_conversation: input.conversation_id,
      p_event: input.in_reply_to_event_id,
      p_text: input.text,
      p_key: key,
      p_hash: hash(JSON.stringify(input)),
    },
  );
  return respond(messageResponse(data), 202);
});
export function getMessage(id: string) {
  return apiRoute(async (request) => {
    const integration = await integrationAuth(request);
    if (!uuid.safeParse(id).success) throw new ApiError(404, "not_found");
    const { data, error } = await createServiceClient()
      .from("bot_messages")
      .select("id,conversation_id,status,external_id,error_code")
      .eq("id", id)
      .eq("integration_id", integration)
      .eq("direction", "outbound")
      .maybeSingle();
    if (error) throw new Error("db_unavailable");
    if (!data) throw new ApiError(404, "not_found");
    return respond(messageResponse(data as TransportMessage));
  });
}
