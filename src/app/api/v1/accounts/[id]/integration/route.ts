export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { bindAccount, getAccountIntegration } from "@/lib/transport/api";
export async function GET(r: Request, c: { params: Promise<{ id: string }> }) {
  return getAccountIntegration((await c.params).id)(r);
}
export async function PUT(r: Request, c: { params: Promise<{ id: string }> }) {
  return bindAccount((await c.params).id)(r);
}
export async function DELETE(
  r: Request,
  c: { params: Promise<{ id: string }> },
) {
  return bindAccount((await c.params).id, true)(r);
}
