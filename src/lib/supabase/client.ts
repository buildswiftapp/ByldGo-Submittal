// Supabase client for use in the BROWSER (Client Components).
// Uses the public anon key, so it is safe to ship to the browser — it can
// only do what Row Level Security (see supabase/migrations/0001_init_schema.sql)
// allows for the currently logged-in user.
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
