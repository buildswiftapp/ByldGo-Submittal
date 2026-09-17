// A deliberately simple keyword-overlap retriever. Specs run hundreds of
// pages, so we never hand the whole document to the model — this scores
// each chunk by how many of the query's meaningful words it contains and
// keeps only the strongest few, within a character budget. This is a
// "basic" retrieval step (Step 4); Step 5's split-screen portal can swap
// in something smarter (embeddings, section-aware search) later without
// changing how the rest of the app calls this.

import type { DocChunk } from "./extract";

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "and", "or", "but", "if", "then", "than", "so", "of", "in", "on", "at",
  "to", "for", "with", "by", "from", "as", "this", "that", "these", "those",
  "what", "when", "where", "which", "who", "how", "does", "do", "did",
  "can", "will", "shall", "must", "should", "would", "it", "its", "there",
]);

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

export function retrieveRelevantChunks(
  chunks: DocChunk[],
  query: string,
  opts: { maxChunks: number; maxChars: number }
): DocChunk[] {
  const queryTerms = tokenize(query).filter(
    (t) => t.length > 2 && !STOPWORDS.has(t)
  );

  if (queryTerms.length === 0) {
    return chunks.slice(0, opts.maxChunks);
  }

  const scored = chunks.map((chunk) => {
    const counts = new Map<string, number>();
    for (const t of tokenize(chunk.text)) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    let score = 0;
    for (const qt of queryTerms) {
      score += counts.get(qt) ?? 0;
    }
    return { chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const selected: DocChunk[] = [];
  let totalChars = 0;
  for (const { chunk, score } of scored) {
    if (score === 0) break; // nothing left worth including
    if (selected.length >= opts.maxChunks) break;
    if (totalChars + chunk.text.length > opts.maxChars && selected.length > 0)
      break;
    selected.push(chunk);
    totalChars += chunk.text.length;
  }

  // Nothing matched any query word at all — fall back to the start of the
  // document rather than returning nothing.
  if (selected.length === 0) {
    return chunks.slice(0, Math.min(opts.maxChunks, chunks.length));
  }

  // Return in original document order — easier to read than by score.
  const selectedLabels = new Set(selected.map((c) => c.label));
  return chunks.filter((c) => selectedLabels.has(c.label));
}
