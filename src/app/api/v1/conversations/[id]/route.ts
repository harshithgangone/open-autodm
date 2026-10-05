export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { pauseConversation } from "@/lib/transport/api";
export async function PATCH(
  r: Request,
  c: { params: Promise<{ id: string }> },
) {
  return pauseConversation((await c.params).id)(r);
}
