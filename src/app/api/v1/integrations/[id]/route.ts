export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { updateIntegration } from "@/lib/transport/api";
export async function PATCH(
  r: Request,
  c: { params: Promise<{ id: string }> },
) {
  return updateIntegration((await c.params).id)(r);
}
