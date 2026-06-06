import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  View,
  TouchableOpacity,
  StyleSheet,
  AccessibilityInfo,
} from 'react-native';
import { NAVY, ACCENT } from '../tokens';

export type FabState = 'idle' | 'recording' | 'processing';

type Props = {
  fabState: FabState;
  onPress: () => void;
};

export default function Fab({ fabState, onPress }: Props) {
  const [reduceMotion, setReduceMotion] = useState(false);

  const breatheAnim = useRef(new Animated.Value(1)).current;
  const glowAnim    = useRef(new Animated.Value(0.3)).current;
  const pulseAnim   = useRef(new Animated.Value(1)).current;

  const breatheLoop = useRef<Animated.CompositeAnimation | null>(null);
  const glowLoop    = useRef<Animated.CompositeAnimation | null>(null);
  const pulseLoop   = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    breatheLoop.current?.stop();
    glowLoop.current?.stop();
    pulseLoop.current?.stop();
    breatheAnim.setValue(1);
    glowAnim.setValue(0.3);
    pulseAnim.setValue(1);

    if (reduceMotion) return;

    if (fabState === 'idle') {
      breatheLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(breatheAnim, { toValue: 1.065, duration: 3800, useNativeDriver: true }),
          Animated.timing(breatheAnim, { toValue: 1,     duration: 3800, useNativeDriver: true }),
        ])
      );
      breatheLoop.current.start();

      glowLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 0.65, duration: 3200, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0.2,  duration: 3200, useNativeDriver: true }),
        ])
      );
      glowLoop.current.start();
    }

    if (fabState === 'recording') {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.4, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,   duration: 900, useNativeDriver: true }),
        ])
      );
      pulseLoop.current.start();
    }
  }, [fabState, reduceMotion]);

  const isRecording  = fabState === 'recording';
  const isProcessing = fabState === 'processing';
  const discColor    = isRecording ? ACCENT : NAVY;

  return (
    <View style={styles.hitArea}>
      {/* Ambient glow at idle */}
      {fabState === 'idle' && (
        <Animated.View
          style={[styles.glowHalo, { opacity: glowAnim }]}
          pointerEvents="none"
        />
      )}

      {/* Pulse ring while recording */}
      {isRecording && (
        <Animated.View
          style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]}
          pointerEvents="none"
        />
      )}

      <TouchableOpacity
        onPress={onPress}
        disabled={isProcessing}
        activeOpacity={0.85}
        accessibilityLabel={isRecording ? 'Stop recording' : 'Record a reading note'}
        accessibilityRole="button"
      >
        <Animated.View
          style={[
            styles.disc,
            { backgroundColor: discColor },
            fabState === 'idle' && { transform: [{ scale: breatheAnim }] },
            isProcessing && styles.discProcessing,
          ]}
        >
          {isRecording && <View style={styles.stopIcon} />}
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  hitArea: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowHalo: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: ACCENT,
  },
  pulseRing: {
    position: 'absolute',
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: ACCENT,
    opacity: 0.22,
  },
  disc: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  discProcessing: {
    opacity: 0.45,
  },
  stopIcon: {
    width: 18,
    height: 18,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
});
