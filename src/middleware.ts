/**
 * Next.js middleware.
 *  1. Refreshes the Supabase session cookie (required by @supabase/ssr).
 *  2. Protects app routes; redirects unauthenticated users to the login page.
 *
 * /api/* is fully excluded: the webhook and cron endpoints must never be
 * touched by session logic, and app API routes authenticate via Bearer JWT.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isOwnerAllowed } from "@/lib/access";

const SUPABASE_URL = process.env["NEXT_PUBLIC_SUPABASE_URL"]!;
const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // getUser() also refreshes the session token when needed - call it before
  // any redirect decisions.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const allowed = !!user && isOwnerAllowed(user.email);
  const pathname = request.nextUrl.pathname;
  const isProtectedRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/automations") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/setup");

  if (isProtectedRoute && !allowed) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    return NextResponse.redirect(redirectUrl);
  }

  if (pathname === "/" && allowed) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Everything EXCEPT:
     *  - /api/* (webhook + cron + Bearer-authenticated app APIs)
     *  - _next static assets, favicon, auth callback
     */
    "/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|logo.svg|auth/).*)",
  ],
};
