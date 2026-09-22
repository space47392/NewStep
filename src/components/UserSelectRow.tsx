import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import Avatar from './Avatar';
import { spacing, fontSize, fontFamily, colors } from '../constants/theme';
import { ChatProfile } from '../types';

type Props = {
  user: ChatProfile;
  onPress: (userId: string) => void;
};

// The shared row StoryViewsModal and LikesListModal each hand-rolled
// identically (avatar + name, callback-based selection, no navigation of its
// own — the caller decides what a tap means). Selection only; behavior,
// spacing, and fallback text are unchanged from the original two rows.
export default function UserSelectRow({ user, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.row} onPress={() => onPress(user.id)}>
      <Avatar uri={user.avatar_url} size={40} />
      <Text style={styles.name}>{user.full_name ?? 'Unknown'}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  name: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.md,
    color: colors.textDark,
  },
});
