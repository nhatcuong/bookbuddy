import { NoteBlock } from '../types/note';

const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;

export type ExtractedNote = {
  title: string | null;
  author: string | null;
  chapter: string | null;
  blocks: NoteBlock[];
};

export class ExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractError';
  }
}

export async function extractNoteOnly(transcript: string, bookTitle: string, bookAuthor: string | null): Promise<{ chapter: string | null; blocks: NoteBlock[] }> {
  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'your_anthropic_api_key_here') {
    throw new ExtractError('Anthropic API key not set in .env');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 512,
      tools: [
        {
          name: 'extract_reading_note',
          description: 'Extract a clean note and optional chapter reference from a reading transcript.',
          input_schema: {
            type: 'object',
            properties: {
              chapter: {
                type: ['string', 'null'],
                description: 'Chapter or section reference if mentioned (e.g. "chapter 3", "part 2"), otherwise null.',
              },
              blocks: {
                type: 'array',
                description:
                  'Ordered list of note blocks. ' +
                  'A "quote" block is text from the book itself — words the author wrote, cited by the user. ' +
                  'Signals: explicit markers ("quote...end quote", "open quote...close quote"), or phrases like "the author writes", "there\'s a line that goes", "he says", "she argues". ' +
                  'Paraphrases ("the author argues that...") are thoughts, not quotes — only use quote when the user appears to be citing the actual words. ' +
                  'A "thought" block is the user\'s own reaction, reflection, or commentary. ' +
                  'When in doubt, use thought.',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['thought', 'quote'] },
                    text: { type: 'string', description: 'The content of the block.' },
                    location: {
                      type: ['string', 'null'],
                      description: 'Page, location, or percentage if mentioned near the quote (e.g. "page 25", "loc 4521"). null for thought blocks.',
                    },
                  },
                  required: ['type', 'text', 'location'],
                },
              },
            },
            required: ['chapter', 'blocks'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'extract_reading_note' },
      messages: [
        {
          role: 'user',
          content: `I just finished a reading session of "${bookTitle}"${bookAuthor ? ` by ${bookAuthor}` : ''} and spoke this note aloud. Structure my spoken thoughts as a clean note.\n\n"${transcript}"`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new ExtractError(`Claude API error: ${response.status}`);
  }

  const json = await response.json();
  const toolUse = json.content?.find((b: any) => b.type === 'tool_use');
  if (!toolUse) {
    throw new ExtractError('No structured output from Claude');
  }

  return toolUse.input as { chapter: string | null; blocks: NoteBlock[] };
}

export async function amendNote(existingBlocks: NoteBlock[], amendTranscript: string, bookTitle: string, bookAuthor: string | null): Promise<NoteBlock[]> {
  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'your_anthropic_api_key_here') {
    throw new ExtractError('Anthropic API key not set in .env');
  }

  const existingText = existingBlocks
    .map((b, i) => {
      const loc = b.type === 'quote' && b.location ? ` [${b.location}]` : '';
      return `[${i + 1}] (${b.type}) ${b.text}${loc}`;
    })
    .join('\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      tools: [
        {
          name: 'amend_reading_note',
          description: 'Apply a spoken amendment to an existing reading note and return the complete updated blocks.',
          input_schema: {
            type: 'object',
            properties: {
              blocks: {
                type: 'array',
                description:
                  'The complete updated note as an ordered list of blocks. ' +
                  'Apply the amendment as follows: ' +
                  '(1) If the user corrects a word or phrase (e.g. "I said metrics not matrix"), find and fix it in the relevant block. ' +
                  '(2) If the user adds new thoughts, append them as new thought blocks. ' +
                  '(3) If the user amends a specific sentence or idea, update the relevant block in place. ' +
                  'Preserve all unchanged blocks exactly. ' +
                  'Only use type "quote" if the block was already a quote or the amendment explicitly introduces quoted text.',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['thought', 'quote'] },
                    text: { type: 'string' },
                    location: { type: ['string', 'null'] },
                  },
                  required: ['type', 'text', 'location'],
                },
              },
            },
            required: ['blocks'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'amend_reading_note' },
      messages: [
        {
          role: 'user',
          content: `I'm reading "${bookTitle}"${bookAuthor ? ` by ${bookAuthor}` : ''}. Here is a note I recorded earlier:\n\n${existingText}\n\nI'd like to amend it. Here is what I just said:\n\n"${amendTranscript}"\n\nApply my amendment and return the complete updated note.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new ExtractError(`Claude API error: ${response.status}`);
  }

  const json = await response.json();
  const toolUse = json.content?.find((b: any) => b.type === 'tool_use');
  if (!toolUse) {
    throw new ExtractError('No structured output from Claude');
  }

  return (toolUse.input as { blocks: NoteBlock[] }).blocks;
}

export async function extractBookInfo(transcript: string): Promise<ExtractedNote> {
  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'your_anthropic_api_key_here') {
    throw new ExtractError('Anthropic API key not set in .env');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      tools: [
        {
          name: 'extract_reading_note',
          description: 'Extract structured book information from a reading note transcript.',
          input_schema: {
            type: 'object',
            properties: {
              title: {
                type: ['string', 'null'],
                description: 'The book title if mentioned or clearly implied. Return null if no book is mentioned.',
              },
              author: {
                type: ['string', 'null'],
                description: 'Author name if mentioned, otherwise null.',
              },
              chapter: {
                type: ['string', 'null'],
                description: 'Chapter or section reference if mentioned (e.g. "chapter 3", "part 2"), otherwise null.',
              },
              blocks: {
                type: 'array',
                description:
                  'Ordered list of note blocks. ' +
                  'A "quote" block is text from the book itself — words the author wrote, cited by the user. ' +
                  'Signals: explicit markers ("quote...end quote", "open quote...close quote"), or phrases like "the author writes", "there\'s a line that goes", "he says", "she argues". ' +
                  'Paraphrases ("the author argues that...") are thoughts, not quotes — only use quote when the user appears to be citing the actual words. ' +
                  'A "thought" block is the user\'s own reaction, reflection, or commentary. ' +
                  'When in doubt, use thought.',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['thought', 'quote'] },
                    text: { type: 'string', description: 'The content of the block, cleaned up from spoken language but preserving meaning.' },
                    location: {
                      type: ['string', 'null'],
                      description: 'Page, location, or percentage if mentioned near the quote (e.g. "page 25", "loc 4521"). null for thought blocks.',
                    },
                  },
                  required: ['type', 'text', 'location'],
                },
              },
            },
            required: ['title', 'author', 'chapter', 'blocks'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'extract_reading_note' },
      messages: [
        {
          role: 'user',
          content: `I just finished a reading session and spoke this note aloud. Extract the book I was reading (title, author, chapter) and structure my spoken thoughts as a clean note.\n\n"${transcript}"`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new ExtractError(`Claude API error: ${response.status}`);
  }

  const json = await response.json();
  const toolUse = json.content?.find((b: any) => b.type === 'tool_use');
  if (!toolUse) {
    throw new ExtractError('No structured output from Claude');
  }

  return toolUse.input as ExtractedNote;
}

