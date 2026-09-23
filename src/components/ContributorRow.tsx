import { ReactNode } from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import Avatar from './Avatar';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../constants/theme';

type ContributorUser = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

type Props = {
  user: ContributorUser;
  // Caller-composed and caller-styled — SearchScreen/SchoolScreen show one
  // "💙 N" text, VolunteerScreen shows two side-by-side stat texts. The
  // shape that's actually identical across all three call sites is the
  // avatar + name + tappable shell, not the stat content itself.
  stat: ReactNode;
  onPress: () => void;
  // 'rail': vertical avatar-over-name-over-stat stack, for a horizontal
  // FlatList item (SearchScreen's "Community Helpers", SchoolScreen's
  // "Community Contributors" — each already sits beside its own screen's
  // story/member rail and intentionally matches that rail's avatar size).
  // 'row': horizontal card, avatar left + name/stat right, for a vertical
  // FlatList item (VolunteerScreen) — not the same container shape as
  // 'rail', so it isn't forced into one shared layout.
  variant: 'rail' | 'row';
  // Rail avatar size legitimately differs per screen (52 on Search, 56 on
  // School) to match each screen's own sibling rail — pass the caller's
  // existing exact value rather than picking one and drifting the other.
  avatarSize?: number;
  itemWidth?: number; // rail only
};

export default function ContributorRow({ user, stat, onPress, variant, avatarSize, itemWidth }: Props) {
  if (variant === 'rail') {
    return (
      <TouchableOpacity style={[styles.railItem, { width: itemWidth ?? 60 }]} onPress={onPress}>
        <Avatar uri={user.avatar_url} size={avatarSize ?? 52} />
        <Text style={styles.railName} numberOfLines={1}>
          {user.full_name ?? 'Unknown'}
        </Text>
        {stat}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.85} onPress={onPress}>
      <Avatar uri={user.avatar_url} size={avatarSize ?? 44} />
      <View style={styles.rowText}>
        <Text style={styles.rowName}>{user.full_name ?? 'Unknown'}</Text>
        {stat}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  railItem: {
    alignItems: 'center',
  },
  railName: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: colors.textDark,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
    ...shadow.card,
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
});
