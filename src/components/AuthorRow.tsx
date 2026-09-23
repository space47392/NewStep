import { ReactNode } from 'react';
import { Text, TouchableOpacity, View, StyleProp, ViewStyle, StyleSheet } from 'react-native';
import Avatar from './Avatar';
import { colors, spacing, fontSize, fontFamily } from '../constants/theme';

type AuthorRowUser = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  username?: string | null;
};

type Props = {
  user: AuthorRowUser;
  onPress: () => void;
  // Whatever comes after the username line — a school name, a combined
  // "school · Grade N", a grade-only line, or (People You May Know) a reason
  // line plus a shared-interests line. The actual CONTENT genuinely differs
  // per screen, not just its style, so it stays caller-composed rather than
  // being forced into one shape.
  meta?: ReactNode;
  // Container-level needs that differ per caller: FollowList/People You May
  // Know need flex:1 to share their row with a sibling Follow button; Search
  // People's row (no sibling button) instead needs its own paddingVertical
  // since there's no outer card supplying it. Same values the three rows
  // already used — just no longer duplicated three times.
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

// The shared "full identity" row: avatar + name + optional @username, tappable
// as one block. Only FollowListScreen, SearchScreen's "People" results, and
// SearchScreen's "People You May Know" use this exact shape — deliberately
// not a stand-in for Feed/PostDetail/Chat/Notifications, which are a
// different family (see the Author Identity audit).
export default function AuthorRow({ user, onPress, meta, style, accessibilityLabel }: Props) {
  return (
    <TouchableOpacity
      style={[styles.row, style]}
      onPress={onPress}
      accessibilityRole={accessibilityLabel ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      <Avatar uri={user.avatar_url} size={48} />
      <View style={styles.text}>
        <Text style={styles.name}>{user.full_name ?? 'Unknown'}</Text>
        {user.username ? <Text style={styles.username}>@{user.username}</Text> : null}
        {meta}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  text: {
    flex: 1,
  },
  name: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
  username: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.textMid,
    marginTop: 1,
  },
});
