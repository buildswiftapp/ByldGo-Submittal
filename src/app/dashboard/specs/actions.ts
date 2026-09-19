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
const SECTION_SAVE_CONCURRENCY = 5;

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

  // Best-effort progress ping — a failed update here shouldn't take down
  // the actual scan, so it's swallowed rather than thrown.
  async function setProgress(
    stage: string,
    current: number | null,
    total: number | null
  ) {
    try {
      await admin
        .from("spec_books")
        .update({ progress_stage: stage, progress_current: current, progress_total: total })
        .eq("id", specBookId);
    } catch {
      // ignore — progress is a nice-to-have, not worth failing the scan over
    }
  }

  try {
    await setProgress("Reading document...", null, null);
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

    await setProgress("Finding spec sections...", null, null);
    const sections = await segmentIntoSections(pageChunks, (current, total) =>
      setProgress("Finding spec sections...", current, total)
    );

    // Saves each section's full text before extraction runs, so a registry
    // row can later show you the real source text next to the requirement
    // — not just a page citation. One row per section (not per
    // requirement), since several requirements typically share a section.
    // Inserted one at a time (through a small worker pool) rather than as
    // one multi-row insert, specifically so each section's database id can
    // be matched back to its position in `sections` with certainty —
    // Postgres doesn't guarantee a multi-row INSERT...RETURNING preserves
    // input order, and that order is what ties requirements back to the
    // right section below.
    await setProgress("Saving spec sections...", 0, sections.length);
    const sectionIds = await mapWithConcurrency(
      sections,
      SECTION_SAVE_CONCURRENCY,
      async (section) => {
        const { data, error } = await admin
          .from("spec_sections")
          .insert({
            spec_book_id: specBookId,
            account_id: accountId,
            code: section.code,
            title: section.title,
            label: section.label,
            text: section.text,
          })
          .select("id")
          .single();
        // A single section failing to save shouldn't fail the whole scan —
        // its requirements just won't have source text to show.
        return error || !data ? null : (data.id as string);
      },
      (completedCount, total) =>
        setProgress("Saving spec sections...", completedCount, total)
    );

    await setProgress("Extracting requirements...", 0, sections.length);
    const itemsPerSection = await mapWithConcurrency(
      sections,
      EXTRACTION_CONCURRENCY,
      (section) => extractRequirementsFromSection(section),
      (completedCount, total) =>
        setProgress("Extracting requirements...", completedCount, total)
    );

    const rows = itemsPerSection.flatMap((items, i) =>
      items.map((item) => ({
        spec_book_id: specBookId,
        account_id: accountId,
        division_code: item.divisionCode,
        division_title: item.divisionTitle,
        description: item.description,
        source_label: item.sourceLabel,
        section_id: sectionIds[i],
      }))
    );

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
      division_code: requirement.division_code,
      division_title: requirement.division_title,
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

export type SpecSectionTextResult =
  | { success: true; label: string; text: string }
  | { error: string };

// Fetches a section's full saved text so a registry row can show its real
// source text next to it, instead of just the citation label. This is
// called directly from a button click on the client (not through a
// <form>/useActionState) since it's an on-demand read, not a submission —
// Server Actions can be called like a plain async function from a Client
// Component just as easily as from a <form action={...}>.
//
// Returns an error for a null sectionId, or for a requirement whose spec
// book was scanned before this feature existed (those never got their
// sections saved, so there's nothing to show).
export async function getSpecSectionText(
  sectionId: string | null
): Promise<SpecSectionTextResult> {
  if (!sectionId) {
    return {
      error:
        "No source text saved for this item — it came from a spec book scanned before this feature was added. Re-scanning that spec book will save source text going forward.",
    };
  }

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

  const { data: section, error } = await supabase
    .from("spec_sections")
    .select("label, text")
    .eq("id", sectionId)
    .eq("account_id", account.id)
    .single();

  if (error || !section) {
    return { error: "Couldn't find that section's source text." };
  }

  return { success: true, label: section.label, text: section.text };
}

export type BulkCreateSubmittalsState =
  | { success: true; created: number; alreadyLinked: number; failed: number }
  | { error: string }
  | null;

const BULK_CREATE_CONCURRENCY = 5;

// Same idea as createSubmittalFromRequirement above, just for many
// registry rows at once (the "select some rows, create them all" bulk
// action). Runs the inserts through a small worker pool rather than one at
// a time or all simultaneously — the same concurrency helper the AI scan
// itself uses — since a big spec book can mean hundreds of rows selected
// at once.
export async function createSubmittalsFromRequirements(
  _prevState: BulkCreateSubmittalsState,
  formData: FormData
): Promise<BulkCreateSubmittalsState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const specBookId = String(formData.get("specBookId") ?? "");
  const requirementIds = formData
    .getAll("requirementIds")
    .map((v) => String(v))
    .filter(Boolean);

  if (requirementIds.length === 0) {
    return { error: "Select at least one requirement first." };
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("owner_user_id", user.id)
    .single();
  if (!account) return { error: "No account found for this user." };

  const { data: specBook } = await supabase
    .from("spec_books")
    .select("name")
    .eq("id", specBookId)
    .eq("account_id", account.id)
    .single();

  const { data: requirements, error: fetchError } = await supabase
    .from("spec_requirements")
    .select("id, description, division_code, division_title, submittal_id")
    .in("id", requirementIds)
    .eq("account_id", account.id);

  if (fetchError) return { error: fetchError.message };
  if (!requirements || requirements.length === 0) {
    return { error: "None of the selected registry items could be found." };
  }

  // Anything that already has a submittal is left alone — creating a
  // second one for it would just make a duplicate, and the per-row action
  // already treats "has a submittal" as done rather than re-creating.
  const toCreate = requirements.filter((r) => !r.submittal_id);
  const alreadyLinked = requirements.length - toCreate.length;

  const results = await mapWithConcurrency(
    toCreate,
    BULK_CREATE_CONCURRENCY,
    async (req) => {
      const { data: submittal, error: insertError } = await supabase
        .from("submittals")
        .insert({
          account_id: account.id,
          name: req.description,
          project_title: specBook?.name ?? null,
          division_code: req.division_code,
          division_title: req.division_title,
          status: "draft",
        })
        .select("id")
        .single();

      if (insertError || !submittal) return { ok: false as const };

      await supabase
        .from("spec_requirements")
        .update({ submittal_id: submittal.id })
        .eq("id", req.id);

      return { ok: true as const };
    }
  );

  const failed = results.filter((r) => !r.ok).length;
  const created = results.length - failed;

  revalidatePath(`/dashboard/specs/${specBookId}`);
  revalidatePath("/dashboard");

  if (created === 0 && failed > 0) {
    return { error: `Couldn't create any submittals (${failed} failed).` };
  }

  return { success: true, created, alreadyLinked, failed };
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
