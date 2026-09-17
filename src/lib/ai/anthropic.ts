import Anthropic from "@anthropic-ai/sdk";

// If ANTHROPIC_API_KEY isn't set yet, this stays null and the AI query
// action returns a friendly "not configured" message instead of crashing —
// same pattern as src/lib/resend.ts.
export const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// Override with ANTHROPIC_MODEL in .env.local if you want a different
// model — check https://docs.claude.com/en/docs/about-claude/models for
// current model IDs.
export const AI_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
