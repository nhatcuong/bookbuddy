export type BookMetadata = {
  googleBooksId: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  isbn: string | null;
  description: string | null;
  pageCount: number | null;
};

export class GoogleBooksError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleBooksError';
  }
}

const GOOGLE_BOOKS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY;

async function fetchWithRetry(url: string): Promise<Response> {
  const res = await fetch(url);
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 1500));
    return fetch(url);
  }
  return res;
}

function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(a|an|the)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleSimilarity(a: string, b: string): number {
  const wa = new Set(normalizeTitle(a).split(' ').filter(Boolean));
  const wb = new Set(normalizeTitle(b).split(' ').filter(Boolean));
  if (wa.size === 0 || wb.size === 0) return 0;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / Math.max(wa.size, wb.size);
}

function parseItem(item: any, fallbackTitle: string): BookMetadata {
  const info = item.volumeInfo;
  const isbn =
    info.industryIdentifiers?.find(
      (id: any) => id.type === 'ISBN_13' || id.type === 'ISBN_10'
    )?.identifier ?? null;
  const rawCover: string | null =
    info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail ?? null;
  return {
    googleBooksId: item.id,
    title: info.title ?? fallbackTitle,
    author: info.authors?.[0] ?? null,
    coverUrl: rawCover ? rawCover.replace('http://', 'https://') : null,
    isbn,
    description: info.description ?? null,
    pageCount: info.pageCount ?? null,
  };
}

async function queryBooks(query: string, key: string): Promise<any[]> {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5&printType=books${key}`;
  console.log('[googleBooks] query:', query);
  const response = await fetchWithRetry(url);
  if (!response.ok) throw new GoogleBooksError(`Google Books API error: ${response.status}`);
  const json = await response.json();
  return json.items ?? [];
}

export async function fetchBookMetadata(
  title: string,
  author: string | null
): Promise<BookMetadata | null> {
  const key = GOOGLE_BOOKS_API_KEY ? `&key=${GOOGLE_BOOKS_API_KEY}` : '';

  // Try with author filter first, fall back to title-only if it yields nothing
  const queries = author
    ? [`intitle:"${title}" inauthor:"${author}"`, `intitle:"${title}"`]
    : [`intitle:"${title}"`];

  let items: any[] = [];
  for (const q of queries) {
    items = await queryBooks(q, key);
    if (items.length > 0) break;
  }

  if (items.length === 0) return null;

  // Pick the result whose title best matches what the user said
  let best = items[0];
  let bestScore = titleSimilarity(title, items[0].volumeInfo?.title ?? '');
  for (const item of items.slice(1)) {
    const score = titleSimilarity(title, item.volumeInfo?.title ?? '');
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  console.log('[googleBooks] best match:', best.volumeInfo?.title, 'score:', bestScore);
  return parseItem(best, title);
}
