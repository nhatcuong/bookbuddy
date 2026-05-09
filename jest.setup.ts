// Jest setup — runs before any test file is loaded.
// Sets fake API keys so module-level constants (e.g. ANTHROPIC_API_KEY) are
// populated at import time. Without this, the key-check guards in extract.ts
// would throw "API key not set" before the test even reaches the logic under test.
process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY = 'test-anthropic-key';
process.env.EXPO_PUBLIC_OPENAI_API_KEY = 'test-openai-key';
process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = 'test-google-key';
