import { META_API_VERSION } from "@/lib/instagram/api";

export class MetaRejected extends Error {
  constructor(
    public code: number | undefined,
    public retryable: boolean,
    public policyBlocked = false,
  ) {
    super(code === undefined ? "meta_rejected" : `meta_${code}`);
  }
}
/** The network outcome can be ambiguous. Caller must never blindly retry throws. */
export async function sendTransportDm(
  account: string,
  recipient: string,
  text: string,
  token: string,
): Promise<string> {
  const response = await fetch(
    `https://graph.instagram.com/${META_API_VERSION}/${account}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ recipient: { id: recipient }, message: { text } }),
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    },
  );
  const data = (await response.json()) as {
    message_id?: unknown;
    error?: { code?: number };
  };
  // A valid Meta rejection is known not to have produced a message.
  if (!response.ok && response.status < 500 && data.error) {
    const code = data.error.code;
    throw new MetaRejected(
      code,
      code !== undefined && [4, 17, 32, 613].includes(code),
      code === 368,
    );
  }
  if (!response.ok || typeof data.message_id !== "string" || !data.message_id)
    throw new Error("meta_outcome_unknown");
  return data.message_id;
}
