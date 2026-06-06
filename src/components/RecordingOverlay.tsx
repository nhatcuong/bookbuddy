import { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { NAVY, ACCENT, MUTED } from '../tokens';

type OverlayState = 'recording' | 'transcribing' | 'extracting';

type Props = {
  state: OverlayState;
  durationMs: number;
  bookTitle?: string;   // if set → "Recording a note for {title}"
  hasBooks?: boolean;   // used on Home when bookTitle is absent
};

function Waveform() {
  const bar0 = useRef(new Animated.Value(0.3)).current;
  const bar1 = useRef(new Animated.Value(0.6)).current;
  const bar2 = useRef(new Animated.Value(1.0)).current;
  const bar3 = useRef(new Animated.Value(0.5)).current;
  const bar4 = useRef(new Animated.Value(0.4)).current;
  const bars = [bar0, bar1, bar2, bar3, bar4];
  const durations = [620, 450, 750, 520, 680];

  useEffect(() => {
    const loops = bars.map((bar, i) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(bar, { toValue: 1,   duration: durations[i], useNativeDriver: true }),
          Animated.timing(bar, { toValue: 0.2, duration: durations[i], useNativeDriver: true }),
        ])
      );
      setTimeout(() => loop.start(), i * 80);
      return loop;
    });
    return () => loops.forEach(l => l.stop());
  }, []);

  return (
    <View style={wave.container}>
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={[wave.bar, { transform: [{ scaleY: bar }] }]}
        />
      ))}
    </View>
  );
}

const wave = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 30,
  },
  bar: {
    width: 3,
    height: 22,
    borderRadius: 2,
    backgroundColor: ACCENT,
  },
});

export default function RecordingOverlay({ state, durationMs, bookTitle, hasBooks = false }: Props) {
  const isRecording = state === 'recording';

  const mm = String(Math.floor(durationMs / 60000)).padStart(2, '0');
  const ss = String(Math.floor(durationMs / 1000) % 60).padStart(2, '0');

  const processingLabel =
    state === 'transcribing' ? 'Transcribing…' :
    state === 'extracting'   ? 'Identifying book…' : '';

  return (
    <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFillObject}>
      <View style={styles.tint} />
      <View style={styles.center}>
        {isRecording ? (
          <>
            {bookTitle ? (
              <Text style={styles.label}>
                <Text style={styles.labelRegular}>Recording a note for{'\n'}</Text>
                <Text style={styles.labelItalic}>{bookTitle}</Text>
              </Text>
            ) : (
              <Text style={styles.labelRegular}>
                {hasBooks ? 'Recording a new reading note' : 'Record your first reading note'}
              </Text>
            )}
            <Text style={styles.timer}>{mm}:{ss}</Text>
            <Waveform />
          </>
        ) : (
          <>
            <ActivityIndicator size="small" color={NAVY} />
            <Text style={styles.processingLabel}>{processingLabel}</Text>
          </>
        )}
      </View>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(246,243,236,0.62)',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    paddingHorizontal: 32,
  },
  label: {
    textAlign: 'center',
    lineHeight: 32,
  },
  labelRegular: {
    fontFamily: 'Newsreader_500Medium',
    fontSize: 22,
    color: NAVY,
    textAlign: 'center',
    lineHeight: 32,
  },
  labelItalic: {
    fontFamily: 'Newsreader_500Medium_Italic',
    fontSize: 22,
    color: NAVY,
  },
  timer: {
    fontSize: 56,
    fontWeight: '300',
    color: NAVY,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  processingLabel: {
    fontFamily: 'Newsreader_400Regular_Italic',
    fontSize: 20,
    color: NAVY,
    textAlign: 'center',
  },
});
