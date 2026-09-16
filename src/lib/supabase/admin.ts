// SERVER-ONLY admin client — uses the service role key, which BYPASSES Row
// Level Security entirely. Never import this into a Client Component, and
// never send this key to the browser.
//
// Used for the public /review/[review_token] page: a reviewer has no
// account and no session, so the normal (RLS-protected) client can't read
// anything for them. This client reads exactly one row, by an unguessable
// token, on the server, and nothing else.
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
