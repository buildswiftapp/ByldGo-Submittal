"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
