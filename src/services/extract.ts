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

export async function extractNoteOnly(transcript: string): Promise<{ chapter: string | null; blocks: NoteBlock[] }> {
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
                  'Ordered list of note blocks. Split the transcript into thought and quote blocks. ' +
                  'A quote block is triggered by phrases like "quote ... end quote" or "open quote ... close quote". ' +
                  'Everything else is a thought block. When in doubt, use thought.',
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
          content: `Extract a clean reading note from this transcript:\n\n"${transcript}"`,
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
                  'Ordered list of note blocks. Split the transcript into thought and quote blocks. ' +
                  'A quote block is triggered by phrases like "quote ... end quote" or "open quote ... close quote". ' +
                  'Everything else is a thought block. When in doubt, use thought.',
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
            required: ['title', 'author', 'chapter', 'blocks'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'extract_reading_note' },
      messages: [
        {
          role: 'user',
          content: `Extract book information from this reading note transcript:\n\n"${transcript}"`,
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

