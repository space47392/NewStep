import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Avatar from './Avatar';
import NSIcon from './NSIcon';
import AppLogo from './AppLogo';
import InterestIcon from './InterestIcon';
import { colors, spacing, radius, fontSize, fontFamily, shadow } from '../constants/theme';

type Props = {
  name: string | null;
  avatarUri: string | null;
  schoolName: string | null;
  grade: string | null;
  interests: string[];
  style?: StyleProp<ViewStyle>;
};

// The "NEWSTEP STUDENT" card — shown on the Welcome step and as a live
// preview in Edit Profile. Built only from the profile's own fields; anything
// empty simply doesn't show.
export default function StudentCard({ name, avatarUri, schoolName, grade, interests, style }: Props) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.strip}>
        <Text style={styles.stripText}>NEWSTEP STUDENT</Text>
        <AppLogo size={24} />
      </View>
      <View style={styles.body}>
        <View style={styles.avatar}>
          <Avatar uri={avatarUri} size={60} />
        </View>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {name?.trim() || 'New student'}
          </Text>
          {schoolName ? (
            <View style={styles.schoolRow}>
              <NSIcon name="school" size={18} />
              <Text style={[styles.school, styles.schoolFlex]} numberOfLines={2}>
                {schoolName}
              </Text>
            </View>
          ) : null}
          {grade?.trim() ? (
            <View style={styles.schoolRow}>
              <NSIcon name="cap" size={18} />
              <Text style={[styles.meta, styles.metaFlex]}>{grade.trim()} Grade</Text>
            </View>
          ) : null}
        </View>
      </View>
      {interests.length > 0 && (
        <View style={styles.interests}>
          {interests.map((i) => (
            <View key={i} accessible accessibilityLabel={i}>
              <InterestIcon interest={i} size={26} />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: colors.cardBg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    transform: [{ rotate: '-2deg' }],
    ...shadow.card,
  },
  strip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  stripText: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.xs,
    color: '#fff',
    letterSpacing: 1.5,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  avatar: {
    borderRadius: 34,
    borderWidth: 3,
    borderColor: colors.primaryLight,
  },
  schoolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  schoolFlex: {
    flex: 1,
    marginTop: 0,
  },
  metaFlex: {
    marginTop: 0,
  },
  info: {
    flex: 1,
  },
  name: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.lg,
    color: colors.textDark,
  },
  school: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.primary,
    marginTop: 2,
  },
  meta: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMid,
    marginTop: 2,
  },
  interests: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  interestEmoji: {
    fontSize: 22,
  },
});
