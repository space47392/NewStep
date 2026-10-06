import { View, Text, StyleSheet } from 'react-native';
import { getInterestIcon } from '../constants/interests';
import { colors, spacing, radius, fontSize, fontFamily } from '../constants/theme';

// Cycles by position so a profile's chips always read as a varied, playful
// set rather than a row of identical outlines.
const TINTS = [colors.primaryLight, colors.secondaryLight, colors.accentLight, colors.warningLight];

type Props = {
  interests: string[];
  // Viewer's own interests — matching chips get an outline and a
  // "You both like" caption, so common ground stands out on someone
  // else's profile. Case-insensitive, like Search's shared-interest match.
  shared?: string[];
};

export default function InterestChips({ interests, shared }: Props) {
  const sharedSet = new Set((shared ?? []).map((i) => i.toLowerCase()));
  const sharedCount = interests.filter((i) => sharedSet.has(i.toLowerCase())).length;
  return (
    <View style={styles.wrap}>
      {sharedCount > 0 && (
        <Text style={styles.sharedCaption}>
          You both like {sharedCount === 1 ? '1 thing' : `${sharedCount} things`}
        </Text>
      )}
      <View style={styles.row}>
        {interests.map((interest, index) => {
          const isShared = sharedSet.has(interest.toLowerCase());
          return (
            <View
              key={interest}
              style={[styles.chip, { backgroundColor: TINTS[index % TINTS.length] }, isShared && styles.chipShared]}
              accessibilityLabel={isShared ? `${interest}, you both like this` : interest}
            >
              <Text style={styles.icon}>{getInterestIcon(interest)}</Text>
              <Text style={styles.text}>{interest}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  sharedCaption: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.xs,
    color: colors.primaryDark,
    marginBottom: spacing.xs + 2,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  chipShared: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  icon: {
    fontSize: fontSize.md,
  },
  text: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textDark,
  },
});
