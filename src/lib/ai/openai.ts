import OpenAI from "openai";

// If OPENAI_API_KEY isn't set yet, this stays null and every AI feature
// returns a friendly "not configured" message instead of crashing — same
// pattern as src/lib/resend.ts.
export const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// Override with OPENAI_MODEL in .env.local for a different model — e.g.
// "gpt-5.6-luna" is OpenAI's cheaper tier if cost matters more than
// accuracy for a given run, or "gpt-6-astra" for their most capable model.
// Terra is a balanced default: solid at structured extraction without the
// flagship price, which matters here since a large spec book means dozens
// of AI calls per scan.
//
// Uses || rather than ?? on purpose: a blank OPENAI_MODEL= line in
// .env.local reads as an empty string, not undefined, and an empty string
// is falsy so || still falls back correctly (?? would not — same bug this
// project already hit once with RESEND_FROM_EMAIL).
export const AI_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-terra";
