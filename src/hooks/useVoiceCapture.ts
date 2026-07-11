import { useState, useRef, useEffect } from 'react';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { transcribeAudio } from '../services/whisper';

export type VoiceCaptureState = 'idle' | 'recording' | 'transcribing';

export function useVoiceCapture(onTranscript: (text: string) => void) {
  const [state, setState] = useState<VoiceCaptureState>('idle');
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    return () => { recorder.stop().catch(() => {}); };
  }, []);

  const durationMs = recorderState.durationMillis ?? 0;

  async function start() {
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) return;
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    await activateKeepAwakeAsync('recording');
    setState('recording');
  }

  async function stop() {
    await recorder.stop();
    const tempUri = recorder.uri;
    if (!tempUri) { await deactivateKeepAwake('recording'); setState('idle'); return; }

    const dir = new Directory(Paths.document, 'recordings');
    if (!dir.exists) dir.create();
    const dest = new File(dir, `capture_${Date.now()}.m4a`);
    new File(tempUri).move(dest);

    setState('transcribing');
    try {
      const text = await transcribeAudio(dest.uri);
      await deactivateKeepAwake('recording');
      setState('idle');
      onTranscriptRef.current(text);
    } catch {
      await deactivateKeepAwake('recording');
      setState('idle');
    }
  }

  return { state, durationMs, start, stop };
}
