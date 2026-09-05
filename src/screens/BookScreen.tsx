import { useState, useEffect, useCallback, useRef, ElementRef } from 'react';
import {
  View,
  Text,
  Animated,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getBookById, getSessionsByBookId, getBooksByLastSession, deleteBook, deleteSession, reassignSession, updateSessionNote, insertBook, BookRow, SessionRow } from '../db/database';
import { exportBook } from '../services/bookBackup';
import { useRecording } from '../hooks/useRecording';
import { useVoiceCapture } from '../hooks/useVoiceCapture';
import { extractBookInfo, extractNoteOnly, amendNote } from '../services/extract';
import { fetchBookMetadata } from '../services/googleBooks';
import { findMatchingBook } from '../services/matchBook';
import { RootStackParamList } from '../navigation/types';
import NoteBlocksRenderer from '../components/NoteBlocksRenderer';
import Fab from '../components/Fab';
import RecordingOverlay from '../components/RecordingOverlay';
import { NAVY, ACCENT, MUTED, FAINT, DESTRUCTIVE, BODY, PAPER, SURFACE, HAIRLINE, CARD_SHADOW } from '../tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Book'>;

// Scroll distance over which the hero (cover + title) collapses into the
// compact title that crossfades into the fixed nav row.
const HERO_HEIGHT = 176;
const COLLAPSE_RANGE = 130;

// The fixed nav row's height is DERIVED from the compact cover's size, not
// an independently-chosen number — it must always be exactly big enough to
// fit the cover plus top/bottom padding. Picking these separately (as an
// earlier version of this file did) lets the row height and cover size
// silently drift out of sync any time either one changes. Top/bottom are
// intentionally asymmetric (more room below than above).
const COMPACT_COVER_WIDTH = 58;
const COMPACT_COVER_HEIGHT = 84;
const COMPACT_HEADER_PADDING_TOP = 3;
const COMPACT_HEADER_PADDING_BOTTOM = 6;
const COMPACT_HEADER_HEIGHT =
  COMPACT_COVER_HEIGHT + COMPACT_HEADER_PADDING_TOP + COMPACT_HEADER_PADDING_BOTTOM;

