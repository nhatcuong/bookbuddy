import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getBookById, getSessionsByBookId, getBooksByLastSession, deleteBook, deleteSession, reassignSession, insertBook, BookRow, SessionRow } from '../db/database';
import { exportBook } from '../services/bookBackup';
import { useRecording } from '../hooks/useRecording';
import { extractBookInfo } from '../services/extract';
import { fetchBookMetadata } from '../services/googleBooks';
import { findMatchingBook } from '../services/matchBook';
import { RootStackParamList } from '../navigation/types';
import NoteBlocksRenderer from '../components/NoteBlocksRenderer';
import UnifiedPrompt from '../components/UnifiedPrompt';
import Fab from '../components/Fab';
import RecordingOverlay from '../components/RecordingOverlay';
import { NAVY, ACCENT, MUTED, FAINT, DESTRUCTIVE, PAPER, SURFACE, HAIRLINE, CARD_SHADOW } from '../tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Book'>;

export default function BookScreen({ navigation, route }: Props) {
  const { bookId, highlightSessionId } = route.params;

  const [book, setBook] = useState<BookRow | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(highlightSessionId ?? null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [wrongBookSessionId, setWrongBookSessionId] = useState<number | null>(null);
  const rerecordRef = useRef<number | null>(null);

  function load() {
    setBook(getBookById(bookId));
    setSessions(getSessionsByBookId(bookId));
  }

  useFocusEffect(useCallback(() => { load(); }, [bookId]));

  const { state, durationMs, start, stop, cleanup } = useRecording(({ sessionId }) => {
    if (rerecordRef.current !== null) {
      deleteSession(rerecordRef.current);
      rerecordRef.current = null;
    }
    load();
    setExpandedId(sessionId);
  }, bookId);

  useEffect(() => () => cleanup(), []);

  const isRecording  = state === 'recording';
  const isProcessing = state === 'transcribing' || state === 'extracting';
  const showOverlay  = isRecording || isProcessing;

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
          onPress: () => { deleteBook(bookId); navigation.goBack(); },
        },
      ]
    );
  }

  async function handleWrongBook(sessionId: number, transcript: string) {
    try {
      const extracted = await extractBookInfo(transcript);
      if (!extracted.title) {
        Alert.alert("Couldn't identify", "We couldn't identify the book. Try again.");
        return;
      }
      const existing = getBooksByLastSession();
      const match = findMatchingBook(extracted.title, existing);
      let newBookId: number;
      if (match) {
        newBookId = match.id;
      } else {
        const metadata = await fetchBookMetadata(extracted.title, extracted.author);
        newBookId = insertBook(metadata, extracted);
      }
      reassignSession(sessionId, newBookId);
      if (newBookId === bookId) {
        load();
      } else {
        navigation.replace('Book', { bookId: newBookId, highlightSessionId: sessionId });
      }
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not move note.');
    }
  }

  function handleRerecord(sessionId: number) {
    rerecordRef.current = sessionId;
    setExpandedId(null);
    start();
  }

  function handleDeleteSession(sessionId: number) {
    Alert.alert(
      'Delete note',
      'Delete this note? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { deleteSession(sessionId); load(); } },
      ]
    );
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.navButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.backChevron}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMenuOpen(true)} style={styles.navButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
            const isExpanded  = expandedId === session.id;
            const isHighlighted = session.id === highlightSessionId;
            return (
              <TouchableOpacity
                key={session.id}
                style={[styles.sessionItem, isHighlighted && styles.sessionHighlighted]}
                onPress={() => setExpandedId(isExpanded ? null : session.id)}
                activeOpacity={0.75}
              >
                <View style={styles.sessionHeader}>
                  <Text style={styles.sessionDate}>{formatDate(session.sessionDate)}</Text>
                  {session.chapter && <Text style={styles.sessionChapter}>{session.chapter}</Text>}
                </View>
                <NoteBlocksRenderer blocks={session.note} collapsed={!isExpanded} />
                {isExpanded && (
                  <View style={styles.sessionActions}>
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation(); setWrongBookSessionId(session.id); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.sessionAction}>Wrong book?</Text>
                    </TouchableOpacity>
                    <View style={styles.sessionActionsRight}>
                      <TouchableOpacity
                        onPress={(e) => { e.stopPropagation(); handleRerecord(session.id); }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.sessionAction}>Re-record</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={(e) => { e.stopPropagation(); handleDeleteSession(session.id); }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={[styles.sessionAction, styles.sessionActionDestructive]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}

        <View style={{ height: 130 }} />
      </ScrollView>

      {/* Recording overlay */}
      {showOverlay && (
        <RecordingOverlay
          state={state as 'recording' | 'transcribing' | 'extracting'}
          durationMs={durationMs}
          bookTitle={book?.title}
        />
      )}

      {/* FAB */}
      <View style={styles.fabContainer}>
        <Fab
          fabState={isRecording ? 'recording' : isProcessing ? 'processing' : 'idle'}
          onPress={isRecording ? stop : start}
        />
      </View>

      {/* Wrong book correction */}
      {wrongBookSessionId !== null && (
        <UnifiedPrompt
          message="Which book was this for?"
          onTranscript={(transcript) => {
            const sid = wrongBookSessionId;
            setWrongBookSessionId(null);
            handleWrongBook(sid, transcript);
          }}
          onDismiss={() => setWrongBookSessionId(null)}
        />
      )}

      {/* Menu */}
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
    backgroundColor: PAPER,
  },
  headerRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navButton: {
    padding: 4,
  },
  backChevron: {
    fontSize: 32,
    color: NAVY,
    lineHeight: 34,
  },
  menuDots: {
    fontSize: 22,
    color: NAVY,
    letterSpacing: 1,
  },
  menuCard: {
    position: 'absolute',
    top: 56,
    right: 16,
    zIndex: 100,
    backgroundColor: SURFACE,
    borderRadius: 14,
    paddingVertical: 4,
    minWidth: 160,
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 8,
  },
  menuItem: {
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  menuItemText: {
    fontSize: 15,
    color: NAVY,
  },
  menuItemDestructive: {
    fontSize: 15,
    color: DESTRUCTIVE,
  },
  menuDivider: {
    height: 1,
    backgroundColor: HAIRLINE,
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
    width: 104,
    height: 152,
    borderRadius: 4,
    backgroundColor: '#C8BFAF',
  },
  coverPlaceholder: {
    width: 104,
    height: 152,
    borderRadius: 4,
    backgroundColor: '#C8BFAF',
  },
  bookMeta: {
    flex: 1,
    gap: 5,
    justifyContent: 'center',
  },
  bookTitle: {
    fontFamily: 'Newsreader_600SemiBold',
    fontSize: 24,
    color: NAVY,
    lineHeight: 28,
    letterSpacing: -0.4,
  },
  bookAuthor: {
    fontSize: 14,
    color: MUTED,
  },
  bookDetail: {
    fontSize: 12.5,
    color: FAINT,
  },
  divider: {
    height: 1,
    backgroundColor: HAIRLINE,
    marginBottom: 16,
  },
  noSessions: {
    fontSize: 15,
    color: MUTED,
    textAlign: 'center',
    marginTop: 32,
  },
  sessionItem: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    padding: 14,
    marginBottom: 11,
    ...CARD_SHADOW,
    gap: 7,
  },
  sessionHighlighted: {
    borderWidth: 1,
    borderColor: ACCENT + 'AA',
    shadowColor: ACCENT,
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  sessionDate: {
    fontSize: 11,
    fontWeight: '700',
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sessionChapter: {
    fontFamily: 'Newsreader_400Regular_Italic',
    fontSize: 13.5,
    color: ACCENT,
    lineHeight: 18,
  },
  sessionActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  sessionActionsRight: {
    flexDirection: 'row',
    gap: 16,
  },
  sessionAction: {
    fontSize: 13,
    color: MUTED,
  },
  sessionActionDestructive: {
    color: DESTRUCTIVE,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
  },
});
