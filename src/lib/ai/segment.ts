// Splits a spec book into CSI MasterFormat section-sized chunks so the
// registry-extraction pass (registryExtract.ts) can work section-by-section
// instead of on arbitrary page boundaries. This is what lets the registry
// cite "Section 03 30 00" instead of just a page number.
//
// How it works: pages are grouped into overlapping windows and handed to
// AI, which is asked to point out where each new spec SECTION begins (its
// CSI code, title, and starting page) — regex alone is too fragile against
// how differently real spec books are formatted (OCR noise, page
// headers/footers, inconsistent heading styles). If detection doesn't turn
// up enough boundaries to be useful (a non-paginated .docx, or a PDF whose
// formatting the model can't parse), this falls back to fixed-size page
// blocks so the registry still gets built either way.

import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { openai, AI_MODEL } from "./openai";
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

export type SegmentProgress = (current: number, total: number) => void;

export async function segmentIntoSections(
  pageChunks: DocChunk[],
  onProgress?: SegmentProgress
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
  if (openai) {
    try {
      boundaries = await detectBoundaries(pages, onProgress);
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

// Precomputes each window's starting index up front (rather than tracking
// progress inline in the loop below) so the total window count is known
// before the first AI call — that's what lets onProgress report "1 of 12"
// instead of just a running count with no denominator.
function windowStarts(pageCount: number): number[] {
  const step = WINDOW_PAGES - WINDOW_OVERLAP;
  const starts: number[] = [];
  for (let i = 0; i < pageCount; i += step) {
    starts.push(i);
    if (i + WINDOW_PAGES >= pageCount) break;
  }
  return starts;
}

async function detectBoundaries(
  pages: Page[],
  onProgress?: SegmentProgress
): Promise<Boundary[]> {
  const all: Boundary[] = [];
  const seenStartPages = new Set<number>();
  const starts = windowStarts(pages.length);

  for (let w = 0; w < starts.length; w++) {
    const window = pages.slice(starts[w], starts[w] + WINDOW_PAGES);
    if (window.length === 0) break;

    const windowText = window.map((p) => `[Page ${p.num}]\n${p.text}`).join("\n\n");
    const found = await detectBoundariesInWindow(windowText);

    for (const b of found) {
      if (!seenStartPages.has(b.startPage)) {
        seenStartPages.add(b.startPage);
        all.push(b);
      }
    }

    onProgress?.(w + 1, starts.length);
  }

  all.sort((a, b) => a.startPage - b.startPage);
  return all;
}

const BoundariesSchema = z.object({
  sections: z.array(
    z.object({
      code: z
        .string()
        .nullable()
        .describe("CSI MasterFormat code, e.g. '03 30 00', or null if none is printed"),
      title: z.string().nullable().describe("Section title, e.g. 'CAST-IN-PLACE CONCRETE'"),
      startPage: z.number().int().describe("The page number this section begins on"),
    })
  ),
});

async function detectBoundariesInWindow(windowText: string): Promise<Boundary[]> {
  if (!openai) return [];

  const completion = await openai.chat.completions.parse({
    model: AI_MODEL,
    messages: [
      {
        role: "system",
        content:
          'You are analyzing pages from a construction specification book. Each page is marked with [Page N]. Find every place a new CSI MasterFormat specification SECTION begins (for example "SECTION 03 30 00" or "03 30 00 - CAST-IN-PLACE CONCRETE") — actual section headings that begin a section\'s content, not divisions, not subsections, and not table-of-contents entries. For each one, report its CSI code if printed (like "03 30 00"), its title, and the page number it starts on. If a section clearly began on a page before this excerpt, don\'t report it again — only report sections that BEGIN within this excerpt.',
      },
      { role: "user", content: windowText },
    ],
    response_format: zodResponseFormat(BoundariesSchema, "record_sections"),
  });

  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) return [];

  return parsed.sections.map((s) => ({
    code: s.code,
    title: s.title,
    startPage: s.startPage,
  }));
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
