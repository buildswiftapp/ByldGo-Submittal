"use server";

import { createClient } from "@/lib/supabase/server";
import { openai, AI_MODEL } from "@/lib/ai/openai";
import { extractChunks } from "@/lib/ai/extract";
import { retrieveRelevantChunks } from "@/lib/ai/retrieve";

const BUCKET = "submittal-files";

// Keeps the AI request small and cheap even for a hundreds-of-pages spec:
// only the most relevant excerpts are sent, not the whole document.
const MAX_CHUNKS = 8;
const MAX_CONTEXT_CHARS = 12000;

export type SpecQAState =
  | { success: true; answer: string; sourceLabels: string[] }
  | { error: string }
  | null;

export async function querySpecAI(
  _prevState: SpecQAState,
  formData: FormData
): Promise<SpecQAState> {
  if (!openai) {
    return {
      error:
        "AI analysis isn't set up yet — add OPENAI_API_KEY to .env.local and restart the app.",
    };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const submittalId = String(formData.get("submittalId") ?? "");
  const query = String(formData.get("query") ?? "").trim();
  if (!query) return { error: "Enter a question first." };

  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("owner_user_id", user.id)
    .single();
  if (!account) return { error: "No account found for this user." };

  const { data: submittal, error: fetchError } = await supabase
    .from("submittals")
    .select("id, file_path")
    .eq("id", submittalId)
    .eq("account_id", account.id)
    .single();

  if (fetchError || !submittal) return { error: "Submittal not found." };
  if (!submittal.file_path) {
    return { error: "This submittal doesn't have a file uploaded yet." };
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from(BUCKET)
    .download(submittal.file_path);

  if (downloadError || !fileBlob) {
    return {
      error: `Couldn't read the uploaded file: ${downloadError?.message ?? "unknown error"}`,
    };
  }

  let chunks;
  try {
    const buffer = Buffer.from(await fileBlob.arrayBuffer());
    chunks = await extractChunks(buffer, submittal.file_path);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Couldn't read the document.",
    };
  }

  if (chunks.length === 0) {
    return {
      error:
        "Couldn't find any readable text in this document — it may be a scanned image without selectable text.",
    };
  }

  const relevant = retrieveRelevantChunks(chunks, query, {
    maxChunks: MAX_CHUNKS,
    maxChars: MAX_CONTEXT_CHARS,
  });

  const context = relevant
    .map((c) => `--- ${c.label} ---\n${c.text}`)
    .join("\n\n");

  try {
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a construction-spec assistant. You are given EXCERPTS from a specification document, not the whole thing — each excerpt is labeled with the page or section it came from. Answer the user's question using ONLY the excerpts provided. Respond as a concise bulleted list. After each bullet, cite the source label(s) it came from in parentheses, e.g. (Page 12). If the excerpts don't contain enough information to answer confidently, say so plainly rather than guessing.",
        },
        {
          role: "user",
          content: `Specification excerpts:\n\n${context}\n\nQuestion: ${query}`,
        },
      ],
    });

    const answer = (completion.choices[0]?.message.content ?? "").trim();

    return {
      success: true,
      answer: answer || "The AI didn't return an answer — try rephrasing your question.",
      sourceLabels: relevant.map((c) => c.label),
    };
  } catch (err) {
    return {
      error: `The AI request failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
