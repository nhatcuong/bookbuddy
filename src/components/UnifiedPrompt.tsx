import { useState, useRef, useEffect } from 'react';
import { View, Text, Modal, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import { transcribeAudio } from '../services/whisper';
import Fab, { FabState } from './Fab';
import { NAVY, MUTED, SURFACE } from '../tokens';

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

  useEffect(() => {
    return () => {
      if (recorderState.isRecording) recorder.stop().catch(() => {});
    };
  }, []);

  async function handleFabPress() {
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

  const fabState: FabState =
    micState === 'recording'   ? 'recording'  :
    micState === 'transcribing'? 'processing' : 'idle';

  const hintText =
    micState === 'idle'        ? 'Tap to speak'             :
    micState === 'recording'   ? 'Listening… tap when done' :
                                 'Got it — thank you';

  return (
    <Modal transparent animationType="fade" statusBarTranslucent>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFillObject}>
        <View style={styles.backdrop}>
          <View style={styles.navyTint} />
          <View style={styles.card}>
            <Text style={styles.message}>{message}</Text>
            <Text style={styles.sub}>No rush. Just say the title and I'll move the note for you.</Text>

            <Fab fabState={fabState} onPress={handleFabPress} />

            <Text style={styles.hint}>{hintText}</Text>

            <View style={styles.actions}>
              {secondaryLabel && onSecondary && (
                <Text style={styles.actionLink} onPress={onSecondary}>{secondaryLabel}</Text>
              )}
              <Text style={styles.dismiss} onPress={onDismiss}>Never mind</Text>
            </View>
          </View>
        </View>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  navyTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(27,42,74,0.30)',
  },
  card: {
    width: '100%',
    backgroundColor: SURFACE,
    borderRadius: 26,
    paddingVertical: 36,
    paddingHorizontal: 28,
    alignItems: 'center',
    gap: 16,
  },
  message: {
    fontFamily: 'Newsreader_600SemiBold',
    fontSize: 23,
    color: NAVY,
    textAlign: 'center',
    lineHeight: 30,
  },
  sub: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 20,
  },
  hint: {
    fontSize: 13,
    color: MUTED,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 4,
  },
  actionLink: {
    fontSize: 14,
    color: NAVY,
    fontWeight: '500',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  dismiss: {
    fontSize: 14,
    color: MUTED,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
});
