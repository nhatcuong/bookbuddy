import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getBooksByLastSession, BookRow } from '../db/database';
import { importBook } from '../services/bookBackup';
import { useRecording } from '../hooks/useRecording';
import { RootStackParamList } from '../navigation/types';
import UnifiedPrompt from '../components/UnifiedPrompt';
import Fab from '../components/Fab';
import RecordingOverlay from '../components/RecordingOverlay';
import { NAVY, ACCENT, MUTED, FAINT, PAPER, SURFACE, HAIRLINE, CARD_SHADOW } from '../tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const [books, setBooks] = useState<BookRow[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  function loadBooks() {
    setBooks(getBooksByLastSession());
  }

  useFocusEffect(useCallback(() => { loadBooks(); }, []));

  const { state, durationMs, start, stop, cleanup, retryPrompt, provideRetryTranscript } = useRecording(({ bookId, sessionId }) => {
    loadBooks();
    navigation.navigate('Book', { bookId, highlightSessionId: sessionId });
  });

  useEffect(() => () => cleanup(), []);

  const isRecording  = state === 'recording';
  const isProcessing = state === 'transcribing' || state === 'extracting';
  const showOverlay  = isRecording || isProcessing;

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  async function handleImport() {
    setMenuOpen(false);
    try {
      const result = await importBook();
      if (result.status === 'cancelled') return;
      loadBooks();
      const msg = result.status === 'merged'
        ? `Notes imported into existing "${result.bookTitle}".`
        : `"${result.bookTitle}" imported successfully.`;
      Alert.alert('Import complete', msg, [
        { text: 'View book', onPress: () => navigation.navigate('Book', { bookId: result.bookId }) },
        { text: 'OK' },
      ]);
    } catch (err: any) {
      Alert.alert('Import failed', err.message ?? 'Could not import file.');
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.wordmark}>
          <Text style={styles.wordmarkSerif}>Book</Text>
          <Text style={styles.wordmarkScript}>buddy</Text>
        </Text>
        <TouchableOpacity onPress={() => setMenuOpen(true)} style={styles.menuButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.menuDots}>⋯</Text>
        </TouchableOpacity>
      </View>

      {/* Book list */}
      {books.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No books yet</Text>
          <Text style={styles.emptySubtitle}>Tap below to record your first note</Text>
        </View>
      ) : (
        <FlatList
          data={books}
          keyExtractor={b => b.id.toString()}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={[styles.bookCard, index === 0 && styles.bookCardActive]}
              onPress={() => navigation.navigate('Book', { bookId: item.id })}
              activeOpacity={0.75}
            >
              {item.coverUrl ? (
                <Image source={{ uri: item.coverUrl }} style={styles.cover} resizeMode="cover" />
              ) : (
                <View style={styles.coverPlaceholder} />
              )}
              <View style={styles.bookInfo}>
                <Text style={styles.bookTitle} numberOfLines={2}>{item.title}</Text>
                {item.author && <Text style={styles.bookAuthor}>{item.author}</Text>}
                {item.lastSessionAt && (
                  <View style={styles.dateRow}>
                    {index === 0 && <View style={styles.activeDot} />}
                    <Text style={styles.bookDate}>Last note {formatDate(item.lastSessionAt)}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Recording overlay */}
      {showOverlay && (
        <RecordingOverlay
          state={state as 'recording' | 'transcribing' | 'extracting'}
          durationMs={durationMs}
          hasBooks={books.length > 0}
        />
      )}

      {/* FAB */}
      <View style={styles.fabContainer}>
        <Fab
          fabState={isRecording ? 'recording' : isProcessing ? 'processing' : 'idle'}
          onPress={isRecording ? stop : start}
        />
      </View>

      {/* Retry prompt */}
      {retryPrompt && (
        <UnifiedPrompt
          message={retryPrompt.message}
          onTranscript={provideRetryTranscript}
          onDismiss={() => provideRetryTranscript(null)}
        />
      )}

      {/* Menu */}
      {menuOpen && (
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 999 }]}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setMenuOpen(false)} />
          <View style={styles.menuCard}>
            <TouchableOpacity style={styles.menuItem} onPress={handleImport}>
              <Text style={styles.menuItemText}>Import book</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
  },
  wordmark: {
    letterSpacing: -0.4,
  },
  wordmarkSerif: {
    fontFamily: 'Newsreader_600SemiBold',
    fontSize: 28,
    color: NAVY,
  },
  wordmarkScript: {
    fontFamily: 'Newsreader_500Medium_Italic',
    fontSize: 28,
    color: ACCENT,
  },
  menuButton: {
    padding: 4,
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
  list: {
    paddingHorizontal: 16,
    paddingBottom: 140,
    gap: 11,
  },
  bookCard: {
    flexDirection: 'row',
    backgroundColor: SURFACE,
    borderRadius: 14,
    overflow: 'hidden',
    ...CARD_SHADOW,
  },
  bookCardActive: {
    borderWidth: 1,
    borderColor: ACCENT + 'AA',
    shadowOpacity: 0.1,
    shadowRadius: 16,
  },
  cover: {
    width: 52,
    height: 76,
  },
  coverPlaceholder: {
    width: 52,
    height: 76,
    backgroundColor: '#C8BFAF',
  },
  bookInfo: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 13,
    gap: 3,
    justifyContent: 'center',
  },
  bookTitle: {
    fontFamily: 'Newsreader_600SemiBold',
    fontSize: 17,
    color: NAVY,
    lineHeight: 21,
    letterSpacing: -0.2,
  },
  bookAuthor: {
    fontSize: 13,
    color: MUTED,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ACCENT,
  },
  bookDate: {
    fontSize: 12,
    color: FAINT,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 100,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: 'Newsreader_500Medium',
    fontSize: 20,
    color: NAVY,
  },
  emptySubtitle: {
    fontSize: 14,
    color: MUTED,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
  },
});
