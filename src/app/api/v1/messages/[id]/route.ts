export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { getMessage } from "@/lib/transport/api";
export async function GET(r: Request, c: { params: Promise<{ id: string }> }) {
  return getMessage((await c.params).id)(r);
}
