import { useState, useRef } from 'react';
import { Alert } from 'react-native';
import { Audio } from 'expo-av';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sentry from '@sentry/react-native';
import { transcribeAudio, WhisperError } from '../services/whisper';
import { extractBookInfo, extractNoteOnly, ExtractError } from '../services/extract';
import { fetchBookMetadata, GoogleBooksError } from '../services/googleBooks';
import { findMatchingBook } from '../services/matchBook';
import { insertBook, insertReadingSession, getBooks } from '../db/database';

export type RecordingState = 'idle' | 'recording' | 'transcribing' | 'extracting' | 'done';

export type RecordingResult = {
  bookId: number;
  sessionId: number;
};

export function useRecording(onComplete: (result: RecordingResult) => void, pinnedBookId?: number) {
  const [state, setState] = useState<RecordingState>('idle');
  const [durationMs, setDurationMs] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Keep a stable ref to onComplete so stop() always calls the latest version
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  function clearTimer() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  async function start() {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('Microphone permission required', 'Please enable it in Settings.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setState('recording');
      setDurationMs(0);
      intervalRef.current = setInterval(() => setDurationMs(d => d + 1000), 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
      Alert.alert('Error', 'Could not start recording.');
    }
  }

  async function stop() {
    const rec = recordingRef.current;
    if (!rec) return;
    try {
      clearTimer();
      await rec.stopAndUnloadAsync();
      const tempUri = rec.getURI();
      recordingRef.current = null;
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
        const { chapter, note } = await extractNoteOnly(text);
        bookId = pinnedBookId;
        sessionId = insertReadingSession(bookId, { title: '', author: null, chapter, note }, text);
        console.log('[db] saved session to pinned book', bookId);
      } else {
        const extracted = await extractBookInfo(text);
        console.log('[useRecording] extracted:', JSON.stringify(extracted));

        if (extracted.title === null) {
          // No book mentioned — fall back to the most recently recorded book
          Sentry.addBreadcrumb({ category: 'recording', message: 'no_book_identified' });
          const lastBook = getBooks()[0] ?? null;
          if (!lastBook) throw new Error('No book mentioned and no books recorded yet');
          bookId = lastBook.id;
          sessionId = insertReadingSession(bookId, extracted, text);
          console.log('[useRecording] no title, using last book', bookId, lastBook.title);
        } else {
          const existingBooks = getBooks();
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
      onCompleteRef.current({ bookId, sessionId });
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
    clearTimer();
    recordingRef.current?.stopAndUnloadAsync();
  }

  return { state, durationMs, start, stop, cleanup };
}
