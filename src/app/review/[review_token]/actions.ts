"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { resend, EMAIL_FROM } from "@/lib/resend";

// Public, no-login action — anyone with the link can call this, so it
// re-derives everything from the token itself rather than trusting
// anything else passed in from the form.
export async function submitReview(_prevState: unknown, formData: FormData) {
  const reviewToken = String(formData.get("reviewToken") ?? "");
  const action = String(formData.get("action") ?? "");
  const comments = String(formData.get("comments") ?? "").trim();

  if (!["approve", "request_revision"].includes(action)) {
    return { error: "Unknown action." };
  }

  const supabase = createAdminClient();

  const { data: submittal, error: fetchError } = await supabase
    .from("submittals")
    .select("id, name, status, account_id")
    .eq("review_token", reviewToken)
    .maybeSingle();

  if (fetchError || !submittal) {
    return { error: "This review link is no longer valid." };
  }

  if (submittal.status !== "pending_review") {
    return {
      error:
        "This submittal isn't currently awaiting review, so no action was taken.",
    };
  }

  const newStatus = action === "approve" ? "approved" : "needs_revision";

  const { error: updateError } = await supabase
    .from("submittals")
    .update({ status: newStatus, reviewer_comments: comments || null })
    .eq("id", submittal.id);

  if (updateError) {
    return { error: updateError.message };
  }

  // Notify the account owner. Their email lives in Supabase Auth, not the
  // accounts table, so it's looked up via the admin API using the
  // account's owner_user_id.
  const { data: account } = await supabase
    .from("accounts")
    .select("owner_user_id")
    .eq("id", submittal.account_id)
    .single();

  if (account && resend) {
    const { data: ownerUser } = await supabase.auth.admin.getUserById(
      account.owner_user_id
    );
    const ownerEmail = ownerUser?.user?.email;

    if (ownerEmail) {
      const statusLabel =
        newStatus === "approved" ? "approved" : "needs revision";
      try {
        await resend.emails.send({
          from: EMAIL_FROM,
          to: ownerEmail,
          subject: `Update on submittal ${submittal.name}`,
          text: `Update on submittal ${submittal.name}: status is now ${statusLabel}. Reviewer comments: ${
            comments || "(none)"
          }`,
        });
      } catch {
        // The status update already succeeded either way — an email
        // hiccup here shouldn't make the reviewer think their review
        // didn't go through.
      }
    }
  }

  return {
    success: true,
    message:
      newStatus === "approved"
        ? "Thanks — this submittal has been marked Approved."
        : "Thanks — this submittal has been marked Needs Revision.",
  };
}
