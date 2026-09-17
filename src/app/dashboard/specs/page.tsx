import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SpecsListClient, { type SpecBook } from "./SpecsListClient";

// Scanning a large spec book (segmentation + per-section extraction, each an
// AI call) can take a few minutes. This raises the timeout for the upload
// Server Action on this page — on platforms like Vercel the plan's own cap
// still applies on top of this.
export const maxDuration = 300;

export default async function SpecsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("owner_user_id", user!.id)
    .single();

  const { data: specBooks } = await supabase
    .from("spec_books")
    .select("id, name, status, error, created_at")
    .eq("account_id", account?.id ?? "")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to Submittal Log
        </Link>
      </div>
      <SpecsListClient specBooks={(specBooks as SpecBook[]) ?? []} />
    </div>
  );
}
