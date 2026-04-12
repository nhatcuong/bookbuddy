import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native';
import { Audio } from 'expo-av';
import { Directory, File, Paths } from 'expo-file-system';
import { transcribeAudio, WhisperError } from '../services/whisper';
import { ExtractError } from '../services/extract';
import { GoogleBooksError } from '../services/googleBooks';
import { identifyBook, BookCandidate } from '../services/identifyBook';
import { insertBook, insertReadingSession } from '../db/database';

type RecordingState = 'idle' | 'recording' | 'transcribing' | 'extracting' | 'fetching' | 'done';

export default function VoiceCaptureScreen() {
  const [state, setState] = useState<RecordingState>('idle');
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<BookCandidate | null>(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);
  const durationInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (recording) recording.stopAndUnloadAsync();
      stopPulse();
      if (durationInterval.current) clearInterval(durationInterval.current);
    };
  }, []);

  function startPulse() {
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.25, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    pulseLoop.current.start();
  }

  function stopPulse() {
    pulseLoop.current?.stop();
    pulseAnim.setValue(1);
  }

  async function startRecording() {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('Microphone permission required', 'Please enable it in Settings.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(newRecording);
      setState('recording');
      setDurationMs(0);
      setTranscript(null);
      setCandidate(null);
      startPulse();

      durationInterval.current = setInterval(() => {
        setDurationMs((d) => d + 1000);
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
      Alert.alert('Error', 'Could not start recording.');
    }
  }

  async function stopRecording() {
    if (!recording) return;

    try {
      stopPulse();
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
        durationInterval.current = null;
      }

      await recording.stopAndUnloadAsync();
      const tempUri = recording.getURI();
      setRecording(null);

      if (!tempUri) throw new Error('No URI after recording');

      const filename = `recording_${Date.now()}.m4a`;
      const recordingsDir = new Directory(Paths.document, 'recordings');
      if (!recordingsDir.exists) recordingsDir.create();
      const dest = new File(recordingsDir, filename);
      const src = new File(tempUri);
      src.move(dest);

      setState('transcribing');
      const text = await transcribeAudio(dest.uri);
      setTranscript(text);

      setState('extracting');
      const result = await identifyBook(text);
      const candidate = result.certain ? result.candidate : result.candidates[0] ?? null;
      setCandidate(candidate);

      if (candidate) {
        const bookId = insertBook(candidate.metadata, candidate.extracted);
        insertReadingSession(bookId, candidate.extracted, text);
        console.log('[db] saved book', bookId, '/', candidate.extracted.title);
      }

      setState('done');
    } catch (err) {
      console.error('Failed to stop recording:', err);
      const message =
        err instanceof WhisperError ||
        err instanceof ExtractError ||
        err instanceof GoogleBooksError
          ? err.message
          : 'Could not process recording.';
      Alert.alert('Error', message);
      setState('idle');
    }
  }

  function formatDuration(ms: number) {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
    const s = (totalSec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  const isRecording = state === 'recording';
  const isProcessing = state === 'transcribing' || state === 'extracting' || state === 'fetching';

  const subtitleText = {
    idle: 'Tap to record your reading note',
    recording: 'Recording… tap to stop',
    transcribing: 'Transcribing…',
    extracting: 'Extracting book info…',
    fetching: 'Fetching book metadata…',
    done: 'Tap to record another note',
  }[state];

  const extracted = candidate?.extracted ?? null;
  const metadata = candidate?.metadata ?? null;
  const displayTitle = metadata?.title ?? extracted?.title;
  const displayAuthor = metadata?.author ?? extracted?.author;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>BookBuddy</Text>
      <Text style={styles.subtitle}>{subtitleText}</Text>

      <Text style={styles.duration}>
        {state !== 'idle' && state !== 'done' ? formatDuration(durationMs) : ' '}
      </Text>

      <View style={styles.buttonWrapper}>
        {isRecording && (
          <Animated.View
            style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]}
          />
        )}
        {isProcessing ? (
          <ActivityIndicator size="large" color={RED} />
        ) : (
          <TouchableOpacity
            style={[styles.recordButton, isRecording && styles.recordButtonActive]}
            onPress={isRecording ? stopRecording : startRecording}
            activeOpacity={0.8}
          >
            <View style={[styles.recordIcon, isRecording && styles.stopIcon]} />
          </TouchableOpacity>
        )}
      </View>

      {/* Book card */}
      {candidate && (
        <View style={styles.card}>
          <View style={styles.bookHeader}>
            {metadata?.coverUrl ? (
              <Image source={{ uri: metadata.coverUrl }} style={styles.cover} resizeMode="cover" />
            ) : (
              <View style={styles.coverPlaceholder} />
            )}
            <View style={styles.bookInfo}>
              <Text style={styles.bookTitle} numberOfLines={3}>{displayTitle}</Text>
              {displayAuthor && <Text style={styles.bookAuthor}>by {displayAuthor}</Text>}
              {extracted?.chapter && <Text style={styles.bookChapter}>{extracted.chapter}</Text>}
              {metadata?.pageCount && (
                <Text style={styles.bookMeta}>{metadata.pageCount} pages</Text>
              )}
            </View>
          </View>

          <View style={styles.divider} />

          <Text style={styles.cardLabel}>Note</Text>
          <Text style={styles.noteText}>{extracted?.note}</Text>
        </View>
      )}

      {/* Raw transcript */}
      {transcript && (
        <View style={styles.transcriptBox}>
          <Text style={styles.cardLabel}>Transcript</Text>
          <Text style={styles.transcriptText}>{transcript}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const RED = '#E53935';
const DARK_RED = '#B71C1C';

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#FAFAFA',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 24,
    paddingVertical: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
  },
  duration: {
    fontSize: 22,
    fontWeight: '600',
    color: RED,
    fontVariant: ['tabular-nums'],
    height: 32,
  },
  buttonWrapper: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  pulseRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: RED,
    opacity: 0.2,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: RED,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  recordButtonActive: {
    backgroundColor: DARK_RED,
  },
  recordIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
  },
  stopIcon: {
    borderRadius: 4,
    width: 24,
    height: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  bookHeader: {
    flexDirection: 'row',
    gap: 14,
  },
  cover: {
    width: 70,
    height: 100,
    borderRadius: 6,
    backgroundColor: '#E0E0E0',
  },
  coverPlaceholder: {
    width: 70,
    height: 100,
    borderRadius: 6,
    backgroundColor: '#E0E0E0',
  },
  bookInfo: {
    flex: 1,
    gap: 4,
    justifyContent: 'center',
  },
  bookTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  bookAuthor: {
    fontSize: 14,
    color: '#555',
  },
  bookChapter: {
    fontSize: 13,
    color: '#888',
  },
  bookMeta: {
    fontSize: 12,
    color: '#AAA',
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginVertical: 4,
  },
  noteText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  transcriptBox: {
    width: '100%',
    backgroundColor: '#F3F3F3',
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  transcriptText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
  },
});
