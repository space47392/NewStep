import { useEffect, useState } from 'react';
import { RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useStableCallback } from './useStableCallback';

// Recording a voice message: audio mode, the timer and the length cap.
// The screen asks for the microphone first (askPermission) and decides
// how to send.

const MIN_CLIP_MS = 800;

export type VoiceClip = { uri: string; ms: number };

export function useVoiceRecorder({ maxMs, onMaxReached }: { maxMs: number; onMaxReached: () => void }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const [recording, setRecording] = useState(false);
  const durationMs = state.durationMillis;

  const stop = async () => {
    try {
      await recorder.stop();
    } catch {
      // Already stopped.
    }
    setRecording(false);
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
  };

  // Resolves true once recording has started.
  const start = async (): Promise<boolean> => {
    if (recording) return true;
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      return true;
    } catch {
      return false;
    }
  };

  // Stops and hands back the clip, or null when it's too short to be on purpose.
  const finish = async (): Promise<VoiceClip | null> => {
    const ms = Math.min(maxMs, durationMs);
    await stop();
    const uri = recorder.uri;
    return uri && ms >= MIN_CLIP_MS ? { uri, ms } : null;
  };

  // At the cap, the screen sends it on its own.
  const reachedMax = useStableCallback(onMaxReached);
  useEffect(() => {
    if (recording && durationMs >= maxMs) reachedMax();
  }, [recording, durationMs, maxMs, reachedMax]);

  return { recording, durationMs, start, cancel: stop, finish };
}
