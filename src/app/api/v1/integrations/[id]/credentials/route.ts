export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { rotateCredentials } from "@/lib/transport/api";
export async function POST(r: Request, c: { params: Promise<{ id: string }> }) {
  return rotateCredentials((await c.params).id)(r);
}
