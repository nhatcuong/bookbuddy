import { extractBookInfo, ExtractedNote } from './extract';
import { fetchBookMetadata, BookMetadata } from './googleBooks';

export type BookCandidate = {
  extracted: ExtractedNote;
  metadata: BookMetadata | null;
};

// When certain: one high-confidence match.
// When not certain: a list of candidates for the user to pick from.
// Currently always returns certain=true (single candidate). The type is
// designed to support multi-candidate once extraction returns alternatives.
export type IdentificationResult =
  | { certain: true; candidate: BookCandidate }
  | { certain: false; candidates: BookCandidate[] };

export async function identifyBook(transcript: string): Promise<IdentificationResult> {
  console.log('[identifyBook] transcript:', transcript);

  const extracted = await extractBookInfo(transcript);
  console.log('[identifyBook] extracted:', JSON.stringify(extracted));

  const query = extracted.author
    ? `${extracted.title} inauthor:${extracted.author}`
    : extracted.title;
  const googleBooksUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=1&printType=books`;
  console.log('[identifyBook] Google Books query:', query);
  console.log('[identifyBook] Google Books url:', googleBooksUrl);

  const metadata = await fetchBookMetadata(extracted.title, extracted.author);
  console.log('[identifyBook] Google Books result:', JSON.stringify(metadata));

  return {
    certain: true,
    candidate: { extracted, metadata },
  };
}
