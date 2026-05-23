/**
 * Tests for extract.ts — Claude-powered note and book info extraction.
 *
 * These tests verify:
 *  1. extractNoteOnly — strips book identification, returns chapter + clean note
 *  2. extractBookInfo — returns structured book info including null title when
 *     no book is mentioned (the most critical edge case for the fallback flow)
 *
 * Strategy: mock the global `fetch` to return canned Claude API responses.
 * We never hit the real Claude API in tests — this keeps tests fast, free,
 * and deterministic regardless of network or API key availability.
 */

import { extractNoteOnly, extractBookInfo, ExtractError } from '../extract';

// ---------------------------------------------------------------------------
// Helpers — build fake Claude API responses
// ---------------------------------------------------------------------------

/**
 * Builds a minimal Claude /v1/messages response that looks like a successful
 * tool_use call. `input` is what Claude "returned" as the structured output.
 */
function makeClaudeResponse(input: Record<string, unknown>): Response {
  return {
    ok: true,
    json: async () => ({
      content: [
        {
          type: 'tool_use',
          name: 'extract_reading_note',
          input,
        },
      ],
    }),
  } as unknown as Response;
}

/**
 * Builds a failed Claude API response (e.g. rate limit, server error).
 */
function makeClaudeErrorResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => ({ error: { message: 'API error' } }),
  } as unknown as Response;
}

/**
 * Builds a Claude response where the content array has no tool_use block —
 * simulates Claude responding with plain text instead of a structured output.
 */
function makeClaudeNoToolResponse(): Response {
  return {
    ok: true,
    json: async () => ({
      content: [{ type: 'text', text: 'I cannot help with that.' }],
    }),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Replace the global fetch with a Jest mock before each test.
  // Individual tests configure the mock's return value via mockResolvedValueOnce.
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.resetAllMocks();
});

// ---------------------------------------------------------------------------
// extractNoteOnly
// ---------------------------------------------------------------------------

describe('extractNoteOnly', () => {
  /**
   * Happy path: Claude returns a chapter reference AND a clean note.
   * Verifies that extractNoteOnly correctly parses the tool_use block
   * and returns both fields as-is.
   */
  it('returns chapter and blocks when Claude responds with both fields', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      makeClaudeResponse({
        chapter: 'chapter 5',
        blocks: [{ type: 'thought', text: 'I found the section on decision fatigue particularly compelling.', location: null }],
      })
    );

    const result = await extractNoteOnly(
      'Just finished chapter 5. The decision fatigue section was really compelling.'
    );

    expect(result.chapter).toBe('chapter 5');
    expect(result.blocks).toEqual([{ type: 'thought', text: 'I found the section on decision fatigue particularly compelling.', location: null }]);
  });

  /**
   * Transcripts often don't mention a chapter at all — e.g. "I read some
   * of this book today, really liked the part about X". Claude should return
   * null for chapter in this case, and extractNoteOnly must pass that through
   * without substituting a default.
   */
  it('returns null chapter when the transcript has no chapter reference', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      makeClaudeResponse({
        chapter: null,
        blocks: [{ type: 'thought', text: 'The section on habits was insightful.', location: null }],
      })
    );

    const result = await extractNoteOnly('Read some of it today. The habits section was insightful.');

    expect(result.chapter).toBeNull();
    expect(result.blocks).toEqual([{ type: 'thought', text: 'The section on habits was insightful.', location: null }]);
  });

  /**
   * When the Claude API returns a non-2xx status (e.g. 429 rate limit, 500
   * server error), extractNoteOnly should throw ExtractError with the status
   * code in the message. It must NOT silently return garbage data.
   */
  it('throws ExtractError when the Claude API returns a non-ok status', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(makeClaudeErrorResponse(429));

    // Must throw ExtractError with the status code in the message so callers
    // can surface a meaningful error to the user (not a generic crash).
    await expect(
      extractNoteOnly('Some transcript text.')
    ).rejects.toThrow(ExtractError);
  });

  /**
   * If Claude returns a response without a tool_use block (e.g. it refuses
   * or replies with plain text), extractNoteOnly must throw ExtractError
   * rather than returning undefined fields. This guards against silent data
   * corruption in the database.
   */
  it('throws ExtractError when Claude response contains no tool_use block', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(makeClaudeNoToolResponse());

    await expect(
      extractNoteOnly('Some transcript text.')
    ).rejects.toThrow(ExtractError);
  });

  /**
   * Quote capture: when the user says "quote ... end quote", Claude should
   * return a quote block. This is the core new behavior in T03.
   */
  it('returns a quote block when the transcript contains a quote signal', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      makeClaudeResponse({
        chapter: null,
        blocks: [
          { type: 'thought', text: 'There was a great line in this chapter.', location: null },
          { type: 'quote', text: 'The value of a man resides in what he gives.', location: 'page 42' },
        ],
      })
    );

    const result = await extractNoteOnly(
      'There was a great line in this chapter. Quote: The value of a man resides in what he gives. End quote. Page 42.'
    );

    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0]).toEqual({ type: 'thought', text: 'There was a great line in this chapter.', location: null });
    expect(result.blocks[1]).toEqual({ type: 'quote', text: 'The value of a man resides in what he gives.', location: 'page 42' });
  });
});

