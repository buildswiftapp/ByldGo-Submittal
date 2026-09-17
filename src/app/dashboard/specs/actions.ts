"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractChunks } from "@/lib/ai/extract";
import { segmentIntoSections } from "@/lib/ai/segment";
import { extractRequirementsFromSection } from "@/lib/ai/registryExtract";
import { mapWithConcurrency } from "@/lib/ai/concurrency";

const BUCKET = "spec-books";
const EXTRACTION_CONCURRENCY = 3;

export type UploadSpecBookState = { error: string } | null;

// Uploads the spec book, kicks off AI processing in the background (via
// Next's `after()` so the upload response doesn't have to wait minutes for
// a 300-page document to finish), and sends the user straight to the
// registry page, which shows "Processing..." until it's done.
export async function uploadSpecBook(
  _prevState: UploadSpecBookState,
  formData: FormData
): Promise<UploadSpecBookState> {
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
  const file = formData.get("file") as File | null;

  if (!name) return { error: "Give this spec book a name." };
  if (!file || file.size === 0) return { error: "Choose a spec book file." };

  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".pdf") && !lower.endsWith(".docx")) {
    return { error: "AI analysis only supports PDF and .docx files right now." };
  }

  const { data: specBook, error: insertError } = await supabase
    .from("spec_books")
    .insert({ account_id: account.id, name, file_path: "", status: "processing" })
    .select("id")
    .single();

  if (insertError || !specBook) {
    return { error: insertError?.message ?? "Could not create the spec book record." };
  }

  const path = `${account.id}/${specBook.id}/${file.name}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { upsert: true, contentType: file.type || undefined });

  if (uploadError) {
    await supabase
      .from("spec_books")
      .update({ status: "failed", error: `Upload failed: ${uploadError.message}` })
      .eq("id", specBook.id);
    return { error: `Upload failed: ${uploadError.message}` };
  }

  await supabase.from("spec_books").update({ file_path: path }).eq("id", specBook.id);

  // Runs after the response is sent — this is what lets a multi-minute scan
  // of a large document happen without the upload request itself hanging.
  after(() => processSpecBook(specBook.id, account.id, buffer, file.name));

  redirect(`/dashboard/specs/${specBook.id}`);
}

async function processSpecBook(
  specBookId: string,
  accountId: string,
  buffer: Buffer,
  fileName: string
) {
  const admin = createAdminClient();

  try {
    const pageChunks = await extractChunks(buffer, fileName);
    if (pageChunks.length === 0) {
      await admin
        .from("spec_books")
        .update({
          status: "failed",
          error:
            "Couldn't find any readable text in this document — it may be a scanned image without selectable text.",
        })
        .eq("id", specBookId);
      return;
    }

    const sections = await segmentIntoSections(pageChunks);

    const itemsPerSection = await mapWithConcurrency(
      sections,
      EXTRACTION_CONCURRENCY,
      (section) => extractRequirementsFromSection(section)
    );

    const rows = itemsPerSection.flat().map((item) => ({
      spec_book_id: specBookId,
      account_id: accountId,
      division_code: item.divisionCode,
      division_title: item.divisionTitle,
      description: item.description,
      source_label: item.sourceLabel,
    }));

    if (rows.length > 0) {
      const { error: insertRowsError } = await admin.from("spec_requirements").insert(rows);
      if (insertRowsError) {
        await admin
          .from("spec_books")
          .update({ status: "failed", error: insertRowsError.message })
          .eq("id", specBookId);
        return;
      }
    }

    await admin
      .from("spec_books")
      .update({ status: "ready", error: null })
      .eq("id", specBookId);
  } catch (err) {
    await admin
      .from("spec_books")
      .update({
        status: "failed",
        error: err instanceof Error ? err.message : "Something went wrong while scanning this document.",
      })
      .eq("id", specBookId);
  }
}

export type CreateSubmittalFromRequirementState =
  | { success: true; submittalId: string }
  | { error: string }
  | null;

export async function createSubmittalFromRequirement(
  _prevState: CreateSubmittalFromRequirementState,
  formData: FormData
): Promise<CreateSubmittalFromRequirementState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const requirementId = String(formData.get("requirementId") ?? "");
  const specBookId = String(formData.get("specBookId") ?? "");

  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("owner_user_id", user.id)
    .single();
  if (!account) return { error: "No account found for this user." };

  const { data: requirement, error: fetchError } = await supabase
    .from("spec_requirements")
    .select("id, description, division_code, division_title, submittal_id, spec_book_id")
    .eq("id", requirementId)
    .eq("account_id", account.id)
    .single();

  if (fetchError || !requirement) return { error: "Registry item not found." };

  if (requirement.submittal_id) {
    return { success: true, submittalId: requirement.submittal_id };
  }

  const { data: specBook } = await supabase
    .from("spec_books")
    .select("name")
    .eq("id", requirement.spec_book_id)
    .single();

  const { data: submittal, error: insertError } = await supabase
    .from("submittals")
    .insert({
      account_id: account.id,
      name: requirement.description,
      project_title: specBook?.name ?? null,
      status: "draft",
    })
    .select("id")
    .single();

  if (insertError || !submittal) {
    return { error: insertError?.message ?? "Could not create the submittal." };
  }

  await supabase
    .from("spec_requirements")
    .update({ submittal_id: submittal.id })
    .eq("id", requirement.id);

  revalidatePath(`/dashboard/specs/${specBookId}`);
  revalidatePath("/dashboard");

  return { success: true, submittalId: submittal.id };
}

export type DeleteSpecBookState = { error: string } | null;

// Deletes a spec book, its uploaded file, and every registry row that came
// from it (the DB cascades spec_requirements automatically — this just also
// cleans up the file sitting in storage, which a table delete alone
// wouldn't touch). Any submittal already created from one of its rows is
// left alone; it just loses the link back to the requirement it came from.
export async function deleteSpecBook(
  _prevState: DeleteSpecBookState,
  formData: FormData
): Promise<DeleteSpecBookState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const specBookId = String(formData.get("specBookId") ?? "");

  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("owner_user_id", user.id)
    .single();
  if (!account) return { error: "No account found for this user." };

  const { data: specBook, error: fetchError } = await supabase
    .from("spec_books")
    .select("id, file_path")
    .eq("id", specBookId)
    .eq("account_id", account.id)
    .single();

  if (fetchError || !specBook) return { error: "Spec book not found." };

  if (specBook.file_path) {
    // Best-effort — if this fails (e.g. the file was already removed), the
    // row delete below should still go through rather than getting stuck.
    await supabase.storage.from(BUCKET).remove([specBook.file_path]);
  }

  const { error: deleteError } = await supabase
    .from("spec_books")
    .delete()
    .eq("id", specBook.id);

  if (deleteError) return { error: deleteError.message };

  revalidatePath("/dashboard/specs");
  redirect("/dashboard/specs");
}
