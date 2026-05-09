# BookBuddy — Supported Flows

This document describes every user-facing flow currently implemented in the app.
It is the authoritative reference for what the app does today (not what is planned).

---

## Flow 1 — Record a note (Home screen)

**Entry point:** FAB (red mic button) on Home screen.
**Used when:** User wants to capture a reading note after a session.

```
Tap mic
  → Request microphone permission (first time only)
  → Recording starts — timer counts up, overlay shown
  → Tap mic again to stop
  → "Transcribing…" — audio sent to Whisper API
  → "Identifying book…" — transcript sent to Claude
      → Claude extracts: title, author, chapter, note
  → [See book identification sub-flows below]
  → Note saved to SQLite
  → Navigate to BookScreen for that book, new session highlighted
```

**Sentry events:** `recording_completed`, `recording_failed` (with errorType)

---

## Flow 1a — Book identified, matches existing library entry

Claude extracts a title. `findMatchingBook()` finds a fuzzy match in the local library.

```
Extracted title fuzzy-matches an existing book
  → insertReadingSession() under that book
  → recording_completed ✓
```

**Sentry:** `book_matched`

---

## Flow 1b — Book identified, new book

Claude extracts a title. No fuzzy match found locally. Google Books is queried.

```
Extracted title does not match any existing book
  → fetchBookMetadata(title, author) — Google Books API
      → Returns: title, author, cover URL, ISBN, description, page count
  → insertBook() + insertReadingSession()
  → recording_completed ✓
```

**Sentry:** `book_created`

---

## Flow 1c — No book mentioned, library has books

Claude returns `title: null` (user didn't name a book). Falls back to the most
recently recorded book (`getBooks()[0]`).

```
Extracted title is null
  → getBooks()[0] exists
  → insertReadingSession() under most recent book
  → recording_completed ✓
```

**Sentry:** `no_book_identified`, then `recording_completed`

---

## Flow 1d — No book mentioned, library is empty

Claude returns `title: null` and there are no books to fall back to.
This is the first-ever recording with no book named — an unresolved edge case.

```
Extracted title is null
  → getBooks() returns []
  → Error thrown: "No book mentioned and no books recorded yet"
  → Alert shown to user
  → State resets to idle — note is lost
```

**Sentry:** `no_book_identified`, then `recording_failed` (errorType: UnknownError)

> ⚠️ Known gap — T08 in tasks.md will replace this with a proper retry flow.

---

## Flow 2 — Record a note (Book screen)

**Entry point:** FAB on BookScreen (when viewing a specific book).
**Used when:** User is already on a book's page and wants to add a note.

```
Tap mic on BookScreen
  → Same recording + transcription pipeline as Flow 1
  → extractNoteOnly() used instead of extractBookInfo()
      — only extracts chapter and note, skips book identification entirely
  → insertReadingSession() always saved under the pinned book
  → Session list refreshes, new session highlighted
```

No book identification happens — the book is always the one currently on screen.

**Sentry:** `recording_completed`, `recording_failed` (with errorType)

---

## Flow 3 — View book library

**Entry point:** Home screen on app open.

```
App opens
  → initDatabase() runs (creates tables if not exists)
  → getBooks() loads all books ordered by last session date
  → Book cards displayed: cover, title, author, last note date
  → Tap a book → navigate to BookScreen
```

---

## Flow 4 — View book detail and notes

**Entry point:** Tap a book card on Home screen, or after a successful recording.

```
Navigate to BookScreen
  → getBookById() — loads book metadata
  → getSessionsByBookId() — loads all sessions, newest first
  → Sessions shown as cards: date, chapter, note (collapsed to 2 lines)
  → Tap session → expand/collapse full note text
  → Newly saved session auto-highlighted on first view
```

---

## Flow 5 — Delete a book

**Entry point:** ⋯ menu on BookScreen → "Delete book".

```
Tap "Delete book"
  → Confirmation Alert ("cannot be undone")
  → Confirm → deleteBook(): removes all sessions + book row
  → Navigate back to Home
```

---

## Flow 6 — Export book notes

**Entry point:** ⋯ menu on BookScreen → "Export notes".

```
Tap "Export notes"
  → getBookById() + getSessionsByBookId()
  → Serialise to JSON (BookBackup v1 format)
  → iOS Share Sheet — user can AirDrop, save to Files, share to Notes, etc.
```

Export format is JSON (v1), not Markdown. Markdown export with AI-ready prompt
is planned in T18.

---

## Flow 7 — Import a book backup

**Entry point:** ⋯ menu on Home screen → "Import book".

```
Tap "Import book"
  → DocumentPicker — user selects a .json file
  → Parse BookBackup v1 format
  → findMatchingBook() — check if book already exists
      → Match found: merge sessions into existing book ("merged")
      → No match: insertBook() + all sessions ("created")
  → Alert: "Import complete" with link to view the book
```

---

## Error handling summary

| Failure | User sees | Note |
|---|---|---|
| Microphone permission denied | Alert — go to Settings | Recoverable |
| Whisper API error | Alert with error message | Retryable manually |
| Claude API error | Alert with error message | Retryable manually |
| Google Books 503/429 | Retried up to 3× automatically, then Alert | Mostly transparent |
| No book + empty library | Alert — note is lost | Gap — see T08 |
| Import file invalid | Alert — "Invalid backup file" | Non-recoverable |
