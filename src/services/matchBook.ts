import { BookRow } from '../db/database';

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')       // punctuation → space
    .replace(/\b(a|an|the)\b/g, '') // drop articles
    .replace(/\s+/g, ' ')
    .trim();
}

function wordOverlap(a: string, b: string): number {
  const wa = new Set(a.split(' ').filter(Boolean));
  const wb = new Set(b.split(' ').filter(Boolean));
  if (wa.size === 0 || wb.size === 0) return 0;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / Math.max(wa.size, wb.size);
}

/**
 * Returns the best matching book from the local library, or null if no
 * confident match is found. Matching is intentionally local-only (no API).
 *
 * Confidence rules (in order):
 *  1. Exact match after normalization
 *  2. One normalized title contains the other (handles subtitles)
 *  3. Word overlap ≥ 0.7 (Jaccard on words)
 */
export function findMatchingBook(title: string, books: BookRow[]): BookRow | null {
  if (books.length === 0) return null;

  const normQuery = normalize(title);

  // Pass 1: exact / containment
  for (const book of books) {
    const normBook = normalize(book.title);
    if (normBook === normQuery) return book;
    if (normBook.includes(normQuery) || normQuery.includes(normBook)) return book;
  }

  // Pass 2: best word-overlap
  let bestScore = 0;
  let bestBook: BookRow | null = null;
  for (const book of books) {
    const score = wordOverlap(normQuery, normalize(book.title));
    if (score > bestScore) {
      bestScore = score;
      bestBook = book;
    }
  }

  return bestScore >= 0.7 ? bestBook : null;
}
