import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import { transcribeAudio } from '../services/whisper';

const RED = '#E53935';
const DARK_RED = '#B71C1C';

type MicState = 'idle' | 'recording' | 'transcribing';

type Props = {
  message: string;
  onTranscript: (transcript: string) => void;
  onDismiss: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
};

export default function UnifiedPrompt({ message, onTranscript, onDismiss, secondaryLabel, onSecondary }: Props) {
  const [micState, setMicState] = useState<MicState>('idle');
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const isRecording = micState === 'recording';

  useEffect(() => {
    if (isRecording) {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  // Stop recorder on unmount if still recording
  useEffect(() => {
    return () => {
      if (recorderState.isRecording) recorder.stop().catch(() => {});
    };
  }, []);

  async function handleMicPress() {
    if (micState === 'recording') {
      await recorder.stop();
      const tempUri = recorder.uri;
      if (!tempUri) return;

      const filename = `prompt_${Date.now()}.m4a`;
      const dir = new Directory(Paths.document, 'recordings');
      if (!dir.exists) dir.create();
      const dest = new File(dir, filename);
      new File(tempUri).move(dest);

      setMicState('transcribing');
      try {
        const text = await transcribeAudio(dest.uri);
        setMicState('idle');
        onTranscript(text);
      } catch {
        setMicState('idle');
      }
    } else {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) return;
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setMicState('recording');
    }
  }

  const hintText =
    micState === 'idle' ? 'Tap to speak' :
    micState === 'recording' ? 'Tap to stop' :
    'Transcribing…';

  return (
    <Modal transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.micWrapper}>
            {isRecording && (
              <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]} />
            )}
            {micState === 'transcribing' ? (
              <ActivityIndicator size="large" color={RED} />
            ) : (
              <TouchableOpacity
                style={[styles.micButton, isRecording && styles.micButtonActive]}
                onPress={handleMicPress}
                activeOpacity={0.8}
              >
                <View style={[styles.micIcon, isRecording && styles.stopIcon]} />
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.hint}>{hintText}</Text>

          <View style={styles.actions}>
            {secondaryLabel && onSecondary && (
              <TouchableOpacity onPress={onSecondary} style={styles.actionButton}>
                <Text style={styles.actionText}>{secondaryLabel}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onDismiss} style={styles.actionButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    width: '100%',
    backgroundColor: '#FAFAFA',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    gap: 20,
  },
  message: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1A1A1A',
    textAlign: 'center',
    lineHeight: 30,
  },
  micWrapper: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: RED,
    opacity: 0.2,
  },
  micButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: RED,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  micButtonActive: {
    backgroundColor: DARK_RED,
  },
  micIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fff',
  },
  stopIcon: {
    borderRadius: 4,
    width: 22,
    height: 22,
  },
  hint: {
    fontSize: 14,
    color: '#888',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  actionText: {
    fontSize: 15,
    color: RED,
    fontWeight: '500',
  },
  cancelText: {
    fontSize: 15,
    color: '#888',
  },
});
