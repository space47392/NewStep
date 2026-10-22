import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, fontSize, fontFamily } from '../constants/theme';
import { PostStatus } from '../types';

// A help request's status in one short line — 'Needs a helper',
// 'Sam is helping', 'Helped by Sam' — for lists where the full three-step
// tracker (HelpProgress) would take too much room.
type Props = {
  status: PostStatus;
  helper: { full_name: string | null } | null | undefined;
  // For the person who asked: how many offers are waiting for them.
  offersToChoose?: number;
};

export default function HelpStatusPill({ status, helper, offersToChoose = 0 }: Props) {
  const first = helper?.full_name?.split(' ')[0];
  const done = status === 'completed';
  const label = done
    ? first ? `Helped by ${first}` : 'Done'
    : status === 'accepted'
      ? first ? `${first} is helping` : 'Being helped'
      : offersToChoose > 0
        ? `${offersToChoose} ${offersToChoose === 1 ? 'offer' : 'offers'} — choose a helper`
        : 'Needs a helper';
  return (
    <View style={[styles.pill, done && styles.pillDone]}>
      <Ionicons
        name={done ? 'checkmark-circle' : status === 'accepted' ? 'people' : 'hand-left-outline'}
        size={14}
        color={done ? colors.accentDark : colors.primaryDark}
      />
      <Text style={[styles.text, done && styles.textDone]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexShrink: 1,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillDone: {
    backgroundColor: colors.accentLight,
  },
  text: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.primaryDark,
  },
  textDone: {
    color: colors.accentDark,
  },
});
