import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Animated,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getBookById, getSessionsByBookId, deleteBook, BookRow, SessionRow } from '../db/database';
import { exportBook } from '../services/bookBackup';
import { useRecording } from '../hooks/useRecording';
import { RootStackParamList } from '../navigation/types';
import { flattenBlocks } from '../types/note';

type Props = NativeStackScreenProps<RootStackParamList, 'Book'>;

const RED = '#E53935';
const DARK_RED = '#B71C1C';

export default function BookScreen({ navigation, route }: Props) {
  const { bookId, highlightSessionId } = route.params;

  const [book, setBook] = useState<BookRow | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(highlightSessionId ?? null);
  const [menuOpen, setMenuOpen] = useState(false);

  function load() {
    setBook(getBookById(bookId));
    setSessions(getSessionsByBookId(bookId));
  }

  useFocusEffect(useCallback(() => { load(); }, [bookId]));

  const { state, durationMs, start, stop, cleanup } = useRecording(({ sessionId }) => {
    load();
    setExpandedId(sessionId);
  }, bookId);

  useEffect(() => () => cleanup(), []);

  const isRecording = state === 'recording';
  const isProcessing = state === 'transcribing' || state === 'extracting';
  const showOverlay = isRecording || isProcessing;

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isRecording) {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.25, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  function formatDuration(ms: number) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  }

  async function handleExport() {
    setMenuOpen(false);
    try {
      await exportBook(bookId);
    } catch (err: any) {
      Alert.alert('Export failed', err.message ?? 'Could not export book.');
    }
  }

  function handleDelete() {
    setMenuOpen(false);
    Alert.alert(
      'Delete book',
      `Delete "${book?.title}" and all its notes? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteBook(bookId);
            navigation.goBack();
          },
        },
      ]
    );
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  const overlayLabel = {
    recording: formatDuration(durationMs),
    transcribing: 'Transcribing…',
    extracting: 'Processing note…',
    done: '',
    idle: '',
  }[state];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMenuOpen(true)} style={styles.menuButton}>
          <Text style={styles.menuDots}>⋯</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Book metadata */}
        {book && (
          <View style={styles.bookHeader}>
            {book.coverUrl ? (
              <Image source={{ uri: book.coverUrl }} style={styles.cover} resizeMode="cover" />
            ) : (
              <View style={styles.coverPlaceholder} />
            )}
            <View style={styles.bookMeta}>
              <Text style={styles.bookTitle}>{book.title}</Text>
              {book.author && <Text style={styles.bookAuthor}>by {book.author}</Text>}
              {book.pageCount != null && <Text style={styles.bookDetail}>{book.pageCount} pages</Text>}
              {book.isbn && <Text style={styles.bookDetail}>ISBN {book.isbn}</Text>}
            </View>
          </View>
        )}

        <View style={styles.divider} />

        {/* Sessions */}
        {sessions.length === 0 ? (
          <Text style={styles.noSessions}>No notes yet</Text>
        ) : (
          sessions.map(session => {
            const isExpanded = expandedId === session.id;
            const isHighlighted = session.id === highlightSessionId;
            return (
              <TouchableOpacity
                key={session.id}
                style={[styles.sessionItem, isHighlighted && styles.sessionHighlighted]}
                onPress={() => setExpandedId(isExpanded ? null : session.id)}
                activeOpacity={0.7}
              >
                <View style={styles.sessionHeader}>
                  <Text style={styles.sessionDate}>{formatDate(session.sessionDate)}</Text>
                  {session.chapter && <Text style={styles.sessionChapter}>{session.chapter}</Text>}
                </View>
                <Text
                  style={styles.sessionNote}
                  numberOfLines={isExpanded ? undefined : 2}
                >
                  {flattenBlocks(session.note)}
                </Text>
              </TouchableOpacity>
            );
          })
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Overlay */}
      {showOverlay && (
        <View style={styles.overlay}>
          <Text style={styles.overlayLabel}>{overlayLabel}</Text>
        </View>
      )}

      {/* FAB */}
      <View style={styles.fab}>
        {isRecording && (
          <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]} />
        )}
        {isProcessing ? (
          <ActivityIndicator size="large" color={RED} />
        ) : (
          <TouchableOpacity
            style={[styles.recordButton, isRecording && styles.recordButtonActive]}
            onPress={isRecording ? stop : start}
            activeOpacity={0.8}
          >
            <View style={[styles.recordIcon, isRecording && styles.stopIcon]} />
          </TouchableOpacity>
        )}
      </View>

      {/* Menu — high zIndex container ensures it's above all content */}
      {menuOpen && (
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 999 }]}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setMenuOpen(false)} />
          <View style={styles.menuCard}>
            <TouchableOpacity style={styles.menuItem} onPress={handleExport}>
              <Text style={styles.menuItemText}>Export notes</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
              <Text style={styles.menuItemDestructive}>Delete book</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  headerRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    padding: 4,
  },
  backArrow: {
    fontSize: 24,
    color: '#1A1A1A',
  },
  menuButton: {
    padding: 4,
  },
  menuDots: {
    fontSize: 22,
    color: '#1A1A1A',
    letterSpacing: 1,
  },
  menuCard: {
    position: 'absolute',
    top: 56,
    right: 16,
    zIndex: 100,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 4,
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuItemText: {
    fontSize: 15,
    color: '#1A1A1A',
  },
  menuItemDestructive: {
    fontSize: 15,
    color: RED,
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#F0F0F0',
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  bookHeader: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  cover: {
    width: 80,
    height: 116,
    borderRadius: 6,
    backgroundColor: '#E0E0E0',
  },
  coverPlaceholder: {
    width: 80,
    height: 116,
    borderRadius: 6,
    backgroundColor: '#E0E0E0',
  },
  bookMeta: {
    flex: 1,
    gap: 4,
    justifyContent: 'center',
  },
  bookTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  bookAuthor: {
    fontSize: 14,
    color: '#555',
  },
  bookDetail: {
    fontSize: 13,
    color: '#AAA',
  },
  divider: {
    height: 1,
    backgroundColor: '#EBEBEB',
    marginBottom: 16,
  },
  noSessions: {
    fontSize: 15,
    color: '#AAA',
    textAlign: 'center',
    marginTop: 32,
  },
  sessionItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
    gap: 6,
  },
  sessionHighlighted: {
    borderWidth: 1.5,
    borderColor: RED + '60',
    backgroundColor: '#FFF8F8',
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sessionDate: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sessionChapter: {
    fontSize: 12,
    color: '#AAA',
  },
  sessionNote: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(250,250,250,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayLabel: {
    fontSize: 22,
    fontWeight: '600',
    color: RED,
    fontVariant: ['tabular-nums'],
  },
  fab: {
    position: 'absolute',
    bottom: 36,
    alignSelf: 'center',
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: RED,
    opacity: 0.2,
  },
  recordButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
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
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
  },
  stopIcon: {
    borderRadius: 4,
    width: 20,
    height: 20,
  },
});
