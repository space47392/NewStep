// Full-screen voice call: ringing (either side), connecting, talking, ended.
// All the logic lives in CallContext; this only draws it.
import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../Avatar';
import { callStatusLabel } from '../../lib/calls';
import type { ActiveCall } from '../../contexts/CallContext';
import { colors, fontFamily, fontSize, spacing } from '../../constants/theme';

type Props = {
  call: ActiveCall;
  onAccept: () => void;
  onDecline: () => void;
  onHangUp: () => void;
  onToggleMute: () => void;
};

// Seconds since the call connected, ticking once a second.
function useElapsed(since: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  return since === null ? 0 : Math.max(0, Math.floor((now - since) / 1000));
}

export default function CallScreen({ call, onAccept, onDecline, onHangUp, onToggleMute }: Props) {
  const insets = useSafeAreaInsets();
  const seconds = useElapsed(call.connectedAt);
  const name = call.other.full_name?.trim() || 'Someone';
  const incoming = call.role === 'callee' && call.phase === 'ringing';
  const ended = call.phase === 'ended';
  const status = call.reconnecting ? 'Reconnecting…' : callStatusLabel(call.phase, call.role, { endReason: call.endReason, seconds });

  return (
    // The back button doesn't close a call: hang up or decline instead.
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={[styles.container, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.who}>
          <View style={styles.avatarRing}>
            <Avatar uri={call.other.avatar_url} size={120} />
          </View>
          <Text style={styles.name} numberOfLines={1} accessibilityRole="header">
            {name}
          </Text>
          <Text style={styles.status} accessibilityLiveRegion="polite">
            {status}
          </Text>
        </View>

        {ended ? null : incoming ? (
          <View style={styles.actions}>
            <RoundButton icon="call" label="Decline" color={colors.error} rotate onPress={onDecline} />
            <RoundButton icon="call" label="Accept" color={colors.successSolid} onPress={onAccept} />
          </View>
        ) : (
          <View style={styles.actions}>
            <RoundButton
              icon={call.muted ? 'mic-off' : 'mic'}
              label={call.muted ? 'Unmute' : 'Mute'}
              color={call.muted ? colors.warm.cream : colors.warm.glassSoft}
              iconColor={call.muted ? colors.night : colors.warm.cream}
              onPress={onToggleMute}
              disabled={call.phase === 'ringing'}
            />
            <RoundButton icon="call" label={call.phase === 'ringing' ? 'Cancel' : 'End'} color={colors.error} rotate onPress={onHangUp} />
          </View>
        )}
      </View>
    </Modal>
  );
}

function RoundButton({
  icon,
  label,
  color,
  iconColor = '#FFFFFF',
  rotate,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  iconColor?: string;
  rotate?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <View style={[styles.action, disabled && styles.disabled]}>
      <TouchableOpacity
        style={[styles.round, { backgroundColor: color }]}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!disabled }}
      >
        <Ionicons name={icon} size={30} color={iconColor} style={rotate ? styles.hangUpIcon : undefined} />
      </TouchableOpacity>
      <Text style={styles.actionLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.night,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  who: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    alignSelf: 'stretch',
  },
  avatarRing: {
    padding: 6,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.warm.line,
    marginBottom: spacing.md,
  },
  name: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xxl,
    color: colors.warm.cream,
    textAlign: 'center',
  },
  status: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.warm.creamMuted,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignSelf: 'stretch',
  },
  action: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  disabled: {
    opacity: 0.4,
  },
  round: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hangUpIcon: {
    transform: [{ rotate: '135deg' }],
  },
  actionLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.warm.cream,
  },
});