// ---------------------------------------------------------------------------
// extractBookInfo
// ---------------------------------------------------------------------------

describe('extractBookInfo', () => {
  /**
   * Happy path: user clearly states the book title and author.
   * All four fields (title, author, chapter, note) should come back populated.
   */
  it('returns title, author, chapter, and blocks when the book is clearly mentioned', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      makeClaudeResponse({
        title: 'High Output Management',
        author: 'Andy Grove',
        chapter: 'chapter 3',
        blocks: [{ type: 'thought', text: 'I keep thinking about how leverage applies to my own work.', location: null }],
      })
    );

    const result = await extractBookInfo(
      "Finished chapter 3 of High Output Management by Andy Grove. Really makes me think about leverage in my own work."
    );

    expect(result.title).toBe('High Output Management');
    expect(result.author).toBe('Andy Grove');
    expect(result.chapter).toBe('chapter 3');
    expect(result.blocks).toEqual([{ type: 'thought', text: 'I keep thinking about how leverage applies to my own work.', location: null }]);
  });

  /**
   * CRITICAL: when the user speaks a note without mentioning any book — e.g.
   * "Just a quick thought about what I read today" — Claude should return
   * null for title. This is the trigger for the useRecording fallback that
   * routes the note to the most recently recorded book.
   *
   * If this returns a non-null title when it shouldn't, the app creates a
   * phantom book instead of attaching the note to the right one.
   */
  it('returns null title when the transcript mentions no book', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      makeClaudeResponse({
        title: null,
        author: null,
        chapter: null,
        blocks: [{ type: 'thought', text: "I keep coming back to this idea about compounding small habits.", location: null }],
      })
    );

    const result = await extractBookInfo(
      "Just a quick thought — I keep coming back to this idea about compounding small habits."
    );

    expect(result.title).toBeNull();
    expect(result.author).toBeNull();
    // blocks should still be extracted even without a book reference
    expect(result.blocks).toEqual([{ type: 'thought', text: "I keep coming back to this idea about compounding small habits.", location: null }]);
  });

  /**
   * Author is optional — user might say the title but not the author.
   * title should be populated; author should be null.
   */
  it('returns null author when the transcript does not mention one', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      makeClaudeResponse({
        title: 'Thinking, Fast and Slow',
        author: null,
        chapter: null,
        blocks: [{ type: 'thought', text: 'The dual process theory really changed how I think about decisions.', location: null }],
      })
    );

    const result = await extractBookInfo(
      "Reading Thinking Fast and Slow. The dual process theory really changed how I think."
    );

    expect(result.title).toBe('Thinking, Fast and Slow');
    expect(result.author).toBeNull();
  });

  /**
   * Same error handling contract as extractNoteOnly: non-ok Claude response
   * must throw ExtractError, not return partial data.
   */
  it('throws ExtractError when the Claude API returns a non-ok status', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(makeClaudeErrorResponse(500));

    await expect(
      extractBookInfo('Some transcript.')
    ).rejects.toThrow(ExtractError);
  });
});
