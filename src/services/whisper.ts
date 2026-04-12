const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY;

export class WhisperError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'WhisperError';
  }
}

export async function transcribeAudio(fileUri: string): Promise<string> {
  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your_openai_api_key_here') {
    throw new WhisperError('OpenAI API key not set in .env');
  }

  const formData = new FormData();
  formData.append('file', {
    uri: fileUri,
    name: 'recording.m4a',
    type: 'audio/m4a',
  } as any);
  formData.append('model', 'whisper-1');
  formData.append('language', 'en');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new WhisperError(`Whisper API error: ${response.status}`, response.status);
  }

  const json = await response.json();
  return json.text as string;
}
