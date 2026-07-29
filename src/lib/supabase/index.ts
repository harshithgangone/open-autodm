// Browser/SSR Supabase clients (safe for client components).
// The service-role client lives in ./service and must ONLY be imported
// from server code.
export { createBrowserClient, createServerClient } from './clients';
