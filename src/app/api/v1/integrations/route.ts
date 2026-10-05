export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { createIntegration, listIntegrations } from "@/lib/transport/api";
export const POST = createIntegration;
export const GET = listIntegrations;
