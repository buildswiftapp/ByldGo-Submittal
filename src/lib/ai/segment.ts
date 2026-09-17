// Splits a spec book into CSI MasterFormat section-sized chunks so the
// registry-extraction pass (registryExtract.ts) can work section-by-section
// instead of on arbitrary page boundaries. This is what lets the registry
// cite "Section 03 30 00" instead of just a page number.
//
// How it works: pages are grouped into overlapping windows and handed to
// Claude, which is asked to point out where each new spec SECTION begins
// (its CSI code, title, and starting page) — regex alone is too fragile
// against how differently real spec books are formatted (OCR noise, page
// headers/footers, inconsistent heading styles). If detection doesn't turn
// up enough boundaries to be useful (a non-paginated .docx, or a PDF whose
// formatting the model can't parse), this falls back to fixed-size page
// blocks so the registry still gets built either way.

import { anthropic, AI_MODEL } from "./anthropic";
import type { DocChunk } from "./extract";

export type SpecSection = {
  code: string | null;
  title: string | null;
  label: string;
  text: string;
};

const WINDOW_PAGES = 25;
const WINDOW_OVERLAP = 2;
const FALLBACK_BLOCK_PAGES = 15;
const MIN_BOUNDARIES_FOR_AI_SEGMENTATION = 3;
const MAX_SECTIONS = 150;

type Boundary = { startPage: number; code: string | null; title: string | null };
type Page = { num: number; text: string };

export async function segmentIntoSections(
  pageChunks: DocChunk[]
): Promise<SpecSection[]> {
  const pages = pageChunks
    .map((c) => ({ num: parsePageNumber(c.label), text: c.text }))
    .filter((p): p is Page => p.num !== null)
    .sort((a, b) => a.num - b.num);

  // Not page-numbered (e.g. a .docx, chunked as "Section 1", "Section 2"...)
  // — nothing to detect boundaries in, go straight to the fallback blocks.
  if (pages.length === 0) {
    return fallbackBlocks(pageChunks);
  }

  let boundaries: Boundary[] = [];
  if (anthropic) {
    try {
      boundaries = await detectBoundaries(pages);
    } catch {
      boundaries = [];
    }
  }

  if (boundaries.length < MIN_BOUNDARIES_FOR_AI_SEGMENTATION) {
    return fallbackBlocks(pageChunks);
  }

  const sections = buildSectionsFromBoundaries(pages, boundaries);
  return mergeDownToLimit(sections, MAX_SECTIONS);
}

