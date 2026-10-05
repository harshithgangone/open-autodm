import { createServiceClient } from "@/lib/supabase/service";

export interface TransportStore {
  rpc<T>(name: string, args?: Record<string, unknown>): Promise<T>;
}
export const transportStore: TransportStore = {
  async rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await createServiceClient().rpc(name, args);
    if (error) throw new Error(error.message);
    return data as T;
  },
};
export interface TransportJob {
  id: string;
  kind: "webhook" | "event" | "send";
  ref_id: string;
  claim_token: string;
  attempts: number;
}
export interface TransportMessage {
  id: string;
  conversation_id: string;
  integration_id: string;
  text: string;
  external_id: string | null;
  status: string;
  occurred_at: string;
  error_code: string | null;
  in_reply_to_event_id: string | null;
}
export interface JobContext {
  body?: unknown;
  message: TransportMessage;
  conversation: { id: string; account_id: string; sender_id: string };
  integration: {
    id: string;
    webhook_url: string;
    signing_secret_encrypted: string;
  };
  account: {
    id: string;
    instagram_user_id: string;
    access_token_encrypted: string;
  };
}
