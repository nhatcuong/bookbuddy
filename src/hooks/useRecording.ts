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
import { extractBookInfo, extractNoteOnly, ExtractError } from '../services/extract';
import { fetchBookMetadata, GoogleBooksError } from '../services/googleBooks';
import { findMatchingBook } from '../services/matchBook';
import { insertBook, insertReadingSession, getBooksByLastSession } from '../db/database';

export type RecordingState = 'idle' | 'recording' | 'transcribing' | 'extracting' | 'done';

export type RecordingResult = {
  bookId: number;
  sessionId: number;
};

export type RetryPrompt = {
  message: string;
  // secondaryLabel deferred until T09 (photo fallback)
};

export function useRecording(onComplete: (result: RecordingResult) => void, pinnedBookId?: number) {
  const [state, setState] = useState<RecordingState>('idle');
  const [retryPrompt, setRetryPrompt] = useState<RetryPrompt | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Resolves the Promise inside stop() when the user provides a retry transcript.
  // null means the user dismissed (note discarded).
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

  async function start() {
    try {
      console.log('[rec] requesting permissions');
      const { granted } = await requestRecordingPermissionsAsync();
      console.log('[rec] permissions:', granted);
      if (!granted) {
        Alert.alert('Microphone permission required', 'Please enable it in Settings.');
        return;
      }
      console.log('[rec] setAudioMode');
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      console.log('[rec] prepareToRecordAsync');
      await recorder.prepareToRecordAsync();
      console.log('[rec] record()');
      recorder.record();
      setState('recording');
      console.log('[rec] done');
    } catch (err) {
      console.error('[rec] error:', err);
      Alert.alert('Error', 'Could not start recording.');
    }
  }

  async function stop() {
    try {
      await recorder.stop();
      const tempUri = recorder.uri;
      if (!tempUri) throw new Error('No recording URI');

      const filename = `recording_${Date.now()}.m4a`;
      const dir = new Directory(Paths.document, 'recordings');
      if (!dir.exists) dir.create();
      const dest = new File(dir, filename);
      new File(tempUri).move(dest);

      setState('transcribing');
      const text = await transcribeAudio(dest.uri);

      setState('extracting');
      let bookId: number;
      let sessionId: number;

      if (pinnedBookId != null) {
        const { chapter, blocks } = await extractNoteOnly(text);
        bookId = pinnedBookId;
        sessionId = insertReadingSession(bookId, { title: '', author: null, chapter, blocks }, text);
        console.log('[db] saved session to pinned book', bookId);
      } else {
        const extracted = await extractBookInfo(text);
        console.log('[useRecording] extracted:', JSON.stringify(extracted));

        if (extracted.title === null) {
          Sentry.addBreadcrumb({ category: 'recording', message: 'no_book_identified' });
          const lastBook = getBooksByLastSession()[0] ?? null;

          if (lastBook) {
            bookId = lastBook.id;
            sessionId = insertReadingSession(bookId, extracted, text);
            console.log('[useRecording] no title, using last book', bookId, lastBook.title);
          } else {
            // No books in library — ask up to 2 times before discarding
            let resolved = false;
            const retryMessages = [
              "Sorry, what book was that?",
              "I still couldn't identify it. Try again?",
            ];

            for (const message of retryMessages) {
              const retryTranscript = await awaitRetry(message);
              if (!retryTranscript) break;

              setState('extracting');
              const retryExtracted = await extractBookInfo(retryTranscript);
              if (retryExtracted.title !== null) {
                const existing = getBooksByLastSession();
                const match = findMatchingBook(retryExtracted.title, existing);
                if (match) {
                  bookId = match.id;
                  Sentry.addBreadcrumb({ category: 'recording', message: 'book_matched' });
                } else {
                  const metadata = await fetchBookMetadata(retryExtracted.title, retryExtracted.author);
                  bookId = insertBook(metadata, retryExtracted);
                  Sentry.addBreadcrumb({ category: 'recording', message: 'book_created' });
                }
                sessionId = insertReadingSession(bookId!, retryExtracted, retryTranscript);
                resolved = true;
                break;
              }
            }

            if (!resolved) {
              console.log('[useRecording] all retries failed, discarding note');
              setState('idle');
              return;
            }
          }
        } else {
          const existingBooks = getBooksByLastSession();
          const match = findMatchingBook(extracted.title, existingBooks);
          if (match) {
            console.log('[useRecording] matched existing book', match.id, match.title);
            bookId = match.id;
            sessionId = insertReadingSession(bookId, extracted, text);
            Sentry.addBreadcrumb({ category: 'recording', message: 'book_matched' });
          } else {
            const metadata = await fetchBookMetadata(extracted.title, extracted.author);
            console.log('[useRecording] metadata:', JSON.stringify(metadata));
            bookId = insertBook(metadata, extracted);
            sessionId = insertReadingSession(bookId, extracted, text);
            console.log('[useRecording] saved new book', bookId, '/', extracted.title);
            Sentry.addBreadcrumb({ category: 'recording', message: 'book_created' });
          }
        }
      }

      setState('done');
      Sentry.addBreadcrumb({ category: 'recording', message: 'recording_completed' });
      onCompleteRef.current({ bookId: bookId!, sessionId: sessionId! });
    } catch (err) {
      console.error('Failed to process recording:', err);
      const errorType =
        err instanceof WhisperError ? 'WhisperError'
        : err instanceof ExtractError ? 'ExtractError'
        : err instanceof GoogleBooksError ? 'GoogleBooksError'
        : 'UnknownError';
      Sentry.addBreadcrumb({ category: 'recording', message: 'recording_failed', data: { errorType } });
      const message =
        err instanceof WhisperError || err instanceof ExtractError || err instanceof GoogleBooksError
          ? err.message
          : 'Could not process recording.';
      Alert.alert('Error', message);
      setState('idle');
    }
  }

  function cleanup() {
    if (recorderState.isRecording) recorder.stop().catch(() => {});
  }

  return { state, durationMs, start, stop, cleanup, retryPrompt, provideRetryTranscript };
}
