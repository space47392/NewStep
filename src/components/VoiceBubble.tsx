import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useChatPhotoUrl } from '../lib/chatPhotos';
import { colors, fontFamily, fontSize, radius, spacing } from '../constants/theme';

// A voice message: play/pause, a little sound wave that fills as it plays,
// and the time. The file is private (chat-photos bucket), so it plays from a
// short-lived signed URL — or from the local file while it's still sending.

const BARS = 26;

export function formatVoiceTime(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// The same id always draws the same wave.
function waveFor(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return Array.from({ length: BARS }, (_, i) => {
    h = Math.imul(h ^ (i + 1), 16777619);
    const r = ((h >>> 0) % 1000) / 1000;
    // Softer at the ends, fuller in the middle, like a real voice.
    const shape = Math.sin((Math.PI * (i + 0.5)) / BARS);
    return 0.25 + 0.75 * (0.35 * shape + 0.65 * r * shape + 0.15);
  });
}

type Props = {
  id: string;
  path?: string | null;
  localUri?: string;
  ms: number;
  mine: boolean;
  onLongPress?: () => void;
};

export default function VoiceBubble({ id, path, localUri, ms, mine, onLongPress }: Props) {
  const signed = useChatPhotoUrl(localUri ? null : path);
  const uri = localUri ?? signed;
  const player = useAudioPlayer(uri ? { uri } : null);
  const status = useAudioPlayerStatus(player);
  const wave = useMemo(() => waveFor(id), [id]);

  const durationMs = status.duration > 0 ? status.duration * 1000 : ms;
  const progress = durationMs > 0 ? Math.min(1, (status.currentTime * 1000) / durationMs) : 0;
  const finished = status.didJustFinish || progress >= 0.995;

  const toggle = async () => {
    if (!uri) return;
    // The player's own flag, not the last rendered status, so a quick tap
    // while it's playing always pauses.
    if (player.playing) {
      player.pause();
      return;
    }
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
    if (finished) await player.seekTo(0).catch(() => {});
    player.play();
  };

  const ink = mine ? colors.onPrimary : colors.textDark;
  const dim = mine ? 'rgba(42,29,18,0.3)' : colors.border;
  const shown = status.playing || progress > 0 ? status.currentTime * 1000 : durationMs;

  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.8}
      onPress={toggle}
      onLongPress={onLongPress}
      delayLongPress={350}
      disabled={!uri}
      accessibilityRole="button"
      accessibilityLabel={`${status.playing ? 'Pause' : 'Play'} voice message, ${formatVoiceTime(durationMs)}`}
    >
      <View style={[styles.play, mine ? styles.playMine : styles.playTheirs]}>
        {!uri ? (
          <ActivityIndicator size="small" color={mine ? colors.primary : colors.cardBg} />
        ) : (
          <Ionicons name={status.playing ? 'pause' : 'play'} size={16} color={mine ? colors.primaryDark : '#FFFFFF'} style={status.playing ? null : styles.playNudge} />
        )}
      </View>
      <View style={styles.wave}>
        {wave.map((h, i) => (
          <View
            key={i}
            style={[styles.bar, { height: 4 + h * 22, backgroundColor: (i + 0.5) / BARS <= progress && !finished ? ink : finished || progress === 0 ? ink : dim, opacity: progress === 0 || finished ? 0.75 : 1 }]}
          />
        ))}
      </View>
      <Text style={[styles.time, { color: ink }]}>{formatVoiceTime(shown)}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 210,
    paddingVertical: 2,
  },
  play: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playMine: {
    backgroundColor: '#FFF6E6',
  },
  playTheirs: {
    backgroundColor: colors.primaryDark,
  },
  playNudge: {
    marginLeft: 2,
  },
  wave: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 28,
  },
  bar: {
    flex: 1,
    borderRadius: 2,
  },
  time: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    minWidth: 30,
    textAlign: 'right',
  },
});
