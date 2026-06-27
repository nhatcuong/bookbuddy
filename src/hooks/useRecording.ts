import { useState, useRef } from 'react';
import { Alert } from 'react-native';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sentry from '@sentry/react-native';
import { transcribeAudio, WhisperError } from '../services/whisper';
import { extractBookInfo, extractNoteOnly, ExtractedNote, ExtractError } from '../services/extract';
import { fetchBookMetadata, GoogleBooksError } from '../services/googleBooks';
import { findMatchingBook } from '../services/matchBook';
import { insertBook, insertReadingSession, getBooksByLastSession } from '../db/database';

export type RecordingState = 'idle' | 'recording' | 'transcribing' | 'extracting' | 'done';
export type RecordingResult = { bookId: number; sessionId: number };
export type RetryPrompt = { message: string };

// ---------------------------------------------------------------------------
// Module-level helpers — no hook state, safe to call from anywhere
// ---------------------------------------------------------------------------

async function saveAudioFile(tempUri: string): Promise<string> {
  const dir = new Directory(Paths.document, 'recordings');
  if (!dir.exists) dir.create();
  const dest = new File(dir, `recording_${Date.now()}.m4a`);
  new File(tempUri).move(dest);
  return dest.uri;
}

// Caller guarantees extracted.title is non-null.
async function findOrCreateBook(extracted: ExtractedNote): Promise<number> {
  const existing = getBooksByLastSession();
  const match = findMatchingBook(extracted.title!, existing);
  if (match) {
    Sentry.addBreadcrumb({ category: 'recording', message: 'book_matched' });
    return match.id;
  }
  const metadata = await fetchBookMetadata(extracted.title!, extracted.author);
  Sentry.addBreadcrumb({ category: 'recording', message: 'book_created' });
  return insertBook(metadata, extracted);
}

function recordingErrorMessage(err: unknown): string {
  if (err instanceof WhisperError || err instanceof ExtractError || err instanceof GoogleBooksError) {
    return (err as Error).message;
  }
  return 'Could not process recording.';
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRecording(onComplete: (result: RecordingResult) => void, pinnedBookId?: number) {
  const [state, setState] = useState<RecordingState>('idle');
  const [retryPrompt, setRetryPrompt] = useState<RetryPrompt | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const retryResolveRef = useRef<((text: string | null) => void) | null>(null);

  const durationMs = recorderState.durationMillis ?? 0;

  function provideRetryTranscript(text: string | null) {
    retryResolveRef.current?.(text);
    retryResolveRef.current = null;
    setRetryPrompt(null);
  }

  function awaitRetry(message: string): Promise<string | null> {
    return new Promise(resolve => {
      setRetryPrompt({ message });
      retryResolveRef.current = resolve;
    });
  }

  // No book title extracted and no books in library. Prompts the user up to
  // twice; returns a saved result or null if the user gives up.
  async function resolveWithRetry(transcript: string): Promise<RecordingResult | null> {
    const prompts = [
      "Sorry, what book was that?",
      "I still couldn't identify it. Try again?",
    ];
    for (const message of prompts) {
      const retryTranscript = await awaitRetry(message);
      if (!retryTranscript) return null;

      setState('extracting');
      const extracted = await extractBookInfo(retryTranscript);
      if (extracted.title !== null) {
        const bookId = await findOrCreateBook(extracted);
        const sessionId = insertReadingSession(bookId, extracted, retryTranscript);
        return { bookId, sessionId };
      }
    }
    return null;
  }

  // Transcript → book + session. Returns null if the note is discarded.
  async function processTranscript(transcript: string): Promise<RecordingResult | null> {
    if (pinnedBookId != null) {
      const { chapter, blocks } = await extractNoteOnly(transcript);
      const sessionId = insertReadingSession(pinnedBookId, { title: '', author: null, chapter, blocks }, transcript);
      return { bookId: pinnedBookId, sessionId };
    }

    const extracted = await extractBookInfo(transcript);

    if (extracted.title !== null) {
      const bookId = await findOrCreateBook(extracted);
      const sessionId = insertReadingSession(bookId, extracted, transcript);
      return { bookId, sessionId };
    }

    Sentry.addBreadcrumb({ category: 'recording', message: 'no_book_identified' });
    const lastBook = getBooksByLastSession()[0] ?? null;
    if (lastBook) {
      const sessionId = insertReadingSession(lastBook.id, extracted, transcript);
      return { bookId: lastBook.id, sessionId };
    }

    return resolveWithRetry(transcript);
  }

  async function start() {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert('Microphone permission required', 'Please enable it in Settings.');
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setState('recording');
    } catch {
      Alert.alert('Error', 'Could not start recording.');
    }
  }

  async function stop() {
    try {
      const durationAtStop = recorderState.durationMillis ?? 0;
      await recorder.stop();
      const tempUri = recorder.uri;
      if (!tempUri) throw new Error('No recording URI');

      if (durationAtStop < 1500) {
        setState('idle');
        return;
      }

      const fileUri = await saveAudioFile(tempUri);

      setState('transcribing');
      const transcript = await transcribeAudio(fileUri);

      if (!transcript.trim()) {
        setState('idle');
        return;
      }

      setState('extracting');
      const result = await processTranscript(transcript);

      if (!result) {
        setState('idle');
        return;
      }

      setState('done');
      Sentry.addBreadcrumb({ category: 'recording', message: 'recording_completed' });
      onCompleteRef.current(result);
    } catch (err) {
      const errorType = err instanceof WhisperError ? 'WhisperError'
        : err instanceof ExtractError ? 'ExtractError'
        : err instanceof GoogleBooksError ? 'GoogleBooksError'
        : 'UnknownError';
      Sentry.addBreadcrumb({ category: 'recording', message: 'recording_failed', data: { errorType } });
      Alert.alert('Error', recordingErrorMessage(err));
      setState('idle');
    }
  }

  function cleanup() {
    if (recorderState.isRecording) recorder.stop().catch(() => {});
  }

  return { state, durationMs, start, stop, cleanup, retryPrompt, provideRetryTranscript };
}
