import * as SQLite from 'expo-sqlite';
import { BookMetadata } from '../services/googleBooks';
import { ExtractedNote } from '../services/extract';

const db = SQLite.openDatabaseSync('bookbuddy.db');

export function initDatabase() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT,
      isbn TEXT,
      google_books_id TEXT,
      cover_url TEXT,
      description TEXT,
      page_count INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reading_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      chapter TEXT,
      raw_transcript TEXT,
      note TEXT,
      session_date TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (book_id) REFERENCES books(id)
    );
  `);
}

// Always inserts a new book row. Matching against existing books is handled separately.
export function insertBook(metadata: BookMetadata | null, extracted: ExtractedNote): number {
  const result = db.runSync(
    `INSERT INTO books (title, author, isbn, google_books_id, cover_url, description, page_count)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    metadata?.title ?? extracted.title ?? 'Unknown',
    metadata?.author ?? extracted.author ?? null,
    metadata?.isbn ?? null,
    metadata?.googleBooksId ?? null,
    metadata?.coverUrl ?? null,
    metadata?.description ?? null,
    metadata?.pageCount ?? null,
  );
  return result.lastInsertRowId;
}

export function insertReadingSession(
  bookId: number,
  extracted: ExtractedNote,
  transcript: string,
): number {
  const result = db.runSync(
    `INSERT INTO reading_sessions (book_id, chapter, raw_transcript, note)
     VALUES (?, ?, ?, ?)`,
    bookId,
    extracted.chapter ?? null,
    transcript,
    extracted.note,
  );
  return result.lastInsertRowId;
}

export type BookRow = {
  id: number;
  title: string;
  author: string | null;
  coverUrl: string | null;
  isbn: string | null;
  googleBooksId: string | null;
  description: string | null;
  pageCount: number | null;
  createdAt: string;
  lastSessionAt: string | null;
};

export type SessionRow = {
  id: number;
  bookId: number;
  chapter: string | null;
  rawTranscript: string | null;
  note: string;
  sessionDate: string;
};

export function getBooks(): BookRow[] {
  return db.getAllSync<BookRow>(`
    SELECT b.id, b.title, b.author,
           b.cover_url        AS coverUrl,
           b.isbn,
           b.google_books_id  AS googleBooksId,
           b.description,
           b.page_count       AS pageCount,
           b.created_at       AS createdAt,
           MAX(rs.session_date) AS lastSessionAt
    FROM books b
    LEFT JOIN reading_sessions rs ON rs.book_id = b.id
    GROUP BY b.id
    ORDER BY lastSessionAt DESC, b.created_at DESC
  `);
}

export function getBookById(id: number): BookRow | null {
  return db.getFirstSync<BookRow>(
    `SELECT id, title, author,
            cover_url       AS coverUrl,
            isbn,
            google_books_id AS googleBooksId,
            description,
            page_count      AS pageCount,
            created_at      AS createdAt,
            NULL            AS lastSessionAt
     FROM books WHERE id = ?`,
    id
  ) ?? null;
}

export function insertReadingSessionRaw(
  bookId: number,
  session: { note: string; chapter: string | null; rawTranscript: string | null; sessionDate: string }
): void {
  db.runSync(
    `INSERT INTO reading_sessions (book_id, chapter, raw_transcript, note, session_date)
     VALUES (?, ?, ?, ?, ?)`,
    bookId,
    session.chapter ?? null,
    session.rawTranscript ?? null,
    session.note,
    session.sessionDate,
  );
}

export function deleteBook(bookId: number): void {
  db.runSync(`DELETE FROM reading_sessions WHERE book_id = ?`, bookId);
  db.runSync(`DELETE FROM books WHERE id = ?`, bookId);
}

export function getSessionsByBookId(bookId: number): SessionRow[] {
  return db.getAllSync<SessionRow>(
    `SELECT id, book_id AS bookId, chapter,
            raw_transcript AS rawTranscript,
            note, session_date AS sessionDate
     FROM reading_sessions
     WHERE book_id = ?
     ORDER BY session_date DESC`,
    bookId
  );
}

export default db;
