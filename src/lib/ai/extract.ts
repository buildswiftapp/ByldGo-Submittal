// Pulls plain text out of an uploaded submittal file, split into labeled
// chunks (page numbers for PDFs, numbered sections for Word docs) so the
// AI query step can cite where an answer came from and can retrieve just
// the relevant pieces instead of reading an entire document at once.

export type DocChunk = { label: string; text: string };

const DOCX_CHUNK_SIZE = 1800; // characters — .docx has no built-in "page" concept

// pdf-parse reads PDFs through pdfjs-dist, which normally hands off text
// extraction to a "worker". There's no real browser Worker on the server, so
// pdfjs-dist falls back to running the worker code in-process — but it does
// that by dynamically import()-ing a relative "./pdf.worker.mjs" path *at
// runtime*. Next.js's bundler (Turbopack in dev, webpack in production)
// can't see inside that runtime string to know the file needs to be copied
// into its build output, so the import fails once the app is bundled (it
// works fine in plain Node, which is why this wasn't caught earlier).
// Importing the worker module ourselves, up front, and handing it to
// pdfjs-dist via the same global it already checks first sidesteps that
// broken dynamic import entirely.
let pdfWorkerSetup: Promise<void> | null = null;
function ensurePdfWorker(): Promise<void> {
  if (!pdfWorkerSetup) {
    pdfWorkerSetup = import("pdfjs-dist/legacy/build/pdf.worker.mjs").then(
      (worker) => {
        (globalThis as unknown as { pdfjsWorker?: unknown }).pdfjsWorker =
          worker;
      }
    );
  }
  return pdfWorkerSetup;
}

export async function extractChunks(
  buffer: Buffer,
  fileName: string
): Promise<DocChunk[]> {
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".pdf")) {
    await ensurePdfWorker();
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.pages
        .map((p) => ({ label: `Page ${p.num}`, text: p.text.trim() }))
        .filter((chunk) => chunk.text.length > 0);
    } finally {
      await parser.destroy();
    }
  }

  if (lower.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return chunkPlainText(result.value, DOCX_CHUNK_SIZE).map((text, i) => ({
      label: `Section ${i + 1}`,
      text,
    }));
  }

  if (lower.endsWith(".doc")) {
    throw new Error(
      "AI analysis doesn't support legacy .doc files yet — re-upload this as a PDF or .docx to use it."
    );
  }

  throw new Error("AI analysis only supports PDF and .docx files right now.");
}

function chunkPlainText(text: string, size: number): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const chunks: string[] = [];
  for (let i = 0; i < clean.length; i += size) {
    chunks.push(clean.slice(i, i + size).trim());
  }
  return chunks.filter((c) => c.length > 0);
}