export default function BookScreen({ navigation, route }: Props) {
  const { bookId, highlightSessionId } = route.params;
  const insets = useSafeAreaInsets();

  const [book, setBook] = useState<BookRow | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(highlightSessionId ?? null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [wrongBookSessionId, setWrongBookSessionId] = useState<number | null>(null);
  const [amendSessionId, setAmendSessionId] = useState<number | null>(null);
  const [reprocessingId, setReprocessingId] = useState<number | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const scrollViewRef = useRef<ElementRef<typeof ScrollView>>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const heroHeight = scrollY.interpolate({
    inputRange: [0, COLLAPSE_RANGE],
    outputRange: [HERO_HEIGHT, 0],
    extrapolate: 'clamp',
  });
  const heroOpacity = scrollY.interpolate({
    inputRange: [0, COLLAPSE_RANGE * 0.6],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  // Chevron and compact title crossfade over the same range, and hand off
  // interactivity (below, via isCollapsed) at this same midpoint so there's
  // never a gap or overlap in what's tappable.
  const CROSSFADE_START = COLLAPSE_RANGE * 0.55;
  const CROSSFADE_MIDPOINT = (CROSSFADE_START + COLLAPSE_RANGE) / 2;
  const compactTitleOpacity = scrollY.interpolate({
    inputRange: [CROSSFADE_START, COLLAPSE_RANGE],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const chevronOpacity = scrollY.interpolate({
    inputRange: [CROSSFADE_START, COLLAPSE_RANGE],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  function handleScroll(event: { nativeEvent: { contentOffset: { y: number } } }) {
    setIsCollapsed(event.nativeEvent.contentOffset.y >= CROSSFADE_MIDPOINT);
  }

  function expandHeader() {
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  }

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

  const amendCapture = useVoiceCapture((transcript) => {
    if (amendSessionId !== null) {
      const sid = amendSessionId;
      setAmendSessionId(null);
      handleAmend(sid, transcript);
    }
  });

  const wrongBookCapture = useVoiceCapture((transcript) => {
    if (wrongBookSessionId !== null) {
      const sid = wrongBookSessionId;
      setWrongBookSessionId(null);
      handleWrongBook(sid, transcript);
    }
  });

  const isRecording    = state === 'recording';
  const isProcessing   = state === 'transcribing' || state === 'extracting';
  const showOverlay    = isRecording || isProcessing;
  const amendIsActive  = amendCapture.state !== 'idle';
  const wrongBookIsActive = wrongBookCapture.state !== 'idle';

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

  async function handleAmend(sessionId: number, transcript: string) {
    const session = sessions.find(s => s.id === sessionId);
    if (!session?.note) return;
    try {
      const updatedBlocks = await amendNote(session.note, transcript, book?.title ?? '', book?.author ?? null);
      updateSessionNote(sessionId, updatedBlocks);
      load();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not amend note.');
    }
  }

  async function handleReprocess(sessionId: number) {
    const session = sessions.find(s => s.id === sessionId);
    if (!session?.rawTranscript) return;
    setReprocessingId(sessionId);
    try {
      const { blocks } = await extractNoteOnly(session.rawTranscript, book?.title ?? '', book?.author ?? null);
      updateSessionNote(sessionId, blocks);
      load();
    } catch (err: any) {
      Alert.alert('Still failed', err.message ?? 'Could not process this note. Try again later.');
    } finally {
      setReprocessingId(null);
    }
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
      {/* Header — a slim, constant-height nav row. It never grows: the
          compact title below is a separate overlay so a bigger cover there
          doesn't force this row to be tall even when it's invisible. */}
      <View style={styles.headerRow}>
        <Animated.View style={{ opacity: chevronOpacity }} pointerEvents={isCollapsed ? 'none' : 'auto'}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.navButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.backChevron}>‹</Text>
          </TouchableOpacity>
        </Animated.View>
        <TouchableOpacity onPress={() => setMenuOpen(true)} style={styles.navButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.menuDots}>⋯</Text>
        </TouchableOpacity>
      </View>

      {/* Compact title overlay — sized independently of headerRow. Invisible
          (opacity 0, pointerEvents none) until scrolled past the collapse
          point, so it never affects the expanded/at-rest layout above. */}
      <View style={[styles.compactTitleTouchable, { top: insets.top }]} pointerEvents={isCollapsed ? 'auto' : 'none'}>
        <TouchableOpacity onPress={expandHeader} activeOpacity={0.7} style={styles.compactTitleTouchableInner}>
          <Animated.View style={[styles.compactTitle, { opacity: compactTitleOpacity }]}>
            {book?.coverUrl ? (
              <Image source={{ uri: book.coverUrl }} style={styles.compactCover} resizeMode="cover" />
            ) : (
              <View style={styles.compactCoverPlaceholder} />
            )}
            <View style={styles.compactTextBlock}>
              <Text style={styles.compactTitleText} numberOfLines={1}>{book?.title}</Text>
              {book?.author && <Text style={styles.compactAuthorText} numberOfLines={1}>{book.author}</Text>}
            </View>
          </Animated.View>
        </TouchableOpacity>
      </View>

      {/* Collapsing hero — cover + full metadata, shrinks away as the list scrolls */}
      <Animated.View style={[styles.heroContainer, { height: heroHeight, opacity: heroOpacity }]}>
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
      </Animated.View>

      <Animated.ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scroll}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false, listener: handleScroll }
        )}
        scrollEventThrottle={16}
      >
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
                {session.note === null ? (
                  isExpanded ? (
                    <View style={styles.fallbackContainer}>
                      <Text style={styles.fallbackBanner}>Processing failed — showing raw transcript</Text>
                      <Text style={styles.fallbackText}>{session.rawTranscript}</Text>
                    </View>
                  ) : (
                    <Text style={styles.fallbackBanner} numberOfLines={2}>
                      Processing failed — showing raw transcript
                    </Text>
                  )
                ) : (
                  <NoteBlocksRenderer blocks={session.note} collapsed={!isExpanded} />
                )}
                {isExpanded && (
                  <View style={styles.sessionActions}>
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation(); setWrongBookSessionId(session.id); wrongBookCapture.start(); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <View style={styles.recordTrigger}>
                        <Text style={styles.sessionAction}>Wrong book?</Text>
                        <View style={styles.recordDot} />
                      </View>
                    </TouchableOpacity>
                    <View style={styles.sessionActionsRight}>
                      {session.note === null ? (
                        <TouchableOpacity
                          onPress={(e) => { e.stopPropagation(); handleReprocess(session.id); }}
                          disabled={reprocessingId === session.id}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={styles.sessionAction}>
                            {reprocessingId === session.id ? 'Re-processing…' : 'Re-process'}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          onPress={(e) => { e.stopPropagation(); setAmendSessionId(session.id); amendCapture.start(); }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <View style={styles.recordTrigger}>
                            <Text style={styles.sessionAction}>Amend</Text>
                            <View style={styles.recordDot} />
                          </View>
                        </TouchableOpacity>
                      )}
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
      </Animated.ScrollView>

      {/* Recording overlay */}
      {showOverlay && (
        <RecordingOverlay
          state={state as 'recording' | 'transcribing' | 'extracting'}
          durationMs={durationMs}
          customLabel="Record your new reading note"
        />
      )}
      {amendIsActive && (
        <RecordingOverlay
          state={amendCapture.state as 'recording' | 'transcribing'}
          durationMs={amendCapture.durationMs}
          customLabel="Amend a reading note"
        />
      )}
      {wrongBookIsActive && (
        <RecordingOverlay
          state={wrongBookCapture.state as 'recording' | 'transcribing'}
          durationMs={wrongBookCapture.durationMs}
          customLabel="What book was that?"
        />
      )}

      {/* FAB */}
      <View style={styles.fabContainer}>
        <Fab
          fabState={
            wrongBookCapture.state === 'recording'    ? 'recording'  :
            wrongBookCapture.state === 'transcribing' ? 'processing' :
            amendCapture.state === 'recording'        ? 'recording'  :
            amendCapture.state === 'transcribing'     ? 'processing' :
            isRecording ? 'recording' : isProcessing  ? 'processing' : 'idle'
          }
          onPress={
            wrongBookCapture.state === 'recording' ? wrongBookCapture.stop :
            amendCapture.state === 'recording'     ? amendCapture.stop     :
            isRecording ? stop : start
          }
        />
      </View>

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
    position: 'relative',
  },
  // Slim and constant — sized only for the chevron/menu buttons, at rest or
  // collapsed. The compact title lives in its own overlay (below), sized
  // independently, so it never has to influence this row's height.
  headerRow: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Sibling paint order in RN follows JSX order regardless of position,
    // and this is declared before the ScrollView — without an explicit
    // zIndex + opaque background, scrolled session cards paint on top of
    // (and show through) this row instead of staying underneath it.
    zIndex: 10,
    backgroundColor: PAPER,
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
  // Absolutely positioned so the compact title can start flush with the
  // true left edge once the chevron hides, rather than being boxed in by
  // the chevron's own layout space.
  compactTitleTouchable: {
    // top is set inline from useSafeAreaInsets() — a static value here would
    // ignore the safe-area inset entirely, since absolutely-positioned
    // children don't inherit SafeAreaView's inset the way normal-flow
    // content does.
    position: 'absolute',
    left: 20,
    right: 44,
    height: COMPACT_HEADER_HEIGHT,
    // Same paint-order issue as headerRow: this is declared before the
    // ScrollView in JSX, so without zIndex, scrolled session cards paint on
    // top of the compact cover as they pass behind it. The opaque
    // background that actually blocks that content lives on `compactTitle`
    // below, NOT here — this outer container is never opacity-animated, so
    // a background here would stay permanently visible even at rest,
    // painting over both the chevron and the hero's title underneath it.
    zIndex: 10,
  },
  compactTitleTouchableInner: {
    flex: 1,
  },
  compactTitle: {
    flex: 1,
    // paddingTop/paddingBottom reserve exactly COMPACT_COVER_HEIGHT of
    // content area (by construction, since COMPACT_HEADER_HEIGHT is derived
    // from these same three values) — alignItems then centers the cover
    // and text within that content area relative to each other, while the
    // asymmetric padding controls their position within the row as a whole.
    paddingTop: COMPACT_HEADER_PADDING_TOP,
    paddingBottom: COMPACT_HEADER_PADDING_BOTTOM,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: PAPER,
  },
  compactCover: {
    width: COMPACT_COVER_WIDTH,
    height: COMPACT_COVER_HEIGHT,
    borderRadius: 4,
    backgroundColor: '#C8BFAF',
  },
  compactCoverPlaceholder: {
    width: COMPACT_COVER_WIDTH,
    height: COMPACT_COVER_HEIGHT,
    borderRadius: 4,
    backgroundColor: '#C8BFAF',
  },
  compactTextBlock: {
    flexShrink: 1,
  },
  compactTitleText: {
    fontFamily: 'Newsreader_600SemiBold',
    fontSize: 17,
    color: NAVY,
    lineHeight: 20,
  },
  compactAuthorText: {
    fontSize: 13,
    color: MUTED,
    lineHeight: 16,
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
    // No paddingTop: headerRow (COMPACT_HEADER_HEIGHT) owns the entire fixed
    // header's height itself, so scroll content starts immediately after it.
    paddingTop: 0,
  },
  heroContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    overflow: 'hidden',
  },
  bookHeader: {
    flexDirection: 'row',
    gap: 16,
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
    marginBottom: 8,
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
  fallbackContainer: {
    gap: 8,
  },
  fallbackBanner: {
    fontSize: 12.5,
    fontWeight: '700',
    color: DESTRUCTIVE,
  },
  fallbackText: {
    fontSize: 15.5,
    color: BODY,
    lineHeight: 25,
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
  recordTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  recordDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ACCENT,
    opacity: 0.7,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
  },
});
