/**
 * Route-handler authentication.
 *
 * Identity comes from verified Supabase auth or an optional deployment-bound
 * owner API token. Never accept an identity from request body or URL params.
 * Accepted transports:
 *   1. Authorization: Bearer <jwt>  (used by the in-app API client)
 *   2. Supabase session cookies     (used by top-level browser navigations,
 *      e.g. the OAuth connect redirect)
 *   3. Authorization: Bearer <adm_...> (headless owner management)
 */

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";
import { isOwnerAllowed } from "@/lib/access";
import { ownerIdForApiToken } from "@/lib/ownerApiToken";
import { createServiceClient } from "@/lib/supabase/service";

export interface AuthenticatedUser {
  id: string;
  email: string | undefined;
}

export async function getAuthenticatedUser(
  request: Request,
): Promise<AuthenticatedUser | null> {
  const env = getEnv();

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const jwt = authHeader.slice(7);
    if (jwt.startsWith("adm_")) {
      const userId = ownerIdForApiToken(jwt);
      if (!userId) return null;
      const { data, error } = await createServiceClient().auth.admin.getUserById(userId);
      if (error || !data.user || !isOwnerAllowed(data.user.email)) return null;
      return { id: data.user.id, email: data.user.email };
    }
    const supabase = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: { autoRefreshToken: false, persistSession: false },
      },
    );
    const { data, error } = await supabase.auth.getUser(jwt);
    if (error || !data.user || !isOwnerAllowed(data.user.email)) return null;
    return { id: data.user.id, email: data.user.email };
  }

  // Cookie-based session (browser navigation)
  const cookieStore = await cookies();
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {
          /* read-only in route handlers that don't refresh sessions */
        },
      },
    },
  );
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || !isOwnerAllowed(data.user.email)) return null;
  return { id: data.user.id, email: data.user.email };
}

export function unauthorized(): Response {
  return Response.json(
    { error: "Unauthorized", message: "Valid session required" },
    { status: 401 },
  );
}
