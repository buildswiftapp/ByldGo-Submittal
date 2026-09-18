// Given one section of a spec book (see segment.ts), asks AI to pull out
// every distinct submittal requirement in it — the actual "registry"
// entries. Runs once per section rather than once per whole document, so
// each item can be cited back to exactly where it came from.

import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { openai, AI_MODEL } from "./openai";
import type { SpecSection } from "./segment";

export type RegistryItem = {
  description: string;
  divisionCode: string | null;
  divisionTitle: string | null;
  sourceLabel: string;
};

// Safety valve: if section detection under-segments (a "section" spanning
// far more pages than expected), don't send unbounded text to the model.
const MAX_SECTION_CHARS = 24000;

const RequirementsSchema = z.object({
  items: z.array(
    z.object({
      description: z.string().describe("Plain-language description of what must be submitted"),
    })
  ),
});

export async function extractRequirementsFromSection(
  section: SpecSection
): Promise<RegistryItem[]> {
  if (!openai) return [];

  const text =
    section.text.length > MAX_SECTION_CHARS
      ? section.text.slice(0, MAX_SECTION_CHARS) + "\n\n[content truncated for length]"
      : section.text;

  const completion = await openai.chat.completions.parse({
    model: AI_MODEL,
    messages: [
      {
        role: "system",
        content:
          'You are reviewing one section of a construction specification book for a general contractor. Find every distinct requirement in this text that requires the contractor to SUBMIT something to the architect/engineer for review before or during construction — product data, shop drawings, samples, certifications, mix designs, test reports, warranties, close-out documents, and similar. Write each as a short, specific, plain-language description a GC could put directly into a submittal log (e.g. "Submit product data for concrete admixtures", not just "admixtures"). If this section has no submittal requirements, return an empty list — don\'t force an answer.',
      },
      {
        role: "user",
        content: `Specification section (${section.label}):\n\n${text}`,
      },
    ],
    response_format: zodResponseFormat(RequirementsSchema, "record_submittal_requirements"),
  });

  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) return [];

  return parsed.items
    .filter((item) => item.description && item.description.trim().length > 0)
    .map((item) => ({
      description: item.description.trim(),
      divisionCode: section.code,
      divisionTitle: section.title,
      sourceLabel: section.label,
    }));
}
