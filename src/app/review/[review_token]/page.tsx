import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import ReviewClient from "./ReviewClient";

// Public, no-login page. Reads with the admin (service role) client on
// purpose — a reviewer has no session, so the normal RLS-protected client
// can't see anything for them. This query resolves strictly by the
// unguessable token and returns nothing else, which is what keeps one
// reviewer from ever browsing another submittal. (Step 7 adds a proper
// 404-on-invalid-token + rate limiting pass on top of this.)
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ review_token: string }>;
}) {
  const { review_token } = await params;
  const supabase = createAdminClient();

  const { data: submittal } = await supabase
    .from("submittals")
    .select(
      "id, name, project_title, status, subcontractor_name, file_path, review_token"
    )
    .eq("review_token", review_token)
    .maybeSingle();

  if (!submittal) {
    notFound();
  }

  let fileUrl: string | null = null;
  if (submittal.file_path) {
    const { data } = await supabase.storage
      .from("submittal-files")
      .createSignedUrl(submittal.file_path, 60 * 30);
    fileUrl = data?.signedUrl ?? null;
  }

  return <ReviewClient submittal={submittal} fileUrl={fileUrl} />;
}
