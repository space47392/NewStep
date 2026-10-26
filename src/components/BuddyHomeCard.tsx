import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from './Avatar';
import NSIcon from './NSIcon';
import PressableScale from './PressableScale';
import FadeInView from './FadeInView';
import { BuddyState, fetchBuddyState } from '../lib/buddies';
import { colors, fontFamily, fontSize, radius, spacing } from '../constants/theme';

// Home's buddy row: only shows when there's something to say — someone
// asked you, you have (or are waiting on) a buddy, or you're new and
// haven't found one yet.
export default function BuddyHomeCard({ userId, isNewStudent, onOpen }: { userId: string; isNewStudent: boolean; onOpen: () => void }) {
  const [state, setState] = useState<BuddyState | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      fetchBuddyState(userId)
        .then((s) => alive && setState(s))
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, [userId])
  );

  if (!state) return null;
  const firstName = (n: string | null | undefined) => n?.trim().split(/\s+/)[0] ?? 'Someone';

  let avatar: string | null | undefined;
  let title: string;
  let sub: string;
  if (state.incoming.length > 0) {
    avatar = state.incoming[0].newcomer?.avatar_url;
    title = `${firstName(state.incoming[0].newcomer?.full_name)} asked you to be their buddy`;
    sub = state.incoming.length > 1 ? `and ${state.incoming.length - 1} more · tap to answer` : 'Tap to answer';
  } else if (state.mine?.status === 'active') {
    avatar = state.mine.buddy?.avatar_url;
    title = `Your buddy: ${firstName(state.mine.buddy?.full_name)}`;
    sub = 'Say hi anytime 💛';
  } else if (state.mine?.status === 'asked') {
    avatar = state.mine.buddy?.avatar_url;
    title = `Waiting for ${firstName(state.mine.buddy?.full_name)} to say yes`;
    sub = "We'll let you know";
  } else if (isNewStudent) {
    title = 'Find a buddy for your first weeks';
    sub = 'A classmate to sit with and ask anything';
  } else {
    return null;
  }

  return (
    <FadeInView>
      <PressableScale style={styles.card} pressedScale={0.98} haptic={false} onPress={onOpen} accessibilityRole="button">
        {avatar !== undefined ? (
          <Avatar uri={avatar ?? null} size={40} />
        ) : (
          <View style={styles.icon}>
            <NSIcon name="help" size={26} />
          </View>
        )}
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {sub}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.primaryDark} />
      </PressableScale>
    </FadeInView>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
  title: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  sub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMid,
    marginTop: 1,
  },
});
