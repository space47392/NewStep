import { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { fetchLanterns } from '../lib/lanterns';
import { LanternGlyph } from '../screens/main/LanternsScreen';
import { colors, spacing, fontSize, fontFamily } from '../constants/theme';

// Home's always-there door into Lanterns: a warm note card that asks how
// you're doing, and gently points at classmates who could use some warmth.

type Props = {
  onWrite: () => void;
  onOpen: () => void;
};

export default function LanternInvite({ onWrite, onOpen }: Props) {
  // Classmates' lanterns that no one (including me) has answered yet.
  const [waiting, setWaiting] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      fetchLanterns()
        .then((ls) => {
          if (alive) setWaiting(ls.filter((l) => !l.mine && !l.noted_by_me).length);
        })
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, [])
  );

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.top} onPress={onOpen} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Open Lanterns">
        <LanternGlyph size={22} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Something on your mind?</Text>
          <Text style={styles.sub}>Let it out here. No name, only kindness back.</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.fakeInput} onPress={onWrite} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Write a lantern">
        <Text style={styles.fakeInputText}>I've been feeling…</Text>
        <Ionicons name="flame" size={16} color={colors.warm.honey} />
      </TouchableOpacity>
      {waiting > 0 ? (
        <TouchableOpacity style={styles.waiting} onPress={onOpen} activeOpacity={0.8}>
          <Text style={styles.waitingText}>
            🏮 {waiting} {waiting === 1 ? 'classmate could' : 'classmates could'} use some warmth
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.warm.honey} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#2A1D2B',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(245,194,122,0.22)',
    padding: spacing.md,
    gap: spacing.sm + 2,
    marginBottom: spacing.lg,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  title: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.warm.cream,
  },
  sub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.warm.creamMuted,
  },
  fakeInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,236,214,0.08)',
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  fakeInputText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: colors.warm.creamFaint,
  },
  waiting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  waitingText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.warm.honey,
  },
});
