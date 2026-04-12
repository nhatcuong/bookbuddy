const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;

export type ExtractedNote = {
  title: string | null;
  author: string | null;
  chapter: string | null;
  note: string;
};

export class ExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractError';
  }
}

export async function extractNoteOnly(transcript: string): Promise<{ chapter: string | null; note: string }> {
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
              note: {
                type: 'string',
                description: 'A clean first-person summary of the thoughts and observations. Use "I", not "the reader".',
              },
            },
            required: ['chapter', 'note'],
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

  return toolUse.input as { chapter: string | null; note: string };
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
              note: {
                type: 'string',
                description: 'A clean first-person summary of the thoughts and observations from the transcript. Use "I", not "the reader".',
              },
            },
            required: ['title', 'author', 'chapter', 'note'],
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