function parsePageNumber(label: string): number | null {
  const m = label.match(/Page (\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

async function detectBoundaries(pages: Page[]): Promise<Boundary[]> {
  const all: Boundary[] = [];
  const seenStartPages = new Set<number>();
  const step = WINDOW_PAGES - WINDOW_OVERLAP;

  for (let i = 0; i < pages.length; i += step) {
    const window = pages.slice(i, i + WINDOW_PAGES);
    if (window.length === 0) break;

    const windowText = window.map((p) => `[Page ${p.num}]\n${p.text}`).join("\n\n");
    const found = await detectBoundariesInWindow(windowText);

    for (const b of found) {
      if (!seenStartPages.has(b.startPage)) {
        seenStartPages.add(b.startPage);
        all.push(b);
      }
    }

    if (i + WINDOW_PAGES >= pages.length) break;
  }

  all.sort((a, b) => a.startPage - b.startPage);
  return all;
}

async function detectBoundariesInWindow(windowText: string): Promise<Boundary[]> {
  if (!anthropic) return [];

  const response = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 2048,
    system:
      'You are analyzing pages from a construction specification book. Each page is marked with [Page N]. Find every place a new CSI MasterFormat specification SECTION begins (for example "SECTION 03 30 00" or "03 30 00 - CAST-IN-PLACE CONCRETE") — actual section headings that begin a section\'s content, not divisions, not subsections, and not table-of-contents entries. For each one, report its CSI code if printed (like "03 30 00"), its title, and the page number it starts on. If a section clearly began on a page before this excerpt, don\'t report it again — only report sections that BEGIN within this excerpt.',
    messages: [{ role: "user", content: windowText }],
    tools: [
      {
        name: "record_sections",
        description: "Record the specification sections found in this excerpt.",
        input_schema: {
          type: "object",
          properties: {
            sections: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  code: {
                    type: ["string", "null"],
                    description: "CSI MasterFormat code, e.g. '03 30 00', or null if none is printed",
                  },
                  title: {
                    type: ["string", "null"],
                    description: "Section title, e.g. 'CAST-IN-PLACE CONCRETE'",
                  },
                  startPage: {
                    type: "integer",
                    description: "The page number this section begins on",
                  },
                },
                required: ["startPage"],
              },
            },
          },
          required: ["sections"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "record_sections" },
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") return [];

  const input = toolUse.input as {
    sections?: Array<{ code?: string | null; title?: string | null; startPage: number }>;
  };

  return (input.sections ?? [])
    .filter((s) => typeof s.startPage === "number")
    .map((s) => ({ code: s.code ?? null, title: s.title ?? null, startPage: s.startPage }));
}

function buildSectionsFromBoundaries(
  pages: Page[],
  boundaries: Boundary[]
): SpecSection[] {
  const firstPage = pages[0].num;
  const lastPage = pages[pages.length - 1].num;

  const cuts = [...boundaries];
  if (cuts.length === 0 || cuts[0].startPage > firstPage) {
    cuts.unshift({
      startPage: firstPage,
      code: null,
      title: "Front matter / general requirements",
    });
  }

  const sections: SpecSection[] = [];
  for (let i = 0; i < cuts.length; i++) {
    const start = cuts[i].startPage;
    const end = i + 1 < cuts.length ? cuts[i + 1].startPage - 1 : lastPage;
    const pagesInRange = pages.filter((p) => p.num >= start && p.num <= end);
    if (pagesInRange.length === 0) continue;

    const text = pagesInRange.map((p) => p.text).join("\n\n");
    sections.push({
      code: cuts[i].code,
      title: cuts[i].title,
      label: formatSectionLabel(cuts[i].code, cuts[i].title, start, end),
      text,
    });
  }

  return sections;
}

function formatSectionLabel(
  code: string | null,
  title: string | null,
  start: number,
  end: number
): string {
  const pageRange = start === end ? `p. ${start}` : `pp. ${start}-${end}`;
  const name = [code, title].filter(Boolean).join(" – ") || "Untitled section";
  return `${name} (${pageRange})`;
}

function fallbackBlocks(pageChunks: DocChunk[]): SpecSection[] {
  const sections: SpecSection[] = [];
  for (let i = 0; i < pageChunks.length; i += FALLBACK_BLOCK_PAGES) {
    const block = pageChunks.slice(i, i + FALLBACK_BLOCK_PAGES);
    if (block.length === 0) continue;
    const text = block.map((c) => c.text).join("\n\n");
    const label =
      block.length === 1
        ? block[0].label
        : `${block[0].label} – ${block[block.length - 1].label}`;
    sections.push({ code: null, title: null, label, text });
  }
  return sections;
}

function mergeDownToLimit(sections: SpecSection[], limit: number): SpecSection[] {
  let result = sections;
  while (result.length > limit) {
    const merged: SpecSection[] = [];
    for (let i = 0; i < result.length; i += 2) {
      if (i + 1 < result.length) {
        merged.push({
          code: result[i].code,
          title: result[i].title,
          label: `${result[i].label} + ${result[i + 1].label}`,
          text: `${result[i].text}\n\n${result[i + 1].text}`,
        });
      } else {
        merged.push(result[i]);
      }
    }
    result = merged;
  }
  return result;
}
