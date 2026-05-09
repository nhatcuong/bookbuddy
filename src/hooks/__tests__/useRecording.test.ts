/**
 * Tests for useRecording — the core recording + book identification hook.
 *
 * These tests focus on the fallback branching logic that runs when Claude
 * extracts a null title from the transcript:
 *
 *   Case A — null title + books exist:
 *     The note should be silently attached to the most recently recorded book
 *     (getBooks()[0]). onComplete is called with that book's ID.
 *
 *   Case B — null title + NO books in library:
 *     There is no book to fall back to. The hook must NOT silently discard
 *     the note — it must surface an error to the user via Alert.
 *
 * Strategy: mock every I/O layer (Audio, FileSystem, Whisper, Claude, Google
 * Books, SQLite) so tests run without any native modules or network. Each
 * mock is configured to return the minimal valid data needed to reach the
 * branching logic under test.
 *
 * Note on act() / async: state updates inside the hook must be wrapped in
 * act() so React flushes them synchronously. We use waitFor from
 * @testing-library/react-native to wait for async operations to settle.
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useRecording } from '../useRecording';

// ---------------------------------------------------------------------------
// Module mocks
// All of these are hoisted to the top of the file by Jest before any imports.
// ---------------------------------------------------------------------------

/**
 * expo-av: mock Audio permission, mode, and recording lifecycle.
 * The recording object returned by createAsync is the minimal shape that
 * useRecording's stop() function needs: stopAndUnloadAsync + getURI.
 */
jest.mock('expo-av', () => ({
  Audio: {
    requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
    Recording: {
      createAsync: jest.fn().mockResolvedValue({
        recording: {
          stopAndUnloadAsync: jest.fn().mockResolvedValue(undefined),
          getURI: jest.fn().mockReturnValue('file://tmp/recording.m4a'),
        },
      }),
    },
    RecordingOptionsPresets: { HIGH_QUALITY: {} },
  },
}));

/**
 * expo-file-system: mock Directory and File classes.
 * Directory is always considered to exist so create() is never called.
 * File.move() is a no-op (we don't care about file system side effects).
 * File.uri is a plausible local path used downstream as the transcription input.
 */
jest.mock('expo-file-system', () => ({
  Directory: jest.fn().mockImplementation(() => ({
    exists: true,
    create: jest.fn(),
  })),
  File: jest.fn().mockImplementation((_arg1: string, arg2?: string) => ({
    move: jest.fn(),
    // When called as new File(dir, filename), uri reflects the destination path.
    uri: arg2
      ? `file://documents/recordings/${arg2}`
      : 'file://tmp/recording.m4a',
  })),
  Paths: { document: 'file://documents' },
}));

/**
 * Whisper: always returns a fixed transcript string.
 * The actual content doesn't matter for these tests — what matters is what
 * extractBookInfo does with it.
 */
jest.mock('../../services/whisper', () => ({
  transcribeAudio: jest.fn().mockResolvedValue('Test transcript text.'),
  WhisperError: class WhisperError extends Error {
    constructor(msg: string) { super(msg); this.name = 'WhisperError'; }
  },
}));

/**
 * extract: default mock returns null title (the scenario we're testing).
 * Individual tests override this via mockResolvedValueOnce when needed.
 */
jest.mock('../../services/extract', () => ({
  extractBookInfo: jest.fn().mockResolvedValue({
    title: null,
    author: null,
    chapter: null,
    note: 'A generic reading note.',
  }),
  extractNoteOnly: jest.fn().mockResolvedValue({
    chapter: null,
    note: 'A note from the pinned book flow.',
  }),
  ExtractError: class ExtractError extends Error {
    constructor(msg: string) { super(msg); this.name = 'ExtractError'; }
  },
}));

/**
 * Google Books: not reached in these tests (null title skips the metadata
 * fetch), but mocked to prevent any accidental real network calls.
 */
jest.mock('../../services/googleBooks', () => ({
  fetchBookMetadata: jest.fn().mockResolvedValue(null),
  GoogleBooksError: class GoogleBooksError extends Error {
    constructor(msg: string) { super(msg); this.name = 'GoogleBooksError'; }
  },
}));

/**
 * matchBook: not reached for null-title path (we never try to match a null
 * title against existing books).
 */
jest.mock('../../services/matchBook', () => ({
  findMatchingBook: jest.fn().mockReturnValue(null),
}));

/**
 * Sentry: no-op all methods so analytics calls don't fail in test environment.
 */
jest.mock('@sentry/react-native', () => ({
  addBreadcrumb: jest.fn(),
  init: jest.fn(),
  captureException: jest.fn(),
}));

/**
 * database: the key mock for these tests.
 * - getBooks() is overridden per-test to control whether books exist.
 * - insertReadingSession() returns a fake session ID.
 * - insertBook() is mocked but should not be called in the null-title path.
 */
