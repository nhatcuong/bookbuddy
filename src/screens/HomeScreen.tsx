import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
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
import { getBooksByLastSession, BookRow } from '../db/database';
import { importBook } from '../services/bookBackup';
import { useRecording } from '../hooks/useRecording';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const RED = '#E53935';
const DARK_RED = '#B71C1C';

export default function HomeScreen({ navigation }: Props) {
  const [books, setBooks] = useState<BookRow[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  function loadBooks() {
    setBooks(getBooksByLastSession());
  }

  useFocusEffect(useCallback(() => { loadBooks(); }, []));

  const { state, durationMs, start, stop, cleanup } = useRecording(({ bookId, sessionId }) => {
    loadBooks();
    navigation.navigate('Book', { bookId, highlightSessionId: sessionId });
  });

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

  const overlayLabel = {
    recording: formatDuration(durationMs),
    transcribing: 'Transcribing…',
    extracting: 'Identifying book…',
    done: '',
    idle: '',
  }[state];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>BookBuddy</Text>
        <TouchableOpacity onPress={() => setMenuOpen(true)} style={styles.menuButton}>
          <Text style={styles.menuDots}>⋯</Text>
        </TouchableOpacity>
      </View>

      {books.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No books yet</Text>
          <Text style={styles.emptySubtitle}>Record your first reading note</Text>
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
              activeOpacity={0.7}
            >
              {index === 0 && <View style={styles.activeIndicator} />}
              {item.coverUrl ? (
                <Image source={{ uri: item.coverUrl }} style={styles.cover} resizeMode="cover" />
              ) : (
                <View style={styles.coverPlaceholder} />
              )}
              <View style={styles.bookInfo}>
                <Text style={styles.bookTitle} numberOfLines={2}>{item.title}</Text>
                {item.author && <Text style={styles.bookAuthor}>{item.author}</Text>}
                {item.lastSessionAt && (
                  <Text style={styles.bookDate}>Last note {formatDate(item.lastSessionAt)}</Text>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Overlay during recording / processing */}
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
    backgroundColor: '#FAFAFA',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  header: {
    fontSize: 26,
    fontWeight: '700',
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
  list: {
    paddingHorizontal: 16,
    paddingBottom: 120,
    gap: 10,
  },
  bookCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  bookCardActive: {
    borderWidth: 1,
    borderColor: RED + '40',
  },
  activeIndicator: {
    width: 4,
    backgroundColor: RED,
    borderRadius: 2,
  },
  cover: {
    width: 56,
    height: 80,
    backgroundColor: '#E0E0E0',
  },
  coverPlaceholder: {
    width: 56,
    height: 80,
    backgroundColor: '#E0E0E0',
  },
  bookInfo: {
    flex: 1,
    padding: 12,
    gap: 3,
    justifyContent: 'center',
  },
  bookTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  bookAuthor: {
    fontSize: 13,
    color: '#666',
  },
  bookDate: {
    fontSize: 12,
    color: '#AAA',
    marginTop: 4,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#888',
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
