// Given one section of a spec book (see segment.ts), asks Claude to pull
// out every distinct submittal requirement in it — the actual "registry"
// entries. Runs once per section rather than once per whole document, so
// each item can be cited back to exactly where it came from.

import { anthropic, AI_MODEL } from "./anthropic";
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

export async function extractRequirementsFromSection(
  section: SpecSection
): Promise<RegistryItem[]> {
  if (!anthropic) return [];

  const text =
    section.text.length > MAX_SECTION_CHARS
      ? section.text.slice(0, MAX_SECTION_CHARS) + "\n\n[content truncated for length]"
      : section.text;

  const response = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 2048,
    system:
      'You are reviewing one section of a construction specification book for a general contractor. Find every distinct requirement in this text that requires the contractor to SUBMIT something to the architect/engineer for review before or during construction — product data, shop drawings, samples, certifications, mix designs, test reports, warranties, close-out documents, and similar. Write each as a short, specific, plain-language description a GC could put directly into a submittal log (e.g. "Submit product data for concrete admixtures", not just "admixtures"). If this section has no submittal requirements, return an empty list — don\'t force an answer.',
    messages: [
      {
        role: "user",
        content: `Specification section (${section.label}):\n\n${text}`,
      },
    ],
    tools: [
      {
        name: "record_submittal_requirements",
        description: "Record the submittal requirements found in this section.",
        input_schema: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: {
                    type: "string",
                    description: "Plain-language description of what must be submitted",
                  },
                },
                required: ["description"],
              },
            },
          },
          required: ["items"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "record_submittal_requirements" },
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") return [];

  const input = toolUse.input as { items?: Array<{ description: string }> };

  return (input.items ?? [])
    .filter((item) => item.description && item.description.trim().length > 0)
    .map((item) => ({
      description: item.description.trim(),
      divisionCode: section.code,
      divisionTitle: section.title,
      sourceLabel: section.label,
    }));
}
