import { createServiceClient } from "@/lib/supabase/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { error } = await createServiceClient()
      .from("bot_transport_jobs")
      .select("id")
      .limit(0);
    return Response.json(
      { status: error ? "unavailable" : "ok" },
      { status: error ? 503 : 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
