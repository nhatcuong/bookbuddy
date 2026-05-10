import * as SQLite from 'expo-sqlite';
import { BookMetadata } from '../services/googleBooks';
import { ExtractedNote } from '../services/extract';
import { NoteBlock } from '../types/note';

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

  // Migration: add note_version column (no-op if already present)
  try {
    db.execSync(`ALTER TABLE reading_sessions ADD COLUMN note_version INTEGER NOT NULL DEFAULT 1`);
  } catch {
    // Column already exists — safe to ignore
  }
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
  const blocks: NoteBlock[] = [{ type: 'thought', text: extracted.note }];
  const result = db.runSync(
    `INSERT INTO reading_sessions (book_id, chapter, raw_transcript, note, note_version)
     VALUES (?, ?, ?, ?, 2)`,
    bookId,
    extracted.chapter ?? null,
    transcript,
    JSON.stringify(blocks),
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
  note: NoteBlock[];
  sessionDate: string;
};

export function getBooksByLastSession(): BookRow[] {
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
  session: { note: string | NoteBlock[]; chapter: string | null; rawTranscript: string | null; sessionDate: string }
): void {
  const noteJson = Array.isArray(session.note)
    ? JSON.stringify(session.note)
    : JSON.stringify([{ type: 'thought', text: session.note }] satisfies NoteBlock[]);
  db.runSync(
    `INSERT INTO reading_sessions (book_id, chapter, raw_transcript, note, note_version, session_date)
     VALUES (?, ?, ?, ?, 2, ?)`,
    bookId,
    session.chapter ?? null,
    session.rawTranscript ?? null,
    noteJson,
    session.sessionDate,
  );
}

export function deleteBook(bookId: number): void {
  db.runSync(`DELETE FROM reading_sessions WHERE book_id = ?`, bookId);
  db.runSync(`DELETE FROM books WHERE id = ?`, bookId);
}

type RawSessionRow = Omit<SessionRow, 'note'> & { note: string; note_version: number };

export function getSessionsByBookId(bookId: number): SessionRow[] {
  const rows = db.getAllSync<RawSessionRow>(
    `SELECT id, book_id AS bookId, chapter,
            raw_transcript AS rawTranscript,
            note, note_version, session_date AS sessionDate
     FROM reading_sessions
     WHERE book_id = ?
     ORDER BY session_date DESC`,
    bookId
  );
  return rows.map(row => ({
    ...row,
    note: row.note_version === 2
      ? (JSON.parse(row.note) as NoteBlock[])
      : [{ type: 'thought' as const, text: row.note }],
  }));
}

export default db;
