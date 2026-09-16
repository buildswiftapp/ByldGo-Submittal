"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resend, EMAIL_FROM, SITE_URL } from "@/lib/resend";

const BUCKET = "submittal-files";

export async function createSubmittal(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("owner_user_id", user.id)
    .single();
  if (!account) return { error: "No account found for this user." };

  const name = String(formData.get("name") ?? "").trim();
  const projectTitle = String(formData.get("projectTitle") ?? "").trim();
  const subcontractorName = String(formData.get("subcontractorName") ?? "").trim();
  const reviewerName = String(formData.get("reviewerName") ?? "").trim();
  const reviewerEmail = String(formData.get("reviewerEmail") ?? "").trim();
  const file = formData.get("file") as File | null;

  if (!name) return { error: "Submittal name is required." };

  // Insert the row first so we have an id to build the storage path from.
  const { data: submittal, error: insertError } = await supabase
    .from("submittals")
    .insert({
      account_id: account.id,
      name,
      project_title: projectTitle || null,
      subcontractor_name: subcontractorName || null,
      reviewer_name: reviewerName || null,
      reviewer_email: reviewerEmail || null,
      status: "draft",
    })
    .select("id")
    .single();

  if (insertError || !submittal) {
    return { error: insertError?.message ?? "Could not create submittal." };
  }

  if (file && file.size > 0) {
    const path = `${account.id}/${submittal.id}/${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true });

    if (uploadError) {
      return { error: `Submittal created, but the file upload failed: ${uploadError.message}` };
    }

    await supabase
      .from("submittals")
      .update({ file_path: path })
      .eq("id", submittal.id);
  }

  revalidatePath("/dashboard");
  return { success: true };
}

// Moves a submittal from "draft" to "pending_review" and, if a reviewer
// email is on file, sends them their no-login review link.
export async function sendForReview(_prevState: unknown, formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const submittalId = String(formData.get("submittalId") ?? "");

  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("owner_user_id", user.id)
    .single();
  if (!account) return { error: "No account found for this user." };

  // .eq("account_id", ...) here isn't just belt-and-suspenders — RLS
  // already enforces it, but it keeps the intent obvious in the code.
  const { data: submittal, error: fetchError } = await supabase
    .from("submittals")
    .select("id, name, reviewer_email, review_token, status")
    .eq("id", submittalId)
    .eq("account_id", account.id)
    .single();

  if (fetchError || !submittal) {
    return { error: "Submittal not found." };
  }

  const { error: updateError } = await supabase
    .from("submittals")
    .update({ status: "pending_review" })
    .eq("id", submittal.id);

  if (updateError) {
    return { error: updateError.message };
  }

  if (submittal.reviewer_email && resend) {
    const reviewLink = `${SITE_URL}/review/${submittal.review_token}`;
    try {
      // IMPORTANT: the Resend SDK does NOT throw for an API-level failure
      // (e.g. an unverified "from" domain) — it resolves normally with
      // an `error` field instead. Missing this check was a bug: it made
      // failed sends look like they'd succeeded.
      const { error: sendError } = await resend.emails.send({
        from: EMAIL_FROM,
        to: submittal.reviewer_email,
        subject: `Submittal package for review: ${submittal.name}`,
        text: `A submittal package is requested for ${submittal.name}. Review it here: ${reviewLink}`,
      });
      if (sendError) {
        revalidatePath("/dashboard");
        return {
          error: `Marked as sent for review, but the reviewer email failed to send: ${sendError.message}`,
        };
      }
    } catch (err) {
      // The status change already succeeded — surface the email problem
      // without pretending the whole action failed.
      revalidatePath("/dashboard");
      return {
        error: `Marked as sent for review, but the reviewer email failed to send: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }
  }

  revalidatePath("/dashboard");
  return { success: true };
}