jest.mock('../../db/database', () => ({
  getBooks: jest.fn(),
  insertBook: jest.fn().mockReturnValue(99),
  insertReadingSession: jest.fn().mockReturnValue(42),
}));

// ---------------------------------------------------------------------------
// Import mocked modules so we can configure them per-test
// ---------------------------------------------------------------------------

import { getBooks, insertReadingSession } from '../../db/database';
import { extractBookInfo } from '../../services/extract';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Drives the hook through a full start() → stop() cycle. */
async function recordAndStop(hookResult: { current: ReturnType<typeof useRecording> }) {
  await act(async () => {
    await hookResult.current.start();
  });
  await act(async () => {
    await hookResult.current.stop();
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useRecording — null title fallback', () => {
  /**
   * CASE A: null title + books in library.
   *
   * Scenario: user says "Just a quick thought about what I read today."
   * Claude returns title: null because no book was mentioned.
   * The library has at least one book (getBooks() returns a non-empty array).
   *
   * Expected behaviour: the note is silently attached to getBooks()[0] — the
   * most recently recorded book — and onComplete is called with that book's ID.
   * No Alert is shown; the user just sees their note appear on the right book.
   */
  it('attaches the note to the most recent book when title is null and books exist', async () => {
    // Arrange: library has one book with id=7
    const existingBook = {
      id: 7,
      title: 'Atomic Habits',
      author: 'James Clear',
      coverUrl: null,
      isbn: null,
      googleBooksId: null,
      description: null,
      pageCount: null,
      createdAt: '2026-04-01T10:00:00Z',
      lastSessionAt: '2026-04-10T09:00:00Z',
    };
    (getBooks as jest.Mock).mockReturnValue([existingBook]);

    // extractBookInfo already defaults to null title (see module mock above)

    const onComplete = jest.fn();
    const { result } = renderHook(() => useRecording(onComplete));

    await recordAndStop(result);

    // onComplete must be called — the recording was not discarded
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    // The bookId passed to onComplete must be the existing book's id, not a new one
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ bookId: existingBook.id })
    );

    // The session was inserted under the existing book
    expect(insertReadingSession).toHaveBeenCalledWith(
      existingBook.id,
      expect.anything(),
      expect.anything()
    );

    // No error should have been shown to the user
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  /**
   * CASE B: null title + empty library.
   *
   * Scenario: user opens the app for the first time and speaks a note that
   * doesn't name a book. There are no books to fall back to.
   *
   * Expected behaviour: the hook cannot save the note (no book to attach it
   * to), so it must surface an error to the user via Alert. onComplete must
   * NOT be called — we must not create phantom data or a bookless session.
   *
   * This test guards against the silent data-loss bug where the note is
   * dropped without any feedback to the user.
   */
  it('shows an Alert and does not call onComplete when title is null and no books exist', async () => {
    // Arrange: completely empty library
    (getBooks as jest.Mock).mockReturnValue([]);

    // extractBookInfo already defaults to null title

    const onComplete = jest.fn();
    const { result } = renderHook(() => useRecording(onComplete));

    await recordAndStop(result);

    // The user must be told something went wrong — silent discard is not acceptable
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));

    // onComplete must NOT have been called — no data should have been saved
    expect(onComplete).not.toHaveBeenCalled();
  });

  /**
   * Regression guard: when a title IS extracted, the null-title fallback path
   * must NOT activate. The note should be routed through the normal
   * book-identification flow (match existing or fetch new metadata).
   *
   * This ensures a future refactor of the null-title branch can't accidentally
   * swallow notes that have a valid title.
   */
  it('does not use the fallback when extractBookInfo returns a non-null title', async () => {
    // Arrange: Claude extracts a real title this time
    (extractBookInfo as jest.Mock).mockResolvedValueOnce({
      title: 'Deep Work',
      author: 'Cal Newport',
      chapter: null,
      note: 'The idea of deep work resonates with how I want to structure my days.',
    });

    // Library has a matching book — findMatchingBook will return it
    const existingBook = {
      id: 3,
      title: 'Deep Work',
      author: 'Cal Newport',
      coverUrl: null,
      isbn: null,
      googleBooksId: null,
      description: null,
      pageCount: null,
      createdAt: '2026-03-15T10:00:00Z',
      lastSessionAt: '2026-04-01T09:00:00Z',
    };
    (getBooks as jest.Mock).mockReturnValue([existingBook]);

    // Make findMatchingBook return the existing book for this title
    const { findMatchingBook } = require('../../services/matchBook');
    (findMatchingBook as jest.Mock).mockReturnValueOnce(existingBook);

    const onComplete = jest.fn();
    const { result } = renderHook(() => useRecording(onComplete));

    await recordAndStop(result);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    // Should have matched the existing book, not fallen back to getBooks()[0]
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ bookId: existingBook.id })
    );
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
